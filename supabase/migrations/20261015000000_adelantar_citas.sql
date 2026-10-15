/*
  Adelantar citas cuando el barbero termina antes de tiempo.

  Al marcar una cita de HOY como «Completada» antes de su hora de fin, las citas pendientes o
  confirmadas del mismo barbero que venían pegadas a ella (cada una empieza cuando termina la
  anterior) se corren a la hora en que el barbero quedó libre, en cadena. Así no se pierde tiempo.

  - Funciona igual si el estado se cambia desde el panel o desde el portal del barbero.
  - No se adelanta nada hacia el almuerzo ni antes de la hora actual.
  - Cada cita adelantada guarda su hora original (original_time) y cuándo se movió (shifted_at),
    para que el panel la marque y se le pueda avisar al cliente.
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_time text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS shifted_at timestamptz;

CREATE OR REPLACE FUNCTION public.advance_following_bookings()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_now     timestamp := now() AT TIME ZONE 'America/Bogota';
  v_now_min int;
  v_dur     int;
  v_end     int;   -- hora (en minutos) en que terminaba lo que ya se movió, según la agenda
  v_free    int;   -- hora en que el barbero realmente queda libre
  v_lunch   record;
  r         record;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' OR NEW.barber_id IS NULL OR NEW.date <> v_now::date THEN
    RETURN NEW;
  END IF;

  v_now_min := extract(hour FROM v_now)::int * 60 + extract(minute FROM v_now)::int;
  v_now_min := ((v_now_min + 4) / 5) * 5;  -- a los 5 minutos siguientes
  SELECT coalesce(duration, 30) INTO v_dur FROM services WHERE id = NEW.service_id;
  v_end := time_to_minutes(NEW.time) + coalesce(v_dur, 30);
  v_free := greatest(v_now_min, time_to_minutes(NEW.time));
  IF v_free >= v_end THEN
    RETURN NEW;  -- terminó a tiempo o tarde: no hay nada que adelantar
  END IF;

  SELECT * INTO v_lunch FROM lunch_break_for(NEW.date);

  FOR r IN
    SELECT b.id, b.time, coalesce(s.duration, 30) AS dur
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.barber_id = NEW.barber_id
      AND b.date = NEW.date
      AND b.id <> NEW.id
      AND b.status IN ('pending', 'confirmed')
      AND time_to_minutes(b.time) >= time_to_minutes(NEW.time)
    ORDER BY time_to_minutes(b.time)
  LOOP
    EXIT WHEN time_to_minutes(r.time) <> v_end;                       -- solo las que venían pegadas
    EXIT WHEN v_lunch.o_start IS NOT NULL
      AND v_free < v_lunch.o_end AND v_free + r.dur > v_lunch.o_start;  -- no se mete en el almuerzo
    UPDATE bookings
    SET original_time = coalesce(original_time, time),
        time = lpad((v_free / 60)::text, 2, '0') || ':' || lpad((v_free % 60)::text, 2, '0'),
        shifted_at = now(),
        updated_at = now()
    WHERE id = r.id;
    v_end := time_to_minutes(r.time) + r.dur;
    v_free := v_free + r.dur;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_advance_following ON bookings;
CREATE TRIGGER bookings_advance_following
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION advance_following_bookings();

REVOKE ALL ON FUNCTION public.advance_following_bookings() FROM PUBLIC, anon, authenticated;
