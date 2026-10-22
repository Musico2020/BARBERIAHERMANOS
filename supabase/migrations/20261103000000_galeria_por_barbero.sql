/*
  Galería por barbero: cada foto puede tener el barbero que hizo el trabajo.
  Los barberos suben y borran sus fotos desde su portal (api/barber-gallery.js valida el PIN y usa la
  llave de servicio); el administrador puede asignar o cambiar el barbero de cualquier foto.
*/
ALTER TABLE gallery ADD COLUMN IF NOT EXISTS barber_id uuid REFERENCES barbers (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS gallery_barber_idx ON gallery (barber_id);
