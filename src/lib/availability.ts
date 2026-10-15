import type { BusySlot } from '../services/bookings';
import { todayKey, nowMinutes, timeToMinutes, minutesToTime } from './dates';
import { bookingHoursFor, lunchFor } from './businessHours';

// Horas que se ofrecen al reservar, «pegadas» a las citas: no hay intervalo fijo. Para cada barbero se
// buscan los huecos libres del día (horario de atención, sin almuerzo ni citas) y en cada hueco se
// ofrece la hora en que empieza, las siguientes según lo que dura el servicio pedido y la que lo deja
// terminando justo al final del hueco.
//
// Para no perder tiempo:
//  - No se ofrece una hora que deje, antes o después, un pedazo libre más corto que el servicio más
//    corto (en ese pedazo no cabría nada). Si el hueco es tan justo que siempre sobra un pedacito, se
//    ofrece igual la hora pegada al inicio, para no perder la cita.
//  - Las horas pegadas a otra cita salen como «recomendadas»: así el día queda compacto.

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

/** Horas de inicio de un hueco que no dejan pedazos inútiles, marcando las pegadas a una cita. */
export function startsInGap(gap: Gap, duration: number, minGap: number): { start: number; recommended: boolean }[] {
  if (gap.end - gap.start < duration) return [];
  const candidates = new Set<number>();
  for (let t = gap.start; t + duration <= gap.end; t += duration) candidates.add(t);
  candidates.add(gap.end - duration);
  const useful = (piece: number) => piece === 0 || piece >= minGap;
  const valid = [...candidates]
    .filter((t) => useful(t - gap.start) && useful(gap.end - t - duration))
    .sort((a, b) => a - b);
  // Hueco justo: siempre sobra un pedacito, pero la cita se ofrece pegada al inicio
  const starts = valid.length ? valid : [gap.start];
  return starts.map((t) => ({
    start: t,
    recommended: (t === gap.start && gap.startEdge === 'booking') || (t + duration === gap.end && gap.endEdge === 'booking'),
  }));
}

/**
 * Horas libres del día para un servicio de `duration` minutos con alguno de `barberIds`.
 * `minGap`: duración del servicio más corto (los pedazos libres más cortos que eso se pierden).
 * Solo dentro del horario de atención, fuera del almuerzo y desde ahora si es hoy (hora de Colombia).
 * Los días cerrados o por orden de llegada no tienen horas.
 */
export function generateSlots(date: string, busy: BusySlot[], barberIds: string[], duration: number, minGap = 15): Slot[] {
  const hours = bookingHoursFor(date);
  if (!hours) return [];
  const lunch = lunchFor(date);
  // Hoy: desde la hora actual, redondeada a los 5 minutos siguientes
  const from = date === todayKey() ? Math.max(hours.open, Math.ceil((nowMinutes() + 1) / 5) * 5) : hours.open;
  const slots = new Map<number, boolean>();
  for (const id of barberIds) {
    const blocks: { start: number; end: number; kind: Edge }[] = busy
      .filter((b) => b.barberId === id)
      .map((b) => ({ start: timeToMinutes(b.startTime), end: timeToMinutes(b.startTime) + b.duration, kind: 'booking' }));
    // El almuerzo es un borde, pero pegarse a él no cuenta como «recomendada»
    if (lunch) blocks.push({ start: lunch.start, end: lunch.end, kind: 'other' });
    for (const gap of freeGaps(from, hours.close, blocks)) {
      for (const s of startsInGap(gap, duration, minGap)) slots.set(s.start, (slots.get(s.start) ?? false) || s.recommended);
    }
  }
  return [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, recommended]) => ({ time: minutesToTime(t), available: true, recommended }));
}
