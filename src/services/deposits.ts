import { supabase } from '../lib/supabase';
import { toDrawableImage, isSupportedImage } from '../lib/imageFile';
import { rowToBooking } from './bookings';
import type { Booking } from '../types';

// Anticipo al reservar (etapa 1): el cliente paga con el QR, sube el comprobante y el administrador
// lo verifica en Panel → Pagos.

const BUCKET = 'receipts';
const MAX_SIDE = 1600;

export type SubmitDepositResult = 'OK' | 'NOT_FOUND' | 'EXPIRED' | 'TERMS_REQUIRED' | 'CASH_DISABLED';

/** Reduce la foto del comprobante (también HEIC de iPhone) a JPEG de máximo 1600 px. */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(await toDrawableImage(file));
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85),
  );
}

/** Sube el comprobante a la carpeta de la primera cita de la reserva. Devuelve la ruta guardada. */
export async function uploadReceipt(bookingId: string, file: File): Promise<string> {
  if (!isSupportedImage(file)) throw new Error('NOT_IMAGE');
  const path = `${bookingId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, await toJpeg(file), { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** El cliente avisa que pagó (anticipo o, con full, el 100 %): las citas quedan «comprobante enviado». */
export async function submitDeposit(bookingIds: string[], payer: string, receiptPath: string, full: boolean, acceptTerms: boolean): Promise<SubmitDepositResult> {
  const { data, error } = await supabase.rpc('submit_deposit', {
    p_booking_ids: bookingIds, p_payer: payer, p_receipt_path: receiptPath, p_full: full, p_accept_terms: acceptTerms,
  });
  if (error) throw error;
  return data as SubmitDepositResult;
}

/** El cliente elige pagar el anticipo en efectivo en el salón y se compromete a cumplir la reserva. */
export async function chooseCashDeposit(bookingIds: string[], acceptTerms: boolean): Promise<SubmitDepositResult> {
  const { data, error } = await supabase.rpc('choose_cash_deposit', { p_booking_ids: bookingIds, p_accept_terms: acceptTerms });
  if (error) throw error;
  return data as SubmitDepositResult;
}

// --- Solo administradores ---------------------------------------------------

/** Citas con anticipo por revisar o recientes (últimos 30 días), de la más nueva a la más vieja. */
export async function getDepositBookings(): Promise<Booking[]> {
  // Primero se cancelan las que vencieron sin comprobante
  const { error: expireError } = await supabase.rpc('expire_unpaid_bookings');
  if (expireError) console.warn('No se pudieron cancelar las reservas vencidas', expireError);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .neq('deposit_status', 'none')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as Parameters<typeof rowToBooking>[0][]).map(rowToBooking);
}

/** Cuántas reservas tienen comprobante esperando verificación (para el aviso del menú). */
export async function countDepositsToReview(): Promise<number> {
  const { count, error } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('deposit_status', 'submitted');
  if (error) throw error;
  return count ?? 0;
}

/** Enlace temporal (10 minutos) para ver la foto del comprobante. */
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

/** «Pago recibido» (o «Recibí el efectivo») confirma las citas; «No llegó» las cancela y libera la hora. */
export async function reviewDeposit(bookingIds: string[], received: boolean): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update(
      received
        ? { deposit_status: 'verified', status: 'confirmed', deposit_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : { deposit_status: 'rejected', status: 'cancelled', deposit_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    )
    .in('id', bookingIds);
  if (error) throw error;
}
