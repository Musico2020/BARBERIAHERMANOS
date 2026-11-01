/*
  Cerrar o abrir días sin pisar lo que guardó otra pantalla.

  Turnos, Configuración → Días especiales y la Agenda guardaban la lista completa de días que tenían
  cargada; si otra pantalla (u otro teléfono) había cambiado un día mientras tanto, la lista vieja lo
  devolvía como estaba (p. ej. se cerraba mañana en Turnos y Configuración lo volvía a abrir).

  admin_set_days(p_changes) cambia SOLO las fechas que recibe, con la configuración bloqueada mientras
  tanto. p_changes = { "AAAA-MM-DD": { "special": {...} | null, "override": {...} | null }, ... }
  · "special": día especial (cerrado / orden de llegada) o null para quitarlo
  · "override": ajuste del día de Turnos o null para quitarlo
  Una clave que no viene no se toca. Solo administradores.
*/

CREATE OR REPLACE FUNCTION public.admin_set_days(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_data     jsonb;
  v_specials jsonb;
  v_overs    jsonb;
  v_date     text;
  v_change   jsonb;
  v_today    date := (now() AT TIME ZONE 'America/Bogota')::date;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_CHANGES';
  END IF;

  SELECT data INTO v_data FROM business_settings WHERE id FOR UPDATE;
  v_data := coalesce(v_data, '{}'::jsonb);
  v_specials := coalesce(v_data -> 'specialDays', '[]'::jsonb);
  v_overs := coalesce(v_data -> 'dayOverrides', '[]'::jsonb);

  FOR v_date, v_change IN SELECT * FROM jsonb_each(p_changes) LOOP
    IF v_date !~ '^\d{4}-\d{2}-\d{2}$' OR jsonb_typeof(v_change) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_CHANGES';
    END IF;
    IF v_change ? 'special' THEN
      v_specials := coalesce((SELECT jsonb_agg(d) FROM jsonb_array_elements(v_specials) d WHERE d ->> 'date' <> v_date), '[]'::jsonb);
      IF jsonb_typeof(v_change -> 'special') = 'object' THEN
        IF v_change -> 'special' ->> 'type' NOT IN ('closed', 'walk-in') THEN
          RAISE EXCEPTION 'INVALID_CHANGES';
        END IF;
        v_specials := v_specials || jsonb_build_array((v_change -> 'special') || jsonb_build_object('date', v_date));
      END IF;
    END IF;
    IF v_change ? 'override' THEN
      v_overs := coalesce((SELECT jsonb_agg(d) FROM jsonb_array_elements(v_overs) d WHERE d ->> 'date' <> v_date), '[]'::jsonb);
      IF jsonb_typeof(v_change -> 'override') = 'object' THEN
        IF coalesce(v_change -> 'override' ->> 'open', '') !~ '^\d{2}:\d{2}$' OR coalesce(v_change -> 'override' ->> 'close', '') !~ '^\d{2}:\d{2}$'
           OR jsonb_typeof(v_change -> 'override' -> 'closed') <> 'array' THEN
          RAISE EXCEPTION 'INVALID_CHANGES';
        END IF;
        v_overs := v_overs || jsonb_build_array((v_change -> 'override') || jsonb_build_object('date', v_date));
      END IF;
    END IF;
  END LOOP;

  -- Los ajustes de días que ya pasaron no se guardan más
  v_overs := coalesce((SELECT jsonb_agg(d ORDER BY d ->> 'date') FROM jsonb_array_elements(v_overs) d WHERE (d ->> 'date')::date >= v_today), '[]'::jsonb);
  v_specials := coalesce((SELECT jsonb_agg(d ORDER BY d ->> 'date') FROM jsonb_array_elements(v_specials) d), '[]'::jsonb);
  v_data := jsonb_set(jsonb_set(v_data, '{specialDays}', v_specials), '{dayOverrides}', v_overs);

  UPDATE business_settings SET data = v_data, updated_at = now() WHERE id;
  IF NOT FOUND THEN
    INSERT INTO business_settings (id, data, updated_at) VALUES (true, v_data, now());
  END IF;
  RETURN v_data;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_days(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_days(jsonb) TO authenticated;
