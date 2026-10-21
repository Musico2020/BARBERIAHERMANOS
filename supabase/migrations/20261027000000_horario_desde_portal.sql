/*
  El barbero cambia su propio horario de trabajo desde su portal (Mi perfil), con su PIN.

  barber_set_work_hours(barbero, PIN, horario) reemplaza barbers.work_hours de ESE barbero.
  Mismo formato que en Panel → Barberos: { "1": { "open": "09:00", "close": "18:00" }, "0": { "off": true } }
  (un día que no aparece sigue el horario del salón).

  Devuelve 'OK' o un código: INVALID_PIN, PIN_LOCKED, INVALID_HOURS.
*/

CREATE OR REPLACE FUNCTION public.barber_set_work_hours(p_barber_id uuid, p_pin text, p_hours jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result text;
  v_key    text;
  v_day    jsonb;
  v_clean  jsonb := '{}'::jsonb;
  hhmm     text := '^([01]\d|2[0-3]):[0-5]\d$';
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;

  IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'object' THEN
    RETURN 'INVALID_HOURS';
  END IF;

  FOR v_key, v_day IN SELECT * FROM jsonb_each(p_hours) LOOP
    IF v_key !~ '^[0-6]$' OR jsonb_typeof(v_day) <> 'object' THEN
      RETURN 'INVALID_HOURS';
    END IF;
    IF coalesce((v_day ->> 'off')::boolean, false) THEN
      v_clean := v_clean || jsonb_build_object(v_key, jsonb_build_object('off', true));
    ELSE
      IF coalesce(v_day ->> 'open', '') !~ hhmm OR coalesce(v_day ->> 'close', '') !~ hhmm
         OR time_to_minutes(v_day ->> 'open') >= time_to_minutes(v_day ->> 'close') THEN
        RETURN 'INVALID_HOURS';
      END IF;
      v_clean := v_clean || jsonb_build_object(v_key, jsonb_build_object('open', v_day ->> 'open', 'close', v_day ->> 'close'));
    END IF;
  END LOOP;

  UPDATE barbers SET work_hours = v_clean, updated_at = now() WHERE id = p_barber_id;
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.barber_set_work_hours(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barber_set_work_hours(uuid, text, jsonb) TO anon, authenticated;
