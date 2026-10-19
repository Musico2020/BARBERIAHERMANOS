/*
  Turnos por día: el administrador abre o cierra horas de cualquier fecha (Panel → Turnos).

  Se guardan en business_settings.data.dayOverrides, una entrada por fecha:
    { "date": "2026-10-26", "open": "09:00", "close": "13:00",
      "closed": [ { "start": "10:00", "end": "11:00" },                      -- todo el salón
                  { "start": "15:00", "end": "16:00", "barberId": "<uuid>" } ] } -- solo un barbero

  - Una fecha con ajuste usa su propio horario: así se abre un domingo, un festivo o un día que
    normalmente está cerrado. Los días especiales «cerrado» y «orden de llegada» siguen mandando.
  - Ese día no se aplica el almuerzo por defecto: las horas cerradas del ajuste lo reemplazan
    (el panel arranca el ajuste con el almuerzo ya cerrado).
  - Las horas cerradas salen en get_busy_slots como ocupadas (kind = 'closed'), así la web y el
    chat no las ofrecen, y create_booking las rechaza.

  También: el almuerzo por defecto pasa a ser de 12:00 a 14:00.
*/

-- ---------------------------------------------------------------------
-- Ajuste de una fecha (o NULL)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.day_override_for(p_date date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d
  FROM business_settings s, jsonb_array_elements(coalesce(s.data -> 'dayOverrides', '[]'::jsonb)) d
  WHERE s.id AND d ->> 'date' = p_date::text
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- Horario del día: días especiales > ajuste del día > festivo / día de la semana
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_hours_for(p_date date, OUT o_status text, OUT o_open int, OUT o_close int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_special jsonb;
  v_override jsonb;
  v_entry jsonb;
  v_default jsonb := '[
    {"open":"08:00","close":"19:00","closed":false},{"open":"08:00","close":"19:00","closed":false},
    {"open":"08:00","close":"19:00","closed":false},{"open":"08:00","close":"19:00","closed":false},
    {"open":"08:00","close":"19:00","closed":false},{"open":"08:00","close":"19:00","closed":false},
    {"open":"09:00","close":"13:00","closed":false}]'::jsonb;
  v_default_holiday jsonb := '{"open":"09:00","close":"13:00","closed":false}'::jsonb;
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

  v_override := day_override_for(p_date);
  IF v_override IS NOT NULL THEN
    o_status := 'OPEN';
    o_open := time_to_minutes(v_override ->> 'open');
    o_close := time_to_minutes(v_override ->> 'close');
    RETURN;
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
-- Almuerzo por defecto (12:00 a 14:00); no aplica domingos, festivos ni días con ajuste
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lunch_break_for(p_date date, OUT o_start int, OUT o_end int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lunch jsonb;
BEGIN
  IF extract(isodow FROM p_date) = 7 OR is_colombian_holiday(p_date) OR day_override_for(p_date) IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT data -> 'lunch' INTO v_lunch FROM business_settings WHERE id;
  v_lunch := coalesce(v_lunch, '{"enabled": true, "start": "12:00", "end": "14:00"}'::jsonb);
  IF NOT coalesce((v_lunch ->> 'enabled')::boolean, false) THEN
    RETURN;
  END IF;
  o_start := time_to_minutes(v_lunch ->> 'start');
  o_end := time_to_minutes(v_lunch ->> 'end');
END $$;

-- ---------------------------------------------------------------------
-- Horas cerradas de una fecha. barber_id NULL = todo el salón.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.closed_ranges_for(p_date date)
RETURNS TABLE (barber_id uuid, start_min int, end_min int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT nullif(c ->> 'barberId', '')::uuid, time_to_minutes(c ->> 'start'), time_to_minutes(c ->> 'end')
  FROM jsonb_array_elements(coalesce(day_override_for(p_date) -> 'closed', '[]'::jsonb)) c
  WHERE c ->> 'start' ~ '^\d{2}:\d{2}$' AND c ->> 'end' ~ '^\d{2}:\d{2}$';
$$;

-- ---------------------------------------------------------------------
-- Horas ocupadas: citas + horas cerradas (sin datos personales)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_busy_slots(date, uuid);
CREATE FUNCTION public.get_busy_slots(p_date date, p_barber_id uuid DEFAULT NULL)
RETURNS TABLE (barber_id uuid, start_time text, duration integer, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT bk.barber_id, bk.time, coalesce(s.duration, 30), 'booking'
  FROM bookings bk
  LEFT JOIN services s ON s.id = bk.service_id
  WHERE bk.date = p_date
    AND bk.status IN ('pending', 'confirmed')
    AND bk.barber_id IS NOT NULL
    AND (p_barber_id IS NULL OR bk.barber_id = p_barber_id)
  UNION ALL
  SELECT b.id,
         lpad((c.start_min / 60)::text, 2, '0') || ':' || lpad((c.start_min % 60)::text, 2, '0'),
         c.end_min - c.start_min,
         'closed'
  FROM closed_ranges_for(p_date) c
  JOIN barbers b ON (c.barber_id IS NULL OR b.id = c.barber_id)
  WHERE c.end_min > c.start_min
    AND (p_barber_id IS NULL OR b.id = p_barber_id);
$$;

-- ---------------------------------------------------------------------
-- create_booking: igual que antes y además respeta las horas cerradas
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
  v_role      text;
BEGIN
  IF length(trim(coalesce(p_client_name, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;
  IF length(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;
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

  v_role := CASE WHEN v_service.category = 'manicura' THEN 'manicurista' ELSE 'barbero' END;
  IF p_barber_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM barbers WHERE id = p_barber_id AND role = v_role) THEN
    RAISE EXCEPTION 'WRONG_PROFESSIONAL';
  END IF;
  IF p_barber_id IS NULL AND coalesce((SELECT (data ->> 'allowAnyBarber')::boolean FROM business_settings WHERE id), true) = false THEN
    RAISE EXCEPTION 'BARBER_REQUIRED';
  END IF;

  v_start := time_to_minutes(p_time);
  v_end   := v_start + v_service.duration;

  SELECT * INTO v_hours FROM business_hours_for(p_date);
  IF v_hours.o_status <> 'OPEN' THEN
    RAISE EXCEPTION 'CLOSED_DAY';
  END IF;
  IF v_start < v_hours.o_open OR v_end > v_hours.o_close THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_date::text));

  FOR v_barber IN
    SELECT b.* FROM barbers b
    WHERE b.available AND b.role = v_role AND (p_barber_id IS NULL OR b.id = p_barber_id)
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
    ) AND NOT EXISTS (
      -- Horas cerradas desde Panel → Turnos (de todo el salón o de este barbero)
      SELECT 1 FROM closed_ranges_for(p_date) c
      WHERE (c.barber_id IS NULL OR c.barber_id = v_barber.id)
        AND c.start_min < v_end AND c.end_min > v_start
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

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.day_override_for(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.closed_ranges_for(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_hours_for(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lunch_break_for(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, date, text, text, text, text) TO anon, authenticated;

-- Almuerzo guardado: de 12:00 a 14:00
UPDATE business_settings
SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{lunch}', '{"enabled": true, "start": "12:00", "end": "14:00"}'::jsonb),
    updated_at = now()
WHERE id;
