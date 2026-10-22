/*
  Actualización automática de estados de reservas:
  1. Al reservar: la cita queda 'pending'.
  2. Al llegar la hora de inicio: pasa automáticamente a 'confirmed'.
  3. Al terminar la duración de la cita: pasa automáticamente a 'completed'.
  4. 'cancelled' y 'no-show' se preservan siempre.
*/

CREATE OR REPLACE FUNCTION public.auto_update_booking_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_bogota timestamp := (now() AT TIME ZONE 'America/Bogota');
  v_today date := v_now_bogota::date;
  v_now_min int := extract(hour FROM v_now_bogota)::int * 60 + extract(minute FROM v_now_bogota)::int;
  v_updated int := 0;
  v_count int := 0;
BEGIN
  -- 1. Pasar a 'completed' citas cuya hora de finalización ya pasó
  WITH to_complete AS (
    SELECT b.id
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.status IN ('pending', 'confirmed')
      AND (
        b.date < v_today
        OR (
          b.date = v_today
          AND v_now_min >= (time_to_minutes(b.time) + coalesce(s.duration, 30))
        )
      )
  )
  UPDATE bookings
  SET status = 'completed',
      updated_at = now()
  WHERE id IN (SELECT id FROM to_complete);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_updated := v_updated + v_count;

  -- 2. Pasar a 'confirmed' citas cuya hora de inicio ya llegó pero no han terminado
  WITH to_confirm AS (
    SELECT b.id
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.status = 'pending'
      AND b.date = v_today
      AND v_now_min >= time_to_minutes(b.time)
      AND v_now_min < (time_to_minutes(b.time) + coalesce(s.duration, 30))
  )
  UPDATE bookings
  SET status = 'confirmed',
      updated_at = now()
  WHERE id IN (SELECT id FROM to_confirm);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_updated := v_updated + v_count;

  RETURN v_updated;
END $$;

GRANT EXECUTE ON FUNCTION public.auto_update_booking_statuses() TO anon, authenticated;

-- Actualizar barber_get_bookings para refrescar antes de devolver citas
CREATE OR REPLACE FUNCTION public.barber_get_bookings(p_barber_id uuid, p_pin text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result text;
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN json_build_object('error', v_result);
  END IF;

  PERFORM public.auto_update_booking_statuses();

  RETURN json_build_object('bookings', coalesce(
    (SELECT json_agg(b ORDER BY b.date DESC, b.time ASC) FROM bookings b WHERE b.barber_id = p_barber_id),
    '[]'::json));
END $$;
