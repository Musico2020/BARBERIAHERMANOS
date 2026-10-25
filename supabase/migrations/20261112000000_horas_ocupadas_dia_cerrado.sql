/*
  Horas ocupadas (get_busy_slots) con el horario del día incluido.

  Antes solo devolvía citas y horas cerradas; si una pantalla tenía la configuración vieja (abierta
  antes de cerrar el día en Panel → Turnos o en Días especiales), seguía ofreciendo horas de un día
  cerrado o de un horario recortado. Ahora también devuelve como «cerrado»:
    · todo el día, si ese día el salón está cerrado (día especial «cerrado» o día sin atención);
    · antes de que entre y después de que salga cada barbero ese día (horario del ajuste del día,
      del salón o el propio del barbero), y todo el día si ese barbero descansa.
  Los días «por orden de llegada» no se tocan (el panel puede registrar a quien llegue).
*/

CREATE OR REPLACE FUNCTION public.get_busy_slots(p_date date, p_barber_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(barber_id uuid, start_time text, duration integer, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH status AS (SELECT o_status FROM business_hours_for(p_date))
  SELECT bk.barber_id, bk.time, coalesce(s.duration, 30), 'booking'
  FROM bookings bk
  LEFT JOIN services s ON s.id = bk.service_id
  WHERE bk.date = p_date
    AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
    AND bk.barber_id IS NOT NULL
    AND (p_barber_id IS NULL OR bk.barber_id = p_barber_id)
  UNION ALL
  SELECT b.id,
         lpad((c.start_min / 60)::text, 2, '0') || ':' || lpad((c.start_min % 60)::text, 2, '0'),
         c.end_min - c.start_min,
         'closed'
  FROM closed_ranges_for(p_date) c
  JOIN barbers b ON (c.barber_id IS NULL OR b.id = c.barber_id)
  WHERE c.end_min > c.start_min
    AND (p_barber_id IS NULL OR b.id = p_barber_id)
  UNION ALL
  -- Día cerrado, o el barbero no trabaja ese día: todo el día
  SELECT w.barber_id, '00:00', 1440, 'closed'
  FROM barber_windows_for(p_date) w, status
  WHERE (status.o_status = 'CLOSED' OR (status.o_status = 'OPEN' AND w.o_open IS NULL))
    AND (p_barber_id IS NULL OR w.barber_id = p_barber_id)
  UNION ALL
  -- Antes de que entre
  SELECT w.barber_id, '00:00', w.o_open, 'closed'
  FROM barber_windows_for(p_date) w, status
  WHERE status.o_status = 'OPEN' AND w.o_open > 0
    AND (p_barber_id IS NULL OR w.barber_id = p_barber_id)
  UNION ALL
  -- Después de que sale
  SELECT w.barber_id,
         lpad((w.o_close / 60)::text, 2, '0') || ':' || lpad((w.o_close % 60)::text, 2, '0'),
         1440 - w.o_close, 'closed'
  FROM barber_windows_for(p_date) w, status
  WHERE status.o_status = 'OPEN' AND w.o_close < 1440
    AND (p_barber_id IS NULL OR w.barber_id = p_barber_id);
$$;
