// Avisos al teléfono del administrador (notificaciones push de la web, sin WhatsApp).
//
//   GET                                   → { publicKey } para que el panel active los avisos
//   POST { event: 'booking', bookingIds } → «Nueva reserva» (la web lo llama al terminar de reservar)
//   POST { event: 'deposit', bookingIds } → «Comprobante por revisar» (al enviar el comprobante)
//   POST { event: 'test', endpoint }      → aviso de prueba a ese teléfono (solo si ya está registrado)
//   POST { event: 'barber' }              → «Te agendaron…» a cada barbero con citas nuevas o que le
//                                           acaban de pasar (panel, portal, Agenda). Lo decide la base
//                                           (claim_barber_push): cada cita se avisa una vez a su barbero.
// La reserva web (event 'booking') también avisa a su barbero.
//
// Los datos se leen de la base de datos con la llave de servicio, así nadie puede mandar textos
// inventados. Cada reserva se avisa una sola vez y solo en los primeros 15 minutos.
//
// Variables de entorno en Vercel:
//   APP_SUPABASE_URL (o VITE_SUPABASE_URL), APP_SUPABASE_SERVICE_ROLE_KEY
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)

import webpush from 'web-push';

const MAX_AGE_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 13:00 -> 1:00 p. m. */
const hour12 = (time) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? ''));
  if (!m) return String(time ?? '');
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
};
const shortDate = (key) => {
  const [y, mo, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS[dow]} ${d} ${MONTHS[mo - 1]}`;
};
const cop = (n) => `$${Number(n).toLocaleString('es-CO')}`;

export default async function handler(req, res) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  const supabaseUrl = process.env.APP_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!publicKey || !privateKey || !supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'Los avisos al teléfono no están configurados' });
  }

  if (req.method === 'GET') return res.status(200).json({ publicKey });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const db = (path, init = {}) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...init.headers },
    });

  /** Envía a los teléfonos de una tabla (todos, de un barbero o uno solo) y borra los que ya no existen. */
  const sendAll = async (payload, onlyEndpoint, table = 'push_subscriptions', barberId = '') => {
    const filtros = [
      onlyEndpoint ? `endpoint=eq.${encodeURIComponent(onlyEndpoint)}` : '',
      barberId ? `barber_id=eq.${barberId}` : '',
    ].filter(Boolean).join('&');
    const r = await db(`${table}?select=endpoint,p256dh,auth${filtros ? `&${filtros}` : ''}`);
    const subs = r.ok ? await r.json() : [];
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
        sent += 1;
      } catch (err) {
        // 404 / 410: el teléfono quitó el permiso o el navegador borró la suscripción
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db(`${table}?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
        } else {
          console.error('No se pudo enviar el aviso', err.statusCode, err.body);
        }
      }
    }));
    return { devices: subs.length, sent };
  };

  /** Avisa a cada barbero sus citas nuevas o que le acaban de pasar (una vez por cita). */
  const notifyBarbers = async () => {
    const r = await db('rpc/claim_barber_push', { method: 'POST', body: '{}' });
    if (!r.ok) {
      console.error('claim_barber_push', r.status, await r.text());
      return { barbers: 0, sent: 0 };
    }
    const rows = await r.json();
    // Un aviso por cliente y día (los servicios seguidos van juntos)
    const groups = new Map();
    for (const b of rows) {
      const client = String(b.o_client_name).replace(/\s*\(turno \d+\)$/, '');
      const key = `${b.o_barber_id}|${client}|${b.o_date}`;
      if (!groups.has(key)) groups.set(key, { barber: b.o_barber_id, client, date: b.o_date, items: [], by: b.o_booked_by });
      groups.get(key).items.push(b);
    }
    let sent = 0;
    for (const g of groups.values()) {
      g.items.sort((a, b) => a.o_time.localeCompare(b.o_time));
      const services = g.items.map((b) => b.o_service_name).join(' + ');
      const total = g.items.reduce((s, b) => s + Number(b.o_price), 0);
      const result = await sendAll({
        title: '💈 Te agendaron una cita',
        body: `${g.client} · ${services} · ${shortDate(g.date)}, ${hour12(g.items[0].o_time)} · ${cop(total)}${g.by ? ` (la agendó ${g.by})` : ''}`,
        url: '/barber',
        tag: `cita-${g.items[0].o_id}`,
      }, '', 'barber_push_subscriptions', g.barber);
      sent += result.sent;
    }
    return { citas: rows.length, sent };
  };

  const { event } = req.body ?? {};

  if (event === 'barber') {
    return res.status(200).json(await notifyBarbers());
  }

  if (event === 'test') {
    const endpoint = String(req.body?.endpoint ?? '');
    if (!endpoint.startsWith('https://')) return res.status(400).json({ error: 'endpoint inválido' });
    const barber = req.body?.barber === true;
    const result = await sendAll({
      title: '💈 Salón Hermanos',
      body: barber ? 'Listo: te avisaremos aquí cuando te agenden una cita.' : 'Listo: los avisos de reservas llegarán a este teléfono.',
      url: barber ? '/barber' : '/admin',
      tag: 'prueba',
    }, endpoint, barber ? 'barber_push_subscriptions' : 'push_subscriptions');
    return res.status(result.devices ? 200 : 404).json(result);
  }

  // La reserva web también le avisa a su barbero (aunque el aviso al administrador ya haya salido)
  if (event === 'booking') await notifyBarbers().catch((err) => console.error('Aviso al barbero', err));

  const ids = Array.isArray(req.body?.bookingIds) ? req.body.bookingIds.filter((x) => typeof x === 'string' && UUID_RE.test(x)).slice(0, 10) : [];
  if (!ids.length || (event !== 'booking' && event !== 'deposit')) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  // Reservar el aviso: solo una petición puede marcar las citas como avisadas
  const since = new Date(Date.now() - MAX_AGE_MS).toISOString();
  const column = event === 'booking' ? 'push_booking_at' : 'push_deposit_at';
  const filter = event === 'booking'
    ? `created_at=gte.${since}`
    : `deposit_status=eq.submitted&deposit_submitted_at=gte.${since}`;
  const claim = await db(`bookings?id=in.(${ids.join(',')})&${column}=is.null&${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ [column]: new Date().toISOString() }),
  });
  if (!claim.ok) {
    console.error('Supabase error', claim.status, await claim.text());
    return res.status(500).json({ error: 'No se pudo leer la reserva' });
  }
  const bookings = (await claim.json()).sort((a, b) => a.time.localeCompare(b.time));
  if (!bookings.length) return res.status(409).json({ error: 'Ya se avisó o la reserva es muy antigua' });

  const first = bookings[0];
  const client = String(first.client_name).replace(/\s*\(turno \d+\)$/, '');
  const services = bookings.map((b) => b.service_name).join(' + ');
  const total = bookings.reduce((s, b) => s + Number(b.price), 0);
  const deposit = bookings.reduce((s, b) => s + Number(b.deposit_amount ?? 0), 0);

  const payload = event === 'booking'
    ? {
        title: '💈 Nueva reserva',
        body: `${client} · ${services} con ${first.barber_name} · ${shortDate(first.date)}, ${hour12(first.time)} · ${cop(total)}`,
        url: '/admin?tab=bookings',
        tag: `reserva-${first.id}`,
      }
    : {
        title: '💵 Comprobante por revisar',
        body: `${client} envió ${cop(deposit)} por ${services} (${shortDate(first.date)}, ${hour12(first.time)}). Revísalo en Pagos.`,
        url: '/admin?tab=payments',
        tag: `pago-${first.id}`,
      };
  const result = await sendAll(payload);
  return res.status(200).json(result);
}
