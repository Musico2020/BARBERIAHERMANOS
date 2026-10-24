import type { BusySlot } from '../services/bookings';
import { todayKey, nowMinutes, timeToMinutes, minutesToTime } from './dates';
import { bookingHoursFor, barberHoursFor, barberLunchFor } from './businessHours';
import type { WorkHours } from '../types';

// Horas que se ofrecen al reservar. Para cada barbero se buscan los huecos libres del día (horario de
// atención, sin almuerzo, sin horas cerradas y sin citas) y en cada hueco se ofrece cualquier hora del
// reloj cada `step` minutos (2:00, 2:15, 2:30…) en la que el servicio completo quepa según su duración.
//
// Además se ofrece la hora justo al terminar otra cita y la que termina justo cuando empieza la siguiente,
// aunque no caigan en el intervalo: salen como «recomendadas» porque no dejan huecos en la agenda.

export interface Slot {
  time: string;
  available: boolean;
  /** Queda justo antes o justo después de otra cita */
  recommended: boolean;
}

type Edge = 'booking' | 'other';
interface Gap { start: number; end: number; startEdge: Edge; endEdge: Edge }

export function isBarberFree(busy: BusySlot[], barberId: string, start: number, duration: number): boolean {
  const end = start + duration;
  return !busy.some((b) => {
    if (b.barberId !== barberId) return false;
    const busyStart = timeToMinutes(b.startTime);
    return busyStart < end && busyStart + b.duration > start;
  });
}

/** Huecos libres [inicio, fin) dentro de [open, close), y si cada borde es una cita u otra cosa (apertura, almuerzo, cierre). */
export function freeGaps(open: number, close: number, blocks: { start: number; end: number; kind: Edge }[]): Gap[] {
  const sorted = blocks.filter((b) => b.end > open && b.start < close).sort((a, b) => a.start - b.start);
  const gaps: Gap[] = [];
  let cursor = open;
  let cursorEdge: Edge = 'other';
  for (const b of sorted) {
    if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, close), startEdge: cursorEdge, endEdge: b.start < close ? b.kind : 'other' });
    if (b.end >= cursor) { cursor = b.end; cursorEdge = b.kind; }
  }
  if (cursor < close) gaps.push({ start: cursor, end: close, startEdge: cursorEdge, endEdge: 'other' });
  return gaps;
}

/**
 * Horas de inicio posibles en un hueco: una detrás de otra según la duración del servicio, desde que
 * empieza el hueco (la apertura, el fin del almuerzo o el fin de otra cita). Así un servicio de 45 min
 * ofrece 2:00, 2:45, 3:30… y cada turno deja el tiempo completo. Además, la que termina justo cuando
 * empieza la siguiente cita (para no dejar huecos).
 */
export function startsInGap(gap: Gap, duration: number): { start: number; recommended: boolean }[] {
  const last = gap.end - duration;
  if (duration <= 0 || last < gap.start) return [];
  const starts = new Map<number, boolean>();
  for (let t = gap.start; t <= last; t += duration) starts.set(t, false);
  if (gap.startEdge === 'booking') starts.set(gap.start, true);
  if (gap.endEdge === 'booking') starts.set(last, true);
  return [...starts.entries()].sort((a, b) => a[0] - b[0]).map(([start, recommended]) => ({ start, recommended }));
}

/**
 * Horas libres del día para un servicio de `duration` minutos con alguno de `barberIds`.
 * Los turnos van uno detrás de otro según la duración del servicio (ver startsInGap); `step` solo se
 * usa si no viene la duración.
 * Solo dentro del horario de atención, fuera del almuerzo de cada barbero y de las horas cerradas, y desde ahora si es hoy
 * (hora de Colombia). Los días cerrados o por orden de llegada no tienen horas.
 */
export function generateSlots(
  date: string,
  busy: BusySlot[],
  barberIds: string[],
  duration: number,
  step = 15,
  /** Horario propio de cada barbero (Panel → Barberos); el que no aparece usa el del salón */
  workHoursOf: (barberId: string) => WorkHours | undefined = () => undefined,
  /** Panel y barbero: pueden ofrecer las horas del almuerzo y las que ya pasaron hoy (cliente atendido sin registrar) */
  options: { includeLunch?: boolean; includePast?: boolean } = {},
): Slot[] {
  if (!bookingHoursFor(date)) return [];
  // Hoy: desde la hora actual, redondeada a los 5 minutos siguientes
  const nowFrom = date === todayKey() && !options.includePast ? Math.ceil((nowMinutes() + 1) / 5) * 5 : 0;
  const slots = new Map<number, boolean>();
  for (const id of barberIds) {
    const hours = barberHoursFor(date, workHoursOf(id));
    if (!hours) continue;
    const lunch = options.includeLunch ? null : barberLunchFor(date, workHoursOf(id));
    const blocks: { start: number; end: number; kind: Edge }[] = busy
      .filter((b) => b.barberId === id)
      .map((b) => ({ start: timeToMinutes(b.startTime), end: timeToMinutes(b.startTime) + b.duration, kind: b.kind === 'closed' ? 'other' : 'booking' }));
    // El almuerzo es un borde, pero pegarse a él no cuenta como «recomendada»
    if (lunch) blocks.push({ start: lunch.start, end: lunch.end, kind: 'other' });
    // Los huecos se cuentan desde la apertura para que la secuencia de turnos sea la misma todo el día;
    // si es hoy, solo se ofrecen los que no han pasado
    for (const gap of freeGaps(hours.open, hours.close, blocks)) {
      for (const s of startsInGap(gap, duration > 0 ? duration : step)) {
        if (s.start >= nowFrom) slots.set(s.start, (slots.get(s.start) ?? false) || s.recommended);
      }
    }
  }
  return [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, recommended]) => ({ time: minutesToTime(t), available: true, recommended }));
}
