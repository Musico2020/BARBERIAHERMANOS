/*
  WhatsApp automático desde la base de datos.

  Antes el aviso por WhatsApp lo disparaba el navegador del cliente después de reservar:
  si cerraba la página o se le iba la señal en ese momento, la cita quedaba guardada
  pero ni el cliente ni la barbería recibían el mensaje.

  Ahora, en cuanto se guarda una reserva, la propia base de datos llama a
  api/send-whatsapp (Vercel). El navegador también lo sigue llamando; no hay mensajes
  repetidos porque api/send-whatsapp marca whatsapp_sent_at y solo envía una vez.

  Para activarlo en producción (una sola vez, en el SQL Editor de Supabase):
    UPDATE notification_settings SET whatsapp_endpoint = 'https://SU-DOMINIO/api/send-whatsapp';
  Mientras esté vacío, el disparador no hace nada.
*/

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS notification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),  -- una sola fila
  whatsapp_endpoint text
);
INSERT INTO notification_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Solo el servidor la usa: sin acceso desde la web
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notification_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION notify_booking_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_endpoint text;
BEGIN
  SELECT whatsapp_endpoint INTO v_endpoint FROM notification_settings WHERE id;
  IF coalesce(v_endpoint, '') = '' THEN
    RETURN NEW;
  END IF;

  -- pg_net envía la petición después de que la reserva queda guardada (no bloquea la reserva)
  PERFORM net.http_post(
    url := v_endpoint,
    body := jsonb_build_object('bookingId', NEW.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Un fallo del aviso nunca debe impedir guardar la cita
  RAISE WARNING 'notify_booking_whatsapp: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_booking_whatsapp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_whatsapp_notify ON bookings;
CREATE TRIGGER bookings_whatsapp_notify
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION notify_booking_whatsapp();
