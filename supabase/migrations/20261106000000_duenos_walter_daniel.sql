-- ============================================================================
-- SALÓN HERMANOS · Migración 08: Multi-Dueños (Walter y Daniel) y Beneficiarios
-- 
-- Permite configurar:
-- 1. Dueño específico: Walter (Dueño 1) o Daniel (Dueño 2).
-- 2. Beneficiario de cada barbero: a qué dueño le rinde su margen el barbero colaborador:
--    - Gerardo: rinde 22% a Walter (comisión barbero: 78%).
--    - Nelson: rinde 23% a Daniel (comisión barbero: 77%).
-- 3. Tanto lo de Walter como lo de Daniel queda registrado en el sistema.
-- 4. Modificable desde la edición de cada barbero en el Panel Admin.
--
-- Pegar y ejecutar en Supabase → SQL Editor → Run
-- ============================================================================

-- 1. Agregar columnas owner_name y owner_beneficiary a la tabla barbers si no existen
ALTER TABLE public.barbers 
ADD COLUMN IF NOT EXISTS owner_name text,
ADD COLUMN IF NOT EXISTS owner_beneficiary text DEFAULT 'walter';

-- 2. Asegurar que is_owner esté presente
ALTER TABLE public.barbers 
ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- 3. Configurar a Walter como Dueño 1
UPDATE public.barbers 
SET is_owner = true,
    owner_name = 'walter',
    owner_beneficiary = 'walter'
WHERE lower(name) LIKE '%walter%' 
   OR lower(short_name) LIKE '%walter%';

-- 4. Configurar a Daniel como Dueño 2 (si existe en la tabla barbers)
UPDATE public.barbers 
SET is_owner = true,
    owner_name = 'daniel',
    owner_beneficiary = 'daniel'
WHERE lower(name) LIKE '%daniel%' 
   OR lower(short_name) LIKE '%daniel%';

-- 5. Configurar Gerardo: comisión 78% (entrega 22% a Walter)
UPDATE public.barbers 
SET is_owner = false,
    owner_name = NULL,
    commission = 78,
    owner_beneficiary = 'walter'
WHERE lower(name) LIKE '%gerardo%' 
   OR lower(short_name) LIKE '%gerardo%';

-- 6. Configurar Nelson: comisión 77% (entrega 23% a Daniel)
UPDATE public.barbers 
SET is_owner = false,
    owner_name = NULL,
    commission = 77,
    owner_beneficiary = 'daniel'
WHERE lower(name) LIKE '%nelson%' 
   OR lower(short_name) LIKE '%nelson%';

-- 7. Otorgar permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barbers TO authenticated;
GRANT SELECT ON public.barbers TO anon;

-- 8. Documentación
COMMENT ON COLUMN public.barbers.owner_name IS 'Nombre clave del dueño si is_owner es true: walter o daniel.';
COMMENT ON COLUMN public.barbers.owner_beneficiary IS 'A qué dueño rinde el margen de administración: walter, daniel o general.';

-- 9. Verificar estado final
SELECT id, name, short_name, role, commission, is_owner, owner_name, owner_beneficiary 
FROM public.barbers 
ORDER BY is_owner DESC, name ASC;
