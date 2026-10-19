/*
  El barbero cierra sus propios turnos de un día desde su portal (con su PIN).

  barber_set_day_closures(barbero, PIN, fecha, horas) reemplaza las horas cerradas de ESE barbero en
  esa fecha (business_settings.data.dayOverrides). No puede tocar lo que el administrador cerró para
  todo el salón, ni las horas de otros barberos, ni el horario del día.

  Devuelve 'OK' o un código: INVALID_PIN, PIN_LOCKED, INVALID_DATE, DAY_CLOSED, INVALID_RANGES.
  p_ranges: [{ "start": "HH:MM", "end": "HH:MM" }, ...]  (vacío = abre todas sus horas)
*/

CREATE OR REPLACE FUNCTION public.barber_set_day_closures(p_barber_id uuid, p_pin text, p_date date, p_ranges jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result   text;
  v_today    date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_hours    record;
  v_lunch    record;
  v_data     jsonb;
  v_override jsonb;
  v_mine     jsonb := '[]'::jsonb;
  v_range    jsonb;
  v_start    int;
  v_end      int;
  hhmm       text := '^([01]\d|2[0-3]):[0-5]\d$';
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;

  IF p_date IS NULL OR p_date < v_today OR p_date > v_today + 60 THEN
    RETURN 'INVALID_DATE';
  END IF;
  IF p_ranges IS NULL OR jsonb_typeof(p_ranges) <> 'array' OR jsonb_array_length(p_ranges) > 48 THEN
    RETURN 'INVALID_RANGES';
  END IF;

  -- Una edición a la vez sobre la configuración
  SELECT data INTO v_data FROM business_settings WHERE id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'DAY_CLOSED';
  END IF;

  SELECT * INTO v_hours FROM business_hours_for(p_date);
  IF v_hours.o_status <> 'OPEN' THEN
    RETURN 'DAY_CLOSED';
  END IF;

  FOR v_range IN SELECT * FROM jsonb_array_elements(p_ranges) LOOP
    IF coalesce(v_range ->> 'start', '') !~ hhmm OR coalesce(v_range ->> 'end', '') !~ hhmm THEN
      RETURN 'INVALID_RANGES';
    END IF;
    v_start := time_to_minutes(v_range ->> 'start');
    v_end := time_to_minutes(v_range ->> 'end');
    IF v_start >= v_end OR v_start < v_hours.o_open OR v_end > v_hours.o_close THEN
      RETURN 'INVALID_RANGES';
    END IF;
    v_mine := v_mine || jsonb_build_array(jsonb_build_object(
      'start', v_range ->> 'start', 'end', v_range ->> 'end', 'barberId', p_barber_id::text));
  END LOOP;

  -- Si el día no tenía ajuste, se crea con su horario normal y el almuerzo cerrado para todos
  v_override := day_override_for(p_date);
  IF v_override IS NULL THEN
    SELECT * INTO v_lunch FROM lunch_break_for(p_date);
    v_override := jsonb_build_object(
      'date', p_date::text,
      'open', lpad((v_hours.o_open / 60)::text, 2, '0') || ':' || lpad((v_hours.o_open % 60)::text, 2, '0'),
      'close', lpad((v_hours.o_close / 60)::text, 2, '0') || ':' || lpad((v_hours.o_close % 60)::text, 2, '0'),
      'closed', CASE WHEN v_lunch.o_start IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
        'start', lpad((v_lunch.o_start / 60)::text, 2, '0') || ':' || lpad((v_lunch.o_start % 60)::text, 2, '0'),
        'end', lpad((v_lunch.o_end / 60)::text, 2, '0') || ':' || lpad((v_lunch.o_end % 60)::text, 2, '0'))) END);
  END IF;

  -- Se conservan las horas del salón y de los demás barberos; se reemplazan solo las de este barbero
  v_override := jsonb_set(v_override, '{closed}', coalesce((
    SELECT jsonb_agg(c) FROM jsonb_array_elements(coalesce(v_override -> 'closed', '[]'::jsonb)) c
    WHERE coalesce(c ->> 'barberId', '') <> p_barber_id::text
  ), '[]'::jsonb) || v_mine);

  UPDATE business_settings
  SET data = jsonb_set(coalesce(v_data, '{}'::jsonb), '{dayOverrides}', coalesce((
        SELECT jsonb_agg(d) FROM jsonb_array_elements(coalesce(v_data -> 'dayOverrides', '[]'::jsonb)) d
        WHERE d ->> 'date' <> p_date::text
      ), '[]'::jsonb) || jsonb_build_array(v_override)),
      updated_at = now()
  WHERE id;
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.barber_set_day_closures(uuid, text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barber_set_day_closures(uuid, text, date, jsonb) TO anon, authenticated;
