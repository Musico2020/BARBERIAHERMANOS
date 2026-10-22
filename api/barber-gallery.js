// Fotos de trabajos que sube cada barbero desde su portal («Mis trabajos») a la galería de la web.
//
//   POST { action: 'upload', barberId, pin, image (JPEG en base64), category, alt }
//   POST { action: 'delete', barberId, pin, id }
//
// El PIN se valida con barber_login en la base de datos; con la llave de servicio se guarda la foto en
// el almacenamiento «gallery» (carpeta barbers/<barbero>) y la fila en la tabla gallery con su barber_id.
// Un barbero solo puede borrar sus propias fotos.
//
// Variables de entorno en Vercel: APP_SUPABASE_URL (o VITE_SUPABASE_URL), APP_SUPABASE_SERVICE_ROLE_KEY

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = ['Cortes', 'Degradado', 'Barba', 'Cejas', 'Niños', 'Damas', 'Keratina', 'El salón'];
const MAX_BYTES = 3 * 1024 * 1024;

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabaseUrl = process.env.APP_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(503).json({ error: 'No configurado' });

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const { action, barberId, pin } = req.body ?? {};
  if (typeof barberId !== 'string' || !UUID_RE.test(barberId) || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'INVALID' });
  }

  // El PIN se valida en la base de datos (con bloqueo tras varios intentos fallidos)
  const login = await fetch(`${supabaseUrl}/rest/v1/rpc/barber_login`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_barber_id: barberId, p_pin: pin }),
  });
  const result = login.ok ? await login.json() : 'ERROR';
  if (result !== 'OK') return res.status(401).json({ error: result === 'PIN_LOCKED' ? 'PIN_LOCKED' : 'INVALID_PIN' });

  if (action === 'upload') {
    const { image, category, alt } = req.body;
    if (typeof image !== 'string' || !CATEGORIES.includes(category)) return res.status(400).json({ error: 'INVALID' });
    const bytes = Buffer.from(image, 'base64');
    // JPEG: empieza por FF D8
    if (bytes.length < 1000 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return res.status(400).json({ error: 'INVALID_IMAGE' });
    }
    const id = `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const path = `barbers/${barberId}/${id}.jpg`;
    const up = await fetch(`${supabaseUrl}/storage/v1/object/gallery/${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
      body: bytes,
    });
    if (!up.ok) {
      console.error('No se pudo subir la foto', up.status, await up.text());
      return res.status(500).json({ error: 'UPLOAD_FAILED' });
    }
    const url = `${supabaseUrl}/storage/v1/object/public/gallery/${path}`;
    const item = {
      id,
      url,
      category,
      alt: String(alt || `Trabajo de ${category.toLowerCase()} en Salón Hermanos`).slice(0, 160),
      barber_id: barberId,
    };
    const ins = await fetch(`${supabaseUrl}/rest/v1/gallery`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(item),
    });
    if (!ins.ok) {
      console.error('No se pudo guardar la foto', ins.status, await ins.text());
      await fetch(`${supabaseUrl}/storage/v1/object/gallery`, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
      return res.status(500).json({ error: 'SAVE_FAILED' });
    }
    return res.status(200).json({ id, url, category, alt: item.alt, barberId });
  }

  if (action === 'delete') {
    const { id } = req.body;
    if (typeof id !== 'string' || !/^g-[\w-]+$/.test(id)) return res.status(400).json({ error: 'INVALID' });
    const del = await fetch(`${supabaseUrl}/rest/v1/gallery?id=eq.${encodeURIComponent(id)}&barber_id=eq.${barberId}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=representation' },
    });
    const rows = del.ok ? await del.json() : [];
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });
    const marker = '/object/public/gallery/';
    const at = rows[0].url.indexOf(marker);
    if (at !== -1) {
      const path = decodeURIComponent(rows[0].url.slice(at + marker.length));
      await fetch(`${supabaseUrl}/storage/v1/object/gallery`, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'INVALID' });
}
