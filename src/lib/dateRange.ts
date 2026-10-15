// Rangos de fechas para los reportes (quincenas)

export interface DateRange { start: string; end: string }

export const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const pad = (n: number) => String(n).padStart(2, '0');
export const dateKeyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Quincena (1–15 o 16–fin de mes) que contiene la fecha */
export function quincenaOf(dateKey: string): DateRange {
  const [y, m, d] = dateKey.split('-').map(Number);
  return d <= 15 ? { start: dateKeyOf(y, m, 1), end: dateKeyOf(y, m, 15) } : { start: dateKeyOf(y, m, 16), end: dateKeyOf(y, m, lastDay(y, m)) };
}

/** «1 al 15 de octubre de 2026» o «28 sep 2026 al 12 oct 2026» */
export function rangeLabel({ start, end }: DateRange): string {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  if (start === end) return `${d1} de ${MONTHS_LONG[m1 - 1].toLowerCase()} de ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1} al ${d2} de ${MONTHS_LONG[m1 - 1].toLowerCase()} de ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS_SHORT[m1 - 1]} al ${d2} ${MONTHS_SHORT[m2 - 1]} de ${y1}`;
  return `${d1} ${MONTHS_SHORT[m1 - 1]} ${y1} al ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`;
}
