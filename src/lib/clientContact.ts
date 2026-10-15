// Nombre y celular del visitante, guardados en su propio navegador para no pedírselos
// otra vez (en la reserva y en el chat). Si el navegador no permite guardar, todo funciona igual.

const STORAGE_KEY = 'salon-hermanos-contact';
const LEGACY_CHAT_KEY = 'salon-hermanos-chat-contact';

export interface ClientContact {
  name: string;
  phone: string;
}

export function loadClientContact(): ClientContact {
  for (const key of [STORAGE_KEY, LEGACY_CHAT_KEY]) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved && typeof saved.name === 'string' && typeof saved.phone === 'string') {
        return { name: saved.name, phone: saved.phone };
      }
    } catch {
      // Sin almacenamiento disponible (modo privado, etc.)
    }
  }
  return { name: '', phone: '' };
}

export function saveClientContact(contact: ClientContact) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: contact.name.trim(), phone: contact.phone.trim() }));
  } catch {
    // No es necesario recordar los datos para reservar
  }
}

export const phoneDigits = (phone: string) => phone.replace(/\D/g, '');

export const isValidName = (name: string) => name.trim().length >= 3;

/** Celular colombiano: 10 dígitos (se acepta con +57 o espacios). */
export const isValidPhone = (phone: string) => {
  const digits = phoneDigits(phone);
  return digits.length === 10 || (digits.length === 12 && digits.startsWith('57'));
};
