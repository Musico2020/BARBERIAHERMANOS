import { supabase } from '../lib/supabase';

export interface ContactMessage {
  id: string;
  name: string;
  /** Celular normalizado: solo dígitos, sin el 57 inicial */
  phone: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export type ContactMessageError = 'INVALID_NAME' | 'INVALID_PHONE' | 'INVALID_MESSAGE' | 'TOO_MANY_MESSAGES' | 'UNKNOWN';

const KNOWN: ContactMessageError[] = ['INVALID_NAME', 'INVALID_PHONE', 'INVALID_MESSAGE', 'TOO_MANY_MESSAGES'];

export class ContactMessageSendError extends Error {
  constructor(public code: ContactMessageError, public cause?: unknown) {
    super(code);
    this.name = 'ContactMessageSendError';
  }
}

/** Envía un mensaje desde el chat de la web. Lo puede usar cualquier visitante. */
export async function sendContactMessage(name: string, phone: string, message: string): Promise<void> {
  const { error } = await supabase.rpc('send_contact_message', { p_name: name, p_phone: phone, p_message: message });
  if (error) {
    throw new ContactMessageSendError(KNOWN.find((c) => c === error.message) ?? 'UNKNOWN', error);
  }
}

// --- Solo administradores ---------------------------------------------------

/**
 * Mensajes del más nuevo al más viejo. Sin `limit` trae todos (Supabase entrega máximo 1000 filas
 * por consulta, así que se piden por páginas); con `limit`, solo los más recientes (la campanita).
 */
export async function getContactMessages(limit?: number): Promise<ContactMessage[]> {
  type Row = { id: string; name: string; phone: string; message: string; read: boolean; created_at: string };
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const size = limit ? Math.min(PAGE, limit - from) : PAGE;
    const { data, error } = await supabase
      .from('contact_messages')
      .select('id, name, phone, message, read, created_at')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if ((data as Row[]).length < size || (limit && rows.length >= limit)) break;
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    message: r.message,
    read: r.read,
    createdAt: r.created_at,
  }));
}

export async function setContactMessageRead(id: string, read: boolean): Promise<void> {
  const { error } = await supabase.from('contact_messages').update({ read }).eq('id', id);
  if (error) throw error;
}

export async function markAllContactMessagesRead(): Promise<void> {
  const { error } = await supabase.from('contact_messages').update({ read: true }).eq('read', false);
  if (error) throw error;
}
