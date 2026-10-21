/*
  Una cita que el administrador confirma a mano siempre ocupa su hora.

  Problema: una reserva web que esperaba el anticipo y el administrador pasó a «Confirmada» desde el
  menú de estado seguía con deposit_status 'awaiting' (o 'expired'). Al vencer el plazo:
    · booking_holds_slot la daba por libre → la web ofrecía esa hora a otro cliente (citas cruzadas);
    · expire_unpaid_bookings la podía cancelar sola.

  Arreglo:
    · booking_holds_slot: solo una cita PENDIENTE con el plazo del anticipo vencido deja de ocupar la hora.
    · expire_unpaid_bookings: solo cancela citas pendientes.
    · Al confirmar o completar una cita que esperaba el anticipo (o venció), queda «sin anticipo» ('none'):
      el administrador decidió atenderla igual. «Pago recibido» sigue marcando 'verified'.
    · Se corrigen las citas que ya estaban así.
*/

CREATE OR REPLACE FUNCTION public.booking_holds_slot(p_status text, p_deposit_status text, p_expires timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT p_status = 'confirmed'
      OR (p_status = 'pending'
          AND NOT (p_deposit_status IN ('awaiting', 'expired') AND p_expires IS NOT NULL AND p_expires < now()));
$$;

CREATE OR REPLACE FUNCTION public.expire_unpaid_bookings()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE bookings
  SET status = 'cancelled', deposit_status = 'expired', updated_at = now()
  WHERE deposit_status = 'awaiting' AND deposit_expires_at < now() AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.confirmed_without_deposit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('confirmed', 'completed') AND NEW.deposit_status IN ('awaiting', 'expired') THEN
    NEW.deposit_status := 'none';
    NEW.deposit_expires_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_confirmed_without_deposit ON bookings;
CREATE TRIGGER bookings_confirmed_without_deposit
  BEFORE INSERT OR UPDATE OF status, deposit_status ON bookings
  FOR EACH ROW EXECUTE FUNCTION confirmed_without_deposit();

-- Las que ya estaban confirmadas o completadas esperando un anticipo vencido
UPDATE bookings
SET deposit_status = 'none', deposit_expires_at = NULL, updated_at = now()
WHERE status IN ('confirmed', 'completed') AND deposit_status IN ('awaiting', 'expired');
