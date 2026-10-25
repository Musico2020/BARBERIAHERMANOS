/*
  Revisión de disponibilidad.

  1. Festivos y días con horario cambiado en Panel → Turnos: el horario propio de cada barbero ya no
     pasa por encima. Si ese día el salón atiende en un horario distinto al normal de ese día de la
     semana (festivo 9 a 1, o se cambió la apertura o el cierre en Turnos), cada barbero queda dentro de
     ese horario. Los días normales el horario propio sigue pudiendo ir más allá del salón.
     (Igual que barberHoursFor en src/lib/businessHours.ts.)

  2. Nunca dos citas activas encimadas: un trigger impide guardar una cita pendiente o confirmada que
     se cruce con otra pendiente o confirmada del mismo barbero, venga de donde venga (web, panel,
     portal del barbero o al mover en la Agenda). Las citas completadas (clientes ya atendidos) no se
     frenan.

  3. Estados automáticos: solo se completan solas las citas que ocupaban el turno (no las reservas que
     vencieron sin anticipo).
*/

-- 1 ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.barber_windows_for(p_date date)
RETURNS TABLE(barber_id uuid, o_open integer, o_close integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_h       record;
  v_regular jsonb;
  v_special boolean := false;
  r         record;
  v_open    int;
  v_close   int;
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
    IF v_h.o_status <> 'OPEN' OR coalesce((r.d ->> 'off')::boolean, false) THEN
      o_open := NULL; o_close := NULL;
    ELSIF r.d ->> 'open' ~ '^\d{2}:\d{2}$' AND r.d ->> 'close' ~ '^\d{2}:\d{2}$' THEN
      v_open := time_to_minutes(r.d ->> 'open');
      v_close := time_to_minutes(r.d ->> 'close');
      IF v_special THEN
        v_open := greatest(v_open, v_h.o_open);
        v_close := least(v_close, v_h.o_close);
      END IF;
      IF v_open < v_close THEN o_open := v_open; o_close := v_close; ELSE o_open := NULL; o_close := NULL; END IF;
    ELSE
      o_open := v_h.o_open; o_close := v_h.o_close;
    END IF;
    RETURN NEXT;
  END LOOP;
END $$;

-- 2 ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start int;
  v_end   int;
BEGIN
  IF NEW.barber_id IS NULL OR NEW.status NOT IN ('pending', 'confirmed')
     OR NOT booking_holds_slot(NEW.status, NEW.deposit_status, NEW.deposit_expires_at) THEN
    RETURN NEW;
  END IF;
  -- Al editar algo que no cambia la hora (nombre, valor…) no se revisa
  IF TG_OP = 'UPDATE' AND (NEW.barber_id, NEW.date, NEW.time, NEW.service_id, NEW.status)
     IS NOT DISTINCT FROM (OLD.barber_id, OLD.date, OLD.time, OLD.service_id, OLD.status) THEN
    RETURN NEW;
  END IF;
  v_start := time_to_minutes(NEW.time);
  v_end := v_start + coalesce((SELECT duration FROM services WHERE id = NEW.service_id), 30);
  IF EXISTS (
    SELECT 1 FROM bookings bk LEFT JOIN services s ON s.id = bk.service_id
    WHERE bk.barber_id = NEW.barber_id AND bk.date = NEW.date AND bk.id <> NEW.id
      AND bk.status IN ('pending', 'confirmed')
      AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
      AND time_to_minutes(bk.time) < v_end AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prevent_double_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_prevent_double ON bookings;
CREATE TRIGGER bookings_prevent_double
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION prevent_double_booking();

-- 3 ---------------------------------------------------------------------------------------------
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.auto_update_booking_statuses'::regproc);
  IF position('booking_holds_slot' IN v_def) = 0 THEN
    -- Solo la primera condición (la de completar), sin depender de los espacios ni saltos de línea
    v_def := regexp_replace(v_def,
      'WHERE b\.status IN \(''pending'', ''confirmed''\)(\s+)AND \(',
      'WHERE b.status IN (''pending'', ''confirmed'')\1AND booking_holds_slot(b.status, b.deposit_status, b.deposit_expires_at)\1AND (');
    IF position('booking_holds_slot' IN v_def) = 0 THEN
      RAISE EXCEPTION 'No se encontró dónde ajustar auto_update_booking_statuses';
    END IF;
    EXECUTE v_def;
  END IF;
END $$;
