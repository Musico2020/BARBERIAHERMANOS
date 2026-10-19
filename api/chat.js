// Asistente del chat de la web. Responde precios, horarios, ubicación y cupos con los datos reales de
// la base; lleva al cliente a reservar y, si no sabe algo, deja el mensaje en Panel → Mensajes.
// Sin ANTHROPIC_API_KEY responde por reglas (api/_reglas.js, gratis); con la llave usa Claude.
//
// Recibe { messages: [{ role: 'user' | 'assistant', content: string }] } y devuelve
// { reply: string, actions: [{ type: 'book' } | { type: 'message_sent' }] }.
//
// Variables de entorno en Vercel:
//   ANTHROPIC_API_KEY
//   VITE_SUPABASE_URL (o APP_SUPABASE_URL), APP_SUPABASE_SERVICE_ROLE_KEY

import Anthropic from '@anthropic-ai/sdk';
import { ruleReply } from './_reglas.js';

const MODEL = 'claude-opus-5-5';
const TZ = 'America/Bogota';
const MAX_TURNS = 30;          // mensajes de historial que se aceptan
const MAX_CHARS = 1000;        // largo máximo de cada mensaje del cliente
const MAX_TOOL_ROUNDS = 5;     // vueltas de herramientas por respuesta
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Límite sencillo por IP (vive mientras la función esté caliente): evita abusos que cuesten dinero
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 40;
}

// ---------------------------------------------------------------- fechas en Colombia
function nowInBogota() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), time: `${parts.hour}:${parts.minute}` };
}
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOf = (key) => DAYS[new Date(`${key}T12:00:00Z`).getUTCDay()];
const longDate = (key) => { const [y, m, d] = key.split('-').map(Number); return `${weekdayOf(key)} ${d} de ${MONTHS[m - 1]} de ${y}`; };
const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const cop = (n) => `$${Number(n).toLocaleString('es-CO')}`;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------------------------------------------------------------- base de datos
function supabase() {
  const url = process.env.APP_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const check = async (r) => { if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`); return r.json(); };
  return {
    ok: Boolean(url && key),
    get: (path) => fetch(`${url}/rest/v1/${path}`, { headers }).then(check),
    rpc: (fn, body) => fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) }).then(check),
  };
}

async function loadBusiness(db) {
  const [settingsRows, services, barbers, products] = await Promise.all([
    db.get('business_settings?select=data&limit=1'),
    db.get('services?select=id,name,category,duration,price,description,popular&active=eq.true&order=name'),
    db.get('barbers?select=id,name,short_name,role,available,specialties&order=name'),
    db.get('products?select=name,brand,price&active=eq.true&order=name').catch(() => []),
  ]);
  return { settings: settingsRows[0]?.data ?? {}, services, barbers, products };
}

/** Datos del negocio para el modelo. Cambia poco: va en el prompt de sistema y se guarda en caché. */
function businessText({ settings: s, services, barbers }) {
  const hours = (s.hours ?? []).map((h) => `- ${h.day}: ${h.closed ? 'cerrado' : `${h.open} a ${h.close}`}`).join('\n');
  const holiday = s.holidayHours ? (s.holidayHours.closed ? 'cerrado' : `${s.holidayHours.open} a ${s.holidayHours.close}, de corrido`) : '10:00 a 15:00, de corrido';
  const lunch = s.lunch?.enabled === false ? 'No hay pausa de almuerzo.' : `Almuerzo de ${s.lunch?.start ?? '12:00'} a ${s.lunch?.end ?? '14:00'} de lunes a sábado (sin citas en ese rango). Domingos y festivos se trabaja de corrido.`;
  const special = (s.specialDays ?? [])
    .filter((d) => d.date >= nowInBogota().date)
    .map((d) => `- ${longDate(d.date)}: ${d.type === 'closed' ? 'cerrado, no hay servicio' : 'abierto solo por orden de llegada (sin reservas por la web)'}${d.note ? ` (${d.note})` : ''}`)
    .join('\n') || '- Ninguno próximo.';
  const serviceLines = services.map((x) => `- ${x.name.trim()}: ${cop(x.price)} · ${x.duration} min${x.category === 'manicura' ? ' · lo hace la manicurista' : ''}${x.description ? ` · ${x.description.trim()}` : ''}`).join('\n');
  const team = barbers.map((b) => `- ${b.name} (${b.role === 'manicurista' ? 'manicurista' : 'barbero'})${b.available ? '' : ' · no disponible por ahora para reservas'}`).join('\n');
  const social = [['Instagram', s.instagram], ['Facebook', s.facebook], ['TikTok', s.tiktok]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
  return `DATOS DEL NEGOCIO (actualizados desde el panel)
Nombre: Salón Hermanos, barbería tradicional (Club de Caballeros) en Valledupar, Colombia.
Dirección: ${(s.address ?? 'Barrio Tobías Daza, Mz B casa 16, segunda etapa, Valledupar').trim()}
WhatsApp: ${s.whatsapp || 'no registrado'} · Teléfono: ${s.phone || s.whatsapp || 'no registrado'}${s.email ? ` · Correo: ${s.email}` : ''}
${social ? `Redes: ${social}` : ''}

Horario:
${hours}
Festivos de Colombia: ${holiday}.
${lunch}

Días especiales:
${special}

Servicios (precio · duración):
${serviceLines}

Equipo:
${team}

Reglas de reserva:
- Se reserva desde el botón "Reservar" de la web: el cliente elige uno o varios servicios, el día, con quién y la hora. No se pide anticipo; se paga en la barbería.
- Se puede reservar hasta ${s.daysAhead ?? 14} días adelante. Las citas pueden empezar cada ${s.slotStep ?? 15} minutos; el cliente elige la hora que quiera entre las libres.
- La manicura se reserva aparte de los servicios de barbería (la hace otra persona).
- Para cambiar o cancelar una cita, escribir por WhatsApp con al menos 2 horas de anticipación.`;
}

const INSTRUCTIONS = `Eres el asistente virtual del chat de la página web de Salón Hermanos. Hablas en español de Colombia, cálido, cercano y breve, como un buen recepcionista de barbería.

Qué haces:
- Respondes sobre servicios, precios, duración, horarios, ubicación, equipo, redes y cómo reservar, usando solo los DATOS DEL NEGOCIO de abajo.
- Cuando preguntan por cupo u horas libres de un día, usa la herramienta consultar_disponibilidad (con la fecha exacta; resuelve "hoy", "mañana", "el sábado" con el calendario que te doy). No inventes horas.
- Cuando el cliente quiere reservar o ya encontró una hora que le sirve, usa mostrar_boton_reservar para que pueda reservar desde la web. Tú no creas reservas.
- Si preguntan algo que no está en los datos (promociones, productos, precios especiales, citas a domicilio, quejas, cambiar o cancelar una cita, algo personal), o el cliente pide hablar con una persona: ofrece dejarle el mensaje a la barbería. Pide su nombre y celular si no los tienes, y usa dejar_mensaje_a_la_barberia con un resumen claro de lo que necesita. Luego dile que le responderán por WhatsApp.

Cómo respondes:
- Respuestas cortas: 1 a 4 frases. Texto plano, sin markdown (nada de asteriscos ni títulos). Puedes usar listas cortas con guiones cuando ayuden y algún emoji con moderación.
- Precios en pesos colombianos tal como aparecen (ej. $30.000).
- Nunca inventes datos, precios, servicios, horas ni promociones. Si no sabes, dilo y ofrece dejar el mensaje.
- Solo hablas de la barbería. Si te piden otra cosa, redirige con amabilidad.
- No pidas datos personales salvo nombre y celular para dejar un mensaje.`;

const TOOLS = [
  {
    name: 'consultar_disponibilidad',
    description: 'Consulta las horas libres reales de un día en la agenda de la barbería (respeta horario, festivos, días especiales, almuerzo y citas ya reservadas). Úsala siempre que pregunten si hay cupo o a qué hora pueden ir.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha en formato AAAA-MM-DD (hora de Colombia).' },
        servicio: { type: 'string', description: 'Nombre del servicio, si el cliente lo dijo (para calcular la duración). Opcional.' },
        barbero: { type: 'string', description: 'Nombre del barbero o manicurista, si el cliente lo pidió. Opcional.' },
      },
      required: ['fecha'],
      additionalProperties: false,
    },
  },
  {
    name: 'mostrar_boton_reservar',
    description: 'Muestra en el chat un botón para que el cliente abra la reserva en la web. Úsala cuando el cliente quiera reservar.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'dejar_mensaje_a_la_barberia',
    description: 'Deja un mensaje para que una persona de la barbería le responda al cliente por WhatsApp. Úsala cuando no puedas responder algo o el cliente pida hablar con alguien. Requiere nombre y celular del cliente.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del cliente.' },
        celular: { type: 'string', description: 'Celular del cliente (10 dígitos).' },
        mensaje: { type: 'string', description: 'Resumen claro de lo que el cliente necesita.' },
      },
      required: ['nombre', 'celular', 'mensaje'],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------- herramientas
async function availability(db, biz, input) {
  const today = nowInBogota();
  const date = String(input.fecha ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Fecha inválida. Usa AAAA-MM-DD.' };
  const daysAhead = Number(biz.settings.daysAhead ?? 14);
  if (date < today.date) return { error: 'Esa fecha ya pasó.' };
  if (date > addDays(today.date, Math.min(daysAhead, 30) - 1)) return { aviso: `Solo se puede reservar hasta ${daysAhead} días adelante.` };

  const [[hours], [lunch], busy] = await Promise.all([
    db.rpc('business_hours_for', { p_date: date }).then((r) => (Array.isArray(r) ? r : [r])),
    db.rpc('lunch_break_for', { p_date: date }).then((r) => (Array.isArray(r) ? r : [r])),
    db.rpc('get_busy_slots', { p_date: date, p_barber_id: null }),
  ]);
  const base = { fecha: date, dia: longDate(date) };
  if (hours.o_status === 'CLOSED') return { ...base, estado: 'Cerrado ese día. No hay servicio.' };
  if (hours.o_status === 'WALK_IN') return { ...base, estado: 'Ese día se atiende solo por orden de llegada; no hay reservas por la web.' };

  const service = input.servicio
    ? biz.services.find((s) => norm(s.name) === norm(input.servicio)) ?? biz.services.find((s) => norm(s.name).includes(norm(input.servicio)) || norm(input.servicio).includes(norm(s.name)))
    : null;
  const duration = service?.duration ?? 30;
  const role = service?.category === 'manicura' ? 'manicurista' : 'barbero';
  let staff = biz.barbers.filter((b) => b.available && b.role === role);
  if (input.barbero) {
    const wanted = biz.barbers.find((b) => norm(b.name).includes(norm(input.barbero)) || norm(b.short_name) === norm(input.barbero));
    if (wanted && !wanted.available) return { ...base, estado: `${wanted.name} no está disponible por ahora para reservas.` };
    if (wanted) staff = staff.filter((b) => b.id === wanted.id);
  }
  // Igual que src/lib/availability.ts: cualquier hora cada «step» minutos en la que el servicio completo
  // quepa en un hueco libre, más la hora justo al terminar otra cita
  const step = Number(biz.settings.slotStep) > 0 ? Number(biz.settings.slotStep) : 15;
  const from = date === today.date ? Math.max(hours.o_open, Math.ceil((today.minutes + 1) / 5) * 5) : hours.o_open;
  const result = staff.map((b) => {
    const blocks = busy
      .filter((x) => x.barber_id === b.id)
      .map((x) => ({ start: toMin(x.start_time), end: toMin(x.start_time) + x.duration }));
    if (lunch.o_start !== null) blocks.push({ start: lunch.o_start, end: lunch.o_end });
    blocks.sort((x, y) => x.start - y.start);
    const gaps = [];
    let cursor = from;
    for (const x of blocks) {
      if (x.end <= cursor) continue;
      if (x.start > cursor) gaps.push({ start: cursor, end: Math.min(x.start, hours.o_close) });
      cursor = Math.max(cursor, x.end);
    }
    if (cursor < hours.o_close) gaps.push({ start: cursor, end: hours.o_close });
    const times = [];
    for (const g of gaps) {
      const last = g.end - duration;
      if (last < g.start) continue;
      const starts = new Set();
      if (g.start !== from) starts.add(g.start);
      for (let t = Math.ceil(g.start / step) * step; t <= last; t += step) starts.add(t);
      times.push(...[...starts].sort((x, y) => x - y).map(toTime));
    }
    return { nombre: b.name, horas_libres: times.slice(0, 24), total_libres: times.length };
  });
  return {
    ...base,
    horario: `${toTime(hours.o_open)} a ${toTime(hours.o_close)}`,
    almuerzo: lunch.o_start !== null ? `${toTime(lunch.o_start)} a ${toTime(lunch.o_end)}` : 'no aplica (de corrido)',
    servicio: service ? `${service.name.trim()} (${duration} min)` : `sin servicio indicado (se calculó con ${duration} min)`,
    disponibilidad: result,
  };
}

async function leaveMessage(db, input) {
  const name = String(input.nombre ?? '').trim();
  const phone = String(input.celular ?? '').replace(/\D/g, '');
  const message = String(input.mensaje ?? '').trim();
  if (name.length < 2) return { error: 'Falta el nombre del cliente.' };
  if (phone.length < 10) return { error: 'Falta un celular válido de 10 dígitos.' };
  if (!message) return { error: 'Falta el mensaje.' };
  try {
    await db.rpc('send_contact_message', { p_name: name, p_phone: phone, p_message: `[Chat de la web] ${message}`.slice(0, 1000) });
    return { ok: true, info: 'Mensaje entregado a la barbería. Le responderán por WhatsApp.' };
  } catch (err) {
    const code = /TOO_MANY_MESSAGES/.test(err.message) ? 'El cliente ya dejó varios mensajes; que espere o escriba por WhatsApp.' : 'No se pudo guardar el mensaje; que escriba directo por WhatsApp.';
    return { error: code };
  }
}

// ---------------------------------------------------------------- handler
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = supabase();
  if (!db.ok) return res.status(503).json({ error: 'El asistente no está configurado' });

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'Demasiados mensajes seguidos. Espera un momento.' });

  // Historial: solo texto, alternando cliente/asistente, terminando en un mensaje del cliente
  const raw = Array.isArray(req.body?.messages) ? req.body.messages.slice(-MAX_TURNS) : [];
  const history = raw
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, m.role === 'user' ? MAX_CHARS : 4000) }));
  while (history.length && history[0].role !== 'user') history.shift();
  if (!history.length || history.at(-1).role !== 'user') return res.status(400).json({ error: 'Falta el mensaje' });

  try {
    const biz = await loadBusiness(db);
    const today = nowInBogota();

    // Sin llave de Claude: asistente por reglas con los datos de la base (gratis)
    if (!process.env.ANTHROPIC_API_KEY) {
      const result = await ruleReply({
        text: history.at(-1).content,
        biz,
        today,
        availability: (input) => availability(db, biz, input),
        // Horario de un día cualquiera (festivos y días especiales incluidos), sin límite de anticipación
        hoursFor: async (fecha) => {
          const [[h], [l]] = await Promise.all([
            db.rpc('business_hours_for', { p_date: fecha }).then((r) => (Array.isArray(r) ? r : [r])),
            db.rpc('lunch_break_for', { p_date: fecha }).then((r) => (Array.isArray(r) ? r : [r])),
          ]);
          return { status: h.o_status, open: h.o_open, close: h.o_close, lunchStart: l.o_start, lunchEnd: l.o_end };
        },
      });
      return res.status(200).json(result);
    }

    const calendar = Array.from({ length: 8 }, (_, i) => { const d = addDays(today.date, i); return `${i === 0 ? 'hoy' : i === 1 ? 'mañana' : weekdayOf(d)} = ${d}`; }).join(', ');

    const client = new Anthropic();
    const messages = [
      ...history,
      // Fecha y hora actuales: van al final para no romper la caché del prompt de sistema
      { role: 'system', content: `Ahora en Colombia es ${longDate(today.date)}, ${today.time}. Calendario: ${calendar}.` },
    ];
    const actions = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: [
          { type: 'text', text: INSTRUCTIONS },
          { type: 'text', text: businessText(biz), cache_control: { type: 'ephemeral' } },
        ],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === 'refusal') {
        return res.status(200).json({ reply: 'Disculpa, con eso no te puedo ayudar. ¿Te ayudo con precios, horarios o una reserva?', actions });
      }
      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const reply = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        return res.status(200).json({ reply: reply || '¿Me lo puedes repetir, por favor?', actions });
      }

      messages.push({ role: 'assistant', content: response.content });
      const results = await Promise.all(toolUses.map(async (t) => {
        let out;
        try {
          if (t.name === 'consultar_disponibilidad') out = await availability(db, biz, t.input ?? {});
          else if (t.name === 'mostrar_boton_reservar') { if (!actions.some((a) => a.type === 'book')) actions.push({ type: 'book' }); out = { ok: true, info: 'Botón de reservar mostrado al cliente.' }; }
          else if (t.name === 'dejar_mensaje_a_la_barberia') { out = await leaveMessage(db, t.input ?? {}); if (out.ok) actions.push({ type: 'message_sent' }); }
          else out = { error: 'Herramienta desconocida' };
        } catch (err) {
          console.error('Herramienta falló', t.name, err);
          out = { error: 'No se pudo consultar en este momento.' };
        }
        return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(out), ...(out.error ? { is_error: true } : {}) };
      }));
      messages.push({ role: 'user', content: results });
    }
    return res.status(200).json({ reply: 'Déjame revisar mejor eso. ¿Me escribes de nuevo tu pregunta?', actions });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'El asistente está muy ocupado. Intenta en un momento.' });
    if (err instanceof Anthropic.APIError) { console.error('Claude API', err.status, err.message); return res.status(502).json({ error: 'El asistente no pudo responder.' }); }
    console.error('Chat falló', err);
    return res.status(500).json({ error: 'El asistente no pudo responder.' });
  }
}

// Para pruebas locales (Vercel solo usa el export por defecto)
export { availability, businessText, loadBusiness, supabase as connectSupabase };
