import { useMemo, useState } from 'react';
import { Save, Loader2, Lock, Unlock, Info, UserCheck, UserX } from 'lucide-react';
import { setBarberDayClosures, setBarberDayHours, type DayClosuresResult } from '../../services/barberPortal';
import { loadSettings } from '../../services/settings';
import { businessConfig } from '../../config/business';
import { todayKey, addDays, dayShort, dayOfMonth, monthShort, formatDateLong, minutesToTime, timeToMinutes, time12 } from '../../lib/dates';
import { bookingHoursFor, barberHoursFor, regularHoursFor, specialDayOf } from '../../lib/businessHours';
import { newOverride, slotStarts, slotState, toggleSlot, setAllSlots } from '../../lib/dayShifts';
import { Panel } from '../../components/admin/ui';
import type { Barber, Booking, DayOverride } from '../../types';

// Portal del barbero → Mis turnos: el barbero cierra o abre SUS medias horas de un día y puede poner su
// horario de ese día (o no trabajar). Si el salón está cerrado ese día, puede abrirlo solo para él.
// Lo que el administrador cerró para todo el salón se ve bloqueado y no se puede abrir desde aquí.

const DAYS_SHOWN = 90;
const TIME_OPTIONS = Array.from({ length: (23 - 5) * 2 + 1 }, (_, i) => minutesToTime(5 * 60 + i * 30));
const ERRORS: Record<Exclude<DayClosuresResult, 'OK'>, string> = {
  INVALID_PIN: 'Tu PIN cambió o no es válido. Sal y vuelve a entrar.',
  PIN_LOCKED: 'Tu acceso está bloqueado unos minutos por intentos fallidos.',
  INVALID_DATE: 'Solo puedes cambiar los turnos de hoy en adelante (hasta 90 días).',
  DAY_CLOSED: 'Ese día el salón no recibe reservas. Habla con el administrador.',
  INVALID_RANGES: 'Alguna hora está fuera del horario del día. Recarga e intenta de nuevo.',
};

const isActive = (b: Booking) => b.status === 'pending' || b.status === 'confirmed';

export default function BarberShifts({ barber, pin, appts }: { barber: Barber; pin: string; appts: Booking[] }) {
  const today = todayKey();
  const dates = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i)), [today]);
  const [date, setDate] = useState(today);
  // Cambios sin guardar de cada día que el barbero ha tocado
  const [drafts, setDrafts] = useState<Record<string, DayOverride>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [, setVersion] = useState(0);

  const open = !!bookingHoursFor(date);
  const saved = businessConfig.dayOverrides.find((d) => d.date === date) ?? null;
  const view: DayOverride | null = open ? drafts[date] ?? saved ?? newOverride(date) : null;
  const slots = view ? slotStarts(view.open, view.close) : [];
  const mineClosed = view ? slots.filter((s) => slotState(view, s, barber.id) === 'closed').length : 0;
  const dirty = !!drafts[date];
  // Su horario de ese día (el mismo que ve la Agenda y la web)
  const myWindow = open ? barberHoursFor(date, barber.workHours, barber.id) : null;
  const outside = (s: number) => !myWindow || s < myWindow.open || s + 30 > myWindow.close;
  const [openFrom, setOpenFrom] = useState('');
  const [openTo, setOpenTo] = useState('');
  const regular = regularHoursFor(date);
  const defaultOpen = { open: regular?.open ?? '09:00', close: regular?.close ?? '13:00' };

  const saveHours = async (hours: { open: string; close: string } | { off: true }) => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await setBarberDayHours(barber.id, pin, date, hours);
      if (result !== 'OK') { setMessage({ kind: 'error', text: ERRORS[result] ?? 'No se pudo guardar.' }); return; }
      await loadSettings();
      const rest = { ...drafts };
      delete rest[date];
      setDrafts(rest);
      setVersion((v) => v + 1);
      setMessage({ kind: 'ok', text: 'off' in hours ? 'Listo: ese día no trabajas y no se ofrecen tus horas.' : `Listo: ese día trabajas de ${time12(hours.open)} a ${time12(hours.close)}` });
    } catch (err) {
      console.error('No se pudo guardar el horario del día', err);
      setMessage({ kind: 'error', text: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  const change = (next: DayOverride) => {
    setDrafts({ ...drafts, [date]: next });
    setMessage(null);
  };

  const save = async () => {
    if (!view) return;
    setSaving(true);
    setMessage(null);
    try {
      const mine = view.closed.filter((r) => r.barberId === barber.id).map(({ start, end }) => ({ start, end }));
      const result = await setBarberDayClosures(barber.id, pin, date, mine);
      if (result !== 'OK') {
        setMessage({ kind: 'error', text: ERRORS[result] ?? 'No se pudo guardar.' });
        return;
      }
      // Se vuelve a leer la configuración para ver lo guardado (y lo que haya cambiado el administrador)
      await loadSettings();
      const rest = { ...drafts };
      delete rest[date];
      setDrafts(rest);
      setVersion((v) => v + 1);
      setMessage({ kind: 'ok', text: mine.length ? 'Listo: esas horas ya no se ofrecen en la web.' : 'Listo: todas tus horas de ese día están abiertas.' });
    } catch (err) {
      console.error('No se pudieron guardar los turnos del barbero', err);
      setMessage({ kind: 'error', text: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  const bookedAt = (start: number) =>
    appts.filter((b) => b.date === date && isActive(b) && timeToMinutes(b.time) >= start && timeToMinutes(b.time) < start + 30).length;

  return (
    <div className="space-y-5">
      <p className="text-zinc-400 text-sm">
        Toca una media hora para cerrarla o abrirla. Las horas que cierres no se ofrecen a los clientes en la web.
        Las citas que ya tenías reservadas no se cancelan.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {dates.map((d, i) => {
          const selected = d === date;
          const mine = businessConfig.dayOverrides.find((o) => o.date === d)?.closed.some((r) => r.barberId === barber.id);
          return (
            <button
              key={d}
              onClick={() => { setDate(d); setMessage(null); }}
              aria-pressed={selected}
              className={`relative flex flex-col items-center min-w-[60px] px-2.5 py-2 rounded-2xl border shrink-0 transition-all ${
                selected ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              } ${bookingHoursFor(d) ? '' : 'opacity-50'}`}
            >
              <span className={`text-[10px] font-semibold uppercase ${selected ? 'text-gold' : 'text-zinc-500'}`}>{i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : dayShort(d)}</span>
              <span className={`text-lg font-bold font-mono ${selected ? 'text-gold' : 'text-white'}`}>{dayOfMonth(d)}</span>
              <span className="text-[10px] text-zinc-500">{monthShort(d)}</span>
              {(mine || drafts[d]) && <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${drafts[d] ? 'bg-amber-400' : 'bg-rose-400'}`} />}
            </button>
          );
        })}
      </div>

      <Panel
        title={formatDateLong(date)}
        subtitle={view ? `De ${time12(view.open)} a ${time12(view.close)} · ${slots.length - mineClosed} horas abiertas, ${mineClosed} cerradas por ti` : 'El salón no recibe reservas este día'}
        action={view && (
          <div className="flex gap-2">
            <button onClick={() => change(setAllSlots(view, barber.id, true))} className="btn-dark-glass px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px]">
              <Lock size={13} /> Cerrar todo el día
            </button>
            <button onClick={() => change(setAllSlots(view, barber.id, false))} className="btn-dark-glass px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px]">
              <Unlock size={13} /> Abrir todas
            </button>
          </div>
        )}
      >
        {!view ? (
          specialDayOf(date) === 'walk-in' ? (
            <p className="text-zinc-400 text-sm py-6 text-center">Ese día se atiende por orden de llegada, sin reservas por la web.</p>
          ) : (
            <div className="py-4 space-y-3 text-center">
              <p className="text-zinc-400 text-sm">El salón está cerrado este día. Puedes abrirlo <b className="text-white">solo para ti</b> (los demás siguen sin trabajar).</p>
              <div className="flex flex-wrap items-end justify-center gap-3">
                <label className="text-xs text-zinc-400">Entras
                  <select value={openFrom || defaultOpen.open} onChange={(e) => setOpenFrom(e.target.value)} className="block mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                  </select>
                </label>
                <label className="text-xs text-zinc-400">Sales
                  <select value={openTo || defaultOpen.close} onChange={(e) => setOpenTo(e.target.value)} className="block mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                  </select>
                </label>
                <button
                  disabled={saving || (openFrom || defaultOpen.open) >= (openTo || defaultOpen.close)}
                  onClick={() => saveHours({ open: openFrom || defaultOpen.open, close: openTo || defaultOpen.close })}
                  className="btn-gold px-4 py-2.5 rounded-full text-sm font-bold disabled:opacity-50"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />} <span>Abrir mi día</span>
                </button>
              </div>
            </div>
          )
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              {myWindow ? (
                <>
                  <p className="w-full text-sm text-white font-semibold">Tu horario este día</p>
                  <label className="text-xs text-zinc-400">Entras
                    <select value={minutesToTime(myWindow.open)} disabled={saving} onChange={(e) => e.target.value < minutesToTime(myWindow.close) && saveHours({ open: e.target.value, close: minutesToTime(myWindow.close) })} className="block mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400">Sales
                    <select value={minutesToTime(myWindow.close)} disabled={saving} onChange={(e) => e.target.value > minutesToTime(myWindow.open) && saveHours({ open: minutesToTime(myWindow.open), close: e.target.value })} className="block mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                    </select>
                  </label>
                  <button onClick={() => saveHours({ off: true })} disabled={saving} className="btn-danger-glass px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px]">
                    <UserX size={13} /> No trabajo este día
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-rose-300 flex-1">Este día no trabajas.</p>
                  <button onClick={() => saveHours({ open: view.open, close: view.close })} disabled={saving} className="btn-gold px-4 py-2 rounded-full text-xs font-bold">
                    <UserCheck size={14} /> <span>Trabajar este día ({time12(view.open)} a {time12(view.close)})</span>
                  </button>
                </>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {slots.map((s) => {
                const state = outside(s) ? 'off' : slotState(view, s, barber.id);
                const booked = bookedAt(s);
                return (
                  <button
                    key={s}
                    onClick={() => state !== 'closed-salon' && state !== 'off' && change(toggleSlot(view, s, barber.id))}
                    disabled={state === 'closed-salon' || state === 'off'}
                    aria-pressed={state === 'open'}
                    title={state === 'closed-salon' ? 'Cerrada por el salón' : state === 'open' ? 'Toca para cerrar' : 'Toca para abrir'}
                    className={`rounded-xl border px-2 py-2.5 text-left transition-all min-h-[56px] ${
                      state === 'open'
                        ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
                        : state === 'closed'
                          ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20'
                          : 'border-white/10 bg-white/[0.03] opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <span className={`block font-mono text-sm font-bold ${state === 'open' ? 'text-emerald-300' : state === 'closed' ? 'text-rose-300' : 'text-zinc-500'}`}>
                      {time12(minutesToTime(s))}
                    </span>
                    <span className="block text-[10px] text-zinc-400 mt-0.5">
                      {state === 'open' ? 'Abierta' : state === 'closed' ? 'Cerrada' : state === 'off' ? 'No trabajas' : 'Salón cerrado'}
                      {booked > 0 && <span className="text-gold font-semibold"> · {booked} cita{booked > 1 ? 's' : ''}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-zinc-500 mt-3">
              <Info size={12} className="mt-0.5 shrink-0" />
              Las horas grises las cerró el salón (por ejemplo el almuerzo) y solo el administrador las puede abrir.
            </p>
          </>
        )}
      </Panel>

      {(dirty || message) && (
        <div className="sticky bottom-24 lg:bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-[#161616] shadow-2xl px-4 py-3">
          <p className={`text-sm ${message?.kind === 'error' ? 'text-rose-300' : message?.kind === 'ok' ? 'text-emerald-300' : 'text-zinc-300'}`}>
            {message?.text ?? 'Tienes cambios sin guardar en este día.'}
          </p>
          {dirty && (
            <button onClick={save} disabled={saving} className="btn-gold px-5 py-2 rounded-full text-sm font-bold min-h-[40px] disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              <span>Guardar</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
