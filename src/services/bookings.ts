import { supabase } from '../lib/supabase';
import type { Booking } from '../types';

interface BookingRow {
  id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  service_id: string;
  service_name: string;
  barber_id: string | null;
  barber_name: string;
  date: string;
  time: string;
  price: number;
  status: string;
  created_at: string;
  original_time?: string | null;
  shifted_at?: string | null;
}

export function rowToBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    serviceId: row.service_id,
    serviceName: row.service_name,
    barberId: row.barber_id ?? '',
    barberName: row.barber_name,
    date: row.date,
    time: row.time,
    price: row.price,
    status: row.status as Booking['status'],
    createdAt: row.created_at,
    originalTime: row.original_time ?? undefined,
    shiftedAt: row.shifted_at ?? undefined,
  };
}

// Supabase devuelve como máximo 1000 filas por consulta; se piden por páginas.
const PAGE_SIZE = 1000;

async function fetchAllPages(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Booking[]> {
  const rows: BookingRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data as BookingRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.map(rowToBooking);
}

export async function getBookings(): Promise<Booking[]> {
  return fetchAllPages((from, to) =>
    supabase
      .from('bookings')
      .select('*')
      .order('date', { ascending: false })
      .order('time', { ascending: true })
      .order('id')
      .range(from, to),
  );
}

export async function getBookingsByDate(date: string): Promise<Booking[]> {
  return getBookingsInRange(date, date);
}

export async function getBookingsInRange(start: string, end: string): Promise<Booking[]> {
  return fetchAllPages((from, to) =>
    supabase
      .from('bookings')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .order('id')
      .range(from, to),
  );
}

export async function updateBookingStatus(id: string, status: Booking['status']): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getBookingsByMonth(year: number, month: number): Promise<Booking[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return getBookingsInRange(start, end);
}

export async function getBookingsByYear(year: number): Promise<Booking[]> {
  return getBookingsInRange(`${year}-01-01`, `${year}-12-31`);
}

// ---------------------------------------------------------------------------
// Reserva pública
// ---------------------------------------------------------------------------

export interface BusySlot {
  barberId: string;
  startTime: string;
  duration: number;
}

/** Horas ocupadas de un día (sin datos de clientes). Sin barberId devuelve las de todos. */
export async function getBusySlots(date: string, barberId?: string): Promise<BusySlot[]> {
  const { data, error } = await supabase.rpc('get_busy_slots', {
    p_date: date,
    p_barber_id: barberId || null,
  });
  if (error) throw error;
  return (data as { barber_id: string; start_time: string; duration: number }[]).map((row) => ({
    barberId: row.barber_id,
    startTime: row.start_time,
    duration: row.duration,
  }));
}

export type BookingErrorCode =
  | 'SLOT_TAKEN'
  | 'NO_BARBER_AVAILABLE'
  | 'INVALID_NAME'
  | 'INVALID_PHONE'
  | 'INVALID_TIME'
  | 'PAST_DATE'
  | 'SERVICE_NOT_FOUND'
  | 'CLOSED_DAY'
  | 'BARBER_REQUIRED'
  | 'WRONG_PROFESSIONAL'
  | 'LUNCH_BREAK'
  | 'UNKNOWN';

const KNOWN_CODES: BookingErrorCode[] = [
  'SLOT_TAKEN', 'NO_BARBER_AVAILABLE', 'INVALID_NAME', 'INVALID_PHONE', 'INVALID_TIME', 'PAST_DATE', 'SERVICE_NOT_FOUND', 'CLOSED_DAY', 'BARBER_REQUIRED', 'WRONG_PROFESSIONAL', 'LUNCH_BREAK',
];

export class BookingError extends Error {
  constructor(public code: BookingErrorCode, public cause?: unknown) {
    super(code);
    this.name = 'BookingError';
  }
}

export interface NewBooking {
  serviceId: string;
  /** Vacío = sin preferencia: el servidor asigna un barbero libre. */
  barberId: string;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}

export interface CreatedBooking {
  bookingId: string;
  barberId: string;
  barberName: string;
  barberShortName: string;
}

export async function createBooking(booking: NewBooking): Promise<CreatedBooking> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_service_id: booking.serviceId,
    p_barber_id: booking.barberId || null,
    p_date: booking.date,
    p_time: booking.time,
    p_client_name: booking.clientName,
    p_client_phone: booking.clientPhone,
    p_client_email: booking.clientEmail ?? '',
  });
  if (error) {
    const code = KNOWN_CODES.find((c) => error.message === c) ?? 'UNKNOWN';
    throw new BookingError(code, error);
  }
  const result = data as { booking_id: string; barber_id: string; barber_name: string; barber_short_name: string };
  return {
    bookingId: result.booking_id,
    barberId: result.barber_id,
    barberName: result.barber_name,
    barberShortName: result.barber_short_name,
  };
}

// ---------------------------------------------------------------------------
// Registro manual desde el panel (clientes atendidos en la barbería o fuera del horario)
// ---------------------------------------------------------------------------

export interface ManualBookingLine {
  serviceId: string;
  serviceName: string;
  time: string;
  price: number;
}

/**
 * Guarda de una vez (todo o nada) los servicios de un cliente registrado por el administrador.
 * No pasa por las reglas de la reserva web: sirve a cualquier hora. Si ya se atendió, no se
 * envía WhatsApp de confirmación (se marca como avisada).
 */
export async function createManualBookings(input: {
  clientName: string;
  clientPhone: string;
  barberId: string;
  barberName: string;
  date: string;
  status: Booking['status'];
  lines: ManualBookingLine[];
}): Promise<void> {
  const skipWhatsApp = input.status === 'completed' || input.status === 'cancelled';
  const rows = input.lines.map((line) => ({
    client_name: input.clientName.trim(),
    client_phone: input.clientPhone.trim(),
    client_email: '',
    service_id: line.serviceId,
    service_name: line.serviceName,
    barber_id: input.barberId,
    barber_name: input.barberName,
    date: input.date,
    time: line.time,
    price: line.price,
    status: input.status,
    ...(skipWhatsApp ? { whatsapp_sent_at: new Date().toISOString() } : {}),
  }));
  const { error } = await supabase.from('bookings').insert(rows);
  if (error) throw error;
}

/** Reservas creadas desde `sinceIso` (fecha y hora ISO), de la más nueva a la más vieja. Solo administradores. */
export async function getRecentlyCreatedBookings(sinceIso: string, limit = 30): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as BookingRow[]).map(rowToBooking);
}
