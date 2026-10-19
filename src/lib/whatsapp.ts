import { businessConfig } from '../config/business';

// Enlaces para escribirle a un cliente por WhatsApp desde el panel.

/** Dirección pública de la web (en Vercel, VITE_SITE_URL; en local, la del navegador). */
export function siteUrl(): string {
  const fromEnv = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/+$/, '');
  return fromEnv || window.location.origin;
}

/** Número para wa.me: solo dígitos y con el 57 de Colombia si es un celular de 10 dígitos. */
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
}

/** Mensaje de invitación a reservar en la web, con el enlace. */
export function bookingInvitation(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return [
    `Hola${first ? ` ${first}` : ''} 👋, te saludamos de ${businessConfig.name} 💈.`,
    'Ya puedes reservar tu turno en línea: eliges el servicio, el día, la hora y tu barbero, sin esperas y sin anticipo.',
    `Reserva aquí 👉 ${siteUrl()}`,
    '¡Te esperamos!',
  ].join('\n\n');
}

/** Abre el chat de WhatsApp del cliente con la invitación lista para enviar. */
export function inviteToBookLink(name: string, phone: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(bookingInvitation(name))}`;
}
