// Festivos de Colombia calculados con las reglas oficiales (Ley 51 de 1983, "Ley Emiliani"),
// así sirve para cualquier año sin depender de un servicio externo.
//  - Fijos: se celebran el mismo día aunque caigan entre semana.
//  - Trasladables: si no caen en lunes, pasan al lunes siguiente.
//  - Religiosos: dependen de la fecha de Pascua.

const FIXED: [number, number, string][] = [
  [1, 1, 'Año Nuevo'],
  [5, 1, 'Día del Trabajo'],
  [7, 20, 'Día de la Independencia'],
  [8, 7, 'Batalla de Boyacá'],
  [12, 8, 'Inmaculada Concepción'],
  [12, 25, 'Navidad'],
];

const MOVED_TO_MONDAY: [number, number, string][] = [
  [1, 6, 'Reyes Magos'],
  [3, 19, 'San José'],
  [6, 29, 'San Pedro y San Pablo'],
  [8, 15, 'Asunción de la Virgen'],
  [10, 12, 'Día de la Raza'],
  [11, 1, 'Todos los Santos'],
  [11, 11, 'Independencia de Cartagena'],
];

// Días después del domingo de Pascua (los positivos ya caen en lunes)
const FROM_EASTER: [number, string][] = [
  [-3, 'Jueves Santo'],
  [-2, 'Viernes Santo'],
  [43, 'Ascensión del Señor'],
  [64, 'Corpus Christi'],
  [71, 'Sagrado Corazón'],
];

/** Domingo de Pascua (algoritmo de Butcher / Meeus). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function key(date: Date): string {
  return date.toISOString().slice(0, 10); // fechas en UTC puro, sin hora: aquí sí es seguro
}

function nextMonday(date: Date): Date {
  const shift = (8 - date.getUTCDay()) % 7; // 0 si ya es lunes
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + shift));
}

const cache = new Map<number, Map<string, string>>();

/** Festivos de un año: 'YYYY-MM-DD' → nombre. */
export function holidaysOf(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const result = new Map<string, string>();
  // Dos festivos pueden caer el mismo lunes (pasó en 2025 con San Pedro y Sagrado Corazón)
  const add = (date: Date, name: string) => {
    const k = key(date);
    const current = result.get(k);
    result.set(k, current ? `${current} y ${name}` : name);
  };
  for (const [m, d, name] of FIXED) add(new Date(Date.UTC(year, m - 1, d)), name);
  for (const [m, d, name] of MOVED_TO_MONDAY) add(nextMonday(new Date(Date.UTC(year, m - 1, d))), name);
  const e = easter(year);
  for (const [offset, name] of FROM_EASTER) {
    add(new Date(Date.UTC(year, e.getUTCMonth(), e.getUTCDate() + offset)), name);
  }

  cache.set(year, result);
  return result;
}

/** Nombre del festivo de esa fecha ('YYYY-MM-DD'), o null si es un día normal. */
export function holidayName(dateKey: string): string | null {
  return holidaysOf(Number(dateKey.slice(0, 4))).get(dateKey) ?? null;
}

/** Próximos festivos a partir de una fecha (incluida). */
export function upcomingHolidays(fromKey: string, count: number): { date: string; name: string }[] {
  const year = Number(fromKey.slice(0, 4));
  return [...holidaysOf(year), ...holidaysOf(year + 1)]
    .filter(([date]) => date >= fromKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, count)
    .map(([date, name]) => ({ date, name }));
}
