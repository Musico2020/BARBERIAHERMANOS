import { businessConfig } from '../config/business';

// Enlaces a las redes de la barbería. En Panel → Configuración se puede pegar el enlace
// completo del perfil (https://...) o solo el usuario; aquí se arma la dirección final.

export type SocialKind = 'instagram' | 'facebook' | 'tiktok';

const BASE: Record<SocialKind, (user: string) => string> = {
  instagram: (u) => `https://www.instagram.com/${u}`,
  facebook: (u) => `https://www.facebook.com/${u}`,
  tiktok: (u) => `https://www.tiktok.com/@${u}`,
};

export const SOCIAL_LABEL: Record<SocialKind, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };

export function socialUrl(kind: SocialKind, value = businessConfig[kind]): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return BASE[kind](v.replace(/^@/, '').replace(/^(www\.)?(instagram|facebook|tiktok)\.com\/@?/i, ''));
}

/** Las redes que tienen enlace configurado, en orden. */
export function socialLinks(): { kind: SocialKind; label: string; url: string }[] {
  return (['instagram', 'facebook', 'tiktok'] as SocialKind[])
    .map((kind) => ({ kind, label: SOCIAL_LABEL[kind], url: socialUrl(kind) }))
    .filter((s) => s.url);
}

/** Usuario para mostrar ("@salonhermanos"), venga como usuario o como enlace. */
export function socialHandle(kind: SocialKind): string {
  const url = socialUrl(kind);
  if (!url) return '';
  const last = url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';
  return last ? `@${last.replace(/^@/, '')}` : '';
}
