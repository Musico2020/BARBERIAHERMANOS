import { supabase } from '../lib/supabase';

// «Mis citas»: el cliente consulta sus citas con su celular y su primer nombre (solo lectura).

export interface ClientBooking {
  id: string;
  date: string;
  time: string;
  service: string;
  barber: string;
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

export type ClientLookup =
  | { status: 'OK'; name: string; bookings: ClientBooking[] }
  | { status: 'NOT_FOUND' | 'TOO_MANY' | 'INVALID' };

export async function findClientBookings(phone: string, name: string): Promise<ClientLookup> {
  const { data, error } = await supabase.rpc('client_bookings', { p_phone: phone, p_name: name });
  if (error) throw error;
  return data as ClientLookup;
}
