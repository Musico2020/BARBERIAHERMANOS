/*
  Lista permanente de clientes.

  Antes la sección "Clientes" del panel solo se armaba a partir de las citas.
  Ahora existe la tabla clients:
    - Se puede cargar desde los contactos de Google (scripts/importar-clientes.mjs).
    - Cada cita nueva agrega al cliente automáticamente si su celular no existía.
  El celular se guarda normalizado (solo dígitos, sin el 57 inicial) para poder
  relacionar al cliente con sus citas aunque lo hayan escrito con espacios o con +57.
*/

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(d) = 12 AND left(d, 2) = '57' THEN substr(d, 3)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS d) s;
$$;

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  email text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'google_contacts', 'booking')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_admin ON clients FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Cada cita nueva registra al cliente si su celular no estaba en la lista
CREATE OR REPLACE FUNCTION public.register_client_from_booking()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone text := normalize_phone(NEW.client_phone);
BEGIN
  IF length(v_phone) >= 7 THEN
    INSERT INTO clients (name, phone, email, source)
    VALUES (trim(NEW.client_name), v_phone, coalesce(NEW.client_email, ''), 'booking')
    ON CONFLICT (phone) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_register_client ON bookings;
CREATE TRIGGER bookings_register_client
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION register_client_from_booking();

REVOKE EXECUTE ON FUNCTION public.register_client_from_booking() FROM PUBLIC, anon, authenticated;

-- Registrar a los clientes de las citas que ya existen (se usa el nombre de su cita más reciente)
INSERT INTO clients (name, phone, email, source)
SELECT DISTINCT ON (normalize_phone(client_phone))
  trim(client_name), normalize_phone(client_phone), coalesce(client_email, ''), 'booking'
FROM bookings
WHERE length(normalize_phone(client_phone)) >= 7
ORDER BY normalize_phone(client_phone), created_at DESC
ON CONFLICT (phone) DO NOTHING;
