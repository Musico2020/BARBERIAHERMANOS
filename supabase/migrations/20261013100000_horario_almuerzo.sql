/*
  Horario de almuerzo: no se reciben reservas por la web en ese rango.

  - Se configura en Panel → Configuración → Horario (business_settings.data.lunch):
      { "enabled": true, "start": "12:00", "end": "13:00" }
    Sin valor guardado se usa 12:00 a 13:00, activo (igual que src/config/business.ts).
  - No aplica domingos ni festivos: esos días se atiende de corrido.
  - Lo valida un disparador sobre las reservas nuevas en estado 'pending', que son las que crea
    create_booking() desde la web. Las citas que el administrador registra desde el panel
    («Cliente nuevo», completadas o agendadas) no se bloquean.
*/

CREATE OR REPLACE FUNCTION public.lunch_break_for(p_date date, OUT o_start int, OUT o_end int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lunch jsonb;
BEGIN
  IF extract(isodow FROM p_date) = 7 OR is_colombian_holiday(p_date) THEN
    RETURN;
  END IF;
  SELECT coalesce(data -> 'lunch', '{"enabled": true, "start": "12:00", "end": "13:00"}'::jsonb)
    INTO v_lunch FROM business_settings WHERE id;
  v_lunch := coalesce(v_lunch, '{"enabled": true, "start": "12:00", "end": "13:00"}'::jsonb);
  IF NOT coalesce((v_lunch ->> 'enabled')::boolean, false) THEN
    RETURN;
  END IF;
  o_start := time_to_minutes(v_lunch ->> 'start');
  o_end := time_to_minutes(v_lunch ->> 'end');
END $$;

CREATE OR REPLACE FUNCTION public.reject_booking_in_lunch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lunch record;
  v_start int;
  v_duration int;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_lunch FROM lunch_break_for(NEW.date);
  IF v_lunch.o_start IS NULL THEN
    RETURN NEW;
  END IF;
  v_start := time_to_minutes(NEW.time);
  SELECT duration INTO v_duration FROM services WHERE id = NEW.service_id;
  IF v_start < v_lunch.o_end AND v_start + coalesce(v_duration, 30) > v_lunch.o_start THEN
    RAISE EXCEPTION 'LUNCH_BREAK';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_reject_lunch ON bookings;
CREATE TRIGGER bookings_reject_lunch
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION reject_booking_in_lunch();

REVOKE ALL ON FUNCTION public.lunch_break_for(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_booking_in_lunch() FROM PUBLIC, anon, authenticated;
