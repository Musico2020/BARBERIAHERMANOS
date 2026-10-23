-- Migración: Barbero Dueño / Propietario (Walter)
-- El dueño no rinde cuentas a la administración (100% Salón).

ALTER TABLE public.barbers 
ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

UPDATE public.barbers 
SET is_owner = true 
WHERE lower(name) LIKE '%walter%' 
   OR lower(short_name) LIKE '%walter%';

COMMENT ON COLUMN public.barbers.is_owner IS 'Indica si el barbero es dueño/propietario. El dueño no rinde cuentas: el 100% de lo producido entra íntegramente a la caja de la administración.';
