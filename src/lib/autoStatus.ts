import { todayKey, nowMinutes, timeToMinutes } from './dates';
import { getCachedServiceDuration } from '../services/services';
import { supabase } from './supabase';
import type { Booking } from '../types';

/**
 * Calcula el estado automático según la hora y fecha en Colombia:
 * - 'cancelled' y 'no-show' nunca se modifican automáticamente.
 * - Si la fecha ya pasó, o si es hoy y ya terminó la duración del servicio: 'completed'.
 * - Si es hoy y ya llegó la hora de inicio (pero aún no ha terminado): 'confirmed'.
 * - Si la cita es en el futuro (hoy más tarde o un día posterior): 'pending'.
 */
export function getAutoStatus(
  date: string,
  time: string,
  currentStatus: Booking['status'],
  durationMinutes = 30,
): Booking['status'] {
  if (currentStatus === 'cancelled' || currentStatus === 'no-show') {
    return currentStatus;
  }

  const today = todayKey();
  const dur = Math.max(15, durationMinutes);
  const startMin = timeToMinutes(time);
  const endMin = startMin + dur;

  if (date < today) {
    return 'completed';
  }

  if (date === today) {
    const now = nowMinutes();
    if (now >= endMin) {
      return 'completed';
    }
    if (now >= startMin) {
      return 'confirmed';
    }
  }

  return 'pending';
}

/** Devuelve la reserva con su estado corregido automáticamente si corresponde. */
export function applyAutoStatus(booking: Booking): Booking {
  const dur = getCachedServiceDuration(booking.serviceId);
  const nextStatus = getAutoStatus(booking.date, booking.time, booking.status, dur);
  if (nextStatus === booking.status) return booking;
  return { ...booking, status: nextStatus };
}

/**
 * Revisa una lista de reservas y sincroniza en Supabase las que requieran cambio de estado.
 * Se ejecuta en segundo plano sin bloquear la interfaz.
 */
export async function syncAutoStatusToDb(bookings: Booking[]): Promise<void> {
  const toComplete: string[] = [];
  const toConfirm: string[] = [];

  for (const b of bookings) {
    const dur = getCachedServiceDuration(b.serviceId);
    const auto = getAutoStatus(b.date, b.time, b.status, dur);
    if (auto !== b.status) {
      if (auto === 'completed') toComplete.push(b.id);
      else if (auto === 'confirmed') toConfirm.push(b.id);
    }
  }

  try {
    if (toComplete.length > 0) {
      await supabase
        .from('bookings')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .in('id', toComplete);
    }
    if (toConfirm.length > 0) {
      await supabase
        .from('bookings')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .in('id', toConfirm);
    }
  } catch (err) {
    console.warn('No se pudieron sincronizar los estados automáticos en la base', err);
  }
}

