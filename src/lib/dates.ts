// Fechas de la barbería, siempre en hora de Colombia.
// Una "clave de fecha" es un texto 'YYYY-MM-DD', igual al que guarda la columna bookings.date.
// No usar toISOString() para fechas: devuelve la hora UTC y después de las 7 p. m. salta al día siguiente.

export const BUSINESS_TIME_ZONE = 'America/Bogota';

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function nowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { year: get('year'), month: get('month'), day: get('day'), hour: Number(get('hour')), minute: Number(get('minute')) };
}

/** Fecha de hoy en Colombia, como 'YYYY-MM-DD'. */
export function todayKey(): string {
  const { year, month, day } = nowParts();
  return `${year}-${month}-${day}`;
}

/** Minutos transcurridos desde la medianoche, hora de Colombia. */
export function nowMinutes(): number {
  const { hour, minute } = nowParts();
  return hour * 60 + minute;
}

function keyToUTC(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Suma (o resta) días a una clave de fecha. */
export function addDays(key: string, days: number): string {
  const date = keyToUTC(key);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToKey(date);
}

/** Lunes de la semana de la fecha dada. */
export function startOfWeek(key: string): string {
  const day = keyToUTC(key).getUTCDay();
  return addDays(key, day === 0 ? -6 : 1 - day);
}

export function dayOfMonth(key: string): number {
  return keyToUTC(key).getUTCDate();
}

export function dayShort(key: string): string {
  return DAYS_SHORT[keyToUTC(key).getUTCDay()];
}

export function monthShort(key: string): string {
  return MONTHS_SHORT[keyToUTC(key).getUTCMonth()];
}

export function monthLong(key: string): string {
  return MONTHS_LONG[keyToUTC(key).getUTCMonth()];
}


/** 'YYYY-MM-DD' -> 'Sábado 11 de octubre' */
export function formatDateLong(key: string): string {
  if (!key) return '';
  const date = keyToUTC(key);
  const day = DAYS_LONG[date.getUTCDay()];
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${date.getUTCDate()} de ${MONTHS_LONG[date.getUTCMonth()]}`;
}

/** 'HH:MM' -> minutos desde la medianoche */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
