/*
  Horario de trabajo de cada barbero (Panel → Barberos → Editar perfil).

  barbers.work_hours guarda, por día de la semana (0 = domingo … 6 = sábado):
    { "1": { "open": "09:00", "close": "17:00" }, "0": { "off": true } }
  Un día que no aparece sigue el horario del salón. Fuera de su horario el barbero no recibe
  reservas: closed_ranges_for() devuelve esas horas como cerradas para él, y así lo respetan
  get_busy_slots (web y chat) y create_booking.
*/

ALTER TABLE barbers ADD COLUMN IF NOT EXISTS work_hours jsonb NOT NULL DEFAULT '{}'::jsonb;
GRANT SELECT (work_hours) ON barbers TO anon, authenticated;
GRANT INSERT (work_hours), UPDATE (work_hours) ON barbers TO authenticated;

CREATE OR REPLACE FUNCTION public.closed_ranges_for(p_date date)
RETURNS TABLE (barber_id uuid, start_min int, end_min int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Horas cerradas del día (Panel → Turnos o el portal del barbero)
  SELECT nullif(c ->> 'barberId', '')::uuid, time_to_minutes(c ->> 'start'), time_to_minutes(c ->> 'end')
  FROM jsonb_array_elements(coalesce(day_override_for(p_date) -> 'closed', '[]'::jsonb)) c
  WHERE c ->> 'start' ~ '^\d{2}:\d{2}$' AND c ->> 'end' ~ '^\d{2}:\d{2}$'
  UNION ALL
  -- Horario de trabajo del barbero: el día que descansa, todo el día
  SELECT b.id, 0, 1440
  FROM barbers b
  WHERE coalesce((b.work_hours -> extract(dow FROM p_date)::text ->> 'off')::boolean, false)
  UNION ALL
  -- … y antes de que entre
  SELECT b.id, 0, time_to_minutes(d ->> 'open')
  FROM barbers b, LATERAL (SELECT b.work_hours -> extract(dow FROM p_date)::text AS d) x
  WHERE NOT coalesce((d ->> 'off')::boolean, false) AND d ->> 'open' ~ '^\d{2}:\d{2}$'
  UNION ALL
  -- … y después de la hora hasta la que trabaja
  SELECT b.id, time_to_minutes(d ->> 'close'), 1440
  FROM barbers b, LATERAL (SELECT b.work_hours -> extract(dow FROM p_date)::text AS d) x
  WHERE NOT coalesce((d ->> 'off')::boolean, false) AND d ->> 'close' ~ '^\d{2}:\d{2}$';
$$;
