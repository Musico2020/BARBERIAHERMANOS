import type { ClosedRange, DayOverride } from '../types';
import { minutesToTime, timeToMinutes } from './dates';
import { regularHoursFor, regularLunchFor } from './businessHours';

// Lógica de Panel → Turnos: la grilla de medias horas de un día y sus horas cerradas.
// Las horas cerradas se guardan como rangos (DayOverride.closed); sin barberId aplican a todo el salón.

export const SHIFT_STEP = 30;

/** Horario con el que arranca un ajuste nuevo: el normal del día y el almuerzo ya cerrado. */
export function newOverride(date: string): DayOverride {
  const hours = regularHoursFor(date) ?? { open: '09:00', close: '13:00' };
  const lunch = regularLunchFor(date);
  const closed: ClosedRange[] = lunch && lunch.start >= hours.open && lunch.end <= hours.close ? [{ start: lunch.start, end: lunch.end }] : [];
  return { date, open: hours.open, close: hours.close, closed };
}

/** Inicio (en minutos) de cada media hora entre la apertura y el cierre. */
export function slotStarts(open: string, close: string): number[] {
  const list: number[] = [];
  for (let t = timeToMinutes(open); t + SHIFT_STEP <= timeToMinutes(close); t += SHIFT_STEP) list.push(t);
  return list;
}

const covers = (r: ClosedRange, start: number) => timeToMinutes(r.start) <= start && start + SHIFT_STEP <= timeToMinutes(r.end);

/** Estado de una media hora para «todo el salón» (barberId null) o para un barbero. */
export function slotState(o: DayOverride, start: number, barberId: string | null): 'open' | 'closed' | 'closed-salon' {
  if (o.closed.some((r) => !r.barberId && covers(r, start))) return barberId ? 'closed-salon' : 'closed';
  if (barberId && o.closed.some((r) => r.barberId === barberId && covers(r, start))) return 'closed';
  return 'open';
}

/** Junta medias horas seguidas en rangos «HH:MM–HH:MM». */
function toRanges(starts: number[], barberId?: string): ClosedRange[] {
  const sorted = [...new Set(starts)].sort((a, b) => a - b);
  const ranges: ClosedRange[] = [];
  for (const s of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && timeToMinutes(last.end) === s) last.end = minutesToTime(s + SHIFT_STEP);
    else ranges.push({ start: minutesToTime(s), end: minutesToTime(s + SHIFT_STEP), ...(barberId ? { barberId } : {}) });
  }
  return ranges;
}

/** Medias horas cerradas de un alcance (todo el salón o un barbero), dentro del horario del día. */
function closedStarts(o: DayOverride, barberId: string | null): number[] {
  return slotStarts(o.open, o.close).filter((s) =>
    o.closed.some((r) => (barberId ? r.barberId === barberId : !r.barberId) && covers(r, s)),
  );
}

/** Rehace los rangos guardados quitando lo que quedó fuera del horario del día. */
export function normalizeOverride(o: DayOverride): DayOverride {
  const barbers = [...new Set(o.closed.map((r) => r.barberId).filter((id): id is string => !!id))];
  return {
    ...o,
    closed: [...toRanges(closedStarts(o, null)), ...barbers.flatMap((id) => toRanges(closedStarts(o, id), id))],
  };
}

/** Abre o cierra una media hora para todo el salón o para un barbero. */
export function toggleSlot(o: DayOverride, start: number, barberId: string | null): DayOverride {
  const scoped = closedStarts(o, barberId);
  const next = scoped.includes(start) ? scoped.filter((s) => s !== start) : [...scoped, start];
  const others = o.closed.filter((r) => (barberId ? r.barberId !== barberId : !!r.barberId));
  return normalizeOverride({ ...o, closed: [...others, ...toRanges(next, barberId ?? undefined)] });
}

/** Cierra o abre todas las medias horas del día para un alcance. */
export function setAllSlots(o: DayOverride, barberId: string | null, closed: boolean): DayOverride {
  const others = o.closed.filter((r) => (barberId ? r.barberId !== barberId : !!r.barberId));
  return normalizeOverride({ ...o, closed: closed ? [...others, ...toRanges(slotStarts(o.open, o.close), barberId ?? undefined)] : others });
}
