/*
  Galería administrable: el administrador sube las fotos desde el panel (Panel → Galería)
  y la página /galeria las muestra. Antes la galería eran fotos fijas de un banco de imágenes.
*/

ALTER TABLE gallery ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

GRANT SELECT ON gallery TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON gallery TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gallery', 'gallery', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS gallery_photos_read ON storage.objects;
CREATE POLICY gallery_photos_read ON storage.objects
  FOR SELECT USING (bucket_id = 'gallery');

DROP POLICY IF EXISTS gallery_photos_insert ON storage.objects;
CREATE POLICY gallery_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND public.is_admin());

DROP POLICY IF EXISTS gallery_photos_update ON storage.objects;
CREATE POLICY gallery_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'gallery' AND public.is_admin())
  WITH CHECK (bucket_id = 'gallery' AND public.is_admin());

DROP POLICY IF EXISTS gallery_photos_delete ON storage.objects;
CREATE POLICY gallery_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'gallery' AND public.is_admin());
