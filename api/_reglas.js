// Asistente por reglas (sin IA, sin costo): entiende palabras clave de la pregunta y responde con los
// datos de la base. Lo usa api/chat.js cuando no hay ANTHROPIC_API_KEY.
// Los archivos de api/ que empiezan con «_» no son rutas en Vercel.

const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;:()]/g, ' ').replace(/\s+/g, ' ').trim();
const has = (text, words) => words.some((w) => (w.includes(' ') ? text.includes(w) : new RegExp(`\\b${w}`).test(text)));
const cop = (n) => `$${Number(n).toLocaleString('es-CO')}`;
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (key) => new Date(`${key}T12:00:00Z`).getUTCDay();
const dayLabel = (key, today) => {
  const [, m, d] = key.split('-').map(Number);
  const rel = key === today ? 'hoy ' : key === addDays(today, 1) ? 'mañana ' : '';
  return `${rel}${DAYS_ES[weekday(key)]} ${d} de ${MONTHS[m - 1]}`;
};
const hour12 = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
};

// Palabras de cada tema
const INTENTS = {
  saludo: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'saludos', 'que mas', 'q mas'],
  gracias: ['gracias', 'muchas gracias', 'listo', 'perfecto', 'ok', 'chao', 'adios', 'hasta luego', 'bendiciones'],
  cupo: ['cupo', 'disponib', 'libre', 'espacio', 'turno', 'hay campo', 'puedo ir', 'me atienden', 'me pueden atender', 'a que hora puedo', 'que horas tienen', 'horas libres'],
  reservar: ['reserv', 'agend', 'apart', 'sacar cita', 'pedir cita', 'una cita', 'separar', 'separ'],
  precio: ['precio', 'cuanto', 'vale', 'valor', 'cuesta', 'cobran', 'tarifa', 'costo', 'plata'],
  servicios: ['servicio', 'que hacen', 'que ofrecen', 'que tienen', 'catalogo', 'menu', 'lista'],
  horario: ['horario', 'hora', 'abren', 'abierto', 'cierran', 'cerrado', 'atienden', 'trabajan', 'domingo', 'festivo', 'feriado'],
  almuerzo: ['almuerzo', 'almorzar', 'mediodia', 'medio dia'],
  ubicacion: ['donde', 'direccion', 'ubicacion', 'ubicados', 'quedan', 'llegar', 'mapa', 'barrio', 'sitio', 'lugar', 'local'],
  contacto: ['telefono', 'numero', 'whatsapp', 'celular', 'llamar', 'contacto', 'correo', 'email'],
  redes: ['instagram', 'facebook', 'tiktok', 'redes', 'insta'],
  equipo: ['barbero', 'quien', 'equipo', 'manicurista', 'walter', 'nelson', 'gerardo'],
  pago: ['pago', 'pagar', 'tarjeta', 'nequi', 'daviplata', 'efectivo', 'transferencia', 'anticipo', 'abono'],
  cancelar: ['cancel', 'cambiar la cita', 'cambiar mi cita', 'mover la cita', 'reprogram', 'no puedo ir', 'llegar tarde'],
  humano: ['persona', 'humano', 'asesor', 'hablar con alguien', 'dueno', 'administrador', 'encargado'],
  // Temas que no están en la base: los responde una persona de la barbería
  especial: ['domicilio', 'a casa', 'mi casa', 'promo', 'descuento', 'oferta', 'estudiante', 'combo', 'empleo', 'trabajo', 'vacante', 'hoja de vida', 'curso', 'clases', 'aprender', 'evento', 'boda', 'matrimonio', 'grupo', 'nino', 'nina', 'bebe', 'queja', 'reclamo', 'parqueadero', 'parqueo', 'mascota', 'factura', 'garantia', 'bono', 'regalo', 'tarjeta de regalo'],
  productos: ['venden', 'vender', 'producto', 'comprar', 'tienda', 'shop', 'gel', 'shampoo', 'champu', 'aceite', 'pomada', 'cera para', 'locion', 'perfume', 'maquina', 'cuchilla'],
};

// Sinónimos para encontrar el servicio del que hablan
const SERVICE_HINTS = [
  [['corte', 'motilar', 'motilada', 'pelar', 'peluqueada', 'cabello', 'pelo'], ['corte']],
  [['barba', 'afeitar', 'afeitada', 'perfilado'], ['barba']],
  [['ceja'], ['ceja']],
  [['depil', 'cera', 'nariz', 'oreja'], ['depil']],
  [['manicur', 'unas', 'pedicur'], ['manicur']],
  [['masaje', 'capilar'], ['masaje']],
  [['aminoacido', 'alisado', 'keratina', 'tratamiento'], ['aminoacido', 'tratamiento']],
  [['mascarilla', 'facial', 'limpieza'], ['mascarilla', 'facial']],
];

function findServices(text, services) {
  // Nombre completo escrito tal cual (p. ej. «corte + barba + mascarilla»)
  let found = services.filter((s) => norm(s.name).length > 3 && text.includes(norm(s.name)));
  // «corte + barba + mascarilla» no es también «barba»: se quitan los nombres contenidos en otro
  found = found.filter((s) => !found.some((o) => o !== s && norm(o.name).includes(norm(s.name))));
  for (const [words, nameHints] of SERVICE_HINTS) {
    if (!words.some((w) => new RegExp(`\\b${w}`).test(text))) continue;
    const matches = services.filter((s) => nameHints.some((h) => norm(s.name).includes(h)));
    if (matches.some((s) => found.includes(s))) continue;
    // Por tema, el servicio más sencillo: «un corte» → «Corte premium», no «Corte + barba + mascarilla»
    const simplest = [...matches].sort((a, b) => a.name.length - b.name.length)[0];
    if (simplest) found.push(simplest);
  }
  return found;
}

function findBarber(text, barbers) {
  return barbers.find((b) => text.includes(norm(b.short_name)) || text.includes(norm(b.name).split(' ')[0]));
}

/** Fecha de la que habla el mensaje (hoy, mañana, pasado mañana, un día de la semana, «el 20», «20/10»). */
function findDate(text, today) {
  if (/\bpasado manana\b/.test(text)) return addDays(today, 2);
  if (/\bhoy\b|\bahorita\b|\bahora\b/.test(text)) return today;
  // «mañana» como día; «en la mañana» / «por la mañana» es la parte del día
  if (/\bmanana\b/.test(text.replace(/\b((en|por|de) )?la manana\b/g, ''))) return addDays(today, 1);
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    if (new RegExp(`\\b${DAYS[weekday(d)]}\\b`).test(text) && !/\bfestivo/.test(text)) return d;
  }
  const [y, m] = today.split('-').map(Number);
  const slash = text.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})\b/);
  if (slash) return `${y}-${String(slash[2]).padStart(2, '0')}-${String(slash[1]).padStart(2, '0')}`;
  const monthName = text.match(new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join('|')})\\b`));
  if (monthName) return `${y}-${String(MONTHS.indexOf(monthName[2]) + 1).padStart(2, '0')}-${String(monthName[1]).padStart(2, '0')}`;
  const dayOnly = text.match(/\b(?:el|dia|para el)\s+(\d{1,2})\b/);
  if (dayOnly) {
    const d = Number(dayOnly[1]);
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return key >= today ? key : `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/** Parte del día que piden: mañana (antes de 12), tarde (12 a 17), noche (desde 17). */
function partOfDay(text) {
  if (/\b(en|por) la manana\b|\btemprano\b/.test(text)) return { label: 'en la mañana', from: '00:00', to: '12:00' };
  if (/\b(en|por) la tarde\b|\btarde\b/.test(text)) return { label: 'en la tarde', from: '12:00', to: '17:00' };
  if (/\b(en|por) la noche\b|\bnoche\b/.test(text)) return { label: 'en la noche', from: '17:00', to: '23:59' };
  return null;
}

/** «8 a. m., 9 a. m. y 10 a. m.» o, si hay más, «8 a. m., 9 a. m., 10 a. m. y 3 más» */
const listTimes = (times, more = 0) => {
  if (more > 0) return `${times.join(', ')} y ${more} más`;
  return times.length <= 1 ? times.join('') : `${times.slice(0, -1).join(', ')} y ${times.at(-1)}`;
};
/** Termina la frase con un solo punto (las horas ya terminan en «m.») */
const dot = (s) => (s.endsWith('.') ? s : `${s}.`);

/** «Hoy miércoles 14…», «Mañana jueves 15…» o «El sábado 17…» */
const onDay = (label) => (/^(hoy|mañana) /.test(label) ? label[0].toUpperCase() + label.slice(1) : `El ${label}`);

/** Cómo se paga, según el anticipo configurado en el panel */
const depositText = (s) => (s.deposit && s.deposit.enabled === false
  ? 'No pedimos anticipo: pagas en el salón el día de tu cita.'
  : `Para separar tu hora pagas un anticipo del ${s.deposit?.percent ?? 50} % con el QR de Nequi que te aparece al terminar la reserva (o el 100 % si prefieres), y el resto lo pagas en el salón. También puedes elegir pagar el anticipo en efectivo: te comprometes a ir al salón a pagarlo antes de tu cita. Si pagas por transferencia y no asistes, pierdes el dinero pagado.`);

/**
 * Respuesta por reglas. Devuelve { reply, actions }.
 * ctx: { text, biz, today: {date, minutes}, availability(input), hoursFor(fecha) }
 */
export async function ruleReply({ text: raw, biz, today, availability, hoursFor }) {
  const text = norm(raw);
  const { settings: s, services, barbers } = biz;
  const parts = [];
  const actions = [];
  const intent = Object.fromEntries(Object.entries(INTENTS).map(([k, words]) => [k, has(text, words)]));
  // Domicilio, promociones, eventos…: no se adivina, se pasa a la barbería
  if (intent.especial) {
    return {
      reply: 'Eso lo coordina directamente la barbería. 🙌 Toca "Dejar mensaje", escribe tu nombre y celular, y te responden por WhatsApp lo antes posible.',
      actions: [{ type: 'handoff' }],
    };
  }
  const svc = intent.productos ? [] : findServices(text, services);
  const barber = findBarber(text, barbers);
  const date = findDate(text, today.date);
  const part = partOfDay(text);

  // Cupo: «¿hay cupo…?», o reservar con un día, o un día + hora/barbero
  const wantsSlots = intent.cupo || (date && (intent.reservar || barber || part)) || (date && svc.length && !intent.precio);
  if (wantsSlots) {
    const when = date ?? today.date;
    const service = svc[0];
    const result = await availability({ fecha: when, servicio: service?.name, barbero: barber?.name });
    if (result.error || result.aviso) {
      parts.push(`${result.error ?? result.aviso} Puedes reservar hasta ${s.daysAhead ?? 14} días adelante.`);
    } else if (result.estado) {
      parts.push(`Para ${dayLabel(when, today.date)}: ${result.estado}`);
    } else {
      const lines = result.disponibilidad.map((b) => ({
        name: b.nombre.split(' ')[0],
        all: b.horas_libres,
        times: part ? b.horas_libres.filter((t) => t >= part.from && t < part.to) : b.horas_libres,
      }));
      const withTimes = lines.filter((l) => l.times.length);
      const forWhat = service ? ` para ${service.name.trim()} (${service.duration} min)` : '';
      const openHours = result.horario.split(' a ').map(hour12).join(' a ');
      if (!withTimes.length && part && lines.some((l) => l.all.length)) {
        // No hay en esa parte del día, pero sí en otra: se ofrecen las demás
        const detail = lines.filter((l) => l.all.length).map((l) => `- ${l.name}: ${listTimes(l.all.slice(0, 8).map(hour12), Math.max(0, l.all.length - 8))}`).join('\n');
        parts.push(`${onDay(dayLabel(when, today.date))} atendemos de ${openHours}, así que ${part.label} no hay horas. Estas sí están libres ese día:\n${detail}\nToca "Reservar ahora" para apartar la tuya.`);
        actions.push({ type: 'book' });
      } else if (!withTimes.length) {
        parts.push(`Para ${dayLabel(when, today.date)}${part ? ` ${part.label}` : ''}${forWhat} ya no quedan horas libres${barber ? ` con ${barber.short_name}` : ''}. ¿Quieres que mire otro día?`);
      } else {
        const detail = withTimes.map((l) => `- ${l.name}: ${listTimes(l.times.slice(0, 8).map(hour12), Math.max(0, l.times.length - 8))}`).join('\n');
        parts.push(`Para ${dayLabel(when, today.date)}${part ? ` ${part.label}` : ''}${forWhat} hay estas horas libres:\n${detail}\nToca "Reservar ahora" para apartar la tuya.`);
        actions.push({ type: 'book' });
      }
    }
  } else if (intent.reservar) {
    parts.push(`¡Claro! Toca "Reservar ahora": eliges los servicios, el día, con quién y la hora. ${depositText(s)} Si quieres, dime un día y te digo qué horas hay libres.`);
    actions.push({ type: 'book' });
  }

  if (intent.precio || (svc.length && !wantsSlots && !intent.horario)) {
    if (svc.length) {
      parts.push(svc.map((x) => `${x.name.trim()}: ${cop(x.price)} (${x.duration} min)`).join('\n'));
    } else {
      parts.push(`Estos son nuestros servicios y precios:\n${services.map((x) => `- ${x.name.trim()}: ${cop(x.price)}`).join('\n')}`);
    }
  } else if (intent.servicios) {
    parts.push(`Estos son nuestros servicios:\n${services.map((x) => `- ${x.name.trim()}: ${cop(x.price)} · ${x.duration} min`).join('\n')}`);
  }

  if (intent.horario && !wantsSlots && !intent.almuerzo) {
    const hol = s.holidayHours && !s.holidayHours.closed ? `Festivos: ${hour12(s.holidayHours.open)} a ${hour12(s.holidayHours.close)}, de corrido.` : 'Festivos: cerrado.';
    const lunchLine = s.lunch?.enabled === false ? '' : dot(`De lunes a sábado salimos a almorzar de ${hour12(s.lunch?.start ?? '12:00')} a ${hour12(s.lunch?.end ?? '14:00')}`);
    if (date) {
      // Un día puntual: el servidor ya sabe de festivos y días especiales
      const h = await hoursFor(date);
      const day = onDay(dayLabel(date, today.date));
      const t = (min) => hour12(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
      if (h.status === 'CLOSED') parts.push(`${day} estamos cerrados, no hay servicio.`);
      else if (h.status === 'WALK_IN') parts.push(`${day} atendemos solo por orden de llegada (sin reservas por la web).`);
      else parts.push(`${day} atendemos de ${t(h.open)} a ${t(h.close)}${h.lunchStart === null ? ', de corrido.' : ` (almuerzo de ${t(h.lunchStart)} a ${t(h.lunchEnd)}).`}`);
    } else if (/\bfestivo|\bferiado/.test(text)) {
      parts.push(`${hol} ${lunchLine ? 'Ese día no cerramos al mediodía.' : ''}`.trim());
    } else {
      const hours = (s.hours ?? []).map((h) => `- ${h.day}: ${h.closed ? 'cerrado' : `${hour12(h.open)} a ${hour12(h.close)}`}`).join('\n');
      parts.push(`Nuestro horario:\n${hours}\n${hol}${lunchLine ? `\n${lunchLine}` : ''}`);
    }
  } else if (intent.almuerzo) {
    parts.push(s.lunch?.enabled === false ? 'No cerramos al mediodía.' : `De lunes a sábado salimos a almorzar de ${hour12(s.lunch?.start ?? '12:00')} a ${hour12(s.lunch?.end ?? '14:00')}, y domingos y festivos atendemos de corrido.`);
  }

  if (intent.ubicacion) {
    const address = (s.address ?? 'Barrio Tobías Daza, Mz B casa 16, segunda etapa, Valledupar').trim();
    parts.push(`Estamos en ${address}. 📍\nCómo llegar: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Salón Hermanos ${address}`)}`);
  }
  if (intent.contacto) parts.push(`Puedes escribirnos al WhatsApp ${s.whatsapp || 'de la barbería'}${s.phone && s.phone !== s.whatsapp ? ` o llamar al ${s.phone}` : ''}.`);
  if (intent.redes) {
    const social = [['Instagram', s.instagram], ['Facebook', s.facebook], ['TikTok', s.tiktok]].filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n');
    if (social) parts.push(`Síguenos:\n${social}`);
  }
  if (intent.equipo && !wantsSlots) {
    parts.push(`Nuestro equipo:\n${barbers.map((b) => `- ${b.name} (${b.role === 'manicurista' ? 'manicurista' : 'barbero'})${b.available ? '' : ' · por ahora no está tomando reservas'}`).join('\n')}`);
  }
  if (intent.productos) {
    const products = biz.products ?? [];
    const wanted = products.filter((p) => norm(p.name).split(' ').some((w) => w.length > 3 && text.includes(w)));
    if (wanted.length) parts.push(`Sí, tenemos:\n${wanted.slice(0, 6).map((p) => `- ${p.name}${p.brand ? ` (${p.brand})` : ''}: ${cop(p.price)}`).join('\n')}\nMíralos en la sección Productos de esta página`);
    else if (products.length) parts.push(`Puedes ver todos nuestros productos en la sección Productos de esta página\nSi buscas algo que no aparece ahí, déjanos tu mensaje y te confirmamos.`);
    else parts.push('Todavía no tenemos productos publicados en la web. Déjanos tu mensaje y te confirmamos si lo tenemos en la barbería.');
    if (!wanted.length) actions.push({ type: 'handoff' });
  }
  if (intent.pago) parts.push(`${depositText(s)} Para otras formas de pago, déjanos tu mensaje y te confirmamos.`);
  if (intent.cancelar) parts.push(`Para cambiar o cancelar tu cita escríbenos al WhatsApp ${s.whatsapp || 'de la barbería'} con al menos 2 horas de anticipación. 🙏`);

  if (!parts.length && intent.humano) {
    parts.push('Con gusto te comunico con la barbería. Toca "Dejar mensaje", escribe tu nombre y celular, y te responden por WhatsApp.');
    actions.push({ type: 'handoff' });
  }
  if (!parts.length && intent.gracias) parts.push('¡Con mucho gusto! Te esperamos en Salón Hermanos. 💈');
  if (!parts.length && intent.saludo) {
    parts.push('¡Hola! 👋 Bienvenido a Salón Hermanos. Puedo decirte precios, horarios, cómo llegar o qué horas hay libres. ¿Qué necesitas?');
  }
  if (!parts.length) {
    parts.push('Esa pregunta no la sé responder todavía. 🙈 Puedo ayudarte con precios, horarios, ubicación o cupos. Si es otra cosa, toca "Dejar mensaje" y la barbería te responde por WhatsApp.');
    actions.push({ type: 'handoff' });
  }
  if (intent.pago && !actions.some((a) => a.type === 'handoff')) actions.push({ type: 'handoff' });

  return { reply: parts.join('\n\n'), actions };
}
