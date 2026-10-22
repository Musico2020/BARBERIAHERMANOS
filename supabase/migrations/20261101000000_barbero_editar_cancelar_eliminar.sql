/*
  El barbero puede editar, cancelar y eliminar SUS reservas desde su portal (con su PIN).

  · barber_set_status: además de confirmar, completar y «no asistió», ahora también cancelar.
  · barber_delete_booking(barbero, PIN, cita): borra una cita suya.
  · barber_edit_booking(barbero, PIN, cita, cliente, celular, servicio, fecha, hora): cambia los datos
    de una cita suya. Sigue siendo suya (no puede pasarla a otro barbero), el valor es el del servicio
    (si no cambia el servicio se conserva el que tenía) y la nueva hora no puede cruzarse con otra cita
    ni con horas cerradas.
  Devuelven 'OK' o un código: INVALID_PIN, PIN_LOCKED, BOOKING_NOT_FOUND, INVALID_STATUS,
  INVALID_NAME, INVALID_PHONE, INVALID_SERVICE, INVALID_DATE, INVALID_TIME, SLOT_TAKEN.
*/

CREATE OR REPLACE FUNCTION public.barber_set_status(p_barber_id uuid, p_pin text, p_booking_id uuid, p_status text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result text;
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;
  IF p_status NOT IN ('confirmed', 'completed', 'no-show', 'cancelled') THEN
    RETURN 'INVALID_STATUS';
  END IF;
  UPDATE bookings SET status = p_status, updated_at = now()
  WHERE id = p_booking_id AND barber_id = p_barber_id;
  IF NOT FOUND THEN
    RETURN 'BOOKING_NOT_FOUND';
  END IF;
  RETURN 'OK';
END $$;

CREATE OR REPLACE FUNCTION public.barber_delete_booking(p_barber_id uuid, p_pin text, p_booking_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result text;
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;
  DELETE FROM bookings WHERE id = p_booking_id AND barber_id = p_barber_id;
  IF NOT FOUND THEN
    RETURN 'BOOKING_NOT_FOUND';
  END IF;
  RETURN 'OK';
END $$;

CREATE OR REPLACE FUNCTION public.barber_edit_booking(
  p_barber_id uuid,
  p_pin text,
  p_booking_id uuid,
  p_client_name text,
  p_client_phone text,
  p_service_id uuid,
  p_date date,
  p_time text
)
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
  IF NOT FOUND THEN
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
  -- Si cambió el día, la hora o el servicio, la nueva hora tiene que estar libre (sin contar esta cita)
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
      price = CASE WHEN v_service.id = v_booking.service_id THEN v_booking.price ELSE v_service.price END,
      date = p_date,
      time = p_time,
      original_time = NULL,
      shifted_at = NULL,
      updated_at = now()
  WHERE id = p_booking_id;
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.barber_delete_booking(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.barber_edit_booking(uuid, text, uuid, text, text, uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barber_delete_booking(uuid, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barber_edit_booking(uuid, text, uuid, text, text, uuid, date, text) TO anon, authenticated;
