/*
  1. Avisos al teléfono para cada barbero.
     barber_push_subscriptions: los teléfonos donde un barbero tocó «Activar avisos» en su portal.
     Solo se registran con su PIN (barber_push_subscribe); nadie los puede leer desde la web.
     claim_barber_push() (solo la llave de servicio, desde api/notify-push.js) devuelve las citas que
     hay que avisarle a su barbero: nuevas, o que acaban de pasar a ese barbero (al moverlas en la
     Agenda o al agendarlas otro barbero). Cada cita se le avisa una sola vez a cada barbero.

  2. Un barbero agenda a OTRO barbero desde su portal (si él no está disponible): barber_book_for.
     Solo citas agendadas (no «ya atendido»), en horas libres del otro barbero, dentro de su horario
     y con servicios que el otro sí hace, a su precio. Queda quién la agendó (booked_by_barber_id).
*/

-- 1 ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.barber_push_subscriptions (
  endpoint   text PRIMARY KEY,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  barber_id  uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  device     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.barber_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.barber_push_subscriptions FROM anon, authenticated;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS push_barber_to uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booked_by_barber_id uuid;

CREATE OR REPLACE FUNCTION public.barber_push_subscribe(p_barber_id uuid, p_pin text, p_endpoint text, p_p256dh text, p_auth text, p_device text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result text;
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN RETURN v_result; END IF;
  IF coalesce(p_endpoint, '') !~ '^https://' OR length(p_endpoint) > 1000
     OR coalesce(p_p256dh, '') = '' OR coalesce(p_auth, '') = '' THEN
    RETURN 'INVALID';
  END IF;
  INSERT INTO barber_push_subscriptions (endpoint, p256dh, auth, barber_id, device)
  VALUES (p_endpoint, p_p256dh, p_auth, p_barber_id, left(coalesce(p_device, ''), 40))
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
    barber_id = EXCLUDED.barber_id, device = EXCLUDED.device;
  RETURN 'OK';
END $$;

CREATE OR REPLACE FUNCTION public.barber_push_unsubscribe(p_barber_id uuid, p_pin text, p_endpoint text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result text;
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN RETURN v_result; END IF;
  DELETE FROM barber_push_subscriptions WHERE endpoint = p_endpoint AND barber_id = p_barber_id;
  RETURN 'OK';
END $$;

-- Cuántos teléfonos tiene activos este barbero (para mostrarlo en su perfil)
CREATE OR REPLACE FUNCTION public.barber_push_count(p_barber_id uuid, p_pin text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF barber_login(p_barber_id, p_pin) <> 'OK' THEN RETURN NULL; END IF;
  RETURN (SELECT count(*) FROM barber_push_subscriptions WHERE barber_id = p_barber_id);
END $$;

REVOKE ALL ON FUNCTION public.barber_push_subscribe(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.barber_push_unsubscribe(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.barber_push_count(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barber_push_subscribe(uuid, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barber_push_unsubscribe(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barber_push_count(uuid, text) TO anon, authenticated;

-- Citas por avisar a su barbero (y se marcan como avisadas a ese barbero)
CREATE OR REPLACE FUNCTION public.claim_barber_push()
RETURNS TABLE(o_id uuid, o_barber_id uuid, o_client_name text, o_service_name text, o_date date, o_time text, o_price integer, o_booked_by text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH c AS (
    UPDATE bookings b SET push_barber_to = b.barber_id
    WHERE b.barber_id IS NOT NULL
      AND b.push_barber_to IS DISTINCT FROM b.barber_id
      AND b.status IN ('pending', 'confirmed')
      AND b.date >= (now() AT TIME ZONE 'America/Bogota')::date
      AND greatest(b.created_at, coalesce(b.updated_at, b.created_at)) > now() - interval '15 minutes'
      AND EXISTS (SELECT 1 FROM barber_push_subscriptions s WHERE s.barber_id = b.barber_id)
    RETURNING b.id, b.barber_id, b.client_name, b.service_name, b.date, b.time, b.price, b.booked_by_barber_id
  )
  SELECT c.id, c.barber_id, c.client_name, c.service_name, c.date, c.time, c.price::integer,
         (SELECT short_name FROM barbers x WHERE x.id = c.booked_by_barber_id)
  FROM c;
$$;
REVOKE ALL ON FUNCTION public.claim_barber_push() FROM PUBLIC, anon, authenticated;

-- 2 ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.barber_book_for(
  p_barber_id uuid, p_pin text, p_target_barber_id uuid,
  p_client_name text, p_client_phone text, p_date date, p_lines jsonb
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result  text;
  v_me      barbers%ROWTYPE;
  v_target  barbers%ROWTYPE;
  v_today   date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_now_min int := extract(hour FROM now() AT TIME ZONE 'America/Bogota')::int * 60
                   + extract(minute FROM now() AT TIME ZONE 'America/Bogota')::int;
  v_win     record;
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
  SELECT * INTO v_me FROM barbers WHERE id = p_barber_id;
  SELECT * INTO v_target FROM barbers WHERE id = p_target_barber_id;
  IF NOT FOUND OR v_target.id = v_me.id OR v_target.role IS DISTINCT FROM v_me.role THEN
    RETURN 'INVALID_BARBER';
  END IF;
  IF length(trim(coalesce(p_client_name, ''))) < 2 THEN
    RETURN 'INVALID_NAME';
  END IF;
  IF v_digits <> '' AND length(v_digits) < 10 THEN
    RETURN 'INVALID_PHONE';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 10 THEN
    RETURN 'INVALID_LINES';
  END IF;
  IF p_date IS NULL OR p_date < v_today OR p_date > v_today + 90 THEN
    RETURN 'INVALID_DATE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_date::text));
  SELECT * INTO v_win FROM barber_windows_for(p_date) w WHERE w.barber_id = v_target.id;

  -- Primero se revisa todo; si algo falla no se guarda nada
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_service FROM services WHERE id = (v_line ->> 'serviceId')::uuid AND active;
    IF NOT FOUND OR coalesce(v_line ->> 'time', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       OR NOT barber_does_service(v_target.id, v_service.id) THEN
      RETURN 'INVALID_LINES';
    END IF;
    v_start := time_to_minutes(v_line ->> 'time');
    v_end := v_start + v_service.duration;
    IF p_date = v_today AND v_start < v_now_min - 15 THEN
      RETURN 'INVALID_DATE';
    END IF;
    IF v_win.o_open IS NULL OR v_start < v_win.o_open OR v_end > v_win.o_close THEN
      RETURN 'SLOT_TAKEN';
    END IF;
    IF EXISTS (
      SELECT 1 FROM bookings bk LEFT JOIN services s ON s.id = bk.service_id
      WHERE bk.barber_id = v_target.id AND bk.date = p_date
        AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
        AND time_to_minutes(bk.time) < v_end AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
    ) OR EXISTS (
      SELECT 1 FROM closed_ranges_for(p_date) c
      WHERE (c.barber_id IS NULL OR c.barber_id = v_target.id) AND c.start_min < v_end AND c.end_min > v_start
    ) THEN
      RETURN 'SLOT_TAKEN';
    END IF;
  END LOOP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_service FROM services WHERE id = (v_line ->> 'serviceId')::uuid;
    INSERT INTO bookings (client_name, client_phone, client_email, service_id, service_name,
                          barber_id, barber_name, date, time, price, status, booked_by_barber_id)
    VALUES (trim(p_client_name), trim(coalesce(p_client_phone, '')), '', v_service.id, v_service.name,
            v_target.id, v_target.short_name, p_date, v_line ->> 'time',
            barber_price_for(v_target.id, v_service.id), 'confirmed', v_me.id);
  END LOOP;
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.barber_book_for(uuid, text, uuid, text, text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barber_book_for(uuid, text, uuid, text, text, date, jsonb) TO anon, authenticated;
