import { supabase } from '../lib/supabase';
import { toDrawableImage, isSupportedImage } from '../lib/imageFile';
import type { Barber } from '../types';

interface BarberRow {
  id: string;
  name: string;
  short_name: string;
  role: Barber['role'] | null;
  phone: string;
  bio: string;
  specialties: string[];
  rating: number;
  review_count: number;
  available: boolean;
  commission: number;
  total_services_month: number;
  earnings_month: number;
  avatar: string;
  photo_url: string;
  work_hours?: Barber['workHours'] | null;
  is_owner?: boolean | null;
}

function rowToBarber(row: BarberRow): Barber {
  const isWalter =
    (row.short_name?.toLowerCase().trim() === 'walter') ||
    (row.name?.toLowerCase().includes('walter'));
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    role: row.role === 'manicurista' ? 'manicurista' : 'barbero',
    phone: row.phone,
    bio: row.bio,
    specialties: row.specialties,
    rating: row.rating,
    reviewCount: row.review_count,
    available: row.available,
    commission: row.commission,
    totalServicesMonth: row.total_services_month,
    earningsMonth: row.earnings_month,
    avatar: row.avatar,
    photoUrl: row.photo_url ?? '',
    workHours: row.work_hours ?? {},
    isOwner: row.is_owner !== undefined && row.is_owner !== null ? Boolean(row.is_owner) : isWalter,
  };
}

// Columnas que se pueden leer desde la web. El PIN no está: solo se valida en el servidor.
const BARBER_COLUMNS =
  'id, name, short_name, role, phone, bio, specialties, rating, review_count, available, commission, total_services_month, earnings_month, avatar, photo_url, work_hours';

export async function getBarbers(): Promise<Barber[]> {
  // 1. Intentar con is_owner y todas las columnas extendidas
  try {
    const { data, error } = await supabase
      .from('barbers')
      .select(`${BARBER_COLUMNS}, is_owner`)
      .order('name');
    if (!error && data && data.length > 0) {
      return (data as BarberRow[]).map(rowToBarber);
    }
  } catch {
    // Continuar a fallback
  }

  // 2. Fallback sin is_owner (rowToBarber detecta a Walter por nombre automáticamente)
  try {
    const { data, error } = await supabase
      .from('barbers')
      .select(BARBER_COLUMNS)
      .order('name');
    if (!error && data && data.length > 0) {
      return (data as BarberRow[]).map(rowToBarber);
    }
  } catch {
    // Continuar a fallback mínimo
  }

  // 3. Fallback mínimo asegurado con solo las columnas esenciales
  const minimalCols = 'id, name, short_name, role, phone, bio, specialties, rating, review_count, available, commission, total_services_month, earnings_month, avatar';
  const { data, error } = await supabase
    .from('barbers')
    .select(minimalCols)
    .order('name');
  if (error) throw error;
  return (data as BarberRow[]).map(rowToBarber);
}

export async function updateBarberAvailability(id: string, available: boolean): Promise<void> {
  const { error } = await supabase
    .from('barbers')
    .update({ available, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function createBarber(barber: Omit<Barber, 'id' | 'reviewCount' | 'totalServicesMonth' | 'earningsMonth' | 'photoUrl'>): Promise<Barber> {
  const isWalter = barber.shortName.toLowerCase().includes('walter') || barber.name.toLowerCase().includes('walter');
  const isOwner = barber.isOwner ?? isWalter;
  const insertData: Record<string, unknown> = {
    name: barber.name,
    short_name: barber.shortName,
    role: barber.role,
    phone: barber.phone,
    bio: barber.bio,
    specialties: barber.specialties,
    rating: barber.rating,
    review_count: 0,
    available: barber.available,
    pin: barber.pin,
    commission: barber.commission,
    total_services_month: 0,
    earnings_month: 0,
    avatar: barber.avatar,
    work_hours: barber.workHours ?? {},
    is_owner: isOwner,
  };

  const { data, error } = await supabase
    .from('barbers')
    .insert(insertData)
    .select(BARBER_COLUMNS)
    .single();

  if (error) {
    if (error.message?.includes('is_owner') || error.code === '42703' || error.code === '42501' || error.message?.toLowerCase().includes('permission')) {
      delete insertData.is_owner;
      const retry = await supabase.from('barbers').insert(insertData).select(BARBER_COLUMNS).single();
      if (retry.error) throw retry.error;
      return rowToBarber(retry.data as BarberRow);
    }
    throw error;
  }
  return rowToBarber(data as BarberRow);
}

export async function updateBarber(id: string, updates: Partial<Barber>): Promise<void> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.shortName !== undefined) dbUpdates.short_name = updates.shortName;
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
  if (updates.specialties !== undefined) dbUpdates.specialties = updates.specialties;
  if (updates.available !== undefined) dbUpdates.available = updates.available;
  if (updates.pin !== undefined) dbUpdates.pin = updates.pin;
  if (updates.commission !== undefined) dbUpdates.commission = updates.commission;
  if (updates.workHours !== undefined) dbUpdates.work_hours = updates.workHours;
  if (updates.isOwner !== undefined) dbUpdates.is_owner = updates.isOwner;

  const { error } = await supabase
    .from('barbers')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    if (error.message?.includes('is_owner') || error.code === '42703' || error.code === '42501' || error.message?.toLowerCase().includes('permission')) {
      delete dbUpdates.is_owner;
      const retry = await supabase.from('barbers').update(dbUpdates).eq('id', id);
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  }
}

export async function deleteBarber(id: string): Promise<void> {
  const { error } = await supabase
    .from('barbers')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Foto de perfil (bucket de Storage "barber-photos")
// ---------------------------------------------------------------------------

const PHOTO_BUCKET = 'barber-photos';
const PHOTO_MAX_SIZE = 600;

/** Reduce la foto a máximo 600 px por lado y la convierte a JPEG, para que cargue rápido. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(await toDrawableImage(file));
  const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85),
  );
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

/** Sube la foto, la guarda en el barbero y borra la anterior. Devuelve la URL nueva. */
export async function uploadBarberPhoto(barber: Pick<Barber, 'id' | 'photoUrl'>, file: File): Promise<string> {
  if (!isSupportedImage(file)) throw new Error('El archivo no es una imagen');
  const image = await resizeImage(file);
  const path = `${barber.id}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, image, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const { error } = await supabase
    .from('barbers')
    .update({ photo_url: data.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', barber.id);
  if (error) throw error;

  const oldPath = barber.photoUrl ? storagePathFromUrl(barber.photoUrl) : null;
  if (oldPath) {
    const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
    if (removeError) console.warn('No se pudo borrar la foto anterior', removeError);
  }
  return data.publicUrl;
}

/** Elimina al barbero y su foto. Sus citas se conservan con el nombre del barbero. */
export async function deleteBarberWithPhoto(barber: Pick<Barber, 'id' | 'photoUrl'>): Promise<void> {
  await deleteBarber(barber.id);
  const path = barber.photoUrl ? storagePathFromUrl(barber.photoUrl) : null;
  if (path) {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (error) console.warn('No se pudo borrar la foto del barbero', error);
  }
}
