/*
  Arreglo de choose_pay_at_salon («Pagar en el salón» en el paso del anticipo).

  · Fallaba siempre: guardaba deposit_method = 'salon', que la restricción de la tabla no acepta.
  · Y no revisaba nada: con el id de cualquier cita se podía quitar su anticipo o devolver a «pendiente»
    una cita completada o confirmada.

  Ahora solo cambia citas de la web que todavía esperan el anticipo (deposit_status 'awaiting', estado
  pendiente, creadas hace menos de 3 horas) y las deja como reserva sin anticipo (pago en el salón).
  Devuelve 'OK' o 'NOT_FOUND'.
*/

CREATE OR REPLACE FUNCTION public.choose_pay_at_salon(p_booking_ids uuid[])
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL OR array_length(p_booking_ids, 1) > 10 THEN
    RETURN 'NOT_FOUND';
  END IF;

  UPDATE bookings
  SET deposit_status = 'none',
      deposit_amount = 0,
      deposit_method = NULL,
      deposit_expires_at = NULL,
      updated_at = now()
  WHERE id = ANY (p_booking_ids)
    AND deposit_status = 'awaiting'
    AND status = 'pending'
    AND created_at > now() - interval '3 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN CASE WHEN v_count > 0 THEN 'OK' ELSE 'NOT_FOUND' END;
END $$;

REVOKE ALL ON FUNCTION public.choose_pay_at_salon(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.choose_pay_at_salon(uuid[]) TO anon, authenticated;
