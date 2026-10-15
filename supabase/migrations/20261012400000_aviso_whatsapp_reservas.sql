/*
  Marca de envío del WhatsApp de confirmación.
  api/send-whatsapp.js la usa para enviar el aviso una sola vez por reserva.
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;
