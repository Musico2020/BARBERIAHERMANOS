/*
  «Mis citas»: el cliente consulta sus citas (próxima, pendientes e historial) con su celular y su
  primer nombre, sin cuenta ni contraseña. Solo lectura.

  Para que nadie vea las citas de otra persona solo con saber su número:
    · además del celular hay que escribir el primer nombre con el que reservó;
    · cada celular tiene máximo 8 consultas por hora (TOO_MANY después);
    · solo se devuelven fecha, hora, servicio, barbero, estado y valores; nunca otros datos.

  client_bookings(celular, nombre) devuelve json:
    { "status": "OK" | "NOT_FOUND" | "TOO_MANY" | "INVALID", "name": "...", "bookings": [...] }
*/

CREATE TABLE IF NOT EXISTS client_lookup_attempts (
  id         bigserial PRIMARY KEY,
  phone_key  text NOT NULL,
  ok         boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_lookup_attempts_phone_idx ON client_lookup_attempts (phone_key, created_at);
ALTER TABLE client_lookup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON client_lookup_attempts FROM anon, authenticated;

/** Solo los dígitos del celular, sin el 57 de Colombia: '+57 310 754 7148' → '3107547148' */
CREATE OR REPLACE FUNCTION public.phone_key(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN length(d) = 12 AND d LIKE '57%' THEN substr(d, 3) ELSE d END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) x;
$$;

/** Minúsculas y sin tildes, para comparar nombres */
CREATE OR REPLACE FUNCTION public.plain_text(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT translate(lower(trim(coalesce(p, ''))), 'áéíóúüñàèìòù', 'aeiouunaeiou');
$$;

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

  -- El primer nombre tiene que coincidir con el de alguna de sus citas
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
               'depositStatus', b.deposit_status
             ) ORDER BY b.date DESC, b.time DESC)
      FROM (
        SELECT * FROM bookings
        WHERE phone_key(client_phone) = v_key
          AND date >= (now() AT TIME ZONE 'America/Bogota')::date - 365
          -- Las reservas web que vencieron sin pagar el anticipo no se muestran
          AND NOT (status = 'cancelled' AND deposit_status = 'expired')
        ORDER BY date DESC, time DESC
        LIMIT 100
      ) b
    ), '[]'::json)
  );
END $$;

REVOKE ALL ON FUNCTION public.client_bookings(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_bookings(text, text) TO anon, authenticated;
