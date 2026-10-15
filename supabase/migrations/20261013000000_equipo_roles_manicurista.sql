/*
  Equipo con roles: además de barberos, la barbería puede tener manicurista(s).

  - barbers.role: 'barbero' o 'manicurista'.
  - Los servicios de la categoría 'manicura' solo se reservan con una manicurista,
    y los demás solo con barberos (create_booking lo valida: WRONG_PROFESSIONAL).
  - business_settings.data.allowAnyBarber: si es false, el cliente debe elegir con quién
    (se apaga «El primero que esté libre»; create_booking responde BARBER_REQUIRED).
*/

ALTER TABLE barbers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'barbero';
ALTER TABLE barbers DROP CONSTRAINT IF EXISTS barbers_role_check;
ALTER TABLE barbers ADD CONSTRAINT barbers_role_check CHECK (role IN ('barbero', 'manicurista'));

-- El PIN sigue oculto: se dan permisos solo sobre la columna nueva
GRANT SELECT (role) ON barbers TO anon, authenticated;
GRANT INSERT (role), UPDATE (role) ON barbers TO authenticated;

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

  -- Quién puede hacer el servicio: manicura → manicurista; lo demás → barbero
  v_role := CASE WHEN v_service.category = 'manicura' THEN 'manicurista' ELSE 'barbero' END;
  IF p_barber_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM barbers WHERE id = p_barber_id AND role = v_role) THEN
    RAISE EXCEPTION 'WRONG_PROFESSIONAL';
  END IF;
  -- «El primero que esté libre» se puede apagar desde Panel → Configuración
  IF p_barber_id IS NULL AND coalesce((SELECT (data ->> 'allowAnyBarber')::boolean FROM business_settings WHERE id), true) = false THEN
    RAISE EXCEPTION 'BARBER_REQUIRED';
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

GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, date, text, text, text, text) TO anon, authenticated;
