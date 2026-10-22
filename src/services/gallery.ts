import { supabase } from '../lib/supabase';
import { toDrawableImage, isSupportedImage } from '../lib/imageFile';
import type { GalleryItem } from '../types';

// Fotos de la galería (/galeria). Se suben desde Panel → Galería al almacenamiento 'gallery'.

const BUCKET = 'gallery';
const MAX_SIDE = 1600;

export const GALLERY_CATEGORIES = ['Cortes', 'Degradado', 'Barba', 'Cejas', 'Niños', 'Damas', 'Keratina', 'El salón'];

export async function getGallery(): Promise<GalleryItem[]> {
  const { data, error } = await supabase
    .from('gallery')
    .select('id, url, category, alt, barber_id')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    // Si la columna barber_id aún no existe en la base de datos, reintenta sin ella para no romper la galería
    if (error.message?.includes('barber_id') || error.code === '42703') {
      const fallback = await supabase
        .from('gallery')
        .select('id, url, category, alt')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      return (fallback.data as GalleryItem[]).map((item) => ({ ...item, barberId: null }));
    }
    throw error;
  }
  return (data as (Omit<GalleryItem, 'barberId'> & { barber_id: string | null })[]).map(({ barber_id, ...rest }) => ({ ...rest, barberId: barber_id }));
}

/**
 * Bordes negros que trae la foto (WhatsApp a veces la guarda con franjas negras arriba y abajo).
 * Devuelve el recuadro sin esas franjas; si no hay, el recuadro completo.
 */
function contentBox(source: ImageBitmap): { x: number; y: number; w: number; h: number } {
  const w = source.width;
  const h = source.height;
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext('2d', { willReadFrequently: true })!;
  pctx.drawImage(source, 0, 0);
  const { data } = pctx.getImageData(0, 0, w, h);
  const dark = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return data[i] < 22 && data[i + 1] < 22 && data[i + 2] < 22;
  };
  // Una fila (o columna) es borde si casi todos sus puntos son negros
  const rowIsBorder = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x += 8) if (dark(x, y)) n++;
    return n >= Math.ceil(w / 8) * 0.97;
  };
  const colIsBorder = (x: number) => {
    let n = 0;
    for (let y = 0; y < h; y += 8) if (dark(x, y)) n++;
    return n >= Math.ceil(h / 8) * 0.97;
  };
  let top = 0;
  while (top < h * 0.4 && rowIsBorder(top)) top++;
  let bottom = h - 1;
  while (bottom > h * 0.6 && rowIsBorder(bottom)) bottom--;
  let left = 0;
  while (left < w * 0.4 && colIsBorder(left)) left++;
  let right = w - 1;
  while (right > w * 0.6 && colIsBorder(right)) right--;
  // Solo se recorta si las franjas son claras (más del 2 %), para no comerse fotos oscuras
  const cropY = top + (h - 1 - bottom) > h * 0.02;
  const cropX = left + (w - 1 - right) > w * 0.02;
  return {
    x: cropX ? left : 0,
    y: cropY ? top : 0,
    w: cropX ? right - left + 1 : w,
    h: cropY ? bottom - top + 1 : h,
  };
}

/** Quita franjas negras y reduce la foto a máximo 1600 px por lado (JPEG) para que cargue rápido. */
export async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(await toDrawableImage(file));
  const box = contentBox(bitmap);
  const scale = Math.min(1, MAX_SIDE / Math.max(box.w, box.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.w * scale);
  canvas.height = Math.round(box.h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85),
  );
}

export async function uploadGalleryPhoto(file: File, category: string, alt: string): Promise<GalleryItem> {
  if (!isSupportedImage(file)) throw new Error('INVALID_TYPE');
  const image = await resizeImage(file);
  const id = `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `${id}.jpg`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, image, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const item: GalleryItem = { id, url: data.publicUrl, category, alt: alt || `Trabajo de ${category.toLowerCase()} en Salón Hermanos` };
  const { error } = await supabase.from('gallery').insert(item);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return item;
}

export async function updateGalleryItem(id: string, updates: Partial<Pick<GalleryItem, 'category' | 'alt' | 'barberId'>>): Promise<void> {
  const { barberId, ...rest } = updates;
  const { error } = await supabase.from('gallery').update(barberId === undefined ? rest : { ...rest, barber_id: barberId }).eq('id', id);
  if (error) throw error;
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

export async function deleteGalleryItem(item: Pick<GalleryItem, 'id' | 'url'>): Promise<void> {
  const { error } = await supabase.from('gallery').delete().eq('id', item.id);
  if (error) throw error;
  const path = storagePathFromUrl(item.url);
  if (path) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
    if (removeError) console.warn('No se pudo borrar la foto de la galería', removeError);
  }
}
