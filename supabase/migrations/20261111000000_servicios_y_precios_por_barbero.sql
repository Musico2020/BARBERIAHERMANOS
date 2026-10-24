/*
  Servicios y precios por barbero (Panel → Configuración → Barberos).

  barber_services guarda solo las excepciones de cada barbero:
    · enabled = false → ese barbero NO hace ese servicio (no se le puede reservar ni registrar).
    · price           → lo que cobra ese barbero por ese servicio (vacío = el precio general del servicio).
  Sin fila, el barbero hace el servicio (si es de su rol) al precio general. Así nada cambia hasta que
  el administrador lo configure.

  La reserva web (create_booking), el portal del barbero (barber_add_client, barber_edit_booking)
  usan barber_does_service y barber_price_for. El anticipo se calcula con el precio del barbero.
*/

CREATE TABLE IF NOT EXISTS public.barber_services (
  barber_id  uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT true,
  price      integer CHECK (price IS NULL OR price >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (barber_id, service_id)
);

ALTER TABLE public.barber_services ENABLE ROW LEVEL SECURITY;
-- Lo que hace y cobra cada barbero es información pública (la web la muestra al reservar)
GRANT SELECT ON public.barber_services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.barber_services TO authenticated;

DROP POLICY IF EXISTS barber_services_read ON public.barber_services;
CREATE POLICY barber_services_read ON public.barber_services FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS barber_services_admin ON public.barber_services;
CREATE POLICY barber_services_admin ON public.barber_services FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.barber_does_service(p_barber_id uuid, p_service_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM barber_services WHERE barber_id = p_barber_id AND service_id = p_service_id AND NOT enabled);
$$;

CREATE OR REPLACE FUNCTION public.barber_price_for(p_barber_id uuid, p_service_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT price FROM barber_services WHERE barber_id = p_barber_id AND service_id = p_service_id),
    (SELECT price FROM services WHERE id = p_service_id));
$$;

REVOKE ALL ON FUNCTION public.barber_does_service(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.barber_price_for(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Reserva web ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking(p_service_id uuid, p_barber_id uuid, p_date date, p_time text, p_client_name text, p_client_phone text, p_client_email text DEFAULT ''::text)
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
  v_deposit   jsonb;
  v_percent   integer := 0;
  v_price     integer;
  v_amount    integer := 0;
  v_expires   timestamptz;
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
  IF p_date > v_now::date + least(90, greatest(1, coalesce((SELECT (data ->> 'daysAhead')::int FROM business_settings WHERE id), 14))) THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  v_role := CASE WHEN v_service.category = 'manicura' THEN 'manicurista' ELSE 'barbero' END;
  IF p_barber_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM barbers WHERE id = p_barber_id AND role = v_role AND barber_does_service(id, v_service.id)
  ) THEN
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
  IF NOT EXISTS (
    SELECT 1 FROM barber_windows_for(p_date) w JOIN barbers b ON b.id = w.barber_id
    WHERE b.role = v_role AND (p_barber_id IS NULL OR b.id = p_barber_id) AND barber_does_service(b.id, v_service.id)
      AND w.o_open IS NOT NULL AND v_start >= w.o_open AND v_end <= w.o_close
  ) THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_date::text));
  PERFORM expire_unpaid_bookings();

  -- Anticipo: porcentaje del precio (el del barbero que atiende), redondeado hacia arriba a $100
  SELECT data -> 'deposit' INTO v_deposit FROM business_settings WHERE id;
  v_deposit := coalesce(v_deposit, '{"enabled": true, "percent": 50, "minutes": 30}'::jsonb);
  IF coalesce((v_deposit ->> 'enabled')::boolean, true) AND coalesce((v_deposit ->> 'percent')::int, 50) > 0 THEN
    v_percent := least(100, coalesce((v_deposit ->> 'percent')::int, 50));
    v_expires := now() + make_interval(mins => greatest(5, least(240, coalesce((v_deposit ->> 'minutes')::int, 30))));
  END IF;

  FOR v_barber IN
    SELECT b.* FROM barbers b
    JOIN barber_windows_for(p_date) w ON w.barber_id = b.id
    WHERE b.available AND b.role = v_role AND (p_barber_id IS NULL OR b.id = p_barber_id)
      AND barber_does_service(b.id, v_service.id)
      AND w.o_open IS NOT NULL AND v_start >= w.o_open AND v_end <= w.o_close
    ORDER BY (
      SELECT count(*) FROM bookings x
      WHERE x.barber_id = b.id AND x.date = p_date AND booking_holds_slot(x.status, x.deposit_status, x.deposit_expires_at)
    ), b.name
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM bookings bk
      LEFT JOIN services s ON s.id = bk.service_id
      WHERE bk.barber_id = v_barber.id
        AND bk.date = p_date
        AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
        AND time_to_minutes(bk.time) < v_end
        AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
    ) AND NOT EXISTS (
      SELECT 1 FROM closed_ranges_for(p_date) c
      WHERE (c.barber_id IS NULL OR c.barber_id = v_barber.id)
        AND c.start_min < v_end AND c.end_min > v_start
    ) THEN
      v_price := barber_price_for(v_barber.id, v_service.id);
      v_amount := CASE WHEN v_percent > 0 THEN (ceil(v_price * v_percent / 100.0 / 100.0) * 100)::int ELSE 0 END;
      INSERT INTO bookings (client_name, client_phone, client_email, service_id, service_name,
                            barber_id, barber_name, date, time, price, status,
                            deposit_amount, deposit_status, deposit_expires_at)
      VALUES (trim(p_client_name), trim(p_client_phone), coalesce(trim(p_client_email), ''),
              v_service.id, v_service.name, v_barber.id, v_barber.short_name,
              p_date, p_time, v_price, 'pending',
              v_amount, CASE WHEN v_amount > 0 THEN 'awaiting' ELSE 'none' END,
              CASE WHEN v_amount > 0 THEN v_expires END)
      RETURNING id INTO v_id;

      RETURN json_build_object(
        'booking_id', v_id,
        'barber_id', v_barber.id,
        'barber_name', v_barber.name,
        'barber_short_name', v_barber.short_name,
        'price', v_price,
        'deposit_amount', v_amount,
        'deposit_expires_at', CASE WHEN v_amount > 0 THEN v_expires END
      );
    END IF;
  END LOOP;

  IF p_barber_id IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;
  RAISE EXCEPTION 'NO_BARBER_AVAILABLE';
END $$;

-- Portal del barbero: cliente nuevo ------------------------------------------------
CREATE OR REPLACE FUNCTION public.barber_add_client(p_barber_id uuid, p_pin text, p_client_name text, p_client_phone text, p_date date, p_lines jsonb, p_schedule boolean)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result  text;
  v_barber  barbers%ROWTYPE;
  v_today   date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_line    jsonb;
  v_service services%ROWTYPE;
  v_start   int;
  v_end     int;
  v_digits  text := regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g');
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;
  SELECT * INTO v_barber FROM barbers WHERE id = p_barber_id;

  IF length(trim(coalesce(p_client_name, ''))) < 2 THEN
    RETURN 'INVALID_NAME';
  END IF;
  IF v_digits <> '' AND length(v_digits) < 10 THEN
    RETURN 'INVALID_PHONE';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 10 THEN
    RETURN 'INVALID_LINES';
  END IF;
  IF p_schedule AND (p_date IS NULL OR p_date < v_today OR p_date > v_today + 90) THEN
    RETURN 'INVALID_DATE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || coalesce(p_date, v_today)::text));

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_service FROM services WHERE id = (v_line ->> 'serviceId')::uuid;
    IF NOT FOUND OR coalesce(v_line ->> 'time', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       OR NOT barber_does_service(p_barber_id, v_service.id) THEN
      RETURN 'INVALID_LINES';
    END IF;
    IF p_schedule THEN
      v_start := time_to_minutes(v_line ->> 'time');
      v_end := v_start + v_service.duration;
      IF EXISTS (
        SELECT 1 FROM bookings bk LEFT JOIN services s ON s.id = bk.service_id
        WHERE bk.barber_id = p_barber_id AND bk.date = p_date
          AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
          AND time_to_minutes(bk.time) < v_end AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
      ) OR EXISTS (
        SELECT 1 FROM closed_ranges_for(p_date) c
        WHERE (c.barber_id IS NULL OR c.barber_id = p_barber_id) AND c.start_min < v_end AND c.end_min > v_start
      ) THEN
        RETURN 'SLOT_TAKEN';
      END IF;
    END IF;
  END LOOP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_service FROM services WHERE id = (v_line ->> 'serviceId')::uuid;
    INSERT INTO bookings (client_name, client_phone, client_email, service_id, service_name,
                          barber_id, barber_name, date, time, price, status, whatsapp_sent_at)
    VALUES (trim(p_client_name), trim(coalesce(p_client_phone, '')), '', v_service.id, v_service.name,
            v_barber.id, v_barber.short_name, CASE WHEN p_schedule THEN p_date ELSE v_today END,
            v_line ->> 'time', barber_price_for(p_barber_id, v_service.id),
            CASE WHEN p_schedule THEN 'confirmed' ELSE 'completed' END,
            CASE WHEN p_schedule THEN NULL ELSE now() END);
  END LOOP;
  RETURN 'OK';
END $$;

-- Portal del barbero: editar cita ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.barber_edit_booking(p_barber_id uuid, p_pin text, p_booking_id uuid, p_client_name text, p_client_phone text, p_service_id uuid, p_date date, p_time text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result  text;
  v_booking bookings%ROWTYPE;
  v_service services%ROWTYPE;
  v_today   date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_start   int;
  v_end     int;
  v_digits  text := regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g');
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND barber_id = p_barber_id;
  IF NOT FOUND THEN
    RETURN 'BOOKING_NOT_FOUND';
  END IF;
  IF length(trim(coalesce(p_client_name, ''))) < 2 THEN
    RETURN 'INVALID_NAME';
  END IF;
  IF v_digits <> '' AND length(v_digits) < 10 THEN
    RETURN 'INVALID_PHONE';
  END IF;
  SELECT * INTO v_service FROM services WHERE id = p_service_id;
  IF NOT FOUND OR (p_service_id <> v_booking.service_id AND NOT barber_does_service(p_barber_id, p_service_id)) THEN
    RETURN 'INVALID_SERVICE';
  END IF;
  IF p_date IS NULL OR p_date < v_today - 30 OR p_date > v_today + 90 THEN
    RETURN 'INVALID_DATE';
  END IF;
  IF p_time IS NULL OR p_time !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RETURN 'INVALID_TIME';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_date::text));
  v_start := time_to_minutes(p_time);
  v_end := v_start + v_service.duration;
  IF (p_date, p_time, p_service_id) IS DISTINCT FROM (v_booking.date, v_booking.time, v_booking.service_id) THEN
    IF EXISTS (
      SELECT 1 FROM bookings bk LEFT JOIN services s ON s.id = bk.service_id
      WHERE bk.barber_id = p_barber_id AND bk.date = p_date AND bk.id <> p_booking_id
        AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
        AND time_to_minutes(bk.time) < v_end AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
    ) OR EXISTS (
      SELECT 1 FROM closed_ranges_for(p_date) c
      WHERE (c.barber_id IS NULL OR c.barber_id = p_barber_id) AND c.start_min < v_end AND c.end_min > v_start
    ) THEN
      RETURN 'SLOT_TAKEN';
    END IF;
  END IF;

  UPDATE bookings
  SET client_name = trim(p_client_name),
      client_phone = trim(coalesce(p_client_phone, '')),
      service_id = v_service.id,
      service_name = v_service.name,
      price = CASE WHEN v_service.id = v_booking.service_id THEN v_booking.price ELSE barber_price_for(p_barber_id, v_service.id) END,
      date = p_date,
      time = p_time,
      original_time = NULL,
      shifted_at = NULL,
      updated_at = now()
  WHERE id = p_booking_id;
  RETURN 'OK';
END $$;
