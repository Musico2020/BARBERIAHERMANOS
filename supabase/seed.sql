-- =====================================================================
--  SALÓN HERMANOS — DATOS INICIALES DE LA BASE LOCAL (pruebas)
--  Se ejecuta solo en local con `npx supabase start` / `npx supabase db reset`.
--  Nunca se aplica al Supabase real con `db push`.
-- =====================================================================

-- Administrador local:  admin@salonhermanos.local  /  Hermanos2026
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'admin@salonhermanos.local',
  extensions.crypt('Hermanos2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
  gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
  '{"sub":"b0000000-0000-0000-0000-000000000001","email":"admin@salonhermanos.local","email_verified":true}',
  'email', now(), now(), now()
);

INSERT INTO admin_users (email) VALUES ('admin@salonhermanos.local');

-- Configuración del negocio (la misma que muestra la web y valida el servidor).
-- PENDIENTE: WhatsApp, horario real y redes; se cambian en Panel → Configuración.
INSERT INTO business_settings (id, data) VALUES (true, '{
  "tagline": "Barbería tradicional · Club de Caballeros",
  "address": "Barrio Tobías Daza, Mz B casa 16, segunda etapa, Valledupar",
  "phone": "",
  "whatsapp": "",
  "email": "",
  "instagram": "",
  "facebook": "",
  "tiktok": "",
  "hours": [
    {"day": "Lunes", "open": "08:00", "close": "19:00", "closed": false},
    {"day": "Martes", "open": "08:00", "close": "19:00", "closed": false},
    {"day": "Miércoles", "open": "08:00", "close": "19:00", "closed": false},
    {"day": "Jueves", "open": "08:00", "close": "19:00", "closed": false},
    {"day": "Viernes", "open": "08:00", "close": "19:00", "closed": false},
    {"day": "Sábado", "open": "08:00", "close": "19:00", "closed": false},
    {"day": "Domingo", "open": "09:00", "close": "13:00", "closed": false}
  ],
  "holidayHours": {"day": "Festivos", "open": "09:00", "close": "13:00", "closed": false},
  "lunch": {"enabled": true, "start": "12:00", "end": "13:00"},
  "allowAnyBarber": true,
  "slotStep": 30,
  "daysAhead": 14,
  "specialDays": []
}'::jsonb);

-- Equipo. Los PIN son solo de prueba local (Walter 1111, Nelson 2222, Gerardo 3333);
-- cada barbero lo cambia desde su portal.
INSERT INTO barbers (name, short_name, role, phone, bio, specialties, rating, review_count, available, pin, commission, avatar) VALUES
  ('Walter Manjarrez', 'Walter', 'barbero', '', 'Barbero y fundador de Salón Hermanos.',
   '["Corte caballero","Degradado","Barba","Cejas"]', 5, 0, true, '1111', 50, 'WM'),
  ('Nelson Márquez', 'Nelson', 'barbero', '', 'Barbero de Salón Hermanos.',
   '["Corte caballero","Degradado","Barba","Cejas"]', 5, 0, true, '2222', 50, 'NM'),
  ('Gerardo Reinero', 'Gerardo', 'barbero', '', 'Barbero de Salón Hermanos.',
   '["Corte caballero","Degradado","Barba","Cejas"]', 5, 0, true, '3333', 50, 'GR');

-- Servicios y precios de Salón Hermanos (duraciones provisionales: se ajustan en Panel → Servicios)
INSERT INTO services (name, category, duration, price, description, popular) VALUES
  ('Corte caballero', 'cortes', 30, 15000, 'Corte clásico o moderno a tu gusto.', true),
  ('Corte de niño', 'cortes', 30, 15000, 'Corte para los más pequeños de la casa.', false),
  ('Corte dama', 'cortes', 45, 15000, 'Corte de cabello para dama.', false),
  ('Corte degradado + cejas', 'cortes', 40, 17000, 'Degradado con perfilado de cejas.', true),
  ('Corte + barba', 'cortes', 45, 20000, 'Corte de cabello y arreglo de barba.', true),
  ('Corte degradado + barba + cejas', 'cortes', 60, 22000, 'El servicio completo: degradado, barba y cejas.', false),
  ('Barba', 'barba', 20, 12000, 'Perfilado y arreglo de barba.', false),
  ('Cejas', 'cejas', 10, 3000, 'Perfilado de cejas.', false),
  ('Corte + keratina', 'tratamientos', 90, 50000, 'Corte de cabello con tratamiento de keratina.', false);
