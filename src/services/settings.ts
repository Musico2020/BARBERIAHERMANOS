import { supabase } from '../lib/supabase';
import { businessConfig } from '../config/business';
import type { BusinessConfig, BusinessHours, LunchBreak, SpecialDay } from '../types';

// Configuración del negocio que el administrador puede cambiar desde el panel.
// Se guarda en la tabla business_settings; los valores de src/config/business.ts son el respaldo.
// loadSettings() se llama una vez al abrir la web, antes de mostrar nada.

export type EditableSettings = Pick<
  BusinessConfig,
  'tagline' | 'address' | 'phone' | 'whatsapp' | 'email' | 'instagram' | 'tiktok' | 'facebook' | 'hours' | 'holidayHours' | 'specialDays' | 'allowAnyBarber' | 'slotStep' | 'daysAhead' | 'lunch'
>;

/** Opciones de «las citas empiezan cada…» (minutos) */
export const SLOT_STEP_OPTIONS = [10, 15, 20, 30, 40, 45, 60] as const;
/** Opciones de anticipación (días). El servidor no acepta reservas a más de 30 días. */
export const DAYS_AHEAD_OPTIONS = [3, 7, 14, 21, 30] as const;

const validSlotStep = (n: unknown): n is number => (SLOT_STEP_OPTIONS as readonly unknown[]).includes(n);
const validDaysAhead = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 30;

const TEXT_KEYS = ['tagline', 'address', 'phone', 'whatsapp', 'email', 'instagram', 'tiktok', 'facebook'] as const;
const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validHours(h: unknown): h is BusinessHours {
  const x = h as BusinessHours;
  return !!x && typeof x.day === 'string' && typeof x.closed === 'boolean' &&
    (x.closed || (TIME_RE.test(x.open) && TIME_RE.test(x.close) && x.open < x.close));
}

function validLunch(l: unknown): l is LunchBreak {
  const x = l as LunchBreak;
  return !!x && typeof x.enabled === 'boolean' && TIME_RE.test(x.start) && TIME_RE.test(x.end) && x.start < x.end;
}

function validSpecialDay(d: unknown): d is SpecialDay {
  const x = d as SpecialDay;
  return !!x && DATE_RE.test(x.date) && (x.type === 'closed' || x.type === 'walk-in') &&
    (x.noticeFrom === undefined || DATE_RE.test(x.noticeFrom)) && (x.note === undefined || typeof x.note === 'string');
}

/** Copia en businessConfig solo los valores guardados que sean válidos. */
function apply(data: Partial<EditableSettings>) {
  for (const key of TEXT_KEYS) {
    const value = data[key];
    // Las redes se pueden dejar vacías (se ocultan); los demás datos no
    const optional = key === 'instagram' || key === 'facebook' || key === 'tiktok';
    if (typeof value === 'string' && (value.trim() || optional)) businessConfig[key] = value.trim();
  }
  if (Array.isArray(data.hours) && data.hours.length === 7 && data.hours.every(validHours)) businessConfig.hours = data.hours;
  if (validHours(data.holidayHours)) businessConfig.holidayHours = data.holidayHours;
  if (typeof data.allowAnyBarber === 'boolean') businessConfig.allowAnyBarber = data.allowAnyBarber;
  if (validSlotStep(data.slotStep)) businessConfig.slotStep = data.slotStep;
  if (validDaysAhead(data.daysAhead)) businessConfig.daysAhead = data.daysAhead;
  if (validLunch(data.lunch)) businessConfig.lunch = data.lunch;
  if (Array.isArray(data.specialDays) && data.specialDays.every(validSpecialDay)) {
    businessConfig.specialDays = [...data.specialDays].sort((a, b) => a.date.localeCompare(b.date));
  }
}

/** Lee la configuración guardada. Si falla (sin internet, tabla vacía) la web sigue con los valores del código. */
export async function loadSettings(): Promise<void> {
  try {
    const { data, error } = await supabase.from('business_settings').select('data').maybeSingle();
    if (error) throw error;
    if (data?.data) apply(data.data as Partial<EditableSettings>);
  } catch (err) {
    console.warn('No se pudo cargar la configuración guardada; se usan los valores por defecto', err);
  }
}

export function currentSettings(): EditableSettings {
  const { tagline, address, phone, whatsapp, email, instagram, tiktok, facebook, hours, holidayHours, specialDays, allowAnyBarber, slotStep, daysAhead, lunch } = businessConfig;
  return structuredClone({ tagline, address, phone, whatsapp, email, instagram, tiktok, facebook, hours, holidayHours, specialDays, allowAnyBarber, slotStep, daysAhead, lunch });
}

/** Guarda los cambios (solo administradores) y los aplica de inmediato en esta pestaña. */
export async function saveSettings(patch: Partial<EditableSettings>): Promise<void> {
  const next = { ...currentSettings(), ...patch };
  if (!next.hours.every(validHours) || !validHours(next.holidayHours)) throw new Error('INVALID_HOURS');
  if (!next.specialDays.every(validSpecialDay)) throw new Error('INVALID_SPECIAL_DAY');
  if (!validSlotStep(next.slotStep) || !validDaysAhead(next.daysAhead)) throw new Error('INVALID_RULES');
  if (!validLunch(next.lunch)) throw new Error('INVALID_LUNCH');
  const { error } = await supabase
    .from('business_settings')
    .upsert({ id: true, data: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  apply(next);
}
