/*
  Productos de la Shop administrables desde el panel.
  - products.active: si es false, el producto no se muestra en la web (queda oculto, no se borra).
  - El público solo ve productos activos; el administrador ve y edita todos.
  - Bucket de Storage "products" para las fotos: lectura pública, escritura solo admin.
*/

ALTER TABLE products ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP POLICY IF EXISTS products_read ON products;
CREATE POLICY products_read ON products FOR SELECT USING (active OR is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('products', 'products', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_photos_admin_insert ON storage.objects;
DROP POLICY IF EXISTS product_photos_admin_update ON storage.objects;
DROP POLICY IF EXISTS product_photos_admin_delete ON storage.objects;

CREATE POLICY product_photos_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'products' AND public.is_admin());

CREATE POLICY product_photos_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'products' AND public.is_admin())
  WITH CHECK (bucket_id = 'products' AND public.is_admin());

CREATE POLICY product_photos_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'products' AND public.is_admin());
