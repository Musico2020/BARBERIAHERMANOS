// Fotos que llegan del celular. Los iPhone guardan en HEIC/HEIF, un formato que Chrome y
// la mayoría de navegadores no saben abrir; aquí se convierten a JPG antes de procesarlas.
// El convertidor (heic-to, con libheif reciente: lee las fotos de iPhone nuevos) solo se
// descarga cuando de verdad llega una foto HEIC.

/** Tipos que acepta el selector de archivos (con extensión, porque Windows no reconoce el tipo HEIC). */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

export function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function isSupportedImage(file: File): boolean {
  return /^image\/(jpeg|png|webp)$/i.test(file.type) || isHeic(file);
}

/** Devuelve una imagen que el navegador puede dibujar (convierte HEIC a JPG si hace falta). */
export async function toDrawableImage(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  const { heicTo } = await import('heic-to');
  return heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
}
