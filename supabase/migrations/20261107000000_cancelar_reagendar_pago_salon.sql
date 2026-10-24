-- ============================================================================
-- SALÓN HERMANOS · Migración 09: Cancelación, Reagendamiento y Pago en Salón
-- 
-- 1. client_cancel_booking: el cliente cancela su cita desde «Mis citas».
-- 2. client_reschedule_booking: el cliente reagenda su cita a una nueva fecha y hora.
-- 3. choose_pay_at_salon: el cliente agenda sin anticipo para pagar en la barbería.
-- 4. client_bookings: incluye barber_id, service_id y duración para reagendar con precisión.
--
-- Pegar y ejecutar en Supabase → SQL Editor → Run
-- ============================================================================

-- 1. Función para que el cliente cancele su cita
CREATE OR REPLACE FUNCTION public.client_cancel_booking(
  p_phone text,
  p_name text,
  p_booking_id uuid
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key   text := phone_key(p_phone);
  v_first text := split_part(plain_text(p_name), ' ', 1);
  v_booking bookings%ROWTYPE;
BEGIN
  IF length(v_key) < 10 OR length(v_first) < 2 THEN
    RETURN 'INVALID';
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN 'NOT_FOUND';
  END IF;

  -- Validar que la cita pertenezca a este cliente
  IF phone_key(v_booking.client_phone) <> v_key
     OR split_part(plain_text(v_booking.client_name), ' ', 1) <> v_first THEN
    RETURN 'UNAUTHORIZED';
  END IF;

  -- Solo se pueden cancelar citas pendientes o confirmadas
  IF v_booking.status IN ('completed', 'cancelled') THEN
    RETURN 'ALREADY_PROCESSED';
  END IF;

  UPDATE bookings
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_booking_id;

  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.client_cancel_booking(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_cancel_booking(text, text, uuid) TO anon, authenticated;


-- 2. Función para que el cliente reagende su cita
CREATE OR REPLACE FUNCTION public.client_reschedule_booking(
  p_phone text,
  p_name text,
  p_booking_id uuid,
  p_new_date date,
  p_new_time text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key       text := phone_key(p_phone);
  v_first     text := split_part(plain_text(p_name), ' ', 1);
  v_booking   bookings%ROWTYPE;
  v_service   services%ROWTYPE;
  v_start     integer;
  v_end       integer;
  v_hours     record;
  v_now       timestamp := now() AT TIME ZONE 'America/Bogota';
BEGIN
  IF length(v_key) < 10 OR length(v_first) < 2 THEN
    RETURN 'INVALID';
  END IF;
  IF p_new_time IS NULL OR p_new_time !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
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

  IF v_booking.status IN ('completed', 'cancelled') THEN
    RETURN 'ALREADY_PROCESSED';
  END IF;

  IF p_new_date < v_now::date
     OR (p_new_date = v_now::date AND time_to_minutes(p_new_time) <= extract(hour FROM v_now)::int * 60 + extract(minute FROM v_now)::int) THEN
    RETURN 'PAST_DATE';
  END IF;

  SELECT * INTO v_service FROM services WHERE id = v_booking.service_id;
  v_start := time_to_minutes(p_new_time);
  v_end   := v_start + coalesce(v_service.duration, 30);

  SELECT * INTO v_hours FROM business_hours_for(p_new_date);
  IF v_hours.o_status <> 'OPEN' THEN
    RETURN 'CLOSED_DAY';
  END IF;
  IF v_start < v_hours.o_open OR v_end > v_hours.o_close THEN
    RETURN 'INVALID_TIME';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('reschedule_booking:' || p_new_date::text));

  -- Verificar si el barbero ya tiene otra cita en ese horario
  IF v_booking.barber_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM bookings bk
      LEFT JOIN services s ON s.id = bk.service_id
      WHERE bk.barber_id = v_booking.barber_id
        AND bk.date = p_new_date
        AND bk.id <> p_booking_id
        AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
        AND time_to_minutes(bk.time) < v_end
        AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
    ) OR EXISTS (
      SELECT 1 FROM closed_ranges_for(p_new_date) c
      WHERE (c.barber_id IS NULL OR c.barber_id = v_booking.barber_id)
        AND c.start_min < v_end AND c.end_min > v_start
    ) THEN
      RETURN 'SLOT_TAKEN';
    END IF;
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

REVOKE ALL ON FUNCTION public.client_reschedule_booking(text, text, uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_reschedule_booking(text, text, uuid, date, text) TO anon, authenticated;


-- 3. Función para pagar en el salón sin anticipo
CREATE OR REPLACE FUNCTION public.choose_pay_at_salon(
  p_booking_ids uuid[]
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE bookings
  SET deposit_status = 'none',
      deposit_amount = 0,
      deposit_method = 'salon',
      deposit_expires_at = NULL,
      status = 'pending',
      updated_at = now()
  WHERE id = ANY (p_booking_ids);
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.choose_pay_at_salon(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.choose_pay_at_salon(uuid[]) TO anon, authenticated;


-- 4. Actualizar client_bookings para que también retorne barber_id, service_id y duración
CREATE OR REPLACE FUNCTION public.client_bookings(p_phone text, p_name text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key   text := phone_key(p_phone);
  v_first text := split_part(plain_text(p_name), ' ', 1);
  v_tries int;
  v_ok    boolean;
  v_name  text;
BEGIN
  IF length(v_key) < 10 OR length(v_first) < 2 THEN
    RETURN json_build_object('status', 'INVALID');
  END IF;

  SELECT count(*) INTO v_tries FROM client_lookup_attempts
  WHERE phone_key = v_key AND created_at > now() - interval '1 hour';
  IF v_tries >= 8 THEN
    RETURN json_build_object('status', 'TOO_MANY');
  END IF;

  SELECT trim(regexp_replace(client_name, '\s*\(turno \d+\)$', '')) INTO v_name
  FROM bookings
  WHERE phone_key(client_phone) = v_key
    AND split_part(plain_text(client_name), ' ', 1) = v_first
  ORDER BY created_at DESC
  LIMIT 1;
  v_ok := v_name IS NOT NULL;

  INSERT INTO client_lookup_attempts (phone_key, ok) VALUES (v_key, v_ok);
  DELETE FROM client_lookup_attempts WHERE created_at < now() - interval '2 days';

  IF NOT v_ok THEN
    RETURN json_build_object('status', 'NOT_FOUND');
  END IF;

  RETURN json_build_object(
    'status', 'OK',
    'name', v_name,
    'bookings', coalesce((
      SELECT json_agg(json_build_object(
               'id', b.id,
               'date', b.date,
               'time', b.time,
               'service', b.service_name,
               'serviceId', b.service_id,
               'duration', s.duration,
               'barber', b.barber_name,
               'barberId', b.barber_id,
               'status', b.status,
               'price', b.price,
               'deposit', b.deposit_amount,
               'depositStatus', b.deposit_status,
               'rating', r.rating,
               'comment', r.comment
             ) ORDER BY b.date DESC, b.time DESC)
      FROM (
        SELECT * FROM bookings
        WHERE phone_key(client_phone) = v_key
          AND date >= (now() AT TIME ZONE 'America/Bogota')::date - 365
          AND NOT (status = 'cancelled' AND deposit_status = 'expired')
        ORDER BY date DESC, time DESC
        LIMIT 100
      ) b
      LEFT JOIN services s ON s.id = b.service_id
      LEFT JOIN reviews r ON r.booking_id = b.id
    ), '[]'::json)
  );
END $$;

REVOKE ALL ON FUNCTION public.client_bookings(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_bookings(text, text) TO anon, authenticated;
