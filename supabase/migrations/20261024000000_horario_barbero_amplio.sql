/*
  El horario propio del barbero manda sobre el del salón, también para trabajar más tarde
  (o más temprano) que el horario general. Ej.: el salón cierra a las 7:00 p. m. y Walter atiende
  hasta las 8:00 p. m. → a Walter se le pueden reservar turnos hasta las 8.

  barber_windows_for(fecha) da la ventana de trabajo de cada barbero ese día:
    · el salón no abre ese día (cerrado / orden de llegada) → nadie (null)
    · el barbero descansa ese día → null
    · tiene horario propio → su entrada y salida
    · si no → el horario del salón de ese día (con festivos y ajustes de Panel → Turnos)
  Las horas cerradas, el almuerzo y las citas se siguen respetando como antes.
*/

CREATE OR REPLACE FUNCTION public.barber_windows_for(p_date date)
RETURNS TABLE (barber_id uuid, o_open int, o_close int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.id,
         CASE WHEN h.o_status <> 'OPEN' OR coalesce((d ->> 'off')::boolean, false) THEN NULL
              WHEN d ->> 'open' ~ '^\d{2}:\d{2}$' THEN time_to_minutes(d ->> 'open')
              ELSE h.o_open END,
         CASE WHEN h.o_status <> 'OPEN' OR coalesce((d ->> 'off')::boolean, false) THEN NULL
              WHEN d ->> 'close' ~ '^\d{2}:\d{2}$' THEN time_to_minutes(d ->> 'close')
              ELSE h.o_close END
  FROM barbers b
  CROSS JOIN business_hours_for(p_date) h
  CROSS JOIN LATERAL (SELECT b.work_hours -> extract(dow FROM p_date)::text AS d) x;
$$;

REVOKE ALL ON FUNCTION public.barber_windows_for(date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- create_booking: igual que antes, pero la hora se valida con la ventana de cada barbero
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
  v_deposit   jsonb;
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
  -- La hora tiene que caber en el horario de trabajo del barbero (o de alguno, si no se eligió)
  IF NOT EXISTS (
    SELECT 1 FROM barber_windows_for(p_date) w JOIN barbers b ON b.id = w.barber_id
    WHERE b.role = v_role AND (p_barber_id IS NULL OR b.id = p_barber_id)
      AND w.o_open IS NOT NULL AND v_start >= w.o_open AND v_end <= w.o_close
  ) THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_date::text));
  -- Las citas vencidas sin anticipo se cancelan antes de buscar barbero libre
  PERFORM expire_unpaid_bookings();

  -- Anticipo: porcentaje del precio, redondeado hacia arriba a $100
  SELECT data -> 'deposit' INTO v_deposit FROM business_settings WHERE id;
  v_deposit := coalesce(v_deposit, '{"enabled": true, "percent": 50, "minutes": 30}'::jsonb);
  IF coalesce((v_deposit ->> 'enabled')::boolean, true) AND coalesce((v_deposit ->> 'percent')::int, 50) > 0 THEN
    v_amount := (ceil(v_service.price * least(100, coalesce((v_deposit ->> 'percent')::int, 50)) / 100.0 / 100.0) * 100)::int;
    v_expires := now() + make_interval(mins => greatest(5, least(240, coalesce((v_deposit ->> 'minutes')::int, 30))));
  END IF;

  FOR v_barber IN
    SELECT b.* FROM barbers b
    JOIN barber_windows_for(p_date) w ON w.barber_id = b.id
    WHERE b.available AND b.role = v_role AND (p_barber_id IS NULL OR b.id = p_barber_id)
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
      INSERT INTO bookings (client_name, client_phone, client_email, service_id, service_name,
                            barber_id, barber_name, date, time, price, status,
                            deposit_amount, deposit_status, deposit_expires_at)
      VALUES (trim(p_client_name), trim(p_client_phone), coalesce(trim(p_client_email), ''),
              v_service.id, v_service.name, v_barber.id, v_barber.short_name,
              p_date, p_time, v_service.price, 'pending',
              v_amount, CASE WHEN v_amount > 0 THEN 'awaiting' ELSE 'none' END, v_expires)
      RETURNING id INTO v_id;

      RETURN json_build_object(
        'booking_id', v_id,
        'barber_id', v_barber.id,
        'barber_name', v_barber.name,
        'barber_short_name', v_barber.short_name,
        'deposit_amount', v_amount,
        'deposit_expires_at', v_expires
      );
    END IF;
  END LOOP;

  IF p_barber_id IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;
  RAISE EXCEPTION 'NO_BARBER_AVAILABLE';
END $$;

GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, date, text, text, text, text) TO anon, authenticated;
