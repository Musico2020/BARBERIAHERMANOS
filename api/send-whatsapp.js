// Envía por WhatsApp (Twilio) la confirmación de una reserva al cliente y el aviso al dueño.
//
// Recibe solo { bookingId }. Los datos se leen de la base de datos, así nadie puede usar esta
// función para mandar mensajes a números o con textos inventados. Cada reserva se avisa una sola
// vez y solo durante los primeros 15 minutos después de creada.
//
// Variables de entorno en Vercel:
//   VITE_SUPABASE_URL (o APP_SUPABASE_URL), APP_SUPABASE_SERVICE_ROLE_KEY (llave service_role de ese proyecto)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_WHATSAPP_TO
//   TWILIO_TEMPLATE_CLIENT, TWILIO_TEMPLATE_OWNER (SIDs «HX...» de las plantillas aprobadas de Salón Hermanos)

const MAX_AGE_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bookingId = req.body?.bookingId;
  if (typeof bookingId !== 'string' || !UUID_RE.test(bookingId)) {
    return res.status(400).json({ error: 'bookingId inválido' });
  }

  // La misma base de datos que usa la web (VITE_SUPABASE_URL). Las variables SUPABASE_* las maneja
  // la integración de Vercel y pueden apuntar a otro proyecto, por eso van de último recurso.
  const supabaseUrl = process.env.APP_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const ownerTo = process.env.TWILIO_WHATSAPP_TO;
  const CLIENT_TEMPLATE_SID = process.env.TWILIO_TEMPLATE_CLIENT;
  const OWNER_TEMPLATE_SID = process.env.TWILIO_TEMPLATE_OWNER;

  if (!supabaseUrl || !serviceKey || !accountSid || !authToken || !from || !ownerTo || !CLIENT_TEMPLATE_SID || !OWNER_TEMPLATE_SID) {
    return res.status(500).json({ error: 'WhatsApp no está configurado' });
  }

  const db = (path, init = {}) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...init.headers },
    });

  // Reservar el envío: solo una petición puede marcar la cita como avisada
  const claim = await db(
    `bookings?id=eq.${bookingId}&whatsapp_sent_at=is.null&created_at=gte.${new Date(Date.now() - MAX_AGE_MS).toISOString()}`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ whatsapp_sent_at: new Date().toISOString() }) },
  );
  if (!claim.ok) {
    console.error('Supabase error', claim.status, await claim.text());
    return res.status(500).json({ error: 'No se pudo leer la reserva' });
  }
  const [booking] = await claim.json();
  if (!booking) {
    return res.status(409).json({ error: 'La reserva no existe, ya fue avisada o es muy antigua' });
  }

  const [year, month, day] = booking.date.split('-');
  const dateFormatted = `${parseInt(day, 10)} de ${MONTHS[parseInt(month, 10) - 1]} de ${year}`;
  const priceFormatted = `$${Number(booking.price).toLocaleString('es-CO')}`;
  const digits = String(booking.client_phone).replace(/\D/g, '').replace(/^57(?=\d{10}$)/, '');
  const clientTo = `whatsapp:+57${digits}`;

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const sendTemplate = async (to, contentSid, variables) => {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: to, ContentSid: contentSid, ContentVariables: JSON.stringify(variables) }).toString(),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Twilio ${response.status}: ${result.message ?? 'error'}`);
    return result.sid;
  };

  const results = {};
  try {
    results.owner = await sendTemplate(ownerTo, OWNER_TEMPLATE_SID, {
      1: booking.client_name,
      2: booking.client_phone,
      3: booking.service_name,
      4: booking.barber_name,
      5: dateFormatted,
      6: booking.time,
      7: priceFormatted,
    });
  } catch (error) {
    console.error('No se pudo avisar al dueño', error);
    results.ownerError = error.message;
  }
  try {
    results.client = await sendTemplate(clientTo, CLIENT_TEMPLATE_SID, {
      1: booking.client_name,
      2: dateFormatted,
      3: booking.time,
      4: booking.service_name,
      5: booking.barber_name,
      6: priceFormatted,
    });
  } catch (error) {
    console.error('No se pudo enviar la confirmación al cliente', error);
    results.clientError = error.message;
  }

  const ok = Boolean(results.owner || results.client);
  if (!ok) {
    // Ningún mensaje salió: se libera la marca para poder reintentar
    await db(`bookings?id=eq.${bookingId}`, { method: 'PATCH', body: JSON.stringify({ whatsapp_sent_at: null }) });
  }
  return res.status(ok ? 200 : 502).json({ success: ok, ...results });
}
