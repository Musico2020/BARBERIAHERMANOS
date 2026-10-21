import { useEffect, useRef, useState } from 'react';
import { X, UserPlus, Loader2, Minus, Plus, Clock, Check, CalendarDays, Zap, ChevronDown } from 'lucide-react';
import { getServices } from '../../services/services';
import { getBarbers } from '../../services/barbers';
import { createManualBookings, getBusySlots, type BusySlot } from '../../services/bookings';
import { businessConfig } from '../../config/business';
import { generateSlots } from '../../lib/availability';
import { formatCOP } from '../../data';
import { todayKey, nowMinutes, minutesToTime, timeToMinutes, formatDateLong, addDays, time12, dayShort, dayOfMonth, monthShort } from '../../lib/dates';
import { isValidName, isValidPhone } from '../../lib/clientContact';
import { MAX_CART_UNITS, roleFor, cartRole, cartUnits, changeQty, type CartItem } from '../../lib/bookingCart';
import BarberAvatar from '../common/BarberAvatar';
import { CategoryIcon } from '../common/BarberIcons';
import type { Service, Barber } from '../../types';

// Cliente registrado por el administrador, por fuera de la reserva web (no pide anticipo).
//   · «Atendido ahora»: queda hoy, a la hora actual, como servicio completado (entra a la contabilidad).
//   · «Agendar cita»: se escoge el día y la hora; queda como cita confirmada en la agenda del barbero.
//     No deja escoger una hora que se cruce con otra cita de ese barbero.

interface Props {
  onClose: () => void;
  onSaved: (count: number, clientName: string, scheduled: { date: string; time: string } | null) => void;
}

type When = 'now' | 'later';


const inputClass = 'w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-gold/60 transition-colors';

function SectionTitle({ number, children, hint }: { number: number; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h4 className="flex items-center gap-2.5 text-sm font-semibold text-white">
        <span className="w-6 h-6 rounded-full bg-gold/15 border border-gold/40 text-gold text-xs font-bold flex items-center justify-center">{number}</span>
        {children}
      </h4>
      {hint && <span className="text-[11px] text-zinc-500 text-right">{hint}</span>}
    </div>
  );
}

export default function NewClientModal({ onClose, onSaved }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [team, setTeam] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CartItem[]>([]);
  // Valor cobrado por unidad de cada servicio (por si se cobró distinto, p. ej. recargo fuera del horario)
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [barberId, setBarberId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [when, setWhen] = useState<When>('now');
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [loadingBusy, setLoadingBusy] = useState(false);

  useEffect(() => {
    Promise.all([getServices(), getBarbers()])
      .then(([s, b]) => { setServices([...s].sort((x, y) => Number(!!y.popular) - Number(!!x.popular))); setTeam(b); })
      .catch((err) => {
        console.error('No se pudieron cargar servicios y equipo', err);
        setError('No se pudieron cargar los servicios. Cierra y vuelve a intentar.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const hasItems = items.length > 0;
  const role = cartRole(items) ?? 'barbero';
  // Todo el equipo de ese rol, incluso quien está «no disponible» para la web
  const staff = team.filter((b) => b.role === role);
  const barber = staff.find((b) => b.id === barberId) ?? (staff.length === 1 ? staff[0] : undefined);

  const unitPrice = (s: Service) => {
    const raw = prices[s.id];
    return raw === undefined ? s.price : Number(raw.replace(/\D/g, '')) || 0;
  };
  const total = items.reduce((sum, i) => sum + i.qty * unitPrice(i.service), 0);
  const units = cartUnits(items);
  const minutes = items.reduce((sum, i) => sum + i.qty * i.service.duration, 0);

  // Citas y horas cerradas de ese barbero ese día
  const barberKey = barber?.id ?? '';
  useEffect(() => {
    if (when !== 'later' || !barberKey || !date) { setBusy([]); return; }
    let alive = true;
    setLoadingBusy(true);
    getBusySlots(date, barberKey)
      .then((list) => { if (alive) setBusy(list); })
      .catch((err) => { console.error('No se pudieron cargar las citas del barbero', err); if (alive) setBusy([]); })
      .finally(() => { if (alive) setLoadingBusy(false); });
    return () => { alive = false; };
  }, [when, barberKey, date]);

  // Las mismas horas que ofrece la reserva de la web: horario del salón (o el propio del barbero),
  // sin almuerzo, sin horas cerradas ni citas, y donde quepan todos los servicios elegidos
  const slots = when === 'later' && barber && !loadingBusy
    ? generateSlots(date, busy, [barber.id], Math.max(minutes, 5), businessConfig.slotStep, () => barber.workHours)
    : [];
  const timeOk = when === 'now' || (!!time && slots.some((s) => s.time === time));

  // Cada elección baja sola a la siguiente pregunta
  const barberRef = useRef<HTMLElement>(null);
  const whenRef = useRef<HTMLElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<HTMLElement>(null);
  const scrollTo = (ref: React.RefObject<HTMLElement>) =>
    window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90);

  const change = (service: Service, delta: number) => {
    const next = changeQty(items, service, delta);
    setItems(next);
    if (barber && barber.role !== (cartRole(next) ?? 'barbero')) setBarberId('');
    setError('');
  };

  const nameOk = isValidName(name);
  const phoneOk = phone.trim() === '' || isValidPhone(phone);
  const ready = hasItems && !!barber && nameOk && phoneOk && timeOk && !saving;

  // El botón de abajo: con todo listo guarda; si falta algo, lleva a ese paso
  const nextStep = (): { label: string; go: () => void } | null => {
    if (!barber) return { label: role === 'manicurista' ? 'Elige la manicurista' : 'Elige quién lo atiende', go: () => scrollTo(barberRef) };
    if (when === 'later' && !timeOk) return { label: 'Escoge la hora de la cita', go: () => scrollTo(timeRef) };
    if (!nameOk || !phoneOk) {
      return {
        label: !nameOk ? 'Escribe el nombre del cliente' : 'Revisa el celular',
        go: () => { scrollTo(clientRef); window.setTimeout(() => document.getElementById(!nameOk ? 'manual-name' : 'manual-phone')?.focus(), 400); },
      };
    }
    return null;
  };
  const pending = hasItems ? nextStep() : null;

  const save = async () => {
    if (!ready || !barber) return;
    setSaving(true);
    setError('');
    try {
      // Ahora: hoy, desde la hora actual. Agendada: el día y la hora escogidos. Un servicio detrás de otro.
      const scheduled = when === 'later' ? { date, time } : null;
      let start = scheduled ? timeToMinutes(scheduled.time) : Math.floor(nowMinutes() / 5) * 5;
      const lines = items.flatMap(({ service, qty }) =>
        Array.from({ length: qty }, () => {
          const line = { serviceId: service.id, serviceName: service.name, time: minutesToTime(start % (24 * 60)), price: unitPrice(service) };
          start += service.duration;
          return line;
        }),
      );
      await createManualBookings({
        clientName: name,
        clientPhone: phone,
        barberId: barber.id,
        barberName: barber.shortName,
        date: scheduled ? scheduled.date : todayKey(),
        status: scheduled ? 'confirmed' : 'completed',
        lines,
      });
      onSaved(lines.length, name.trim(), scheduled);
    } catch (err) {
      console.error('No se pudo registrar el cliente', err);
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Registrar cliente nuevo">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <div className="relative w-full sm:max-w-2xl bg-[#0d0d0d] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden h-[92vh] sm:h-[min(90vh,800px)] flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center">
              <UserPlus size={16} className="text-gold" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold">{when === 'now' ? `Atendido ahora · ${formatDateLong(todayKey())}` : 'Cita agendada desde el panel · sin anticipo'}</p>
              <h2 className="font-serif text-xl font-bold text-white">Cliente nuevo</h2>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-7">
          {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

          <section>
            <SectionTitle number={1} hint="Puedes elegir varios y la cantidad de cada uno">¿Qué se hizo?</SectionTitle>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-gold" /></div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {services.map((service) => {
                  const qty = items.find((i) => i.service.id === service.id)?.qty ?? 0;
                  const selected = qty > 0;
                  const otherRole = hasItems && roleFor(service) !== role;
                  const full = units >= MAX_CART_UNITS;
                  return (
                    <div
                      key={service.id}
                      className={`rounded-xl border transition-all ${selected ? 'border-gold bg-gold/10 shadow-gold' : 'border-white/10 bg-white/[0.03] hover:border-gold/40'} ${otherRole ? 'opacity-40' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => !otherRole && change(service, 1)}
                        disabled={otherRole || (full && !selected)}
                        aria-label={`Agregar ${service.name}`}
                        className="w-full text-left p-3.5 pb-2 disabled:cursor-not-allowed"
                      >
                        <span className="flex items-start gap-2 text-white text-sm font-medium leading-snug">
                          <CategoryIcon category={service.category} size={17} className={`shrink-0 mt-px ${selected ? 'text-gold' : 'text-gold/70'}`} />
                          {service.name}
                        </span>
                        <span className="flex items-center justify-between mt-1.5">
                          <span className="flex items-center gap-1 text-zinc-500 text-xs"><Clock size={11} />{service.duration} min</span>
                          <span className="font-mono text-sm font-bold gold-text">{formatCOP(service.price)}</span>
                        </span>
                      </button>
                      <div className="flex items-center justify-between gap-2 px-3.5 pb-3">
                        <span className={`text-[11px] ${selected ? 'font-semibold text-gold' : 'text-zinc-500'}`}>
                          {otherRole ? 'Se registra aparte' : selected ? formatCOP(qty * unitPrice(service)) : 'Toca para agregar'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => change(service, -1)} disabled={!selected} aria-label={`Quitar un ${service.name}`} className="w-8 h-8 rounded-full border border-white/15 text-zinc-300 flex items-center justify-center hover:border-gold/50 hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed">
                            <Minus size={14} />
                          </button>
                          <span className={`w-6 text-center font-mono text-base font-bold ${selected ? 'text-gold' : 'text-zinc-600'}`}>{qty}</span>
                          <button type="button" onClick={() => change(service, 1)} disabled={otherRole || full} aria-label={`Agregar un ${service.name}`} className="w-8 h-8 rounded-full border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/15 disabled:opacity-30 disabled:cursor-not-allowed">
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {hasItems && (
            <>
              <section>
                <SectionTitle number={2} hint="Cambia el valor si se cobró distinto">Lo que se cobra</SectionTitle>
                <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-4">
                  <ul className="space-y-2">
                    {items.map(({ service, qty }) => (
                      <li key={service.id} className="flex items-center gap-2 text-sm">
                        <span className="font-mono font-bold text-gold w-8 shrink-0">{qty} ×</span>
                        <span className="flex-1 min-w-0 text-white truncate">{service.name}</span>
                        <span className="relative w-28 shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                          <input
                            inputMode="numeric"
                            aria-label={`Valor cobrado por ${service.name}`}
                            value={prices[service.id] ?? String(service.price)}
                            onChange={(e) => setPrices({ ...prices, [service.id]: e.target.value.replace(/\D/g, '') })}
                            className="w-full pl-6 pr-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-right font-mono text-sm text-white focus:outline-none focus:border-gold/60"
                          />
                        </span>
                        <button type="button" onClick={() => change(service, -qty)} aria-label={`Quitar ${service.name}`} className="w-7 h-7 rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center shrink-0">
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-white/10 mt-3 pt-3 flex items-end justify-between gap-3">
                    <p className="text-zinc-400 text-xs">{units} {units === 1 ? 'servicio' : 'servicios'} · {minutes} min</p>
                    <div className="text-right">
                      <p className="text-zinc-500 text-[11px] uppercase tracking-wider">Total</p>
                      <p className="font-mono text-xl font-bold gold-text">{formatCOP(total)}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section ref={barberRef} className="scroll-mt-4">
                <SectionTitle number={3}>{role === 'manicurista' ? '¿Qué manicurista lo atiende?' : '¿Quién lo atiende?'}</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-2">
                  {staff.map((b) => {
                    const selected = barber?.id === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => { setBarberId(b.id); setTime(''); scrollTo(whenRef); }}
                        aria-pressed={selected}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selected ? 'border-gold bg-gold/10' : 'border-white/10 bg-white/[0.03] hover:border-gold/40'}`}
                      >
                        <BarberAvatar barber={b} className={`w-11 h-11 rounded-full text-sm shrink-0 border-2 ${selected ? 'border-gold' : 'border-transparent'}`} />
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-semibold truncate ${selected ? 'text-gold' : 'text-white'}`}>{b.name}</span>
                          <span className="block text-xs text-zinc-500">{b.available ? 'Disponible' : 'No disponible en la web'}</span>
                        </span>
                        {selected && <Check size={16} className="text-gold shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section ref={whenRef} className="scroll-mt-4">
                <SectionTitle number={4} hint={when === 'later' ? 'No pide anticipo' : undefined}>¿Cuándo?</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  {([['now', 'Atendido ahora', 'Queda hoy como completado', Zap], ['later', 'Agendar cita', 'Escoge el día y la hora', CalendarDays]] as const).map(([value, label, hint, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setWhen(value); setError(''); scrollTo(value === 'later' ? timeRef : clientRef); }}
                      aria-pressed={when === value}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${when === value ? 'border-gold bg-gold/10' : 'border-white/10 bg-white/[0.03] hover:border-gold/40'}`}
                    >
                      <Icon size={17} className={`shrink-0 mt-0.5 ${when === value ? 'text-gold' : 'text-zinc-500'}`} />
                      <span>
                        <span className={`block text-sm font-semibold ${when === value ? 'text-gold' : 'text-white'}`}>{label}</span>
                        <span className="block text-[11px] text-zinc-500">{hint}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {when === 'later' && (
                  <div ref={timeRef} className="mt-3 space-y-3 scroll-mt-4">
                    <label className="block">
                      <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Día</span>
                      <input
                        type="date"
                        className={`${inputClass} [color-scheme:dark]`}
                        value={date}
                        min={todayKey()}
                        max={addDays(todayKey(), 90)}
                        onChange={(e) => { setDate(e.target.value); setTime(''); }}
                      />
                      {date && <span className="text-[11px] text-zinc-500 mt-1 block capitalize">{formatDateLong(date)}</span>}
                    </label>
                    <div>
                      <span className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                        Hora {loadingBusy && <Loader2 size={12} className="animate-spin text-gold" />}
                      </span>
                      {!barber ? (
                        <p className="text-zinc-500 text-sm">Primero elige quién lo atiende.</p>
                      ) : loadingBusy ? (
                        <div className="h-16" />
                      ) : slots.length === 0 ? (
                        <p className="text-amber-300 text-sm">
                          {barber.shortName} no tiene horas libres ese día para {minutes} min de servicio. Escoge otro día.
                        </p>
                      ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-56 overflow-y-auto pr-1">
                          {slots.map(({ time: t, recommended }) => {
                            const selected = time === t;
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => { setTime(t); scrollTo(clientRef); }}
                                aria-pressed={selected}
                                className={`py-2 rounded-lg text-xs font-mono border transition-all ${
                                  selected ? 'border-gold bg-gold text-dark font-bold'
                                    : recommended ? 'border-gold/50 text-gold bg-black/30 hover:bg-gold/15'
                                      : 'border-white/10 text-zinc-200 hover:border-gold/50 hover:text-gold bg-white/[0.03]'}`}
                              >
                                {time12(t)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-zinc-500 text-[11px] mt-2">
                        Son las mismas horas libres que ve el cliente en la reserva de la web para {barber?.shortName ?? 'ese barbero'} ({minutes} min de servicio).
                        En dorado, las que quedan pegadas a otra cita.
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <section ref={clientRef} className="space-y-3 scroll-mt-4">
                <SectionTitle number={5}>Datos del cliente</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Nombre</span>
                    <input id="manual-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Carlos Martínez" autoComplete="off" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Celular (opcional)</span>
                    <input id="manual-phone" className={inputClass} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="300 123 4567" autoComplete="off" />
                    {!phoneOk && <span className="text-amber-400 text-[11px] mt-1 block">Escribe 10 dígitos o déjalo vacío.</span>}
                  </label>
                </div>
                <p className="text-zinc-500 text-xs">Con el celular, el cliente queda guardado en la sección Clientes.</p>
              </section>
            </>
          )}
        </div>

        <div className="border-t border-white/10 px-5 sm:px-6 py-4 bg-[#0d0d0d]">
          <button
            type="button"
            onClick={() => (pending ? pending.go() : save())}
            disabled={!hasItems || saving}
            className="w-full btn-gold py-3.5 rounded-full font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 size={17} className="animate-spin" /><span>Guardando...</span></> : !hasItems ? (
              <span>Elige uno o varios servicios</span>
            ) : pending ? (
              <span className="flex flex-col items-center leading-tight">
                <span className="flex items-center gap-1.5">{pending.label} <ChevronDown size={18} className="animate-bounce" /></span>
                <span className="text-xs font-normal opacity-80 mt-0.5">{units} {units === 1 ? 'servicio' : 'servicios'} · {formatCOP(total)}</span>
              </span>
            ) : (
              <span>
                {when === 'later' ? `Agendar · ${dayShort(date)} ${dayOfMonth(date)} ${monthShort(date)}, ${time12(time)} · ${formatCOP(total)}` : `Registrar servicio · ${formatCOP(total)}`}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
