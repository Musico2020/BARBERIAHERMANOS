/*
  «Cliente nuevo» desde el portal del barbero (pestaña Agenda), con su PIN.

  barber_add_client(barbero, PIN, cliente, celular, fecha, servicios, agendar)
    · agendar = false → «Atendido ahora»: hoy, desde la hora actual, como servicio completado.
    · agendar = true  → «Agendar cita»: la fecha y la hora escogidas, como cita confirmada. No puede
      cruzarse con otra cita ni con horas cerradas de ese barbero.
  Las citas siempre quedan a nombre del barbero que entra (no puede registrar a otro) y con el precio
  del servicio (el valor solo lo cambia el administrador). No pide anticipo.

  p_lines: [{ "serviceId": uuid, "time": "HH:MM" }, ...] (uno por servicio, uno detrás de otro)
  Devuelve 'OK' o un código: INVALID_PIN, PIN_LOCKED, INVALID_NAME, INVALID_PHONE, INVALID_LINES,
  INVALID_DATE, SLOT_TAKEN.
*/

CREATE OR REPLACE FUNCTION public.barber_add_client(
  p_barber_id uuid,
  p_pin text,
  p_client_name text,
  p_client_phone text,
  p_date date,
  p_lines jsonb,
  p_schedule boolean
)
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

  -- Primero se revisa todo; si algo falla no se guarda nada
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_service FROM services WHERE id = (v_line ->> 'serviceId')::uuid;
    IF NOT FOUND OR coalesce(v_line ->> 'time', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
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
            v_line ->> 'time', v_service.price,
            CASE WHEN p_schedule THEN 'confirmed' ELSE 'completed' END,
            CASE WHEN p_schedule THEN NULL ELSE now() END);
  END LOOP;
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.barber_add_client(uuid, text, text, text, date, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barber_add_client(uuid, text, text, text, date, jsonb, boolean) TO anon, authenticated;
