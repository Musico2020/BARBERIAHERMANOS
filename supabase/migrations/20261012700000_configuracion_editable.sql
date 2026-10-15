/*
  Configuración del negocio editable desde el panel.

  Antes los datos (dirección, redes, horarios, días especiales) estaban fijos en el código
  (src/config/business.ts) y solo se podían cambiar publicando una nueva versión de la web.
  Ahora se guardan aquí, en una sola fila con un JSON. La web los lee al cargar; si esta
  tabla está vacía usa los valores del código.

  También: el barbero puede cambiar su propio PIN desde su portal (con su PIN actual).
*/

CREATE TABLE IF NOT EXISTS business_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),  -- una sola fila
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leerla (la web pública muestra horarios y dirección)
DROP POLICY IF EXISTS business_settings_read ON business_settings;
CREATE POLICY business_settings_read ON business_settings
  FOR SELECT TO anon, authenticated USING (true);

-- Solo el administrador la cambia
DROP POLICY IF EXISTS business_settings_admin ON business_settings;
CREATE POLICY business_settings_admin ON business_settings
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

GRANT SELECT ON business_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON business_settings TO authenticated;

-- ---------------------------------------------------------------------
-- El barbero cambia su PIN. Devuelve 'OK', 'INVALID_PIN', 'PIN_LOCKED' o 'INVALID_NEW_PIN'.
-- Usa la misma validación (y el mismo bloqueo por intentos) que el ingreso al portal.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.barber_change_pin(p_barber_id uuid, p_current_pin text, p_new_pin text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result text;
BEGIN
  IF p_new_pin IS NULL OR p_new_pin !~ '^\d{4}$' THEN
    RETURN 'INVALID_NEW_PIN';
  END IF;
  v_result := barber_login(p_barber_id, p_current_pin);
  IF v_result <> 'OK' THEN
    RETURN v_result;
  END IF;
  -- El disparador hash_barber_pin guarda el PIN cifrado
  UPDATE barbers SET pin = p_new_pin WHERE id = p_barber_id;
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.barber_change_pin(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barber_change_pin(uuid, text, text) TO anon, authenticated;
