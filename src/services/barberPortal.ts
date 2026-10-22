import { supabase } from '../lib/supabase';
import type { WorkHours, GalleryItem } from '../types';
import { resizeImage } from './gallery';
import { isSupportedImage } from '../lib/imageFile';
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
/** El barbero publica una foto de su trabajo en la Galería (la sube el servidor, que valida el PIN). */
export async function uploadBarberWork(barberId: string, pin: string, file: File, category: string): Promise<GalleryItem> {
  if (!isSupportedImage(file)) throw new Error('INVALID_TYPE');
  const blob = await resizeImage(file);
  const image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const response = await fetch('/api/barber-gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload', barberId, pin, image, category }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'UPLOAD_FAILED');
  return (await response.json()) as GalleryItem;
}

/** El barbero quita de la Galería una foto suya. */
export async function deleteBarberWork(barberId: string, pin: string, id: string): Promise<void> {
  const response = await fetch('/api/barber-gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', barberId, pin, id }),
  });
  if (!response.ok) throw new Error('DELETE_FAILED');
}

export type EditBookingResult = 'OK' | 'INVALID_PIN' | 'PIN_LOCKED' | 'BOOKING_NOT_FOUND' | 'INVALID_NAME' | 'INVALID_PHONE' | 'INVALID_SERVICE' | 'INVALID_DATE' | 'INVALID_TIME' | 'SLOT_TAKEN';

/** El barbero cambia una cita suya (cliente, servicio, día u hora). */
export async function barberEditBooking(
  barberId: string,
  pin: string,
  bookingId: string,
  patch: { clientName: string; clientPhone: string; serviceId: string; date: string; time: string },
): Promise<EditBookingResult> {
  const { data, error } = await supabase.rpc('barber_edit_booking', {
    p_barber_id: barberId, p_pin: pin, p_booking_id: bookingId,
    p_client_name: patch.clientName, p_client_phone: patch.clientPhone, p_service_id: patch.serviceId, p_date: patch.date, p_time: patch.time,
  });
  if (error) throw error;
  return data as EditBookingResult;
}

/** El barbero elimina una cita suya. */
export async function barberDeleteBooking(barberId: string, pin: string, bookingId: string): Promise<'OK' | 'INVALID_PIN' | 'PIN_LOCKED' | 'BOOKING_NOT_FOUND'> {
  const { data, error } = await supabase.rpc('barber_delete_booking', { p_barber_id: barberId, p_pin: pin, p_booking_id: bookingId });
  if (error) throw error;
  return data;
}

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
