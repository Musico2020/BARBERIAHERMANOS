/*
  Anticipo: tres formas de separar la hora.

    · Anticipo por transferencia (50 % por defecto) con el QR de Nequi / Bre-B.
    · Pago total por transferencia (100 %), si deposit.allowFull no es false.
    · Efectivo en el salón, si deposit.allowCash no es false: el cliente se compromete a ir al
      salón a pagar el anticipo antes de su cita. La cita queda con deposit_status = 'cash_pending'
      (no vence sola; el administrador la confirma o la cancela en Panel → Pagos).

  En todos los casos el cliente debe aceptar las condiciones (si paga por transferencia y no asiste,
  pierde el dinero; si elige efectivo, debe cumplir e ir a pagar). Queda constancia en
  deposit_terms_at, deposit_method y deposit_terms (el texto que aceptó).
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_method text;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_deposit_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_deposit_method_check
  CHECK (deposit_method IS NULL OR deposit_method IN ('transfer', 'cash'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_terms_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_terms text;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_deposit_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_deposit_status_check
  CHECK (deposit_status IN ('none', 'awaiting', 'submitted', 'cash_pending', 'verified', 'rejected', 'expired'));

DROP INDEX IF EXISTS bookings_deposit_status_idx;
CREATE INDEX bookings_deposit_status_idx ON bookings (deposit_status)
  WHERE deposit_status IN ('awaiting', 'submitted', 'cash_pending');

-- Revisa que el grupo de citas siga esperando el anticipo. Devuelve 'OK', 'NOT_FOUND' o 'EXPIRED'.
CREATE OR REPLACE FUNCTION public.deposit_group_check(p_booking_ids uuid[])
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_found integer;
BEGIN
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL OR array_length(p_booking_ids, 1) > 10 THEN
    RETURN 'NOT_FOUND';
  END IF;
  SELECT count(*) INTO v_found FROM bookings
  WHERE id = ANY (p_booking_ids) AND deposit_status IN ('awaiting', 'submitted') AND status IN ('pending', 'confirmed');
  IF v_found <> array_length(p_booking_ids, 1) THEN
    IF EXISTS (SELECT 1 FROM bookings WHERE id = ANY (p_booking_ids) AND deposit_status = 'expired') THEN
      RETURN 'EXPIRED';
    END IF;
    RETURN 'NOT_FOUND';
  END IF;
  -- 10 minutos de gracia sobre el plazo
  IF EXISTS (SELECT 1 FROM bookings WHERE id = ANY (p_booking_ids) AND deposit_status = 'awaiting'
             AND deposit_expires_at < now() - interval '10 minutes') THEN
    RETURN 'EXPIRED';
  END IF;
  RETURN 'OK';
END $$;

-- ---------------------------------------------------------------------
-- Transferencia: el cliente envía el comprobante del anticipo o del pago total.
-- Devuelve 'OK', 'NOT_FOUND', 'EXPIRED' o 'TERMS_REQUIRED'.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_deposit(uuid[], text, text);

CREATE OR REPLACE FUNCTION public.submit_deposit(
  p_booking_ids  uuid[],
  p_payer        text,
  p_receipt_path text,
  p_full         boolean DEFAULT false,
  p_accept_terms boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_check text;
  v_full  boolean;
BEGIN
  IF NOT coalesce(p_accept_terms, false) THEN
    RETURN 'TERMS_REQUIRED';
  END IF;
  v_check := deposit_group_check(p_booking_ids);
  IF v_check <> 'OK' THEN
    RETURN v_check;
  END IF;
  IF p_receipt_path IS NULL OR split_part(p_receipt_path, '/', 1) <> p_booking_ids[1]::text THEN
    RETURN 'NOT_FOUND';
  END IF;

  v_full := coalesce(p_full, false)
    AND coalesce((SELECT (data #>> '{deposit,allowFull}')::boolean FROM business_settings WHERE id), true);

  UPDATE bookings
  SET deposit_status = 'submitted',
      deposit_method = 'transfer',
      deposit_amount = CASE WHEN v_full THEN price ELSE deposit_amount END,
      deposit_payer = left(trim(coalesce(p_payer, '')), 80),
      deposit_receipt_path = p_receipt_path,
      deposit_submitted_at = now(),
      deposit_terms_at = now(),
      deposit_terms = 'Pago por transferencia. Si no asiste a la cita, pierde el dinero pagado.',
      updated_at = now()
  WHERE id = ANY (p_booking_ids);
  RETURN 'OK';
END $$;

-- ---------------------------------------------------------------------
-- Efectivo: el cliente se compromete a ir al salón a pagar el anticipo antes de su cita.
-- Devuelve 'OK', 'NOT_FOUND', 'EXPIRED', 'TERMS_REQUIRED' o 'CASH_DISABLED'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.choose_cash_deposit(p_booking_ids uuid[], p_accept_terms boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_check text;
BEGIN
  IF NOT coalesce(p_accept_terms, false) THEN
    RETURN 'TERMS_REQUIRED';
  END IF;
  IF NOT coalesce((SELECT (data #>> '{deposit,allowCash}')::boolean FROM business_settings WHERE id), true) THEN
    RETURN 'CASH_DISABLED';
  END IF;
  v_check := deposit_group_check(p_booking_ids);
  IF v_check <> 'OK' THEN
    RETURN v_check;
  END IF;

  UPDATE bookings
  SET deposit_status = 'cash_pending',
      deposit_method = 'cash',
      deposit_expires_at = NULL,
      deposit_submitted_at = now(),
      deposit_terms_at = now(),
      deposit_terms = 'Anticipo en efectivo. Se compromete a cumplir la reserva e ir al salón a pagar el anticipo antes de la cita.',
      updated_at = now()
  WHERE id = ANY (p_booking_ids);
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.deposit_group_check(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_deposit(uuid[], text, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.choose_cash_deposit(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_deposit(uuid[], text, text, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.choose_cash_deposit(uuid[], boolean) TO anon, authenticated;

-- Anticipo al 50 % y las dos opciones nuevas activas
UPDATE business_settings
SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{deposit}',
      coalesce(data -> 'deposit', '{"enabled": true, "minutes": 30, "key": "0092002945", "holder": "Walter Camilo Manjarrez Blandon"}'::jsonb)
      || '{"percent": 50, "allowFull": true, "allowCash": true}'::jsonb),
    updated_at = now()
WHERE id;
