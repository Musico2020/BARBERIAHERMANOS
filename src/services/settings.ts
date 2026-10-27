import { supabase } from '../lib/supabase';
import { businessConfig } from '../config/business';
import type { BusinessConfig, BusinessHours, DayOverride, DepositConfig, LunchBreak, SpecialDay } from '../types';

// Configuración del negocio que el administrador puede cambiar desde el panel.
// Se guarda en la tabla business_settings; los valores de src/config/business.ts son el respaldo.
// loadSettings() se llama una vez al abrir la web, antes de mostrar nada.

export type EditableSettings = Pick<
  BusinessConfig,
  'tagline' | 'address' | 'phone' | 'whatsapp' | 'email' | 'instagram' | 'tiktok' | 'facebook' | 'hours' | 'holidayHours' | 'specialDays' | 'allowAnyBarber' | 'slotStep' | 'daysAhead' | 'lunch' | 'dayOverrides' | 'deposit'
>;

/** Opciones de «las citas empiezan cada…» (minutos) */
export const SLOT_STEP_OPTIONS = [5, 10, 15, 20, 30, 60] as const;
/** Opciones de anticipación (días). El servidor no acepta reservas a más de 30 días. */
export const DAYS_AHEAD_OPTIONS = [3, 7, 14, 21, 30, 60, 90] as const;

const validSlotStep = (n: unknown): n is number => (SLOT_STEP_OPTIONS as readonly unknown[]).includes(n);
const validDaysAhead = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 90;

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

function validDayOverride(o: unknown): o is DayOverride {
  const x = o as DayOverride;
  return !!x && DATE_RE.test(x.date) && TIME_RE.test(x.open) && TIME_RE.test(x.close) && x.open < x.close &&
    Array.isArray(x.closed) &&
    x.closed.every((c) => !!c && TIME_RE.test(c.start) && TIME_RE.test(c.end) && c.start < c.end &&
      (c.barberId === undefined || typeof c.barberId === 'string')) &&
    (x.barbers === undefined || (typeof x.barbers === 'object' && x.barbers !== null && Object.values(x.barbers).every((d) =>
      !!d && (d.off === true || (TIME_RE.test(d.open) && TIME_RE.test(d.close) && d.open < d.close)))));
}

export function validDeposit(d: unknown): d is DepositConfig {
  const x = d as DepositConfig;
  return !!x && typeof x.enabled === 'boolean' && Number.isInteger(x.percent) && x.percent >= 1 && x.percent <= 100 &&
    Number.isInteger(x.minutes) && x.minutes >= 5 && x.minutes <= 240 && typeof x.key === 'string' && typeof x.holder === 'string' &&
    (x.allowFull === undefined || typeof x.allowFull === 'boolean') && (x.allowCash === undefined || typeof x.allowCash === 'boolean');
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
  if (validDeposit(data.deposit)) businessConfig.deposit = data.deposit;
  if (Array.isArray(data.dayOverrides) && data.dayOverrides.every(validDayOverride)) {
    businessConfig.dayOverrides = [...data.dayOverrides].sort((a, b) => a.date.localeCompare(b.date));
  }
  if (Array.isArray(data.specialDays) && data.specialDays.every(validSpecialDay)) {
    businessConfig.specialDays = [...data.specialDays].sort((a, b) => a.date.localeCompare(b.date));
  }
}

/** Aviso para volver a dibujar la web cuando cambia la configuración (ver startSettingsSync) */
export const SETTINGS_EVENT = 'settings-updated';
let lastLoaded = '';

/** Lee la configuración guardada. Si falla (sin internet, tabla vacía) la web sigue con los valores del código. */
export async function loadSettings(): Promise<void> {
  try {
    const { data, error } = await supabase.from('business_settings').select('data').maybeSingle();
    if (error) throw error;
    if (data?.data) {
      apply(data.data as Partial<EditableSettings>);
      // Solo se avisa si algo cambió, para no redibujar la web cada minuto
      const json = JSON.stringify(data.data);
      if (json !== lastLoaded) {
        const first = lastLoaded === '';
        lastLoaded = json;
        if (!first) window.dispatchEvent(new Event(SETTINGS_EVENT));
      }
    }
  } catch (err) {
    console.warn('No se pudo cargar la configuración guardada; se usan los valores por defecto', err);
  }
}

/**
 * Mantiene el horario al día en pantallas que quedan abiertas (panel, portal del barbero, reserva):
 * vuelve a leer la configuración cada minuto y al volver a la ventana. Si cambió (p. ej. se cerró el
 * día o unas horas en Turnos), avisa con SETTINGS_EVENT para que la web se vuelva a dibujar.
 */
export function startSettingsSync(): () => void {
  const id = window.setInterval(() => { void loadSettings(); }, 60_000);
  const onVisible = () => { if (document.visibilityState === 'visible') void loadSettings(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}

export function currentSettings(): EditableSettings {
  const { tagline, address, phone, whatsapp, email, instagram, tiktok, facebook, hours, holidayHours, specialDays, allowAnyBarber, slotStep, daysAhead, lunch, dayOverrides, deposit } = businessConfig;
  return structuredClone({ tagline, address, phone, whatsapp, email, instagram, tiktok, facebook, hours, holidayHours, specialDays, allowAnyBarber, slotStep, daysAhead, lunch, dayOverrides, deposit });
}

/** Guarda los cambios (solo administradores) y los aplica de inmediato en esta pestaña. */
export async function saveSettings(patch: Partial<EditableSettings>): Promise<void> {
  // Primero lo último guardado (otra pestaña, otro administrador o un barbero pudo cambiar algo):
  // así solo se cambia lo de `patch` y no se borra lo demás
  await loadSettings();
  const next = { ...currentSettings(), ...patch };
  if (!next.hours.every(validHours) || !validHours(next.holidayHours)) throw new Error('INVALID_HOURS');
  if (!next.specialDays.every(validSpecialDay)) throw new Error('INVALID_SPECIAL_DAY');
  if (!validSlotStep(next.slotStep) || !validDaysAhead(next.daysAhead)) throw new Error('INVALID_RULES');
  if (!validLunch(next.lunch)) throw new Error('INVALID_LUNCH');
  if (!next.dayOverrides.every(validDayOverride)) throw new Error('INVALID_DAY_OVERRIDE');
  if (!validDeposit(next.deposit)) throw new Error('INVALID_DEPOSIT');
  const { error } = await supabase
    .from('business_settings')
    .upsert({ id: true, data: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  apply(next);
  lastLoaded = JSON.stringify(next);
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}
