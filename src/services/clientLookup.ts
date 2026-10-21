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
}

export type ClientLookup =
  | { status: 'OK'; name: string; bookings: ClientBooking[] }
  | { status: 'NOT_FOUND' | 'TOO_MANY' | 'INVALID' };

export async function findClientBookings(phone: string, name: string): Promise<ClientLookup> {
  const { data, error } = await supabase.rpc('client_bookings', { p_phone: phone, p_name: name });
  if (error) throw error;
  return data as ClientLookup;
}
