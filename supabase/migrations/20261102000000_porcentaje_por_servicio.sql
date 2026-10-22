/*
  Porcentaje que se lleva el barbero, por servicio (Panel → Servicios).
  services.barber_percent: si tiene valor, en ese servicio el barbero se lleva ese porcentaje
  (para todos los barberos); si es NULL, se usa el porcentaje propio de cada barbero (barbers.commission).
*/
ALTER TABLE services ADD COLUMN IF NOT EXISTS barber_percent integer;
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_barber_percent_check;
ALTER TABLE services ADD CONSTRAINT services_barber_percent_check CHECK (barber_percent IS NULL OR barber_percent BETWEEN 0 AND 100);
