/*
  El barbero puede cerrar también las horas de su horario propio que están por fuera del horario del
  salón (p. ej. el salón cierra a las 12 y él trabaja hasta las 8: antes no podía cerrar su tarde,
  la base respondía INVALID_RANGES). Ahora se valida contra el horario del salón o el suyo de ese día.
*/
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.barber_set_day_closures'::regproc);
  IF position('v_start < v_hours.o_open OR v_end > v_hours.o_close' IN v_def) = 0 THEN
    RAISE EXCEPTION 'No se encontró dónde ajustar barber_set_day_closures';
  END IF;
  v_def := replace(v_def, 'v_start < v_hours.o_open OR v_end > v_hours.o_close',
    'v_start < least(v_hours.o_open, coalesce((SELECT w.o_open FROM barber_windows_for(p_date) w WHERE w.barber_id = p_barber_id), v_hours.o_open))'
    || ' OR v_end > greatest(v_hours.o_close, coalesce((SELECT w.o_close FROM barber_windows_for(p_date) w WHERE w.barber_id = p_barber_id), v_hours.o_close))');
  EXECUTE v_def;
END $$;
