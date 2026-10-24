import { supabase } from '../lib/supabase';

// «Mis citas»: el cliente consulta sus citas con su celular y su primer nombre,
// califica servicios atendidos, cancela o reagenda citas cuando no puede asistir.

export interface ClientBooking {
  id: string;
  date: string;
  time: string;
  service: string;
  serviceId?: string;
  duration?: number;
  barber: string;
  barberId?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  price: number;
  deposit: number;
  depositStatus: string;
  /** Estrellas que le dio el cliente (1 a 5), si ya la calificó */
  rating: number | null;
  comment: string | null;
}

export type RateResult = 'OK' | 'INVALID' | 'TOO_MANY' | 'NOT_FOUND' | 'NOT_COMPLETED';

/** Califica con estrellas una cita atendida (se puede cambiar después). */
export async function rateBooking(phone: string, name: string, bookingId: string, rating: number, comment: string): Promise<RateResult> {
  const { data, error } = await supabase.rpc('rate_booking', { p_phone: phone, p_name: name, p_booking_id: bookingId, p_rating: rating, p_comment: comment });
  if (error) throw error;
  return data as RateResult;
}

/** Cancela una cita desde «Mis citas» cuando el cliente no puede asistir. Devuelve 'OK' o el motivo. */
export async function cancelClientBooking(phone: string, name: string, bookingId: string): Promise<string> {
  const { data, error } = await supabase.rpc('client_cancel_booking', { p_phone: phone, p_name: name, p_booking_id: bookingId });
  if (error) throw error;
  return (data as string) || 'OK';
}

/** Reagenda una cita a nueva fecha y hora desde «Mis citas». Devuelve 'OK' o el motivo. */
export async function rescheduleClientBooking(
  phone: string,
  name: string,
  bookingId: string,
  newDate: string,
  newTime: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('client_reschedule_booking', {
    p_phone: phone,
    p_name: name,
    p_booking_id: bookingId,
    p_new_date: newDate,
    p_new_time: newTime,
  });
  if (error) throw error;
  return (data as string) || 'OK';
}

/** Por qué no se pudo cancelar o reagendar, en palabras para el cliente */
export const CLIENT_CHANGE_ERRORS: Record<string, string> = {
  SLOT_TAKEN: 'Esa hora ya se ocupó. Escoge otra.',
  INVALID_TIME: 'Esa hora no está disponible con tu barbero. Escoge otra.',
  LUNCH_BREAK: 'A esa hora tu barbero está en almuerzo. Escoge otra.',
  CLOSED_DAY: 'Ese día no atendemos. Escoge otro día.',
  PAST_DATE: 'Esa hora ya pasó. Escoge otra.',
  TOO_FAR: 'Ese día está muy lejos todavía. Escoge una fecha más cercana.',
  ALREADY_PROCESSED: 'Esta cita ya fue atendida o cancelada.',
  CLIENT_BLOCKED: 'No es posible reagendar desde la web. Comunícate con el salón por WhatsApp.',
  NOT_FOUND: 'No encontramos esta cita.',
  UNAUTHORIZED: 'Los datos no coinciden con la cita.',
};

export type ClientLookup =
  | { status: 'OK'; name: string; bookings: ClientBooking[] }
  | { status: 'NOT_FOUND' | 'TOO_MANY' | 'INVALID' };

export async function findClientBookings(phone: string, name: string): Promise<ClientLookup> {
  const { data, error } = await supabase.rpc('client_bookings', { p_phone: phone, p_name: name });
  if (error) throw error;
  return data as ClientLookup;
}
