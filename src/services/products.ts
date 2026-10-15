import { supabase } from '../lib/supabase';
import { toDrawableImage, isSupportedImage } from '../lib/imageFile';
import type { Product } from '../types';

const COLUMNS = 'id, name, brand, price, description, image, category, active';
const PHOTO_BUCKET = 'products';
const PHOTO_MAX_SIZE = 900;

/** Productos de la Shop. El público solo recibe los activos; el administrador recibe todos. */
export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select(COLUMNS).order('created_at', { ascending: true });
  if (error) throw error;
  return data as Product[];
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product> {
  const id = `p-${Date.now()}`;
  const { data, error } = await supabase.from('products').insert({ ...product, id }).select(COLUMNS).single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: string, updates: Partial<Omit<Product, 'id'>>): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

export async function deleteProduct(product: Pick<Product, 'id' | 'image'>): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', product.id);
  if (error) throw error;
  const path = storagePathFromUrl(product.image);
  if (path) {
    const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (removeError) console.warn('No se pudo borrar la foto del producto', removeError);
  }
}

/** Reduce la foto a máximo 900 px por lado (JPEG) para que la Shop cargue rápido. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(await toDrawableImage(file));
  const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // fondo blanco para fotos PNG con transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.88),
  );
}

/** Sube la foto y devuelve su URL pública. Si se reemplaza una foto anterior del bucket, la borra. */
export async function uploadProductImage(file: File, previousUrl = ''): Promise<string> {
  if (!isSupportedImage(file)) throw new Error('El archivo no es una imagen');
  const path = `product-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, await resizeImage(file), { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const oldPath = previousUrl ? storagePathFromUrl(previousUrl) : null;
  if (oldPath) {
    const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
    if (removeError) console.warn('No se pudo borrar la foto anterior', removeError);
  }
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
