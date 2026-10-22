import { supabase } from '../lib/supabase';
import type { WorkHours } from '../types';
import { rowToBooking } from './bookings';
import type { Booking } from '../types';

// Portal del barbero: el PIN se valida en el servidor en cada llamada.
// Tras 5 intentos fallidos el barbero queda bloqueado 15 minutos.

export type BarberAuthResult = 'OK' | 'INVALID_PIN' | 'PIN_LOCKED';

export class BarberPortalError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'BarberPortalError';
  }
}

export async function barberLogin(barberId: string, pin: string): Promise<BarberAuthResult> {
  const { data, error } = await supabase.rpc('barber_login', { p_barber_id: barberId, p_pin: pin });
  if (error) throw error;
  return data as BarberAuthResult;
}

export async function getBarberBookings(barberId: string, pin: string): Promise<Booking[]> {
  const { data, error } = await supabase.rpc('barber_get_bookings', { p_barber_id: barberId, p_pin: pin });
  if (error) throw error;
  const result = data as { error?: string; bookings?: Parameters<typeof rowToBooking>[0][] };
  if (result.error) throw new BarberPortalError(result.error);
  return (result.bookings ?? []).map(rowToBooking);
}

export async function setBarberBookingStatus(
  barberId: string,
  pin: string,
  bookingId: string,
  status: Booking['status'],
): Promise<void> {
  const { data, error } = await supabase.rpc('barber_set_status', {
    p_barber_id: barberId,
    p_pin: pin,
    p_booking_id: bookingId,
    p_status: status,
  });
  if (error) throw error;
  if (data !== 'OK') throw new BarberPortalError(data as string);
}

export type ChangePinResult = BarberAuthResult | 'INVALID_NEW_PIN';

/** El barbero cambia su PIN (pide el actual; cuenta como intento de ingreso si es incorrecto). */
export async function changeBarberPin(barberId: string, currentPin: string, newPin: string): Promise<ChangePinResult> {
  const { data, error } = await supabase.rpc('barber_change_pin', {
    p_barber_id: barberId,
    p_current_pin: currentPin,
    p_new_pin: newPin,
  });
  if (error) throw error;
  return data as ChangePinResult;
}

export type DayClosuresResult = BarberAuthResult | 'INVALID_DATE' | 'DAY_CLOSED' | 'INVALID_RANGES';

/**
 * El barbero cierra sus propias horas de un día (reemplaza las que tenía cerradas ese día).
 * No toca lo cerrado para todo el salón ni a los demás barberos. `ranges` vacío = abre todas sus horas.
 */
export type AddClientResult = 'OK' | 'INVALID_PIN' | 'PIN_LOCKED' | 'INVALID_NAME' | 'INVALID_PHONE' | 'INVALID_LINES' | 'INVALID_DATE' | 'SLOT_TAKEN';

/** El barbero registra un cliente (atendido ahora o cita agendada), siempre a su nombre. */
export async function barberAddClient(
  barberId: string,
  pin: string,
  input: { clientName: string; clientPhone: string; date: string | null; schedule: boolean; lines: { serviceId: string; time: string }[] },
): Promise<AddClientResult> {
  const { data, error } = await supabase.rpc('barber_add_client', {
    p_barber_id: barberId,
    p_pin: pin,
    p_client_name: input.clientName,
    p_client_phone: input.clientPhone,
    p_date: input.date,
    p_lines: input.lines,
    p_schedule: input.schedule,
  });
  if (error) throw error;
  return data as AddClientResult;
}

export type WorkHoursResult = 'OK' | 'INVALID_PIN' | 'PIN_LOCKED' | 'INVALID_HOURS';

/** El barbero cambia su propio horario de trabajo (mismo formato que en Panel → Barberos). */
export async function setBarberWorkHours(barberId: string, pin: string, hours: WorkHours): Promise<WorkHoursResult> {
  const { data, error } = await supabase.rpc('barber_set_work_hours', { p_barber_id: barberId, p_pin: pin, p_hours: hours });
  if (error) throw error;
  return data as WorkHoursResult;
}

export async function setBarberDayClosures(
  barberId: string,
  pin: string,
  date: string,
  ranges: { start: string; end: string }[],
): Promise<DayClosuresResult> {
  const { data, error } = await supabase.rpc('barber_set_day_closures', {
    p_barber_id: barberId,
    p_pin: pin,
    p_date: date,
    p_ranges: ranges,
  });
  if (error) throw error;
  return data as DayClosuresResult;
}
