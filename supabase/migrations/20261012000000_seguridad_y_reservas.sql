/*
  Correcciones de seguridad y de reservas (informe de fallas, octubre 2026).

  S1  Solo los correos de admin_users (con sesión real de Supabase Auth) pueden administrar.
  S2  El PIN de los barberos ya no se puede leer desde la web y se guarda cifrado.
      El portal del barbero valida el PIN en el servidor, con bloqueo tras 5 intentos fallidos.
  S3  Se reemplazan TODAS las políticas existentes por unas cerradas: el público solo puede
      ver barberos/servicios, consultar horas ocupadas (sin nombres ni teléfonos) y crear citas.
  H1  create_booking asigna automáticamente un barbero libre cuando el cliente no elige uno.
  H8  create_booking impide citas que se cruzan (teniendo en cuenta la duración del servicio)
      y serializa las reservas del mismo día para evitar choques simultáneos.

  Antes de aplicarla en producción:
    1. Hacer respaldo de la base de datos.
    2. Crear el usuario administrador en Authentication -> Users.
    3. Agregar su correo a la tabla admin_users (ver final de este archivo).
    4. En Authentication -> Sign In / Providers, desactivar "Allow new users to sign up".
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- Quién es administrador
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
-- Borrar todas las políticas actuales (en producción se crearon a mano y
-- no sabemos sus nombres) para dejar solo las de este archivo.
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('barbers','services','bookings','admin_users','reviews','gallery','products')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE barbers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE services    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery     ENABLE ROW LEVEL SECURITY;
ALTER TABLE products    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- barbers: lectura pública SIN la columna pin; escritura solo admin
-- ---------------------------------------------------------------------
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS pin_failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;

CREATE POLICY barbers_read  ON barbers FOR SELECT USING (true);
CREATE POLICY barbers_admin ON barbers FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

REVOKE SELECT ON barbers FROM anon, authenticated;
GRANT SELECT (id, name, short_name, phone, bio, specialties, rating, review_count, available,
              commission, total_services_month, earnings_month, avatar, created_at, updated_at)
  ON barbers TO anon, authenticated;

-- PIN cifrado: cualquier PIN nuevo o cambiado se guarda como hash bcrypt
CREATE OR REPLACE FUNCTION public.hash_barber_pin()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND NEW.pin NOT LIKE '$2%' THEN
    NEW.pin := crypt(NEW.pin, gen_salt('bf'));
    NEW.pin_failed_attempts := 0;
    NEW.pin_locked_until := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS barbers_hash_pin ON barbers;
CREATE TRIGGER barbers_hash_pin
  BEFORE INSERT OR UPDATE OF pin ON barbers
  FOR EACH ROW EXECUTE FUNCTION hash_barber_pin();

-- Cifrar los PIN que ya existen en texto plano
UPDATE barbers SET pin = pin WHERE pin NOT LIKE '$2%';

-- ---------------------------------------------------------------------
-- services: el público ve los activos; el admin ve y edita todos
-- ---------------------------------------------------------------------
CREATE POLICY services_read  ON services FOR SELECT USING (active OR is_admin());
CREATE POLICY services_admin ON services FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ---------------------------------------------------------------------
-- bookings: nadie del público puede leerlas ni cambiarlas directamente.
-- Se crean con create_booking() y las horas ocupadas se consultan con get_busy_slots().
-- ---------------------------------------------------------------------
CREATE POLICY bookings_admin ON bookings FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ---------------------------------------------------------------------
-- admin_users: solo los administradores pueden ver la lista
-- ---------------------------------------------------------------------
CREATE POLICY admin_users_read ON admin_users FOR SELECT TO authenticated USING (is_admin());

-- ---------------------------------------------------------------------
-- reviews, gallery, products
-- ---------------------------------------------------------------------
CREATE POLICY reviews_insert ON reviews FOR INSERT WITH CHECK (rating BETWEEN 1 AND 5);
CREATE POLICY reviews_read   ON reviews FOR SELECT USING (true);
CREATE POLICY reviews_admin  ON reviews FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY gallery_read   ON gallery FOR SELECT USING (true);
CREATE POLICY gallery_admin  ON gallery FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY products_read  ON products FOR SELECT USING (true);
CREATE POLICY products_admin ON products FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- La calificación del barbero se recalcula en el servidor al llegar una reseña
CREATE OR REPLACE FUNCTION public.refresh_barber_rating()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE barbers b
  SET rating = r.avg_rating, review_count = r.total, updated_at = now()
  FROM (
    SELECT round(avg(rating)::numeric, 1) AS avg_rating, count(*) AS total
    FROM reviews WHERE barber_id = NEW.barber_id
  ) r
  WHERE b.id = NEW.barber_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reviews_refresh_rating ON reviews;
CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_barber_rating();

-- ---------------------------------------------------------------------
-- Utilidad: 'HH:MM' -> minutos desde medianoche
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_to_minutes(p_time text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
$$;

-- ---------------------------------------------------------------------
-- Horas ocupadas de un día (sin datos personales)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_busy_slots(p_date date, p_barber_id uuid DEFAULT NULL)
RETURNS TABLE (barber_id uuid, start_time text, duration integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT bk.barber_id, bk.time, coalesce(s.duration, 30)
  FROM bookings bk
  LEFT JOIN services s ON s.id = bk.service_id
  WHERE bk.date = p_date
    AND bk.status IN ('pending', 'confirmed')
    AND bk.barber_id IS NOT NULL
    AND (p_barber_id IS NULL OR bk.barber_id = p_barber_id);
$$;

-- ---------------------------------------------------------------------
-- Crear una cita (única forma en que el público puede escribir en bookings)
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
BEGIN
  IF length(trim(coalesce(p_client_name, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;
  IF length(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;
  IF p_time IS NULL OR p_time !~ '^\d{2}:\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;

  SELECT * INTO v_service FROM services WHERE id = p_service_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  IF p_date < v_now::date
     OR (p_date = v_now::date AND time_to_minutes(p_time) <= extract(hour FROM v_now)::int * 60 + extract(minute FROM v_now)::int) THEN
    RAISE EXCEPTION 'PAST_DATE';
  END IF;

  v_start := time_to_minutes(p_time);
  v_end   := v_start + v_service.duration;

  -- Una reserva a la vez por día: evita que dos clientes tomen la misma hora al mismo tiempo
  PERFORM pg_advisory_xact_lock(hashtext('create_booking:' || p_date::text));

  FOR v_barber IN
    SELECT b.* FROM barbers b
    WHERE b.available AND (p_barber_id IS NULL OR b.id = p_barber_id)
    ORDER BY (
      SELECT count(*) FROM bookings x
      WHERE x.barber_id = b.id AND x.date = p_date AND x.status IN ('pending', 'confirmed')
    ), b.name
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM bookings bk
      LEFT JOIN services s ON s.id = bk.service_id
      WHERE bk.barber_id = v_barber.id
        AND bk.date = p_date
        AND bk.status IN ('pending', 'confirmed')
        AND time_to_minutes(bk.time) < v_end
        AND time_to_minutes(bk.time) + coalesce(s.duration, 30) > v_start
    ) THEN
      INSERT INTO bookings (client_name, client_phone, client_email, service_id, service_name,
                            barber_id, barber_name, date, time, price, status)
      VALUES (trim(p_client_name), trim(p_client_phone), coalesce(trim(p_client_email), ''),
              v_service.id, v_service.name, v_barber.id, v_barber.short_name,
              p_date, p_time, v_service.price, 'pending')
      RETURNING id INTO v_id;

      RETURN json_build_object(
        'booking_id', v_id,
        'barber_id', v_barber.id,
        'barber_name', v_barber.name,
        'barber_short_name', v_barber.short_name
      );
    END IF;
  END LOOP;

  IF p_barber_id IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;
  RAISE EXCEPTION 'NO_BARBER_AVAILABLE';
END $$;

-- ---------------------------------------------------------------------
-- Portal del barbero: todo pasa por el PIN validado en el servidor
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.barber_authenticate(p_barber_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_barber barbers%ROWTYPE;
BEGIN
  SELECT * INTO v_barber FROM barbers WHERE id = p_barber_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PIN';
  END IF;
  IF v_barber.pin_locked_until IS NOT NULL AND v_barber.pin_locked_until > now() THEN
    RAISE EXCEPTION 'PIN_LOCKED';
  END IF;
  IF v_barber.pin <> crypt(coalesce(p_pin, ''), v_barber.pin) THEN
    RAISE EXCEPTION 'INVALID_PIN';
  END IF;
  IF v_barber.pin_failed_attempts > 0 THEN
    UPDATE barbers SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = p_barber_id;
  END IF;
END $$;

-- Devuelve 'OK', 'INVALID_PIN' o 'PIN_LOCKED'. No lanza error a propósito: si lo hiciera,
-- la base de datos desharía también el conteo de intentos fallidos.
-- Tras 5 intentos fallidos el barbero queda bloqueado 15 minutos.
CREATE OR REPLACE FUNCTION public.barber_login(p_barber_id uuid, p_pin text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM barber_authenticate(p_barber_id, p_pin);
  RETURN 'OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'INVALID_PIN' THEN
    UPDATE barbers
    SET pin_failed_attempts = pin_failed_attempts + 1,
        pin_locked_until = CASE WHEN pin_failed_attempts + 1 >= 5
                                THEN now() + interval '15 minutes' ELSE pin_locked_until END
    WHERE id = p_barber_id;
  END IF;
  RETURN SQLERRM;
END $$;

-- Devuelve {"bookings": [...]} o {"error": "INVALID_PIN" | "PIN_LOCKED"}
CREATE OR REPLACE FUNCTION public.barber_get_bookings(p_barber_id uuid, p_pin text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result text;
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN json_build_object('error', v_result);
  END IF;
  RETURN json_build_object('bookings', coalesce(
    (SELECT json_agg(b ORDER BY b.date DESC, b.time ASC) FROM bookings b WHERE b.barber_id = p_barber_id),
    '[]'::json));
END $$;

-- Devuelve 'OK' o el código de error
CREATE OR REPLACE FUNCTION public.barber_set_status(p_barber_id uuid, p_pin text, p_booking_id uuid, p_status text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result text;
BEGIN
  v_result := barber_login(p_barber_id, p_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;
  IF p_status NOT IN ('confirmed', 'completed', 'no-show') THEN
    RETURN 'INVALID_STATUS';
  END IF;
  UPDATE bookings SET status = p_status, updated_at = now()
  WHERE id = p_booking_id AND barber_id = p_barber_id;
  IF NOT FOUND THEN
    RETURN 'BOOKING_NOT_FOUND';
  END IF;
  RETURN 'OK';
END $$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.barber_authenticate(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hash_barber_pin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_barber_rating() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, date, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barber_login(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barber_get_bookings(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barber_set_status(uuid, text, uuid, text) TO anon, authenticated;

-- Para dar acceso de administrador en producción (cambiar el correo):
--   INSERT INTO admin_users (email) VALUES ('correo-del-admin@ejemplo.com');

-- ---------------------------------------------------------------------
-- Respaldo contra citas duplicadas exactas (mismo barbero, día y hora).
-- Si producción ya tiene duplicados, el índice no se crea y solo se avisa;
-- create_booking() sigue protegiendo las citas nuevas.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_slot_uidx
    ON bookings (barber_id, date, time)
    WHERE status IN ('pending', 'confirmed') AND barber_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay citas duplicadas en la base de datos; no se creó bookings_active_slot_uidx.';
END $$;
