import { useState, useEffect } from 'react';
import {
  Store, Clock, CalendarX, ShieldCheck, ListChecks, Save, Loader2, CheckCircle2, AlertCircle, Trash2, Plus,
  Eye, EyeOff, KeyRound, Users, Megaphone, MessageCircle,
} from 'lucide-react';
import { currentSettings, saveSettings, DAYS_AHEAD_OPTIONS, type EditableSettings } from '../../services/settings';
import { changeAdminPassword, currentAdminEmail, AdminAuthError } from '../../services/adminAuth';
import { getBarbers, updateBarber } from '../../services/barbers';
import { noticeStart } from '../../lib/businessHours';
import { upcomingHolidays } from '../../lib/holidays';
import { todayKey, addDays, formatDateLong } from '../../lib/dates';
import { Panel, Segmented } from '../../components/admin/ui';
import type { Barber, BusinessHours, SpecialDay } from '../../types';

// Configuración editable del negocio. Se guarda en la base de datos (tabla business_settings)
// y la web la usa apenas se recarga: horarios, días especiales, contacto y redes.

type Tab = 'negocio' | 'horario' | 'dias' | 'seguridad' | 'reglas';
type Status = { kind: 'ok' | 'error'; text: string } | null;

const inputClass =
  'w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-gold/50 transition-colors';
const labelClass = 'text-xs text-zinc-400 font-medium block mb-1.5';

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  const ok = status.kind === 'ok';
  return (
    <p role="status" className={`flex items-center gap-2 text-sm ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
      {ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {status.text}
    </p>
  );
}

function SaveBar({ saving, status, onSave, label = 'Guardar cambios' }: { saving: boolean; status: Status; onSave: () => void; label?: string }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-5 border-t border-white/[0.06]">
      <StatusLine status={status} />
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 sm:ml-auto"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {label}
      </button>
    </div>
  );
}

/** Fecha larga en minúscula, para usarla dentro de una frase ('desde el lunes 12 de octubre'). */
const inSentence = (key: string) => { const t = formatDateLong(key); return t.charAt(0).toLowerCase() + t.slice(1); };

const onlyDigits = (s: string) => s.replace(/\D/g, '');
/** Celular colombiano de 10 dígitos → con el 57 delante, como lo usa WhatsApp. */
const withCountry = (s: string) => {
  const d = onlyDigits(s);
  return d.length === 10 ? `57${d}` : d;
};

// ---------------------------------------------------------------------------

function BusinessTab() {
  const [form, setForm] = useState(currentSettings);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const set = (key: keyof EditableSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const save = async () => {
    const whatsapp = withCountry(form.whatsapp);
    const phone = withCountry(form.phone);
    if (!form.address.trim()) return setStatus({ kind: 'error', text: 'Escribe la dirección.' });
    if (whatsapp.length !== 12 || phone.length !== 12) return setStatus({ kind: 'error', text: 'El WhatsApp y el teléfono deben tener 10 dígitos.' });
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return setStatus({ kind: 'error', text: 'Revisa el correo.' });
    setSaving(true);
    setStatus(null);
    try {
      const clean = (s: string) => s.trim().replace(/^@/, '');
      await saveSettings({
        tagline: form.tagline.trim(), address: form.address.trim(), whatsapp, phone, email: form.email.trim(),
        instagram: clean(form.instagram), facebook: clean(form.facebook), tiktok: clean(form.tiktok),
      });
      setForm(currentSettings());
      setStatus({ kind: 'ok', text: 'Guardado. La web ya muestra los datos nuevos.' });
    } catch (err) {
      console.error('No se pudo guardar la información del negocio', err);
      setStatus({ kind: 'error', text: 'No se pudo guardar. Intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Información del negocio" subtitle="Lo que ven los clientes en la web: contacto, dirección y redes">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="sm:col-span-2">
          <span className={labelClass}>Eslogan</span>
          <input className={inputClass} value={form.tagline} onChange={set('tagline')} />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>Dirección</span>
          <input className={inputClass} value={form.address} onChange={set('address')} />
        </label>
        <label>
          <span className={labelClass}>WhatsApp de la barbería</span>
          <input className={inputClass} inputMode="tel" value={form.whatsapp.replace(/^57(?=\d{10}$)/, '')} onChange={set('whatsapp')} placeholder="314 411 0530" />
        </label>
        <label>
          <span className={labelClass}>Teléfono para llamadas</span>
          <input className={inputClass} inputMode="tel" value={form.phone.replace(/^57(?=\d{10}$)/, '')} onChange={set('phone')} placeholder="314 411 0530" />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>Correo</span>
          <input className={inputClass} type="email" value={form.email} onChange={set('email')} />
        </label>
        <label>
          <span className={labelClass}>Enlace de Instagram</span>
          <input className={inputClass} value={form.instagram} onChange={set('instagram')} placeholder="https://www.instagram.com/tu-perfil" />
        </label>
        <label>
          <span className={labelClass}>Enlace de TikTok</span>
          <input className={inputClass} value={form.tiktok} onChange={set('tiktok')} placeholder="https://www.tiktok.com/@tu-perfil" />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>Enlace de Facebook</span>
          <input className={inputClass} value={form.facebook} onChange={set('facebook')} placeholder="https://www.facebook.com/tu-pagina" />
          <span className="text-zinc-600 text-[11px] mt-1 block">Pega el enlace de cada perfil (o solo el usuario). Los íconos flotantes de la web llevan a estos enlaces; deja vacío para ocultar una red.</span>
        </label>
      </div>
      <SaveBar saving={saving} status={status} onSave={save} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function HoursRow({ value, onChange }: { value: BusinessHours; onChange: (v: BusinessHours) => void }) {
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[130px_auto_1fr] items-center gap-x-4 gap-y-2 py-3 border-b border-white/[0.05] last:border-0">
      <span className="text-white text-sm font-medium">{value.day}</span>
      <button
        type="button"
        onClick={() => onChange({ ...value, closed: !value.closed, open: value.open || '09:00', close: value.close || '18:00' })}
        aria-pressed={!value.closed}
        className={`justify-self-end sm:justify-self-start inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
          value.closed ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${value.closed ? 'bg-rose-400' : 'bg-emerald-400'}`} />
        {value.closed ? 'Cerrado' : 'Abierto'}
      </button>
      <div className={`col-span-2 sm:col-span-1 flex items-center gap-2 ${value.closed ? 'opacity-30 pointer-events-none' : ''}`}>
        <input type="time" step={1800} className={`${inputClass} font-mono`} value={value.open} onChange={(e) => onChange({ ...value, open: e.target.value })} aria-label={`Abre el ${value.day}`} />
        <span className="text-zinc-500 text-xs">a</span>
        <input type="time" step={1800} className={`${inputClass} font-mono`} value={value.close} onChange={(e) => onChange({ ...value, close: e.target.value })} aria-label={`Cierra el ${value.day}`} />
      </div>
    </div>
  );
}

function HoursTab() {
  const [hours, setHours] = useState(() => currentSettings().hours);
  const [holiday, setHoliday] = useState(() => currentSettings().holidayHours);
  const [lunch, setLunch] = useState(() => currentSettings().lunch);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const save = async () => {
    const bad = [...hours, holiday].find((h) => !h.closed && (!h.open || !h.close || h.open >= h.close));
    if (bad) return setStatus({ kind: 'error', text: `Revisa el horario de ${bad.day}: la hora de cierre debe ser después de la de apertura.` });
    if (!lunch.start || !lunch.end || lunch.start >= lunch.end) return setStatus({ kind: 'error', text: 'Revisa el almuerzo: la hora de regreso debe ser después de la de salida.' });
    setSaving(true);
    setStatus(null);
    try {
      await saveSettings({ hours, holidayHours: holiday, lunch });
      setStatus({ kind: 'ok', text: 'Horario guardado. Las reservas ya usan el horario nuevo.' });
    } catch (err) {
      console.error('No se pudo guardar el horario', err);
      setStatus({ kind: 'error', text: 'No se pudo guardar. Intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Horario de atención" subtitle="Las reservas por la web solo ofrecen horas dentro de este horario">
      {hours.map((h, i) => (
        <HoursRow key={h.day} value={h} onChange={(v) => setHours(hours.map((x, j) => (j === i ? v : x)))} />
      ))}
      <div className="mt-4 rounded-xl border border-gold/20 bg-gold/[0.04] px-4">
        <HoursRow value={holiday} onChange={setHoliday} />
      </div>
      <p className="text-zinc-500 text-xs mt-3 leading-relaxed">
        Los festivos de Colombia se detectan solos. Próximos: {upcomingHolidays(todayKey(), 3).map((h) => `${inSentence(h.date)} (${h.name})`).join(' · ')}.
      </p>
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-white text-sm font-semibold">Almuerzo</p>
            <p className="text-zinc-500 text-xs">En ese rango no se reciben reservas por la web. No aplica domingos ni festivos (se atiende de corrido).</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={lunch.enabled}
            aria-label="Almuerzo"
            onClick={() => setLunch({ ...lunch, enabled: !lunch.enabled })}
            className={`relative w-14 h-8 rounded-full shrink-0 transition-colors ${lunch.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`}
          >
            <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${lunch.enabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        {lunch.enabled && (
          <div className="grid grid-cols-2 gap-3 mt-3 max-w-xs">
            <label>
              <span className={labelClass}>Sale a almorzar</span>
              <input id="lunch-start" type="time" className={`${inputClass} [color-scheme:dark]`} value={lunch.start} onChange={(e) => setLunch({ ...lunch, start: e.target.value })} />
            </label>
            <label>
              <span className={labelClass}>Regresa</span>
              <input id="lunch-end" type="time" className={`${inputClass} [color-scheme:dark]`} value={lunch.end} onChange={(e) => setLunch({ ...lunch, end: e.target.value })} />
            </label>
          </div>
        )}
      </div>
      <SaveBar saving={saving} status={status} onSave={save} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<SpecialDay['type'], string> = {
  closed: 'No hay servicio',
  'walk-in': 'Solo por orden de llegada',
};

function SpecialDaysTab() {
  const today = todayKey();
  const [days, setDays] = useState(() => currentSettings().specialDays);
  const [draft, setDraft] = useState<SpecialDay>({ date: addDays(today, 1), type: 'closed', note: '', noticeFrom: today });
  const [noticeTouched, setNoticeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const upcoming = days.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  const persist = async (next: SpecialDay[], okText: string) => {
    setSaving(true);
    setStatus(null);
    try {
      await saveSettings({ specialDays: next });
      setDays(currentSettings().specialDays);
      setStatus({ kind: 'ok', text: okText });
      return true;
    } catch (err) {
      console.error('No se pudieron guardar los días especiales', err);
      setStatus({ kind: 'error', text: 'No se pudo guardar. Intenta de nuevo.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    if (!draft.date || draft.date < today) return setStatus({ kind: 'error', text: 'Elige una fecha de hoy en adelante.' });
    const noticeFrom = draft.noticeFrom && draft.noticeFrom <= draft.date ? draft.noticeFrom : addDays(draft.date, -1);
    const entry: SpecialDay = { date: draft.date, type: draft.type, noticeFrom, ...(draft.note?.trim() ? { note: draft.note.trim() } : {}) };
    // Quita los días que ya pasaron y reemplaza si la fecha ya existía
    const next = [...days.filter((d) => d.date >= today && d.date !== draft.date), entry];
    const ok = await persist(next, `Listo: el ${inSentence(draft.date)} quedó como «${TYPE_LABEL[draft.type]}». El aviso sale desde el ${inSentence(noticeFrom)}.`);
    if (ok) {
      setDraft({ date: addDays(draft.date, 1), type: draft.type, note: '', noticeFrom: draft.date });
      setNoticeTouched(false);
    }
  };

  const remove = (date: string) => persist(days.filter((d) => d.date !== date && d.date >= today), `Se quitó el ${inSentence(date)}.`);

  return (
    <div className="space-y-5">
      <Panel title="Agregar un día especial" subtitle="Ese día no se podrá reservar por la web y la página principal mostrará un aviso">
        <div className="grid sm:grid-cols-2 gap-4">
          <label>
            <span className={labelClass}>Fecha</span>
            <input
              type="date"
              min={today}
              className={`${inputClass} font-mono`}
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value, noticeFrom: noticeTouched ? draft.noticeFrom : addDays(e.target.value, -1) })}
            />
          </label>
          <label>
            <span className={labelClass}>¿Qué pasa ese día?</span>
            <select className={inputClass} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as SpecialDay['type'] })}>
              <option value="closed" className="bg-[#141414]">No hay servicio (cerrado)</option>
              <option value="walk-in" className="bg-[#141414]">Se atiende solo por orden de llegada</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Mensaje para los clientes (opcional)</span>
            <input
              className={inputClass}
              maxLength={160}
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Ej: Cerramos por capacitación del equipo. ¡Te esperamos el jueves!"
            />
          </label>
          <label>
            <span className={labelClass}>Mostrar el aviso desde</span>
            <input
              type="date"
              min={today}
              max={draft.date}
              className={`${inputClass} font-mono`}
              value={draft.noticeFrom ?? ''}
              onChange={(e) => { setDraft({ ...draft, noticeFrom: e.target.value }); setNoticeTouched(true); }}
            />
            <span className="text-zinc-600 text-[11px] mt-1 block">Por defecto, el día anterior.</span>
          </label>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-5 border-t border-white/[0.06]">
          <StatusLine status={status} />
          <button type="button" onClick={add} disabled={saving} className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 sm:ml-auto">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Agregar día
          </button>
        </div>
      </Panel>

      <Panel title="Próximos días especiales" subtitle={`${upcoming.length} ${upcoming.length === 1 ? 'día programado' : 'días programados'}`} bodyClassName="p-3 sm:p-4">
        {upcoming.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-8">No hay días especiales programados.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((d) => (
              <li key={d.date} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${d.type === 'closed' ? 'bg-rose-500/10 text-rose-300' : 'bg-gold/10 text-gold'}`}>
                  {d.type === 'closed' ? <CalendarX size={17} /> : <Users size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-semibold">{formatDateLong(d.date)}</p>
                  <p className={`text-xs font-medium ${d.type === 'closed' ? 'text-rose-300' : 'text-gold'}`}>{TYPE_LABEL[d.type]}</p>
                  {d.note && <p className="text-zinc-400 text-xs mt-1">“{d.note}”</p>}
                  <p className="text-zinc-500 text-[11px] mt-1 flex items-center gap-1">
                    <Megaphone size={11} /> Aviso desde el {inSentence(noticeStart(d))}
                    {noticeStart(d) <= today && <span className="text-emerald-400 font-semibold ml-1">· visible ahora</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d.date)}
                  disabled={saving}
                  aria-label={`Quitar ${formatDateLong(d.date)}`}
                  className="btn-danger-glass p-2 rounded-lg shrink-0 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <span className="relative block">
        <input type={show ? 'text' : 'password'} autoComplete={autoComplete} className={`${inputClass} pr-11`} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar' : 'Mostrar'} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </label>
  );
}

function SecurityTab() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwStatus, setPwStatus] = useState<Status>(null);

  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [pin, setPin] = useState({ barberId: '', next: '', confirm: '' });
  const [pinSaving, setPinSaving] = useState(false);
  const [pinStatus, setPinStatus] = useState<Status>(null);

  useEffect(() => {
    currentAdminEmail().then(setEmail);
    getBarbers()
      .then((list) => { setBarbers(list); setPin((p) => ({ ...p, barberId: p.barberId || list[0]?.id || '' })); })
      .catch((err) => console.error('No se pudieron cargar los barberos', err));
  }, []);

  const savePassword = async () => {
    if (!pw.current) return setPwStatus({ kind: 'error', text: 'Escribe tu contraseña actual.' });
    if (pw.next.length < 8) return setPwStatus({ kind: 'error', text: 'La contraseña nueva debe tener al menos 8 caracteres.' });
    if (pw.next !== pw.confirm) return setPwStatus({ kind: 'error', text: 'La confirmación no coincide con la contraseña nueva.' });
    if (pw.next === pw.current) return setPwStatus({ kind: 'error', text: 'La contraseña nueva debe ser distinta a la actual.' });
    setPwSaving(true);
    setPwStatus(null);
    try {
      await changeAdminPassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwStatus({ kind: 'ok', text: 'Contraseña cambiada. Úsala la próxima vez que entres.' });
    } catch (err) {
      console.error('No se pudo cambiar la contraseña', err);
      const wrong = err instanceof AdminAuthError && err.code === 'INVALID_CREDENTIALS';
      setPwStatus({ kind: 'error', text: wrong ? 'La contraseña actual no es correcta.' : 'No se pudo cambiar la contraseña. Intenta de nuevo.' });
    } finally {
      setPwSaving(false);
    }
  };

  const savePin = async () => {
    if (!pin.barberId) return setPinStatus({ kind: 'error', text: 'Elige un barbero.' });
    if (!/^\d{4}$/.test(pin.next)) return setPinStatus({ kind: 'error', text: 'El PIN debe tener exactamente 4 números.' });
    if (pin.next !== pin.confirm) return setPinStatus({ kind: 'error', text: 'La confirmación no coincide con el PIN nuevo.' });
    setPinSaving(true);
    setPinStatus(null);
    try {
      await updateBarber(pin.barberId, { pin: pin.next });
      const name = barbers.find((b) => b.id === pin.barberId)?.name ?? 'el barbero';
      setPin({ ...pin, next: '', confirm: '' });
      setPinStatus({ kind: 'ok', text: `PIN de ${name} cambiado. Avísale el nuevo PIN.` });
    } catch (err) {
      console.error('No se pudo cambiar el PIN', err);
      setPinStatus({ kind: 'error', text: 'No se pudo cambiar el PIN. Intenta de nuevo.' });
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Panel title="Tu contraseña de administrador" subtitle={email ? `Cuenta: ${email}` : 'Cuenta del panel'}>
        <div className="space-y-4">
          <PasswordField label="Contraseña actual" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} autoComplete="current-password" />
          <PasswordField label="Contraseña nueva (mínimo 8 caracteres)" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} autoComplete="new-password" />
          <PasswordField label="Repite la contraseña nueva" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} autoComplete="new-password" />
        </div>
        <SaveBar saving={pwSaving} status={pwStatus} onSave={savePassword} label="Cambiar contraseña" />
      </Panel>

      <Panel title="PIN de los barberos" subtitle="Cada barbero también puede cambiar su PIN desde su portal">
        <div className="space-y-4">
          <label className="block">
            <span className={labelClass}>Barbero</span>
            <select className={inputClass} value={pin.barberId} onChange={(e) => setPin({ ...pin, barberId: e.target.value })}>
              {barbers.map((b) => <option key={b.id} value={b.id} className="bg-[#141414]">{b.name}</option>)}
            </select>
          </label>
          <PasswordField label="PIN nuevo (4 números)" value={pin.next} onChange={(v) => setPin({ ...pin, next: onlyDigits(v).slice(0, 4) })} autoComplete="off" />
          <PasswordField label="Repite el PIN nuevo" value={pin.confirm} onChange={(v) => setPin({ ...pin, confirm: onlyDigits(v).slice(0, 4) })} autoComplete="off" />
        </div>
        <SaveBar saving={pinSaving} status={pinStatus} onSave={savePin} label="Cambiar PIN" />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-zinc-500 text-sm">{label}</span>
      <span className="text-white text-sm font-medium sm:text-right">{value}</span>
    </div>
  );
}

function AnyBarberCard() {
  const [enabled, setEnabled] = useState(() => currentSettings().allowAnyBarber);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    setStatus(null);
    try {
      await saveSettings({ allowAnyBarber: next });
      setEnabled(next);
      setStatus({ kind: 'ok', text: next ? 'Activado: los clientes pueden reservar sin elegir barbero.' : 'Desactivado: los clientes deben elegir con quién.' });
    } catch (err) {
      console.error('No se pudo guardar la opción', err);
      setStatus({ kind: 'error', text: 'No se pudo guardar. Intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Perfil «El primero que esté libre»" subtitle="La opción sin preferencia de barbero al reservar">
      <div className="flex items-center justify-between gap-4">
        <p className="text-zinc-400 text-sm leading-relaxed">
          {enabled
            ? 'Está activo: el cliente puede reservar sin elegir y se le asigna quien esté libre.'
            : 'Está desactivado: el cliente siempre elige con quién quiere su cita.'}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="El primero que esté libre"
          onClick={toggle}
          disabled={saving}
          className={`relative w-14 h-8 rounded-full shrink-0 transition-colors disabled:opacity-60 ${enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`}
        >
          <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      {status && <div className="mt-4"><StatusLine status={status} /></div>}
    </Panel>
  );
}

function ChoiceRow({ label, hint, options, value, onChange, format }: {
  label: string;
  hint: string;
  options: readonly number[];
  value: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
}) {
  return (
    <div>
      <p className="text-white text-sm font-medium">{label}</p>
      <p className="text-zinc-500 text-xs mb-2.5">{hint}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={`px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all ${
              value === n ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-gold/40'
            }`}
          >
            {format(n)}
          </button>
        ))}
      </div>
    </div>
  );
}

function BookingRulesCard() {
  const [form, setForm] = useState(() => {
    const { slotStep, daysAhead } = currentSettings();
    return { slotStep, daysAhead };
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await saveSettings(form);
      setStatus({ kind: 'ok', text: 'Reglas guardadas. Las reservas nuevas ya las usan.' });
    } catch (err) {
      console.error('No se pudieron guardar las reglas', err);
      setStatus({ kind: 'error', text: 'No se pudo guardar. Intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Horas y anticipación" subtitle="Cómo se ofrecen las horas al reservar por la web">
      <div className="space-y-5">
        <div>
          <p className="text-white text-sm font-medium">Horas que se ofrecen</p>
          <p className="text-zinc-400 text-xs leading-relaxed mt-1">
            Se calculan cada día según lo que dura cada servicio (Panel → Servicios): cada cita empieza cuando
            termina la anterior, sin huecos ni intervalos fijos. Si el barbero marca una cita como «Completada»
            antes de tiempo, las citas que seguían pegadas se adelantan y aparecen marcadas para avisarle al cliente.
          </p>
        </div>
        <ChoiceRow
          label="Se puede reservar con anticipación de hasta"
          hint="Cuántos días hacia adelante ve el cliente para elegir (máximo 30)."
          options={DAYS_AHEAD_OPTIONS}
          value={form.daysAhead}
          onChange={(daysAhead) => { setForm({ ...form, daysAhead }); setStatus(null); }}
          format={(n) => `${n} días`}
        />
      </div>
      <SaveBar saving={saving} status={status} onSave={save} label="Guardar reglas" />
    </Panel>
  );
}


function RulesTab() {
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <BookingRulesCard />
      <AnyBarberCard />
      <Panel title="Reglas de reserva" subtitle="Funcionan automáticamente">
        <Row label="El servicio debe terminar antes del cierre" value="Sí" />
        <Row label="Citas que se cruzan con otra del mismo profesional" value="No se permiten" />
        <Row label="Servicios de manicura" value="Solo con manicurista" />
      </Panel>
      <Panel title="Avisos por WhatsApp" subtitle="Automáticos al reservar">
        <p className="text-zinc-400 text-sm leading-relaxed flex gap-2.5">
          <MessageCircle size={16} className="text-gold shrink-0 mt-0.5" />
          <span>
            Al confirmar una reserva se envía la confirmación al cliente y un aviso al WhatsApp de la barbería,
            siempre que el servicio de WhatsApp (Twilio) esté configurado en el servidor. Los mensajes del chat
            de la web llegan a la sección <span className="text-white">Mensajes</span>.
          </span>
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: 'negocio', label: 'Negocio', icon: Store },
  { value: 'horario', label: 'Horario', icon: Clock },
  { value: 'dias', label: 'Días especiales', icon: CalendarX },
  { value: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
  { value: 'reglas', label: 'Reglas', icon: ListChecks },
];

export default function AdminSettings() {
  const [tab, setTab] = useState<Tab>('negocio');
  return (
    <div className="space-y-5 max-w-5xl">
      <div className="overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
        <Segmented value={tab} onChange={setTab} options={TABS.map(({ value, label }) => ({ value, label }))} />
      </div>
      <div className="flex items-center gap-2 text-zinc-500 text-xs">
        <KeyRound size={13} className="text-gold/70" />
        Los cambios se guardan en la base de datos y la web los muestra al recargar.
      </div>
      {tab === 'negocio' && <BusinessTab />}
      {tab === 'horario' && <HoursTab />}
      {tab === 'dias' && <SpecialDaysTab />}
      {tab === 'seguridad' && <SecurityTab />}
      {tab === 'reglas' && <RulesTab />}
    </div>
  );
}
