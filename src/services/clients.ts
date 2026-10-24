import { supabase } from '../lib/supabase';

export interface ClientRecord {
  id: string;
  name: string;
  /** Celular normalizado: solo dígitos, sin el 57 inicial */
  phone: string;
  email: string;
  notes: string;
  source: 'manual' | 'google_contacts' | 'booking';
  createdAt: string;
}

interface ClientRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  source: ClientRecord['source'];
  created_at: string;
}

/** Mismo criterio que normalize_phone() en la base de datos. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
}

export async function getClients(): Promise<ClientRecord[]> {
  const rows: ClientRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, phone, email, notes, source, created_at')
      .order('name')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data as ClientRow[]));
    if (data.length < pageSize) break;
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    source: r.source,
    createdAt: r.created_at,
  }));
}

export async function getClientsCount(): Promise<number> {
  const { count, error } = await supabase.from('clients').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

// Clientes bloqueados (Panel → Clientes): ese celular ya no puede reservar ni reagendar por la web.

export interface BlockedClient {
  /** Celular normalizado */
  phone: string;
  name: string;
  reason: string;
  createdAt: string;
}

export async function getBlockedClients(): Promise<BlockedClient[]> {
  const { data, error } = await supabase.from('blocked_clients').select('phone, name, reason, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return (data as { phone: string; name: string; reason: string; created_at: string }[]).map((r) => ({
    phone: r.phone, name: r.name, reason: r.reason, createdAt: r.created_at,
  }));
}

export async function blockClient(phone: string, name: string, reason: string): Promise<void> {
  const { error } = await supabase.from('blocked_clients').upsert({ phone: normalizePhone(phone), name: name.trim(), reason: reason.trim() });
  if (error) throw error;
}

export async function unblockClient(phone: string): Promise<void> {
  const { error } = await supabase.from('blocked_clients').delete().eq('phone', normalizePhone(phone));
  if (error) throw error;
}
