import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Loader2, Users, Sun, Sunset, CalendarX, Minus, Plus, X, ChevronDown, Sparkles } from 'lucide-react';
import { getServices } from '../../services/services';
import { getBarbers } from '../../services/barbers';
import { getBusySlots, getBusySlotsRange, type BusySlot } from '../../services/bookings';
import { generateSlots } from '../../lib/availability';
import { hoursFor, specialDayOf } from '../../lib/businessHours';
import { holidayName } from '../../lib/holidays';
import { todayKey, addDays, dayShort, dayOfMonth, formatDateLong, time12, time12Parts } from '../../lib/dates';
import { formatCOP } from '../../data';
import BarberAvatar from '../common/BarberAvatar';
import { CategoryIcon } from '../common/BarberIcons';
import { businessConfig } from '../../config/business';
import { MAX_CART_UNITS, roleFor, cartRole, cartUnits, cartDuration, changeQty, type CartItem } from '../../lib/bookingCart';
import { doesAll, priceFor, cartPriceFor } from '../../lib/barberServices';
import type { Service, Barber } from '../../types';

export interface Appointment {
  /** Servicios elegidos con su cantidad; se atienden uno detrás de otro */
  items: CartItem[];
  /** null = cualquier barbero disponible (el servidor asigna uno libre) */
  barber: Barber | null;
  date: string;
  time: string;
}

interface Props {
  value: Appointment;
  onChange: (value: Appointment) => void;
  onContinue: () => void;
}


function SectionTitle({ number, children, hint }: { number: number; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h4 className="flex items-center gap-2.5 text-sm font-semibold text-white">
        <span className="w-6 h-6 rounded-full bg-gold/15 border border-gold/40 text-gold text-xs font-bold flex items-center justify-center">
          {number}
        </span>
        {children}
      </h4>
      {hint && <span className="text-[11px] text-zinc-500 text-right">{hint}</span>}
    </div>
  );
}

export default function AppointmentStep({ value, onChange, onContinue }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  // Barberos marcados como no disponibles en el panel: se muestran, pero no se pueden elegir
  const [awayBarbers, setAwayBarbers] = useState<Barber[]>([]);
  // Horas ocupadas de cada uno de los próximos días, para mostrar la disponibilidad real
  const [busyByDate, setBusyByDate] = useState<Record<string, BusySlot[]>>({});
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingBusy, setLoadingBusy] = useState(true);
  const [loadError, setLoadError] = useState('');
  const cartRef = useRef<HTMLElement>(null);
  const dayRef = useRef<HTMLElement>(null);
  const barberRef = useRef<HTMLElement>(null);
  const timeRef = useRef<HTMLElement>(null);

  // Días que se pueden reservar (businessConfig.daysAhead, editable en Panel → Configuración → Reglas)
  const dates = Array.from({ length: businessConfig.daysAhead }, (_, i) => addDays(todayKey(), i));

  useEffect(() => {
    Promise.all([getServices(), getBarbers()])
      .then(([serviceList, barberList]) => {
        setServices([...serviceList].sort((a, b) => Number(!!b.popular) - Number(!!a.popular)));
        setBarbers(barberList.filter((b) => b.available));
        setAwayBarbers(barberList.filter((b) => !b.available));
      })
      .catch((err) => {
        console.error('No se pudieron cargar los servicios y barberos', err);
        setLoadError('No pudimos cargar los servicios. Revisa tu conexión e intenta de nuevo.');
      })
      .finally(() => setLoadingCatalog(false));
  }, []);

  const loadBusy = useCallback((days: string[]) => {
    // Un día: consulta directa. Varios (al abrir, hasta 90): una sola consulta con todo el rango
    const request: Promise<(readonly [string, BusySlot[]])[]> = days.length === 1
      ? getBusySlots(days[0]).then((list) => [[days[0], list] as const])
      : getBusySlotsRange(days[0], days[days.length - 1]).then((byDay) => days.map((d) => [d, byDay[d] ?? []] as const));
    return request
      .then((entries) => {
        setBusyByDate((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        setLoadError('');
      })
      .catch((err) => {
        console.error('No se pudieron cargar las horas ocupadas', err);
        setLoadError('No pudimos cargar la disponibilidad. Intenta de nuevo en un momento.');
      });
  }, []);

  // Al abrir: la disponibilidad de todos los días que se pueden reservar
  useEffect(() => {
    loadBusy(Array.from({ length: businessConfig.daysAhead }, (_, i) => addDays(todayKey(), i))).finally(() => setLoadingBusy(false));
  }, [loadBusy]);

  const items = value.items;
  const hasItems = items.length > 0;
  const units = cartUnits(items);
  // Con barbero elegido, sus precios; si no, los generales (el que atienda puede cobrar distinto)
  const total = cartPriceFor(items, value.barber);
  // Los servicios se atienden uno detrás de otro: se busca un hueco del largo de todos
  const duration = cartDuration(items) || 30;
  const role = cartRole(items) ?? 'barbero';
  // Cada cuántos minutos puede empezar una cita (Panel → Configuración → Reglas)
  const step = businessConfig.slotStep;
  // Horario propio de cada barbero: puede trabajar antes o después del horario del salón
  const workHoursOf = (id: string) => barbers.find((b) => b.id === id)?.workHours;
  const freeTimes = (day: string, barberIds: string[]) =>
    busyByDate[day] ? generateSlots(day, busyByDate[day], barberIds, duration, step, workHoursOf).map((s) => s.time) : [];

  // Solo se ofrece el equipo que hace los servicios elegidos (Panel → Configuración → Barberos)
  const team = barbers.filter((b) => b.role === role && doesAll(b, items));
  const teamAway = awayBarbers.filter((b) => b.role === role && doesAll(b, items));
  // Sin barbero elegido, ¿alguno cobra distinto del precio general?
  const pricesVary = !value.barber && team.some((b) => cartPriceFor(items, b) !== cartPriceFor(items, null));
  // «El primero que esté libre» se puede apagar en Panel → Configuración → Reglas
  const allowAny = businessConfig.allowAnyBarber;
  const allIds = team.map((b) => b.id);
  const mustChoose = !allowAny && !value.barber;
  const selectedIds = value.barber ? [value.barber.id] : allIds;

  // Si la persona no ha elegido fecha, se propone el primer día con horas libres
  const firstOpenDay = dates.find((d) => freeTimes(d, selectedIds).length > 0) ?? dates[0];
  const date = value.date || firstOpenDay;

  // Al cambiar de día se vuelve a consultar ese día, por si alguien acaba de reservar
  useEffect(() => {
    if (value.date) loadBusy([value.date]);
  }, [value.date, loadBusy]);

  // El día propuesto no se fija hasta que la persona toca un día o una hora: así se recalcula
  // al cambiar el pedido (más servicios = se necesita un hueco más largo) o el barbero
  const update = (patch: Partial<Appointment>) => onChange({ ...value, ...patch });

  // Al elegir algo, la pantalla baja sola a la siguiente pregunta
  const scrollTo = (ref: React.RefObject<HTMLElement>) =>
    window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90);

  // Sumar o quitar servicios cambia el tiempo total: la hora elegida se vuelve a escoger
  const changeService = (service: Service, delta: number) => {
    const next = changeQty(items, service, delta);
    const nextRole = cartRole(next);
    const candidates = barbers.filter((b) => b.role === nextRole && doesAll(b, next));
    // Si el profesional elegido no hace estos servicios, se quita; si hay que elegir y solo hay uno, se elige solo
    const keep = value.barber && value.barber.role === nextRole && doesAll(value.barber, next) ? value.barber : null;
    const barber = keep ?? (!allowAny && candidates.length === 1 ? candidates[0] : null);
    update({ items: next, barber, time: '' });
  };
  const chooseDay = (key: string) => {
    update({ date: key, time: '' });
    // Si ya hay barbero elegido, directo a las horas
    scrollTo(value.barber ? timeRef : barberRef);
  };
  const chooseBarber = (barber: Barber | null) => {
    // Se queda en el día que se está viendo si esa persona tiene horas; si no, se propone su primer día libre
    const ids = barber ? [barber.id] : allIds;
    update({ barber, time: '', date: value.date || (freeTimes(date, ids).length > 0 ? date : '') });
    scrollTo(timeRef);
  };

  const allSlots = hasItems && !mustChoose && busyByDate[date] ? generateSlots(date, busyByDate[date], selectedIds, duration, step, workHoursOf) : [];
  const freeCount = allSlots.length;
  // Recomendadas: pegadas a otra cita (el día queda compacto). Si no hay ninguna, se muestran todas igual.
  const recommended = allSlots.filter((s) => s.recommended);
  const others = recommended.length ? allSlots.filter((s) => !s.recommended) : allSlots;
  const morning = others.filter((s) => s.time < '12:00');
  const afternoon = others.filter((s) => s.time >= '12:00');
  const nextDayForBarber = value.barber
    ? dates.find((d) => d > date && freeTimes(d, [value.barber!.id]).length > 0)
    : undefined;
  const ready = hasItems && !!value.time && !mustChoose;
  // Lo que falta, para el botón de abajo: día → con quién → hora
  const nextStep = !value.date
    ? { ref: dayRef, label: 'Siguiente: elegir el día' }
    : mustChoose
      ? { ref: barberRef, label: 'Siguiente: elegir con quién' }
      : { ref: timeRef, label: 'Siguiente: elegir la hora' };

  const dayStatus = (key: string) => {
    if (!hoursFor(key)) return { label: 'Cerrado', tone: 'off' as const };
    if (specialDayOf(key) === 'walk-in') return { label: 'Llegada', tone: 'off' as const };
    if (!busyByDate[key]) return { label: '…', tone: 'muted' as const };
    const n = freeTimes(key, selectedIds).length;
    if (n === 0) return { label: 'Lleno', tone: 'off' as const };
    return { label: `${n} libres`, tone: n <= 3 ? ('few' as const) : ('ok' as const) };
  };

  const slotButton = ({ time, available, recommended: rec }: { time: string; available: boolean; recommended?: boolean }) => (
    <button
      key={time}
      onClick={() => available && update({ date, time })}
      disabled={!available}
      aria-pressed={value.time === time}
      title={available ? undefined : 'Ocupado'}
      className={`py-2.5 rounded-xl text-sm font-mono font-medium border transition-all ${
        value.time === time
          ? 'border-gold bg-gold text-dark font-bold'
          : !available
            ? 'border-white/[0.04] text-zinc-700 line-through cursor-not-allowed'
            : rec
              ? 'border-gold/50 text-gold bg-black/30 hover:bg-gold/15'
              : 'border-white/10 text-zinc-200 hover:border-gold/50 hover:text-gold bg-white/[0.03]'
      }`}
    >
      <span className="block leading-tight">{time12Parts(time).hm}</span>
      <span className="block text-[10px] font-sans opacity-75 leading-tight">{time12Parts(time).suffix}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-7">
        {loadError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{loadError}</div>
        )}

        <section>
          <SectionTitle number={1} hint="Puedes elegir varios y la cantidad de cada uno">¿Qué te quieres hacer?</SectionTitle>
          {loadingCatalog ? (
            <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-gold" /></div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {services.map((service) => {
                const qty = items.find((i) => i.service.id === service.id)?.qty ?? 0;
                const selected = qty > 0;
                // Manicura y barbería los atiende gente distinta: se reservan por separado
                const otherRole = hasItems && roleFor(service) !== role;
                const full = units >= MAX_CART_UNITS;
                return (
                  <div
                    key={service.id}
                    className={`rounded-xl border transition-all ${
                      selected ? 'border-gold bg-gold/10 shadow-gold' : 'border-white/10 bg-white/[0.03] hover:border-gold/40'
                    } ${otherRole ? 'opacity-40' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => !otherRole && changeService(service, 1)}
                      disabled={otherRole || (full && !selected)}
                      aria-label={`Agregar ${service.name}`}
                      className="w-full text-left p-3.5 pb-2 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-start gap-2 text-white text-sm font-medium leading-snug">
                          <CategoryIcon category={service.category} size={17} className={`shrink-0 mt-px ${selected ? 'text-gold' : 'text-gold/70'}`} />
                          {service.name}
                        </span>
                        {service.popular && !selected && <span className="text-[9px] font-bold uppercase tracking-wide text-gold bg-gold/15 px-1.5 py-0.5 rounded shrink-0">Popular</span>}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="flex items-center gap-1 text-zinc-500 text-xs"><Clock size={11} />{service.duration} min</span>
                        <span className="font-mono text-sm font-bold gold-text">{formatCOP(priceFor(value.barber, service))}</span>
                      </div>
                    </button>
                    <div className="flex items-center justify-between gap-2 px-3.5 pb-3">
                      {otherRole ? (
                        <span className="text-[11px] text-zinc-500">Se reserva aparte</span>
                      ) : selected ? (
                        <span className="text-[11px] font-semibold text-gold">{formatCOP(qty * priceFor(value.barber, service))}</span>
                      ) : (
                        <span className="text-[11px] text-zinc-500">Toca para agregar</span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => changeService(service, -1)}
                          disabled={!selected}
                          aria-label={`Quitar un ${service.name}`}
                          className="w-8 h-8 rounded-full border border-white/15 text-zinc-300 flex items-center justify-center hover:border-gold/50 hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus size={14} />
                        </button>
                        <span className={`w-6 text-center font-mono text-base font-bold ${selected ? 'text-gold' : 'text-zinc-600'}`} aria-label={`Cantidad de ${service.name}`}>{qty}</span>
                        <button
                          type="button"
                          onClick={() => changeService(service, 1)}
                          disabled={otherRole || full}
                          aria-label={`Agregar un ${service.name}`}
                          className="w-8 h-8 rounded-full border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/15 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
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
          <div className="space-y-7">
            <section ref={cartRef} className="scroll-mt-4">
              <SectionTitle number={2} hint="Uno detrás de otro, con el mismo barbero">Tu pedido</SectionTitle>
              <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-4">
                <ul className="space-y-2">
                  {items.map(({ service, qty }) => (
                    <li key={service.id} className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-bold text-gold w-8 shrink-0">{qty} ×</span>
                      <span className="flex-1 min-w-0 text-white truncate">{service.name}</span>
                      <span className="font-mono text-zinc-300 shrink-0">{formatCOP(qty * priceFor(value.barber, service))}</span>
                      <button
                        type="button"
                        onClick={() => changeService(service, -qty)}
                        aria-label={`Quitar ${service.name} del pedido`}
                        className="w-7 h-7 rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-white/10 mt-3 pt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-zinc-400 text-xs">{units} {units === 1 ? 'servicio' : 'servicios'} · {duration} min en total</p>
                    {units >= MAX_CART_UNITS && <p className="text-amber-400 text-[11px] mt-0.5">Máximo {MAX_CART_UNITS} servicios por reserva.</p>}
                    {pricesVary && <p className="text-zinc-500 text-[11px] mt-0.5">El valor puede cambiar según el barbero que te atienda.</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-500 text-[11px] uppercase tracking-wider">Total</p>
                    <p className="font-mono text-xl font-bold gold-text">{formatCOP(total)}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => scrollTo(dayRef)}
                className="mt-3 w-full py-2.5 rounded-full border border-gold/40 text-gold text-sm font-semibold hover:bg-gold/10 transition-colors"
              >
                Listo, elegir el día
              </button>
            </section>

            <section ref={dayRef} className="scroll-mt-4">
              <SectionTitle number={3} hint={value.barber ? `Disponibilidad de ${value.barber.shortName}` : 'Disponibilidad de todo el equipo'}>
                ¿Qué día?
              </SectionTitle>
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                {dates.map((key, i) => {
                  const selected = date === key;
                  const status = dayStatus(key);
                  const holiday = holidayName(key);
                  return (
                    <button
                      key={key}
                      title={holiday ? `Festivo: ${holiday}` : undefined}
                      onClick={() => chooseDay(key)}
                      aria-pressed={selected}
                      className={`flex flex-col items-center px-2.5 py-2.5 rounded-xl border shrink-0 min-w-[62px] transition-all ${
                        selected ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                      } ${status.tone === 'off' && !selected ? 'opacity-45' : ''}`}
                    >
                      <span className={`text-[10px] font-semibold uppercase ${selected ? 'text-gold' : 'text-zinc-500'}`}>
                        {i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : dayShort(key)}
                      </span>
                      <span className={`text-lg font-bold font-mono leading-tight ${selected ? 'text-gold' : 'text-white'}`}>{dayOfMonth(key)}</span>
                      <span className={`text-[10px] font-medium whitespace-nowrap ${
                        status.tone === 'ok' ? 'text-emerald-400' : status.tone === 'few' ? 'text-amber-400' : 'text-zinc-500'
                      }`}>
                        {status.label}
                      </span>
                      {holiday && <span className="text-[9px] text-gold font-semibold mt-0.5">Festivo</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-zinc-500 text-xs mt-1">
                {formatDateLong(date)}.
                {holidayName(date) && <span className="text-gold"> Festivo: {holidayName(date)}.</span>}
              </p>
            </section>

            <section ref={barberRef} className="scroll-mt-4">
              <SectionTitle number={4}>¿Con quién?</SectionTitle>
              <div className="grid gap-2">
                {[...(allowAny ? [null] : []), ...team].map((barber) => {
                  const ids = barber ? [barber.id] : allIds;
                  const times = freeTimes(date, ids);
                  const selected = barber ? value.barber?.id === barber.id : value.barber === null;
                  const none = !loadingBusy && times.length === 0;
                  return (
                    <button
                      key={barber?.id ?? 'any'}
                      onClick={() => chooseBarber(barber)}
                      aria-pressed={selected}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        selected ? 'border-gold bg-gold/10' : 'border-white/10 bg-white/[0.03] hover:border-gold/40'
                      } ${none && !selected ? 'opacity-55' : ''}`}
                    >
                      {barber ? (
                        <BarberAvatar barber={barber} className={`w-12 h-12 rounded-full text-sm shrink-0 border-2 ${selected ? 'border-gold' : 'border-transparent'}`} />
                      ) : (
                        <span className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center border-2 ${selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-zinc-400'}`}>
                          <Users size={20} />
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm font-semibold ${selected ? 'text-gold' : 'text-white'}`}>
                          {barber ? barber.name : 'El primero que esté libre'}
                        </span>
                        <span className="block text-xs text-zinc-500 truncate">
                          {barber ? barber.specialties.slice(0, 3).join(' · ') : 'Más horarios para elegir'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {loadingBusy ? (
                          <Loader2 size={14} className="animate-spin text-zinc-500" />
                        ) : none ? (
                          <span className="text-[11px] font-semibold text-zinc-500">Sin horas este día</span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {times.length} {times.length === 1 ? 'hora libre' : 'horas libres'}
                            </span>
                            <span className="block text-[11px] text-zinc-500 mt-0.5">desde las {times[0]}</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
                {teamAway.map((barber) => (
                  <div
                    key={barber.id}
                    aria-disabled="true"
                    className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.015] opacity-50 cursor-not-allowed"
                  >
                    <BarberAvatar barber={barber} className="w-12 h-12 rounded-full text-sm shrink-0 grayscale" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-zinc-300">{barber.name}</span>
                      <span className="block text-xs text-zinc-500 truncate">{barber.specialties.slice(0, 3).join(' · ')}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-zinc-500">No disponible por ahora</span>
                  </div>
                ))}
              </div>
            </section>

            <section ref={timeRef} className="scroll-mt-4">
              <SectionTitle number={5} hint={freeCount > 0 && `${freeCount} ${freeCount === 1 ? "hora libre" : "horas libres"}`}>¿A qué hora?</SectionTitle>
              {loadingBusy && !busyByDate[date] ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gold" /></div>
              ) : freeCount > 0 ? (
                <div className="space-y-4">
                  {recommended.length > 0 && (
                    <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-3">
                      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gold font-semibold">
                        <Sparkles size={13} /> Horas recomendadas
                      </p>
                      <p className="text-[11px] text-zinc-400 mb-2.5">Van justo antes o después de otra cita: así no se pierde tiempo.</p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{recommended.map(slotButton)}</div>
                    </div>
                  )}
                  {recommended.length > 0 && others.length > 0 && (
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">Otras horas</p>
                  )}
                  {[{ label: 'Mañana', icon: Sun, list: morning }, { label: 'Tarde', icon: Sunset, list: afternoon }]
                    .filter((g) => g.list.length > 0)
                    .map(({ label, icon: Icon, list }) => (
                      <div key={label}>
                        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
                          <Icon size={13} className="text-gold/70" /> {label}
                        </p>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{list.map(slotButton)}</div>
                      </div>
                    ))}
                  <p className="text-[11px] text-zinc-600">Las horas se ajustan a lo que dura tu pedido ({duration} min): cada una empieza cuando termina la cita anterior.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center gap-3 py-5 px-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <CalendarX size={22} className="text-zinc-500" />
                  <p className="text-zinc-400 text-sm">
                    {!hoursFor(date)
                      ? 'Este día la barbería está cerrada.'
                      : specialDayOf(date) === 'walk-in'
                        ? 'Este día no hay reservas: atendemos por orden de llegada. ¡Te esperamos en la barbería!'
                        : mustChoose
                          ? 'Elige con quién quieres tu cita para ver sus horas libres.'
                          : value.barber
                            ? `${value.barber.shortName} no tiene horas libres este día.`
                            : 'No quedan horas libres este día.'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {nextDayForBarber && (
                      <button onClick={() => update({ date: nextDayForBarber, time: '' })} className="px-3.5 py-2 rounded-full border border-gold/40 text-gold text-xs font-semibold hover:bg-gold/10">
                        Ver {dayShort(nextDayForBarber).toLowerCase()} {dayOfMonth(nextDayForBarber)} con {value.barber?.shortName}
                      </button>
                    )}
                    {allowAny && value.barber && freeTimes(date, allIds).length > 0 && (
                      <button onClick={() => update({ barber: null, date, time: '' })} className="px-3.5 py-2 rounded-full border border-white/15 text-zinc-300 text-xs font-semibold hover:border-gold/40 hover:text-gold">
                        Ver otro barbero este día
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-5 sm:px-6 py-4 bg-[#0d0d0d]">
        {/* Siempre a la vista: con todo listo continúa; si no, lleva al siguiente paso sin tener que bajar */}
        <button
          disabled={!hasItems}
          onClick={() => (ready ? onContinue() : scrollTo(nextStep.ref))}
          className="w-full btn-gold py-3.5 rounded-full font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="flex flex-col items-center leading-tight">
            {!hasItems
              ? 'Elige uno o varios servicios'
              : ready
                ? `Continuar · ${dayShort(date)} ${dayOfMonth(date)} a las ${time12(value.time)} · ${formatCOP(total)}`
                : (
                  <>
                    <span className="flex items-center gap-1.5">{nextStep.label} <ChevronDown size={18} className="animate-bounce" /></span>
                    <span className="text-xs font-normal opacity-80 mt-0.5">{units} {units === 1 ? 'servicio' : 'servicios'} · {formatCOP(total)}</span>
                  </>
                )}
          </span>
        </button>
      </div>
    </div>
  );
}
