/*
  1. Almuerzo propio de cada barbero.
     En work_hours, un día con horario propio puede llevar "lunch":
       · {"start":"12:00","end":"14:00"}  → su almuerzo ese día (mañana de open a start, tarde de end a close)
       · false                             → no almuerza: trabaja de corrido
       · (sin "lunch")                     → el almuerzo del salón
     barber_lunch_for(fecha, barbero) devuelve el almuerzo que aplica. Lo usan el bloqueo de reservas web
     en el almuerzo y el adelanto de citas. El panel y el barbero pueden seguir poniendo citas en el
     almuerzo a mano (solo las reservas web, que entran «pendientes», lo respetan).

  2. Clientes bloqueados: el administrador bloquea un celular (por ejemplo, porque aparta citas y no
     llega) y desde la web ese celular ya no puede reservar ni reagendar.
*/

-- 1. Almuerzo por barbero -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.barber_lunch_for(p_date date, p_barber_id uuid, OUT o_start integer, OUT o_end integer)
RETURNS record
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_day   jsonb;
  v_salon record;
BEGIN
  -- Con ajuste del día (Panel → Turnos) mandan sus horas cerradas
  IF day_override_for(p_date) IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT work_hours -> extract(dow FROM p_date)::text INTO v_day FROM barbers WHERE id = p_barber_id;
  IF v_day IS NOT NULL AND v_day ? 'lunch' AND NOT coalesce((v_day ->> 'off')::boolean, false) THEN
    IF jsonb_typeof(v_day -> 'lunch') = 'object'
       AND v_day -> 'lunch' ->> 'start' ~ '^\d{2}:\d{2}$' AND v_day -> 'lunch' ->> 'end' ~ '^\d{2}:\d{2}$' THEN
      o_start := time_to_minutes(v_day -> 'lunch' ->> 'start');
      o_end := time_to_minutes(v_day -> 'lunch' ->> 'end');
    END IF;
    RETURN;  -- lunch: false → sin almuerzo
  END IF;
  SELECT * INTO v_salon FROM lunch_break_for(p_date);
  o_start := v_salon.o_start;
  o_end := v_salon.o_end;
END $$;

REVOKE ALL ON FUNCTION public.barber_lunch_for(date, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_booking_in_lunch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lunch record;
  v_start int;
  v_duration int;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  IF NEW.barber_id IS NULL THEN
    SELECT * INTO v_lunch FROM lunch_break_for(NEW.date);
  ELSE
    SELECT * INTO v_lunch FROM barber_lunch_for(NEW.date, NEW.barber_id);
  END IF;
  IF v_lunch.o_start IS NULL THEN
    RETURN NEW;
  END IF;
  v_start := time_to_minutes(NEW.time);
  SELECT duration INTO v_duration FROM services WHERE id = NEW.service_id;
  IF v_start < v_lunch.o_end AND v_start + coalesce(v_duration, 30) > v_lunch.o_start THEN
    RAISE EXCEPTION 'LUNCH_BREAK';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.advance_following_bookings()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_now     timestamp := now() AT TIME ZONE 'America/Bogota';
  v_now_min int;
  v_dur     int;
  v_end     int;
  v_free    int;
  v_lunch   record;
  r         record;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' OR NEW.barber_id IS NULL OR NEW.date <> v_now::date THEN
    RETURN NEW;
  END IF;

  v_now_min := extract(hour FROM v_now)::int * 60 + extract(minute FROM v_now)::int;
  v_now_min := ((v_now_min + 4) / 5) * 5;
  SELECT coalesce(duration, 30) INTO v_dur FROM services WHERE id = NEW.service_id;
  v_end := time_to_minutes(NEW.time) + coalesce(v_dur, 30);
  v_free := greatest(v_now_min, time_to_minutes(NEW.time));
  IF v_free >= v_end THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_lunch FROM barber_lunch_for(NEW.date, NEW.barber_id);

  FOR r IN
    SELECT b.id, b.time, coalesce(s.duration, 30) AS dur
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.barber_id = NEW.barber_id
      AND b.date = NEW.date
      AND b.id <> NEW.id
      AND b.status IN ('pending', 'confirmed')
      AND time_to_minutes(b.time) >= time_to_minutes(NEW.time)
    ORDER BY time_to_minutes(b.time)
  LOOP
    EXIT WHEN time_to_minutes(r.time) <> v_end;
    EXIT WHEN v_lunch.o_start IS NOT NULL
      AND v_free < v_lunch.o_end AND v_free + r.dur > v_lunch.o_start;
    UPDATE bookings
    SET original_time = coalesce(original_time, time),
        time = lpad((v_free / 60)::text, 2, '0') || ':' || lpad((v_free % 60)::text, 2, '0'),
        shifted_at = now(),
        updated_at = now()
    WHERE id = r.id;
    v_end := time_to_minutes(r.time) + r.dur;
    v_free := v_free + r.dur;
  END LOOP;
  RETURN NEW;
END $$;

-- El barbero guarda su horario desde el portal: ahora también su almuerzo
CREATE OR REPLACE FUNCTION public.barber_set_work_hours(p_barber_id uuid, p_pin text, p_hours jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result text;
  v_key    text;
  v_day    jsonb;
  v_clean  jsonb := '{}'::jsonb;
  v_item   jsonb;
  hhmm     text := '^([01]\d|2[0-3]):[0-5]\d$';
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;

  IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'object' THEN
    RETURN 'INVALID_HOURS';
  END IF;

  FOR v_key, v_day IN SELECT * FROM jsonb_each(p_hours) LOOP
    IF v_key !~ '^[0-6]$' OR jsonb_typeof(v_day) <> 'object' THEN
      RETURN 'INVALID_HOURS';
    END IF;
    IF coalesce((v_day ->> 'off')::boolean, false) THEN
      v_clean := v_clean || jsonb_build_object(v_key, jsonb_build_object('off', true));
      CONTINUE;
    END IF;
    IF coalesce(v_day ->> 'open', '') !~ hhmm OR coalesce(v_day ->> 'close', '') !~ hhmm
       OR time_to_minutes(v_day ->> 'open') >= time_to_minutes(v_day ->> 'close') THEN
      RETURN 'INVALID_HOURS';
    END IF;
    v_item := jsonb_build_object('open', v_day ->> 'open', 'close', v_day ->> 'close');
    IF v_day ? 'lunch' THEN
      IF jsonb_typeof(v_day -> 'lunch') = 'boolean' AND NOT (v_day ->> 'lunch')::boolean THEN
        v_item := v_item || '{"lunch": false}'::jsonb;
      ELSIF jsonb_typeof(v_day -> 'lunch') = 'object'
         AND coalesce(v_day -> 'lunch' ->> 'start', '') ~ hhmm AND coalesce(v_day -> 'lunch' ->> 'end', '') ~ hhmm
         AND time_to_minutes(v_day ->> 'open') < time_to_minutes(v_day -> 'lunch' ->> 'start')
         AND time_to_minutes(v_day -> 'lunch' ->> 'start') < time_to_minutes(v_day -> 'lunch' ->> 'end')
         AND time_to_minutes(v_day -> 'lunch' ->> 'end') < time_to_minutes(v_day ->> 'close') THEN
        v_item := v_item || jsonb_build_object('lunch', jsonb_build_object('start', v_day -> 'lunch' ->> 'start', 'end', v_day -> 'lunch' ->> 'end'));
      ELSE
        RETURN 'INVALID_HOURS';
      END IF;
    END IF;
    v_clean := v_clean || jsonb_build_object(v_key, v_item);
  END LOOP;

  UPDATE barbers SET work_hours = v_clean, updated_at = now() WHERE id = p_barber_id;
  RETURN 'OK';
END $$;

-- 2. Clientes bloqueados ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.blocked_clients (
  phone      text PRIMARY KEY,          -- phone_key(): 10 dígitos, sin el 57
  name       text NOT NULL DEFAULT '',
  reason     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blocked_clients FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_clients TO authenticated;

DROP POLICY IF EXISTS blocked_clients_admin ON public.blocked_clients;
CREATE POLICY blocked_clients_admin ON public.blocked_clients
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.is_client_blocked(p_phone text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT length(phone_key(p_phone)) >= 10 AND EXISTS (SELECT 1 FROM blocked_clients WHERE phone = phone_key(p_phone));
$$;
REVOKE ALL ON FUNCTION public.is_client_blocked(text) FROM PUBLIC, anon, authenticated;

-- Las reservas de la web (create_booking) entran como «pendiente»: un celular bloqueado no puede apartar.
-- El panel y el barbero registran «confirmada» o «completada» y no se frenan.
CREATE OR REPLACE FUNCTION public.reject_blocked_client()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' AND is_client_blocked(NEW.client_phone) THEN
    RAISE EXCEPTION 'CLIENT_BLOCKED';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reject_blocked_client() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_reject_blocked ON bookings;
CREATE TRIGGER bookings_reject_blocked
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION reject_blocked_client();

-- 3. Reagendar desde «Mis citas» ------------------------------------------------
-- Ahora: el cliente bloqueado no puede; la hora tiene que caber en el horario de SU barbero (también el
-- extendido), fuera de su almuerzo, y dentro de los días que se permite reservar.
CREATE OR REPLACE FUNCTION public.client_reschedule_booking(p_phone text, p_name text, p_booking_id uuid, p_new_date date, p_new_time text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key     text := phone_key(p_phone);
  v_first   text := split_part(plain_text(p_name), ' ', 1);
  v_booking bookings%ROWTYPE;
  v_service services%ROWTYPE;
  v_start   integer;
  v_end     integer;
  v_hours   record;
  v_lunch   record;
  v_now     timestamp := now() AT TIME ZONE 'America/Bogota';
BEGIN
  IF length(v_key) < 10 OR length(v_first) < 2 THEN
    RETURN 'INVALID';
  END IF;
  IF p_new_date IS NULL OR p_new_time IS NULL OR p_new_time !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RETURN 'INVALID_TIME';
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN 'NOT_FOUND';
  END IF;
  IF phone_key(v_booking.client_phone) <> v_key
     OR split_part(plain_text(v_booking.client_name), ' ', 1) <> v_first THEN
    RETURN 'UNAUTHORIZED';
  END IF;
  IF is_client_blocked(v_booking.client_phone) THEN
    RETURN 'CLIENT_BLOCKED';
  END IF;
  IF v_booking.status IN ('completed', 'cancelled', 'no-show') THEN
    RETURN 'ALREADY_PROCESSED';
  END IF;

  IF p_new_date < v_now::date
     OR (p_new_date = v_now::date AND time_to_minutes(p_new_time) <= extract(hour FROM v_now)::int * 60 + extract(minute FROM v_now)::int) THEN
    RETURN 'PAST_DATE';
  END IF;
  IF p_new_date > v_now::date + least(90, greatest(1, coalesce((SELECT (data ->> 'daysAhead')::int FROM business_settings WHERE id), 14))) THEN
    RETURN 'TOO_FAR';
  END IF;

  SELECT * INTO v_service FROM services WHERE id = v_booking.service_id;
  v_start := time_to_minutes(p_new_time);
  v_end   := v_start + coalesce(v_service.duration, 30);

  SELECT * INTO v_hours FROM business_hours_for(p_new_date);
  IF v_hours.o_status <> 'OPEN' THEN
    RETURN 'CLOSED_DAY';
  END IF;
  IF v_booking.barber_id IS NULL THEN
    IF v_start < v_hours.o_open OR v_end > v_hours.o_close THEN
      RETURN 'INVALID_TIME';
    END IF;
    SELECT * INTO v_lunch FROM lunch_break_for(p_new_date);
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM barber_windows_for(p_new_date) w
      WHERE w.barber_id = v_booking.barber_id AND w.o_open IS NOT NULL AND v_start >= w.o_open AND v_end <= w.o_close
    ) THEN
      RETURN 'INVALID_TIME';
    END IF;
    SELECT * INTO v_lunch FROM barber_lunch_for(p_new_date, v_booking.barber_id);
  END IF;
  IF v_lunch.o_start IS NOT NULL AND v_start < v_lunch.o_end AND v_end > v_lunch.o_start THEN
    RETURN 'LUNCH_BREAK';
  END IF;

  -- El mismo candado que las reservas nuevas, para que no se crucen dos al mismo tiempo
  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_new_date::text));

  IF v_booking.barber_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM bookings bk LEFT JOIN services s ON s.id = bk.service_id
      WHERE bk.barber_id = v_booking.barber_id AND bk.date = p_new_date AND bk.id <> p_booking_id
        AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
        AND time_to_minutes(bk.time) < v_end AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
    ) OR EXISTS (
      SELECT 1 FROM closed_ranges_for(p_new_date) c
      WHERE (c.barber_id IS NULL OR c.barber_id = v_booking.barber_id) AND c.start_min < v_end AND c.end_min > v_start
    )
  ) THEN
    RETURN 'SLOT_TAKEN';
  END IF;

  UPDATE bookings
  SET date = p_new_date,
      time = p_new_time,
      original_time = NULL,
      shifted_at = NULL,
      status = 'pending',
      updated_at = now()
  WHERE id = p_booking_id;
  RETURN 'OK';
END $$;
