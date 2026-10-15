/*
  Foto de perfil de los barberos.
  - Columna barbers.photo_url (lectura pública, como el resto del perfil).
  - Bucket de Storage "barber-photos": cualquiera puede ver las fotos,
    solo los administradores pueden subirlas, cambiarlas o borrarlas.
*/

ALTER TABLE barbers ADD COLUMN IF NOT EXISTS photo_url text NOT NULL DEFAULT '';
GRANT SELECT (photo_url) ON barbers TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('barber-photos', 'barber-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS barber_photos_admin_insert ON storage.objects;
DROP POLICY IF EXISTS barber_photos_admin_update ON storage.objects;
DROP POLICY IF EXISTS barber_photos_admin_delete ON storage.objects;

CREATE POLICY barber_photos_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'barber-photos' AND public.is_admin());

CREATE POLICY barber_photos_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'barber-photos' AND public.is_admin())
  WITH CHECK (bucket_id = 'barber-photos' AND public.is_admin());

CREATE POLICY barber_photos_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'barber-photos' AND public.is_admin());
