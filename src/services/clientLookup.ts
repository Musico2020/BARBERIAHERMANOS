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

/** Cancela una cita desde «Mis citas» cuando el cliente no puede asistir. */
export async function cancelClientBooking(phone: string, name: string, bookingId: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('client_cancel_booking', {
      p_phone: phone,
      p_name: name,
      p_booking_id: bookingId,
    });
    if (error) throw error;
    return (data as string) || 'OK';
  } catch (err: unknown) {
    // Si la función RPC aún no fue ejecutada en Supabase, intentamos fallback directo
    console.warn('RPC client_cancel_booking falló, intentando fallback', err);
    const { error: directError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    if (!directError) return 'OK';
    throw err;
  }
}

/** Reagenda una cita a nueva fecha y hora desde «Mis citas». */
export async function rescheduleClientBooking(
  phone: string,
  name: string,
  bookingId: string,
  newDate: string,
  newTime: string,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('client_reschedule_booking', {
      p_phone: phone,
      p_name: name,
      p_booking_id: bookingId,
      p_new_date: newDate,
      p_new_time: newTime,
    });
    if (error) throw error;
    return (data as string) || 'OK';
  } catch (err: unknown) {
    // Si la función RPC aún no fue ejecutada en Supabase, intentamos fallback directo
    console.warn('RPC client_reschedule_booking falló, intentando fallback', err);
    const { error: directError } = await supabase
      .from('bookings')
      .update({
        date: newDate,
        time: newTime,
        status: 'pending',
        original_time: null,
        shifted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);
    if (!directError) return 'OK';
    throw err;
  }
}

export type ClientLookup =
  | { status: 'OK'; name: string; bookings: ClientBooking[] }
  | { status: 'NOT_FOUND' | 'TOO_MANY' | 'INVALID' };

export async function findClientBookings(phone: string, name: string): Promise<ClientLookup> {
  const { data, error } = await supabase.rpc('client_bookings', { p_phone: phone, p_name: name });
  if (error) throw error;
  return data as ClientLookup;
}
