/*
  Reservas con hasta 90 días de anticipación (Panel → Configuración → Reglas → «Se puede reservar con
  anticipación de hasta»).

    · create_booking acepta fechas hasta los días configurados (daysAhead, máximo 90).
    · Panel → Turnos y el portal del barbero pueden cerrar turnos hasta 90 días adelante.
    · get_busy_slots_range: las horas ocupadas de varios días en una sola consulta, para que la
      página de reservas no haga una consulta por cada día.
*/

DO $migration$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.create_booking(uuid, uuid, date, text, text, text, text)'::regprocedure);
  v_new := replace(v_def, 'IF p_date > v_now::date + 30 THEN',
    $q$IF p_date > v_now::date + least(90, greatest(1, coalesce((SELECT (data ->> 'daysAhead')::int FROM business_settings WHERE id), 14))) THEN$q$);
  IF v_new = v_def THEN
    RAISE EXCEPTION 'create_booking: no se encontró el límite de 30 días';
  END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.barber_set_day_closures(uuid, text, date, jsonb)'::regprocedure);
  v_new := replace(v_def, 'p_date > v_today + 60', 'p_date > v_today + 90');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'barber_set_day_closures: no se encontró el límite de 60 días';
  END IF;
  EXECUTE v_new;
END
$migration$;

CREATE OR REPLACE FUNCTION public.get_busy_slots_range(p_start date, p_end date)
RETURNS TABLE (day date, barber_id uuid, start_time text, duration integer, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d::date, s.barber_id, s.start_time, s.duration, s.kind
  FROM generate_series(p_start, least(p_end, p_start + 100), interval '1 day') d
  CROSS JOIN LATERAL get_busy_slots(d::date, NULL) s;
$$;

REVOKE ALL ON FUNCTION public.get_busy_slots_range(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_busy_slots_range(date, date) TO anon, authenticated;
