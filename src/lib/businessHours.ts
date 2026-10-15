import { businessConfig } from '../config/business';
import { todayKey, nowMinutes, timeToMinutes, addDays } from './dates';
import { holidayName } from './holidays';
import type { BusinessHours, SpecialDay } from '../types';

// Horario de atención según src/config/business.ts (hours va de lunes a domingo).
// Los festivos de Colombia se detectan solos y usan businessConfig.holidayHours.

function weekday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
}

/** Horario que aplica ese día: el del festivo si lo es, si no el del día de la semana. */
function entryFor(dateKey: string): BusinessHours | undefined {
  if (holidayName(dateKey)) return businessConfig.holidayHours;
  return businessConfig.hours[(weekday(dateKey) + 6) % 7];
}

/** Fecha especial configurada en businessConfig.specialDays (cerrado u orden de llegada), si la hay. */
export function specialDayOf(dateKey: string): SpecialDay['type'] | null {
  return businessConfig.specialDays.find((d) => d.date === dateKey)?.type ?? null;
}

/** Desde qué día se anuncia un día especial en la página principal (por defecto, el día anterior). */
export function noticeStart(d: SpecialDay): string {
  return d.noticeFrom ?? addDays(d.date, -1);
}

/** Apertura y cierre (en minutos) de ese día, o null si la barbería está cerrada. */
export function hoursFor(dateKey: string): { open: number; close: number; openLabel: string; closeLabel: string } | null {
  if (specialDayOf(dateKey) === 'closed') return null;
  const entry = entryFor(dateKey);
  if (!entry || entry.closed || !entry.open || !entry.close) return null;
  return { open: timeToMinutes(entry.open), close: timeToMinutes(entry.close), openLabel: entry.open, closeLabel: entry.close };
}

/**
 * Almuerzo de ese día en minutos, o null si no aplica: está apagado, es domingo o festivo
 * (se atiende de corrido) o la barbería no abre ese día.
 */
export function lunchFor(dateKey: string): { start: number; end: number; startLabel: string; endLabel: string } | null {
  const { enabled, start, end } = businessConfig.lunch;
  if (!enabled || weekday(dateKey) === 0 || holidayName(dateKey) || !hoursFor(dateKey)) return null;
  return { start: timeToMinutes(start), end: timeToMinutes(end), startLabel: start, endLabel: end };
}

/** Horario en que se puede reservar por la web: null si está cerrado o se atiende por orden de llegada. */
export function bookingHoursFor(dateKey: string): ReturnType<typeof hoursFor> {
  return specialDayOf(dateKey) === 'walk-in' ? null : hoursFor(dateKey);
}

function formatHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'p. m.' : 'a. m.';
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`;
}

/** Estado en vivo para mostrar "Abierto ahora" / "Cerrado", con la hora de Colombia. */
export function openStatus(): { open: boolean; label: string } {
  const todayK = todayKey();
  const today = hoursFor(todayK);
  const now = nowMinutes();
  const holiday = holidayName(todayK);
  if (today && now >= today.open && now < today.close) {
    const lunch = lunchFor(todayK);
    if (lunch && now >= lunch.start && now < lunch.end) {
      return { open: false, label: `En almuerzo · volvemos a las ${formatHour(lunch.endLabel)}` };
    }
    const note = specialDayOf(todayK) === 'walk-in' ? ' · por orden de llegada' : holiday ? ' (festivo)' : '';
    return { open: true, label: `Abierto ahora${note} · cierra a las ${formatHour(today.closeLabel)}` };
  }
  // Buscar la próxima apertura
  const [y, m, d] = todayK.split('-').map(Number);
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    const key = date.toISOString().slice(0, 10);
    const hours = hoursFor(key);
    if (!hours || (i === 0 && now >= hours.open)) continue;
    const dayName = businessConfig.hours[(date.getUTCDay() + 6) % 7].day.toLowerCase();
    const when = i === 0 ? 'hoy' : i === 1 ? 'mañana' : `el ${dayName}`;
    return { open: false, label: `Cerrado · abre ${when} a las ${formatHour(hours.openLabel)}` };
  }
  return { open: false, label: 'Cerrado' };
}
