// Importa clientes desde un CSV exportado de Google Contactos a la tabla clients.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/importar-clientes.mjs ruta/contactos.csv [--dry-run]
//
// - La llave service_role es secreta: pásala solo como variable de entorno, nunca la guardes en el código.
// - El CSV tiene datos personales: guárdalo fuera de este repositorio.
// - Se puede ejecutar varias veces: si el celular ya existe, actualiza el nombre y las notas.
// - No borra ni fusiona contactos dudosos; los marca en "notes" para revisarlos a mano.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [csvPath, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
if (!csvPath) {
  console.error('Falta la ruta del CSV. Ejemplo: node scripts/importar-clientes.mjs ../datos-privados/contactos.csv');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
}

// Celulares colombianos: 10 dígitos que empiezan por 30, 31, 32, 33 o 35
const isColombianMobile = (phone) => /^3[0-35]\d{8}$/.test(phone);

function cleanName(value) {
  return value
    .normalize('NFKC')                         // letras "decoradas" -> letras normales
    .replace(/[^\p{L}\p{N}\s.@'_-]/gu, ' ')    // quita adornos como ❀
    .replace(/\s+/g, ' ')
    .trim();
}

const differsByOneDigit = (a, b) =>
  a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;

// ---------------------------------------------------------------------------

const contacts = parseCsv(readFileSync(csvPath, 'utf8')).map((row) => {
  let name = cleanName(row['Name'] ?? '');
  let email = '';
  if (name.includes('@')) {           // algunos contactos se guardaron con el correo como nombre
    email = name.toLowerCase();
    name = name.split('@')[0];
  }
  return {
    name: name || 'Sin nombre',
    email,
    phone: normalizePhone(row['Phone 1 - Value'] ?? ''),
  };
}).filter((c) => c.phone.length >= 7);

const byPhone = new Map();
for (const c of contacts) {
  if (!byPhone.has(c.phone)) byPhone.set(c.phone, c);   // si un número se repite, gana el primero
}
const unique = [...byPhone.values()];

for (const c of unique) {
  const notes = [];
  if (!isColombianMobile(c.phone)) notes.push('Número para revisar: no parece un celular colombiano.');
  for (const other of unique) {
    if (other === c) continue;
    if (differsByOneDigit(c.phone, other.phone)) {
      notes.push(`Posible duplicado de "${other.name}" (${other.phone}): los números difieren en un dígito.`);
    } else if (other.name.toLowerCase() === c.name.toLowerCase() && c.name.includes(' ')) {
      notes.push(`Mismo nombre que otro contacto con el número ${other.phone}.`);
    }
  }
  c.notes = notes.join(' ');
}

const flagged = unique.filter((c) => c.notes);
console.log(`Contactos en el archivo: ${contacts.length}`);
console.log(`Celulares únicos: ${unique.length}`);
console.log(`Marcados para revisar: ${flagged.length}`);
for (const c of flagged) console.log(`  - ${c.name} (${c.phone}): ${c.notes}`);

if (dryRun) {
  console.log('\n--dry-run: no se guardó nada.');
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase.from('clients').upsert(
  unique.map((c) => ({
    name: c.name,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    source: 'google_contacts',
    updated_at: new Date().toISOString(),
  })),
  { onConflict: 'phone' },
);
if (error) {
  console.error('Error al guardar:', error.message);
  process.exit(1);
}

const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true });
console.log(`\nListo. Clientes guardados en la base de datos: ${count}`);
