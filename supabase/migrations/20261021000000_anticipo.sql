/*
  Anticipo al reservar por la web (etapa 1: pago con el QR de Nequi y verificación del administrador).

  Flujo:
    1. create_booking crea la cita con deposit_status = 'awaiting', el valor del anticipo
       (business_settings.data.deposit.percent, 30 % por defecto, redondeado hacia arriba a $100)
       y un plazo para pagar (deposit.minutes, 30 min por defecto).
    2. El cliente paga con el QR, sube la foto del comprobante (bucket privado «receipts») y llama a
       submit_deposit → deposit_status = 'submitted'.
    3. El administrador revisa su Nequi y en Panel → Pagos marca «Pago recibido» (verified, la cita
       queda confirmada) o «No llegó» (rejected, la cita se cancela).
    4. Si el plazo vence sin comprobante, la cita se cancela sola (deposit_status = 'expired') y la
       hora se libera; mientras tanto, una cita vencida ya no cuenta como ocupada.

  Las citas que el administrador registra desde el panel no piden anticipo (deposit_status = 'none').
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'none';
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_deposit_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_deposit_status_check
  CHECK (deposit_status IN ('none', 'awaiting', 'submitted', 'verified', 'rejected', 'expired'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_expires_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_payer text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_receipt_path text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_submitted_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_deposit_status_idx ON bookings (deposit_status) WHERE deposit_status IN ('awaiting', 'submitted');

-- ---------------------------------------------------------------------
-- Una cita que espera anticipo y ya venció no ocupa la hora
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_holds_slot(p_status text, p_deposit_status text, p_expires timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT p_status IN ('pending', 'confirmed')
     AND NOT (p_deposit_status = 'awaiting' AND p_expires IS NOT NULL AND p_expires < now());
$$;

-- Cancela las citas cuyo plazo para pagar el anticipo venció sin comprobante
CREATE OR REPLACE FUNCTION public.expire_unpaid_bookings()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE bookings
  SET status = 'cancelled', deposit_status = 'expired', updated_at = now()
  WHERE deposit_status = 'awaiting' AND deposit_expires_at < now() AND status IN ('pending', 'confirmed');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ---------------------------------------------------------------------
-- Horas ocupadas: igual que antes, sin contar las citas vencidas sin anticipo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_busy_slots(p_date date, p_barber_id uuid DEFAULT NULL)
RETURNS TABLE (barber_id uuid, start_time text, duration integer, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    AND (p_barber_id IS NULL OR b.id = p_barber_id);
$$;

-- ---------------------------------------------------------------------
-- create_booking: igual que antes y además calcula el anticipo y su plazo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking(
  p_service_id   uuid,
  p_barber_id    uuid,
  p_date         date,
  p_time         text,
  p_client_name  text,
  p_client_phone text,
  p_client_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service   services%ROWTYPE;
  v_barber    barbers%ROWTYPE;
  v_now       timestamp := now() AT TIME ZONE 'America/Bogota';
  v_start     integer;
  v_end       integer;
  v_id        uuid;
  v_hours     record;
  v_role      text;
  v_deposit   jsonb;
  v_amount    integer := 0;
  v_expires   timestamptz;
BEGIN
  IF length(trim(coalesce(p_client_name, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;
  IF length(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;
  IF p_time IS NULL OR p_time !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  SELECT * INTO v_service FROM services WHERE id = p_service_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  IF p_date IS NULL OR p_date < v_now::date
     OR (p_date = v_now::date AND time_to_minutes(p_time) <= extract(hour FROM v_now)::int * 60 + extract(minute FROM v_now)::int) THEN
    RAISE EXCEPTION 'PAST_DATE';
  END IF;
  IF p_date > v_now::date + 30 THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  v_role := CASE WHEN v_service.category = 'manicura' THEN 'manicurista' ELSE 'barbero' END;
  IF p_barber_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM barbers WHERE id = p_barber_id AND role = v_role) THEN
    RAISE EXCEPTION 'WRONG_PROFESSIONAL';
  END IF;
  IF p_barber_id IS NULL AND coalesce((SELECT (data ->> 'allowAnyBarber')::boolean FROM business_settings WHERE id), true) = false THEN
    RAISE EXCEPTION 'BARBER_REQUIRED';
  END IF;

  v_start := time_to_minutes(p_time);
  v_end   := v_start + v_service.duration;

  SELECT * INTO v_hours FROM business_hours_for(p_date);
  IF v_hours.o_status <> 'OPEN' THEN
    RAISE EXCEPTION 'CLOSED_DAY';
  END IF;
  IF v_start < v_hours.o_open OR v_end > v_hours.o_close THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_date::text));
  -- Las citas vencidas sin anticipo se cancelan antes de buscar barbero libre
  PERFORM expire_unpaid_bookings();

  -- Anticipo: porcentaje del precio, redondeado hacia arriba a $100
  SELECT data -> 'deposit' INTO v_deposit FROM business_settings WHERE id;
  v_deposit := coalesce(v_deposit, '{"enabled": true, "percent": 30, "minutes": 30}'::jsonb);
  IF coalesce((v_deposit ->> 'enabled')::boolean, true) AND coalesce((v_deposit ->> 'percent')::int, 30) > 0 THEN
    v_amount := (ceil(v_service.price * least(100, coalesce((v_deposit ->> 'percent')::int, 30)) / 100.0 / 100.0) * 100)::int;
    v_expires := now() + make_interval(mins => greatest(5, least(240, coalesce((v_deposit ->> 'minutes')::int, 30))));
  END IF;

  FOR v_barber IN
    SELECT b.* FROM barbers b
    WHERE b.available AND b.role = v_role AND (p_barber_id IS NULL OR b.id = p_barber_id)
    ORDER BY (
      SELECT count(*) FROM bookings x
      WHERE x.barber_id = b.id AND x.date = p_date AND booking_holds_slot(x.status, x.deposit_status, x.deposit_expires_at)
    ), b.name
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM bookings bk
      LEFT JOIN services s ON s.id = bk.service_id
      WHERE bk.barber_id = v_barber.id
        AND bk.date = p_date
        AND booking_holds_slot(bk.status, bk.deposit_status, bk.deposit_expires_at)
        AND time_to_minutes(bk.time) < v_end
        AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
    ) AND NOT EXISTS (
      SELECT 1 FROM closed_ranges_for(p_date) c
      WHERE (c.barber_id IS NULL OR c.barber_id = v_barber.id)
        AND c.start_min < v_end AND c.end_min > v_start
    ) THEN
      INSERT INTO bookings (client_name, client_phone, client_email, service_id, service_name,
                            barber_id, barber_name, date, time, price, status,
                            deposit_amount, deposit_status, deposit_expires_at)
      VALUES (trim(p_client_name), trim(p_client_phone), coalesce(trim(p_client_email), ''),
              v_service.id, v_service.name, v_barber.id, v_barber.short_name,
              p_date, p_time, v_service.price, 'pending',
              v_amount, CASE WHEN v_amount > 0 THEN 'awaiting' ELSE 'none' END, v_expires)
      RETURNING id INTO v_id;

      RETURN json_build_object(
        'booking_id', v_id,
        'barber_id', v_barber.id,
        'barber_name', v_barber.name,
        'barber_short_name', v_barber.short_name,
        'deposit_amount', v_amount,
        'deposit_expires_at', v_expires
      );
    END IF;
  END LOOP;

  IF p_barber_id IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;
  RAISE EXCEPTION 'NO_BARBER_AVAILABLE';
END $$;

-- ---------------------------------------------------------------------
-- Comprobantes: bucket privado. El público solo puede SUBIR la foto dentro de la carpeta de una
-- cita que espera anticipo (creada hace menos de 3 horas); solo el administrador las ve.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_upload_receipt(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  BEGIN
    v_id := split_part(p_name, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM bookings
    WHERE id = v_id AND deposit_status IN ('awaiting', 'submitted') AND created_at > now() - interval '3 hours'
  );
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 6291456, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS receipts_public_insert ON storage.objects;
DROP POLICY IF EXISTS receipts_admin_read ON storage.objects;
DROP POLICY IF EXISTS receipts_admin_delete ON storage.objects;

CREATE POLICY receipts_public_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'receipts' AND public.can_upload_receipt(name));

CREATE POLICY receipts_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND public.is_admin());

CREATE POLICY receipts_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_admin());

-- ---------------------------------------------------------------------
-- El cliente avisa que pagó (con el comprobante ya subido). Vale para todas las citas de su reserva.
-- Devuelve 'OK', 'NOT_FOUND' o 'EXPIRED'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_deposit(p_booking_ids uuid[], p_payer text, p_receipt_path text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_found integer;
BEGIN
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL OR array_length(p_booking_ids, 1) > 10 THEN
    RETURN 'NOT_FOUND';
  END IF;
  IF p_receipt_path IS NULL OR split_part(p_receipt_path, '/', 1) <> p_booking_ids[1]::text THEN
    RETURN 'NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_found FROM bookings
  WHERE id = ANY (p_booking_ids) AND deposit_status IN ('awaiting', 'submitted') AND status IN ('pending', 'confirmed');
  IF v_found <> array_length(p_booking_ids, 1) THEN
    -- Puede que el plazo ya haya vencido y la cita se haya cancelado
    IF EXISTS (SELECT 1 FROM bookings WHERE id = ANY (p_booking_ids) AND deposit_status = 'expired') THEN
      RETURN 'EXPIRED';
    END IF;
    RETURN 'NOT_FOUND';
  END IF;
  -- 10 minutos de gracia sobre el plazo para quien estaba subiendo el comprobante
  IF EXISTS (SELECT 1 FROM bookings WHERE id = ANY (p_booking_ids) AND deposit_status = 'awaiting'
             AND deposit_expires_at < now() - interval '10 minutes') THEN
    RETURN 'EXPIRED';
  END IF;

  UPDATE bookings
  SET deposit_status = 'submitted',
      deposit_payer = left(trim(coalesce(p_payer, '')), 80),
      deposit_receipt_path = p_receipt_path,
      deposit_submitted_at = now(),
      updated_at = now()
  WHERE id = ANY (p_booking_ids);
  RETURN 'OK';
END $$;

-- Estado del anticipo de una reserva (para que la web del cliente sepa si ya fue verificado)
CREATE OR REPLACE FUNCTION public.deposit_status_of(p_booking_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT deposit_status FROM bookings WHERE id = p_booking_id;
$$;

REVOKE ALL ON FUNCTION public.can_upload_receipt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_deposit(uuid[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deposit_status_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_unpaid_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_receipt(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_deposit(uuid[], text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_status_of(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, date, text, text, text, text) TO anon, authenticated;

-- Configuración por defecto del anticipo
UPDATE business_settings
SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{deposit}',
      coalesce(data -> 'deposit', '{"enabled": true, "percent": 30, "minutes": 30, "key": "0092002945", "holder": "Walter Camilo Manjarrez Blandon"}'::jsonb)),
    updated_at = now()
WHERE id;
