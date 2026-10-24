/*
  SEGURIDAD: el PIN de los barberos (cifrado) nunca se puede leer desde la web.

  Las migraciones 20261105 y 20261106 dieron «GRANT SELECT ON barbers» a toda la tabla, y eso volvió a
  exponer las columnas pin, pin_failed_attempts y pin_locked_until a cualquiera (anon). Un PIN de 4 números
  cifrado se descifra en segundos probando las 10.000 combinaciones.

  Aquí se quita el permiso de leer toda la tabla y se da solo columna por columna, sin el PIN.
  El PIN solo se valida dentro de la base (barber_login) y lo cambia el administrador o el barbero
  con su PIN actual (barber_change_pin).
*/

REVOKE SELECT ON public.barbers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.barbers FROM anon;

GRANT SELECT (
  id, name, short_name, phone, bio, specialties, rating, review_count, available, commission,
  total_services_month, earnings_month, avatar, created_at, updated_at, photo_url, role, work_hours,
  is_owner, owner_name, owner_beneficiary
) ON public.barbers TO anon, authenticated;

-- El administrador sigue creando, editando (incluido poner un PIN nuevo) y borrando barberos
GRANT INSERT, UPDATE, DELETE ON public.barbers TO authenticated;
