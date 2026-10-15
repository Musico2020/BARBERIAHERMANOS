/*
  El servidor valida el horario de cada reserva (antes solo lo hacía la página web).

  Sin esto, alguien que llamara a create_booking directamente podía reservar a una hora
  inexistente ("25:99"), de madrugada, en un día cerrado o en un día "solo por orden de llegada".
  Ahora create_booking revisa, con la configuración guardada desde el panel (business_settings):
    - que la hora exista (00:00 a 23:59);
    - que la fecha no esté a más de 30 días;
    - los días especiales (cerrado / orden de llegada);
    - el horario del día (o el de festivos, calculados igual que en la web) y que el servicio
      termine antes del cierre.
  Si business_settings está vacía, se usan los horarios por defecto de la web.
*/

-- ---------------------------------------------------------------------
-- Festivos de Colombia (Ley 51 de 1983), igual que src/lib/holidays.ts
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.easter_sunday(p_year integer)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  a int := p_year % 19;
  b int := p_year / 100;
  c int := p_year % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
BEGIN
  RETURN make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
END $$;

CREATE OR REPLACE FUNCTION public.is_colombian_holiday(p_date date)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  y int := extract(year FROM p_date)::int;
  e date := easter_sunday(y);
  md text;
  moved date;
BEGIN
  -- Fijos
  IF to_char(p_date, 'MM-DD') IN ('01-01', '05-01', '07-20', '08-07', '12-08', '12-25') THEN
    RETURN true;
  END IF;
  -- Religiosos según la Pascua
  IF p_date IN (e - 3, e - 2, e + 43, e + 64, e + 71) THEN
    RETURN true;
  END IF;
  -- Trasladables al lunes siguiente
  FOREACH md IN ARRAY ARRAY['01-06', '03-19', '06-29', '08-15', '10-12', '11-01', '11-11'] LOOP
    moved := to_date(y || '-' || md, 'YYYY-MM-DD');
    moved := moved + ((8 - extract(isodow FROM moved)::int) % 7);
    IF p_date = moved THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END $$;

-- ---------------------------------------------------------------------
-- Horario que aplica a una fecha: {closed, open, close} en minutos, o 'WALK_IN' / 'CLOSED'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_hours_for(p_date date, OUT o_status text, OUT o_open int, OUT o_close int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_special jsonb;
  v_entry jsonb;
  -- Horario por defecto (igual que src/config/business.ts): lunes a domingo, y festivos
  v_default jsonb := '[
    {"open":"09:00","close":"19:00","closed":false},{"open":"09:00","close":"19:00","closed":false},
    {"open":"09:00","close":"19:00","closed":false},{"open":"09:00","close":"19:00","closed":false},
    {"open":"09:00","close":"19:00","closed":false},{"open":"09:00","close":"18:00","closed":false},
    {"open":"10:00","close":"15:00","closed":false}]'::jsonb;
  v_default_holiday jsonb := '{"open":"10:00","close":"15:00","closed":false}'::jsonb;
BEGIN
  SELECT data INTO v_data FROM business_settings WHERE id;

  SELECT d INTO v_special
  FROM jsonb_array_elements(coalesce(v_data -> 'specialDays', '[]'::jsonb)) d
  WHERE d ->> 'date' = p_date::text
  LIMIT 1;
  IF v_special IS NOT NULL THEN
    IF v_special ->> 'type' = 'closed' THEN o_status := 'CLOSED'; RETURN; END IF;
    IF v_special ->> 'type' = 'walk-in' THEN o_status := 'WALK_IN'; RETURN; END IF;
  END IF;

  IF is_colombian_holiday(p_date) THEN
    v_entry := coalesce(v_data -> 'holidayHours', v_default_holiday);
  ELSE
    v_entry := coalesce(v_data -> 'hours', v_default) -> (extract(isodow FROM p_date)::int - 1);
  END IF;

  IF v_entry IS NULL OR (v_entry ->> 'closed')::boolean THEN
    o_status := 'CLOSED';
    RETURN;
  END IF;
  o_status := 'OPEN';
  o_open := time_to_minutes(v_entry ->> 'open');
  o_close := time_to_minutes(v_entry ->> 'close');
END $$;

-- ---------------------------------------------------------------------
-- create_booking con la validación de horario
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking(
  p_service_id   uuid,
  p_barber_id    uuid,
  p_date         date,
  p_time         text,
  p_client_name  text,
  p_client_phone text,
  p_client_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service   services%ROWTYPE;
  v_barber    barbers%ROWTYPE;
  v_now       timestamp := now() AT TIME ZONE 'America/Bogota';
  v_start     integer;
  v_end       integer;
  v_id        uuid;
  v_hours     record;
BEGIN
  IF length(trim(coalesce(p_client_name, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;
  IF length(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;
  -- Hora con formato HH:MM y que exista (00:00 a 23:59)
  IF p_time IS NULL OR p_time !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  SELECT * INTO v_service FROM services WHERE id = p_service_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  IF p_date IS NULL OR p_date < v_now::date
     OR (p_date = v_now::date AND time_to_minutes(p_time) <= extract(hour FROM v_now)::int * 60 + extract(minute FROM v_now)::int) THEN
    RAISE EXCEPTION 'PAST_DATE';
  END IF;
  IF p_date > v_now::date + 30 THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  v_start := time_to_minutes(p_time);
  v_end   := v_start + v_service.duration;

  -- Horario del día: cerrado, solo por orden de llegada, o fuera del horario de atención
  SELECT * INTO v_hours FROM business_hours_for(p_date);
  IF v_hours.o_status <> 'OPEN' THEN
    RAISE EXCEPTION 'CLOSED_DAY';
  END IF;
  IF v_start < v_hours.o_open OR v_end > v_hours.o_close THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  -- Una reserva a la vez por día: evita que dos clientes tomen la misma hora al mismo tiempo
  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_date::text));

  FOR v_barber IN
    SELECT b.* FROM barbers b
    WHERE b.available AND (p_barber_id IS NULL OR b.id = p_barber_id)
    ORDER BY (
      SELECT count(*) FROM bookings x
      WHERE x.barber_id = b.id AND x.date = p_date AND x.status IN ('pending', 'confirmed')
    ), b.name
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM bookings bk
      LEFT JOIN services s ON s.id = bk.service_id
      WHERE bk.barber_id = v_barber.id
        AND bk.date = p_date
        AND bk.status IN ('pending', 'confirmed')
        AND time_to_minutes(bk.time) < v_end
        AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
    ) THEN
      INSERT INTO bookings (client_name, client_phone, client_email, service_id, service_name,
                            barber_id, barber_name, date, time, price, status)
      VALUES (trim(p_client_name), trim(p_client_phone), coalesce(trim(p_client_email), ''),
              v_service.id, v_service.name, v_barber.id, v_barber.short_name,
              p_date, p_time, v_service.price, 'pending')
      RETURNING id INTO v_id;

      RETURN json_build_object(
        'booking_id', v_id,
        'barber_id', v_barber.id,
        'barber_name', v_barber.name,
        'barber_short_name', v_barber.short_name
      );
    END IF;
  END LOOP;

  IF p_barber_id IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;
  RAISE EXCEPTION 'NO_BARBER_AVAILABLE';
END $$;

REVOKE ALL ON FUNCTION public.business_hours_for(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, date, text, text, text, text) TO anon, authenticated;
