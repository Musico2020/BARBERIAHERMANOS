/*
  Avisos al teléfono (notificaciones push de la web, sin WhatsApp).

  push_subscriptions: cada teléfono o computador donde el administrador tocó «Activar avisos».
  Solo el administrador puede registrar, ver y quitar los suyos; api/notify-push.js los lee con la
  llave de servicio para enviar los avisos.

  bookings.push_booking_at / push_deposit_at: cuándo se avisó la reserva nueva y el comprobante,
  para que cada aviso salga una sola vez.
*/

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint    text PRIMARY KEY,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_id     uuid REFERENCES auth.users (id) ON DELETE CASCADE DEFAULT auth.uid(),
  device      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_admin ON push_subscriptions;
CREATE POLICY push_admin ON push_subscriptions FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

REVOKE ALL ON push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS push_booking_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS push_deposit_at timestamptz;
