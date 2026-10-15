import type { Booking } from '../types';
import { addDays, todayKey } from './dates';

// Cifras calculadas a partir de las citas reales (antes el panel mostraba números fijos).

export interface BarberStats {
  services: number;
  revenue: number;
}

/** Servicios completados e ingresos de un barbero en un mes ('YYYY-MM'). */
export function barberMonthStats(bookings: Booking[], barberId: string, yearMonth = todayKey().slice(0, 7)): BarberStats {
  const done = bookings.filter(
    (b) => b.barberId === barberId && b.status === 'completed' && b.date.startsWith(yearMonth),
  );
  return { services: done.length, revenue: done.reduce((sum, b) => sum + b.price, 0) };
}

/** Ingresos de servicios completados por día, de los últimos `days` días (el último es hoy). */
export function revenueByDay(bookings: Booking[], days = 30): { date: string; total: number }[] {
  const today = todayKey();
  const totals = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) totals.set(addDays(today, -i), 0);
  for (const b of bookings) {
    if (b.status === 'completed' && totals.has(b.date)) {
      totals.set(b.date, (totals.get(b.date) ?? 0) + b.price);
    }
  }
  return [...totals].map(([date, total]) => ({ date, total }));
}

/** Servicios más reservados (sin contar canceladas), de mayor a menor. */
export function popularServices(bookings: Booking[], top = 5): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    counts.set(b.serviceName, (counts.get(b.serviceName) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

// ---- Cifras para las gráficas del panel y los reportes ----

export type BookingStatus = Booking['status'];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  'no-show': 'No asistió',
};

/** Colores de cada estado, iguales a las etiquetas .status-* */
export const STATUS_COLOR: Record<BookingStatus, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  completed: '#10b981',
  cancelled: '#f43f5e',
  'no-show': '#a1a1aa',
};

export const isCompleted = (b: Booking) => b.status === 'completed';
export const revenueOf = (bookings: Booking[]) => bookings.filter(isCompleted).reduce((sum, b) => sum + b.price, 0);

/** Citas de un rango de fechas 'YYYY-MM-DD' (ambas incluidas). */
export function inRange(bookings: Booking[], from: string, to: string): Booking[] {
  return bookings.filter((b) => b.date >= from && b.date <= to);
}

/** Por día: ingresos (completadas) y número de citas (sin canceladas), para cada fecha de la lista. */
export function dailySeries(bookings: Booking[], dates: string[]): { date: string; revenue: number; bookings: number }[] {
  const map = new Map(dates.map((d) => [d, { date: d, revenue: 0, bookings: 0 }]));
  for (const b of bookings) {
    const day = map.get(b.date);
    if (!day || b.status === 'cancelled') continue;
    day.bookings += 1;
    if (b.status === 'completed') day.revenue += b.price;
  }
  return [...map.values()];
}

/** Cantidad de citas por estado (solo los estados que tienen alguna). */
export function statusBreakdown(bookings: Booking[]): { status: BookingStatus; label: string; value: number; color: string }[] {
  const counts = new Map<BookingStatus, number>();
  for (const b of bookings) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
  return (Object.keys(STATUS_LABEL) as BookingStatus[])
    .filter((s) => counts.get(s))
    .map((s) => ({ status: s, label: STATUS_LABEL[s], value: counts.get(s) ?? 0, color: STATUS_COLOR[s] }));
}

/** Suma de ingresos (completadas) agrupada por una clave, de mayor a menor. */
export function revenueBy(bookings: Booking[], key: (b: Booking) => string): { name: string; revenue: number; count: number }[] {
  const map = new Map<string, { name: string; revenue: number; count: number }>();
  for (const b of bookings) {
    if (!isCompleted(b)) continue;
    const name = key(b) || 'Sin asignar';
    const row = map.get(name) ?? { name, revenue: 0, count: 0 };
    row.revenue += b.price;
    row.count += 1;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Citas (sin canceladas) por día de la semana, de lunes a domingo. */
export function bookingsByWeekday(bookings: Booking[]): { name: string; bookings: number }[] {
  const counts = new Array(7).fill(0);
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const [y, m, d] = b.date.split('-').map(Number);
    counts[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7] += 1;
  }
  return WEEKDAYS.map((name, i) => ({ name, bookings: counts[i] }));
}

/** Citas (sin canceladas) por hora de inicio, solo de las horas que tienen alguna. */
export function bookingsByHour(bookings: Booking[]): { hour: number; name: string; bookings: number }[] {
  const counts = new Map<number, number>();
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const hour = Number(b.time.slice(0, 2));
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([hour, n]) => ({ hour, name: `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`, bookings: n }));
}

/** Variación porcentual entre dos valores; null si no hay base para comparar. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}
