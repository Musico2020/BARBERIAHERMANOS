import { useEffect, useMemo, useState } from 'react';
import { CalendarX, CalendarCheck, RotateCcw, Save, Loader2, Lock, Unlock, Info } from 'lucide-react';
import { getBarbers } from '../../services/barbers';
import { getBookingsInRange } from '../../services/bookings';
import { currentSettings, saveSettings } from '../../services/settings';
import { todayKey, addDays, dayShort, dayOfMonth, monthShort, formatDateLong, minutesToTime, timeToMinutes, time12 } from '../../lib/dates';
import { regularHoursFor } from '../../lib/businessHours';
import { holidayName } from '../../lib/holidays';
import { newOverride, slotStarts, slotState, toggleSlot, setAllSlots, normalizeOverride } from '../../lib/dayShifts';
import { Panel } from '../../components/admin/ui';
import BarberAvatar from '../../components/common/BarberAvatar';
import type { Barber, Booking, DayOverride, SpecialDay } from '../../types';

// Panel → Turnos: abrir o cerrar medias horas de cualquier día, para todo el salón o para un barbero.
// También abre días que normalmente están cerrados (domingos, festivos) o cierra un día completo.

const DAYS_SHOWN = 60;
const TIME_OPTIONS = Array.from({ length: (23 - 5) * 2 + 1 }, (_, i) => minutesToTime(5 * 60 + i * 30));
const isActive = (b: Booking) => b.status === 'pending' || b.status === 'confirmed';
const hour12 = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
};

export default function AdminShifts() {
  const today = todayKey();
  const dates = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i)), [today]);
  const [date, setDate] = useState(today);
  const [target, setTarget] = useState<string | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [overrides, setOverrides] = useState<DayOverride[]>(() => currentSettings().dayOverrides);
  const [specials, setSpecials] = useState<SpecialDay[]>(() => currentSettings().specialDays);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    getBarbers()
      .then((list) => setBarbers(list.filter((b) => b.role === 'barbero' || b.role === 'manicurista')))
      .catch((err) => console.error('No se pudieron cargar los barberos', err));
  }, []);

  useEffect(() => {
    getBookingsInRange(date, date)
      .then(setBookings)
      .catch((err) => {
        console.error('No se pudieron cargar las citas del día', err);
        setBookings([]);
      });
  }, [date]);

  const special = specials.find((d) => d.date === date) ?? null;
  const override = overrides.find((d) => d.date === date) ?? null;
  const regular = regularHoursFor(date);
  const holiday = holidayName(date);
  // Lo que muestra la grilla: el ajuste guardado, o el día normal (con su almuerzo) si no hay ajuste
  const view: DayOverride | null = special ? null : override ?? (regular ? newOverride(date) : null);
  const targetBarber = barbers.find((b) => b.id === target) ?? null;

  const change = (nextOverrides: DayOverride[], nextSpecials: SpecialDay[] = specials) => {
    setOverrides(nextOverrides.sort((a, b) => a.date.localeCompare(b.date)));
    setSpecials(nextSpecials);
    setDirty(true);
    setMessage(null);
  };
  const upsert = (o: DayOverride) => change([...overrides.filter((d) => d.date !== o.date), o]);

  const toggle = (start: number) => view && upsert(toggleSlot(view, start, target));
  const setAll = (closed: boolean) => view && upsert(setAllSlots(view, target, closed));
  const setHours = (field: 'open' | 'close', value: string) => {
    if (!view) return;
    const next = { ...view, [field]: value };
    if (timeToMinutes(next.open) >= timeToMinutes(next.close)) {
      setMessage({ kind: 'error', text: 'La hora de cierre debe ser después de la apertura.' });
      return;
    }
    upsert(normalizeOverride(next));
  };
  const closeDay = () =>
    change(overrides.filter((d) => d.date !== date), [...specials.filter((d) => d.date !== date), { date, type: 'closed' }]);
  const openDay = () =>
    change(
      [...overrides.filter((d) => d.date !== date), override ?? newOverride(date)],
      specials.filter((d) => d.date !== date),
    );
  const resetDay = () => change(overrides.filter((d) => d.date !== date), specials.filter((d) => d.date !== date));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Los ajustes de días que ya pasaron se descartan para no acumularlos
      await saveSettings({ dayOverrides: overrides.filter((d) => d.date >= today), specialDays: specials });
      setOverrides(currentSettings().dayOverrides);
      setSpecials(currentSettings().specialDays);
      setDirty(false);
      setMessage({ kind: 'ok', text: 'Turnos guardados. La web ya muestra los cambios.' });
    } catch (err) {
      console.error('No se pudieron guardar los turnos', err);
      setMessage({ kind: 'error', text: 'No se pudieron guardar los cambios. Revisa la conexión e intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  const status = special?.type === 'closed'
    ? { tone: 'text-rose-300', text: 'Cerrado todo el día' }
    : special?.type === 'walk-in'
      ? { tone: 'text-amber-300', text: 'Solo por orden de llegada (sin reservas por la web)' }
      : override
        ? { tone: 'text-gold', text: `Horario ajustado: ${hour12(timeToMinutes(override.open))} a ${hour12(timeToMinutes(override.close))}` }
        : regular
          ? { tone: 'text-zinc-300', text: `Horario normal${holiday ? ' de festivo' : ''}: ${hour12(timeToMinutes(regular.open))} a ${hour12(timeToMinutes(regular.close))}` }
          : { tone: 'text-zinc-400', text: 'Normalmente cerrado' };

  const activeBookings = bookings.filter(isActive);
  const bookingsAt = (start: number) =>
    activeBookings.filter((b) => (!target || b.barberId === target) && timeToMinutes(b.time) >= start && timeToMinutes(b.time) < start + 30);
  const slots = view ? slotStarts(view.open, view.close) : [];
  const closedCount = view ? slots.filter((s) => slotState(view, s, target) !== 'open').length : 0;

  return (
    <div className="space-y-5 pb-24">
      <div>
        <p className="section-label">Turnos</p>
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1">Abrir o cerrar horas</h2>
        <p className="text-zinc-400 text-sm mt-1 max-w-2xl">
          Elige el día y para quién. Toca cada media hora para cerrarla o abrirla. Las horas cerradas no se
          ofrecen en la web ni en el chat. Las citas que ya estaban reservadas no se cancelan.
        </p>
      </div>

      {/* Días */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
        {dates.map((d, i) => {
          const sp = specials.find((x) => x.date === d);
          const ov = overrides.some((x) => x.date === d);
          const normallyClosed = !regularHoursFor(d);
          const selected = d === date;
          return (
            <button
              key={d}
              onClick={() => setDate(d)}
              aria-pressed={selected}
              className={`relative flex flex-col items-center min-w-[62px] px-2.5 py-2 rounded-2xl border shrink-0 transition-all ${
                selected ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <span className={`text-[10px] font-semibold uppercase ${selected ? 'text-gold' : 'text-zinc-500'}`}>{i === 0 ? 'Hoy' : dayShort(d)}</span>
              <span className={`text-lg font-bold font-mono ${selected ? 'text-gold' : 'text-white'}`}>{dayOfMonth(d)}</span>
              <span className="text-[10px] text-zinc-500">{monthShort(d)}</span>
              {(sp || ov || normallyClosed || holidayName(d)) && (
                <span
                  className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                    sp?.type === 'closed' ? 'bg-rose-400' : ov ? 'bg-gold' : sp ? 'bg-amber-400' : 'bg-zinc-600'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 -mt-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gold" /> con ajustes</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400" /> cerrado</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-600" /> festivo o normalmente cerrado</span>
      </p>

      <Panel
        title={formatDateLong(date)}
        subtitle={<span className={status.tone}>{holiday ? `${holiday} · ` : ''}{status.text}</span>}
        action={
          <div className="flex flex-wrap gap-2">
            {(special?.type === 'closed' || (!view && !special)) && (
              <button onClick={openDay} className="btn-gold px-4 py-2 rounded-full text-xs font-bold min-h-[36px]">
                <CalendarCheck size={14} /> <span>Abrir este día</span>
              </button>
            )}
            {special?.type === 'walk-in' && (
              <button onClick={openDay} className="btn-dark-glass px-4 py-2 rounded-full text-xs font-semibold min-h-[36px]">
                <CalendarCheck size={14} /> Recibir reservas este día
              </button>
            )}
            {view && (
              <button onClick={closeDay} className="btn-danger-glass px-4 py-2 rounded-full text-xs font-semibold min-h-[36px]">
                <CalendarX size={14} /> Cerrar todo el día
              </button>
            )}
            {(override || special) && (
              <button onClick={resetDay} className="btn-dark-glass px-4 py-2 rounded-full text-xs font-semibold min-h-[36px]">
                <RotateCcw size={14} /> Volver al horario normal
              </button>
            )}
          </div>
        }
      >
        {!view ? (
          <p className="text-zinc-400 text-sm py-6 text-center">
            {special?.type === 'closed'
              ? 'Este día está cerrado. Toca «Abrir este día» si quieres recibir reservas.'
              : special?.type === 'walk-in'
                ? 'Este día se atiende por orden de llegada, sin reservas por la web.'
                : 'Este día normalmente no se trabaja. Toca «Abrir este día» para ponerle horario y recibir reservas.'}
          </p>
        ) : (
          <div className="space-y-5">
            {/* Para quién */}
            <div>
              <p className="text-xs text-zinc-400 mb-2">¿Para quién?</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTarget(null)}
                  aria-pressed={target === null}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border min-h-[40px] ${target === null ? 'bg-gold text-dark border-gold' : 'border-white/10 text-zinc-300 hover:border-gold/40'}`}
                >
                  Todo el salón
                </button>
                {barbers.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setTarget(b.id)}
                    aria-pressed={target === b.id}
                    className={`inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full text-sm font-semibold border min-h-[40px] ${target === b.id ? 'bg-gold text-dark border-gold' : 'border-white/10 text-zinc-300 hover:border-gold/40'}`}
                  >
                    <BarberAvatar barber={b} className="w-7 h-7 rounded-full text-[10px]" />
                    {b.shortName}
                  </button>
                ))}
              </div>
            </div>

            {/* Horario del día */}
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-zinc-400">
                Abre
                <select value={view.open} onChange={(e) => setHours('open', e.target.value)} className="block mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{hour12(timeToMinutes(t))}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-400">
                Cierra
                <select value={view.close} onChange={(e) => setHours('close', e.target.value)} className="block mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{hour12(timeToMinutes(t))}</option>)}
                </select>
              </label>
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setAll(true)} className="btn-dark-glass px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px]">
                  <Lock size={13} /> Cerrar todas
                </button>
                <button onClick={() => setAll(false)} className="btn-dark-glass px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px]">
                  <Unlock size={13} /> Abrir todas
                </button>
              </div>
            </div>

            {/* Grilla de medias horas */}
            <div>
              <p className="text-xs text-zinc-400 mb-2">
                {targetBarber ? `Horas de ${targetBarber.shortName}` : 'Horas de todo el salón'} · {slots.length - closedCount} abiertas, {closedCount} cerradas
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {slots.map((s) => {
                  const state = slotState(view, s, target);
                  const booked = bookingsAt(s);
                  return (
                    <button
                      key={s}
                      onClick={() => state !== 'closed-salon' && toggle(s)}
                      disabled={state === 'closed-salon'}
                      aria-pressed={state === 'open'}
                      title={state === 'closed-salon' ? 'Cerrada para todo el salón' : state === 'open' ? 'Toca para cerrar' : 'Toca para abrir'}
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
                        {state === 'open' ? 'Abierta' : state === 'closed' ? 'Cerrada' : 'Cerrada (salón)'}
                        {booked.length > 0 && <span className="text-gold font-semibold"> · {booked.length} cita{booked.length > 1 ? 's' : ''}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!override && (
                <p className="flex items-start gap-1.5 text-[11px] text-zinc-500 mt-3">
                  <Info size={12} className="mt-0.5 shrink-0" />
                  Así está el día con el horario normal (el almuerzo aparece cerrado). Al tocar una hora se crea el ajuste de este día.
                </p>
              )}
            </div>
          </div>
        )}
      </Panel>

      {(dirty || message) && (
        <div className="fixed bottom-4 left-4 right-4 lg:left-[15rem] z-40">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-[#161616] shadow-2xl px-4 py-3">
            <p className={`text-sm ${message?.kind === 'error' ? 'text-rose-300' : message?.kind === 'ok' ? 'text-emerald-300' : 'text-zinc-300'}`}>
              {message?.text ?? 'Tienes cambios sin guardar.'}
            </p>
            {dirty && (
              <button onClick={save} disabled={saving} className="btn-gold px-5 py-2 rounded-full text-sm font-bold min-h-[40px] disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span>Guardar cambios</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
