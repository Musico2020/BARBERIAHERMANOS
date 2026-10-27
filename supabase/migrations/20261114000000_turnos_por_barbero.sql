/*
  Turnos por barbero: Turnos y Agenda dicen lo mismo.

  Un ajuste del día (business_settings.data.dayOverrides[]) puede llevar ahora "barbers": el horario de
  cada barbero ESE día, que manda sobre su horario de la semana (work_hours):
    "barbers": { "<id>": {"open":"09:00","close":"13:00"} | {"off": true}, ... }
  Así se puede:
    · abrir un día que el salón tiene cerrado solo para un barbero (los demás quedan {"off": true});
    · abrir un domingo para quien normalmente descansa;
    · dejar a un barbero sin trabajar un día, sin cerrar el salón.
  Los barberos que no aparecen siguen con su horario de la semana (y en festivos o días con horario
  cambiado, dentro del horario del día).

  barber_windows_for y closed_ranges_for lo usan, así que la reserva web, el panel, la Agenda y las
  horas ocupadas (get_busy_slots) quedan iguales. El barbero puede cambiar su propio horario de un día
  desde su portal con barber_set_day_hours.
*/

CREATE OR REPLACE FUNCTION public.barber_windows_for(p_date date)
RETURNS TABLE(barber_id uuid, o_open integer, o_close integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_h        record;
  v_regular  jsonb;
  v_override jsonb := day_override_for(p_date);
  v_special  boolean := false;
  r          record;
  v_day      jsonb;
  v_open     int;
  v_close    int;
BEGIN
  SELECT * INTO v_h FROM business_hours_for(p_date);
  SELECT data -> 'hours' -> (extract(isodow FROM p_date)::int - 1) INTO v_regular FROM business_settings WHERE id;
  IF v_h.o_status = 'OPEN' AND v_regular IS NOT NULL THEN
    v_special := coalesce((v_regular ->> 'closed')::boolean, false)
      OR v_h.o_open IS DISTINCT FROM time_to_minutes(v_regular ->> 'open')
      OR v_h.o_close IS DISTINCT FROM time_to_minutes(v_regular ->> 'close');
  END IF;

  FOR r IN SELECT b.id, b.work_hours -> extract(dow FROM p_date)::text AS d FROM barbers b LOOP
    barber_id := r.id;
    o_open := NULL; o_close := NULL;
    v_day := v_override -> 'barbers' -> r.id::text;
    IF v_h.o_status <> 'OPEN' THEN
      NULL;  -- salón cerrado o por orden de llegada
    ELSIF v_day IS NOT NULL THEN
      -- Horario de ese barbero ese día (Panel → Turnos o su portal)
      IF NOT coalesce((v_day ->> 'off')::boolean, false)
         AND v_day ->> 'open' ~ '^\d{2}:\d{2}$' AND v_day ->> 'close' ~ '^\d{2}:\d{2}$'
         AND time_to_minutes(v_day ->> 'open') < time_to_minutes(v_day ->> 'close') THEN
        o_open := time_to_minutes(v_day ->> 'open');
        o_close := time_to_minutes(v_day ->> 'close');
      END IF;
    ELSIF coalesce((r.d ->> 'off')::boolean, false) THEN
      NULL;  -- descansa ese día de la semana
    ELSIF r.d ->> 'open' ~ '^\d{2}:\d{2}$' AND r.d ->> 'close' ~ '^\d{2}:\d{2}$' THEN
      v_open := time_to_minutes(r.d ->> 'open');
      v_close := time_to_minutes(r.d ->> 'close');
      IF v_special THEN
        v_open := greatest(v_open, v_h.o_open);
        v_close := least(v_close, v_h.o_close);
      END IF;
      IF v_open < v_close THEN o_open := v_open; o_close := v_close; END IF;
    ELSE
      o_open := v_h.o_open; o_close := v_h.o_close;
    END IF;
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.closed_ranges_for(p_date date)
RETURNS TABLE(barber_id uuid, start_min integer, end_min integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Horas cerradas del día (Panel → Turnos o el portal del barbero)
  SELECT nullif(c ->> 'barberId', '')::uuid, time_to_minutes(c ->> 'start'), time_to_minutes(c ->> 'end')
  FROM jsonb_array_elements(coalesce(day_override_for(p_date) -> 'closed', '[]'::jsonb)) c
  WHERE c ->> 'start' ~ '^\d{2}:\d{2}$' AND c ->> 'end' ~ '^\d{2}:\d{2}$'
  UNION ALL
  -- Fuera del horario de trabajo de cada barbero ese día (el del ajuste del día o el de la semana)
  -- (día cerrado o el barbero no trabaja: todo el día; los días por orden de llegada no se tocan)
  SELECT w.barber_id, 0, 1440 FROM barber_windows_for(p_date) w
  WHERE w.o_open IS NULL AND (SELECT o_status FROM business_hours_for(p_date)) IN ('OPEN', 'CLOSED')
  UNION ALL
  SELECT w.barber_id, 0, w.o_open FROM barber_windows_for(p_date) w WHERE w.o_open > 0
  UNION ALL
  SELECT w.barber_id, w.o_close, 1440 FROM barber_windows_for(p_date) w WHERE w.o_close < 1440;
$$;

-- El barbero cambia SU horario de un día desde el portal: trabaja de tal a tal hora, o no trabaja.
-- Si ese día el salón está cerrado, se abre solo para él (los demás quedan sin trabajar).
CREATE OR REPLACE FUNCTION public.barber_set_day_hours(p_barber_id uuid, p_pin text, p_date date, p_open text, p_close text, p_off boolean)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result   text;
  v_today    date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_data     jsonb;
  v_override jsonb;
  v_special  jsonb;
  v_hours    record;
  v_lunch    record;
  v_regular  jsonb;
  v_open     text;
  v_close    text;
  v_others   jsonb := '{}'::jsonb;
  hhmm       text := '^([01]\d|2[0-3]):[0-5]\d$';
  b          record;
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;
  IF p_date IS NULL OR p_date < v_today OR p_date > v_today + 90 THEN
    RETURN 'INVALID_DATE';
  END IF;
  IF NOT coalesce(p_off, false) AND (coalesce(p_open, '') !~ hhmm OR coalesce(p_close, '') !~ hhmm
     OR time_to_minutes(p_open) >= time_to_minutes(p_close)) THEN
    RETURN 'INVALID_RANGES';
  END IF;

  SELECT data INTO v_data FROM business_settings WHERE id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'DAY_CLOSED';
  END IF;

  SELECT d INTO v_special FROM jsonb_array_elements(coalesce(v_data -> 'specialDays', '[]'::jsonb)) d
  WHERE d ->> 'date' = p_date::text LIMIT 1;
  IF v_special ->> 'type' = 'walk-in' THEN
    RETURN 'DAY_CLOSED';
  END IF;

  v_override := day_override_for(p_date);
  IF v_override IS NULL THEN
    IF v_special ->> 'type' = 'closed' THEN
      -- Salón cerrado: se abre con el horario normal de ese día (o 9 a 1) solo para este barbero
      v_regular := v_data -> 'hours' -> (extract(isodow FROM p_date)::int - 1);
      IF v_regular IS NULL OR coalesce((v_regular ->> 'closed')::boolean, false) THEN
        v_open := '09:00'; v_close := '13:00';
      ELSE
        v_open := v_regular ->> 'open'; v_close := v_regular ->> 'close';
      END IF;
      FOR b IN SELECT id FROM barbers WHERE id <> p_barber_id LOOP
        v_others := v_others || jsonb_build_object(b.id::text, '{"off": true}'::jsonb);
      END LOOP;
      v_override := jsonb_build_object('date', p_date::text, 'open', v_open, 'close', v_close, 'closed', '[]'::jsonb, 'barbers', v_others);
    ELSE
      SELECT * INTO v_hours FROM business_hours_for(p_date);
      IF v_hours.o_status <> 'OPEN' THEN
        -- Día que normalmente no se abre (p. ej. domingo sin horario): solo para este barbero
        FOR b IN SELECT id FROM barbers WHERE id <> p_barber_id LOOP
          v_others := v_others || jsonb_build_object(b.id::text, '{"off": true}'::jsonb);
        END LOOP;
        v_override := jsonb_build_object('date', p_date::text, 'open', '09:00', 'close', '13:00', 'closed', '[]'::jsonb, 'barbers', v_others);
      ELSE
        SELECT * INTO v_lunch FROM lunch_break_for(p_date);
        v_override := jsonb_build_object(
          'date', p_date::text,
          'open', lpad((v_hours.o_open / 60)::text, 2, '0') || ':' || lpad((v_hours.o_open % 60)::text, 2, '0'),
          'close', lpad((v_hours.o_close / 60)::text, 2, '0') || ':' || lpad((v_hours.o_close % 60)::text, 2, '0'),
          'closed', CASE WHEN v_lunch.o_start IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
            'start', lpad((v_lunch.o_start / 60)::text, 2, '0') || ':' || lpad((v_lunch.o_start % 60)::text, 2, '0'),
            'end', lpad((v_lunch.o_end / 60)::text, 2, '0') || ':' || lpad((v_lunch.o_end % 60)::text, 2, '0'))) END);
      END IF;
    END IF;
  END IF;

  v_override := jsonb_set(v_override, '{barbers}', coalesce(v_override -> 'barbers', '{}'::jsonb)
    || jsonb_build_object(p_barber_id::text,
         CASE WHEN coalesce(p_off, false) THEN '{"off": true}'::jsonb ELSE jsonb_build_object('open', p_open, 'close', p_close) END));

  UPDATE business_settings
  SET data = jsonb_set(
        jsonb_set(coalesce(v_data, '{}'::jsonb), '{dayOverrides}', coalesce((
          SELECT jsonb_agg(d) FROM jsonb_array_elements(coalesce(v_data -> 'dayOverrides', '[]'::jsonb)) d
          WHERE d ->> 'date' <> p_date::text
        ), '[]'::jsonb) || jsonb_build_array(v_override)),
        '{specialDays}', coalesce((
          SELECT jsonb_agg(d) FROM jsonb_array_elements(coalesce(v_data -> 'specialDays', '[]'::jsonb)) d
          WHERE d ->> 'date' <> p_date::text OR d ->> 'type' <> 'closed'
        ), '[]'::jsonb)),
      updated_at = now()
  WHERE id;
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.barber_set_day_hours(uuid, text, date, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barber_set_day_hours(uuid, text, date, text, text, boolean) TO anon, authenticated;
