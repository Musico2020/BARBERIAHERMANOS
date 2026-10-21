/*
  Calificar con estrellas desde «Mis citas».

  · Cada reseña queda ligada a una cita (reviews.booking_id, una por cita) y solo se puede calificar
    una cita ATENDIDA (completed), verificando el celular y el primer nombre igual que client_bookings.
  · Ya no se pueden crear reseñas sueltas desde la web (se quita la política de insertar para todos):
    solo con rate_booking.
  · El cliente puede cambiar su calificación; el promedio del barbero se recalcula también al cambiarla.
  · client_bookings ahora devuelve la calificación de cada cita.
*/

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_unique ON reviews (booking_id) WHERE booking_id IS NOT NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DROP POLICY IF EXISTS reviews_insert ON reviews;

-- El promedio del barbero se recalcula al crear, cambiar o borrar una reseña
CREATE OR REPLACE FUNCTION public.refresh_barber_rating()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_barber uuid := coalesce(NEW.barber_id, OLD.barber_id);
BEGIN
  UPDATE barbers b
  SET rating = coalesce(r.avg_rating, 5), review_count = coalesce(r.total, 0), updated_at = now()
  FROM (
    SELECT round(avg(rating)::numeric, 1) AS avg_rating, count(*) AS total
    FROM reviews WHERE barber_id = v_barber
  ) r
  WHERE b.id = v_barber;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS reviews_refresh_rating ON reviews;
CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OF rating OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_barber_rating();
REVOKE EXECUTE ON FUNCTION public.refresh_barber_rating() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- rate_booking(celular, nombre, cita, estrellas, comentario)
-- Devuelve 'OK', 'INVALID', 'TOO_MANY', 'NOT_FOUND' o 'NOT_COMPLETED'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rate_booking(p_phone text, p_name text, p_booking_id uuid, p_rating int, p_comment text DEFAULT '')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key     text := phone_key(p_phone);
  v_first   text := split_part(plain_text(p_name), ' ', 1);
  v_booking bookings%ROWTYPE;
  v_client  text;
BEGIN
  IF length(v_key) < 10 OR length(v_first) < 2 OR p_booking_id IS NULL OR p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RETURN 'INVALID';
  END IF;
  IF (SELECT count(*) FROM client_lookup_attempts WHERE phone_key = v_key AND NOT ok AND created_at > now() - interval '1 hour') >= 8 THEN
    RETURN 'TOO_MANY';
  END IF;

  SELECT * INTO v_booking FROM bookings
  WHERE id = p_booking_id AND phone_key(client_phone) = v_key
    AND split_part(plain_text(client_name), ' ', 1) = v_first;
  IF NOT FOUND THEN
    INSERT INTO client_lookup_attempts (phone_key, ok) VALUES (v_key, false);
    RETURN 'NOT_FOUND';
  END IF;
  IF v_booking.status <> 'completed' THEN
    RETURN 'NOT_COMPLETED';
  END IF;

  -- Nombre corto para mostrar: «Jhosep» o «Carlos M.»
  v_client := trim(regexp_replace(v_booking.client_name, '\s*\(turno \d+\)$', ''));
  v_client := split_part(v_client, ' ', 1) || CASE WHEN split_part(v_client, ' ', 2) <> '' THEN ' ' || upper(left(split_part(v_client, ' ', 2), 1)) || '.' ELSE '' END;

  INSERT INTO reviews (barber_id, barber_name, client_name, rating, comment, booking_id)
  VALUES (v_booking.barber_id, v_booking.barber_name, v_client, p_rating, nullif(left(trim(coalesce(p_comment, '')), 300), ''), p_booking_id)
  ON CONFLICT (booking_id) WHERE booking_id IS NOT NULL
  DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now();
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.rate_booking(text, text, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_booking(text, text, uuid, int, text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- client_bookings: igual que antes y además la calificación de cada cita
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_bookings(p_phone text, p_name text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key   text := phone_key(p_phone);
  v_first text := split_part(plain_text(p_name), ' ', 1);
  v_tries int;
  v_ok    boolean;
  v_name  text;
BEGIN
  IF length(v_key) < 10 OR length(v_first) < 2 THEN
    RETURN json_build_object('status', 'INVALID');
  END IF;

  SELECT count(*) INTO v_tries FROM client_lookup_attempts
  WHERE phone_key = v_key AND created_at > now() - interval '1 hour';
  IF v_tries >= 8 THEN
    RETURN json_build_object('status', 'TOO_MANY');
  END IF;

  SELECT trim(regexp_replace(client_name, '\s*\(turno \d+\)$', '')) INTO v_name
  FROM bookings
  WHERE phone_key(client_phone) = v_key
    AND split_part(plain_text(client_name), ' ', 1) = v_first
  ORDER BY created_at DESC
  LIMIT 1;
  v_ok := v_name IS NOT NULL;

  INSERT INTO client_lookup_attempts (phone_key, ok) VALUES (v_key, v_ok);
  DELETE FROM client_lookup_attempts WHERE created_at < now() - interval '2 days';

  IF NOT v_ok THEN
    RETURN json_build_object('status', 'NOT_FOUND');
  END IF;

  RETURN json_build_object(
    'status', 'OK',
    'name', v_name,
    'bookings', coalesce((
      SELECT json_agg(json_build_object(
               'id', b.id,
               'date', b.date,
               'time', b.time,
               'service', b.service_name,
               'barber', b.barber_name,
               'status', b.status,
               'price', b.price,
               'deposit', b.deposit_amount,
               'depositStatus', b.deposit_status,
               'rating', r.rating,
               'comment', r.comment
             ) ORDER BY b.date DESC, b.time DESC)
      FROM (
        SELECT * FROM bookings
        WHERE phone_key(client_phone) = v_key
          AND date >= (now() AT TIME ZONE 'America/Bogota')::date - 365
          AND NOT (status = 'cancelled' AND deposit_status = 'expired')
        ORDER BY date DESC, time DESC
        LIMIT 100
      ) b
      LEFT JOIN reviews r ON r.booking_id = b.id
    ), '[]'::json)
  );
END $$;
