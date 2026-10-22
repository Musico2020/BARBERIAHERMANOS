import { useEffect, useState } from 'react';
import {
  CalendarDays, Wallet, History, User, LogOut, Star, Check, X, CheckCheck, MessageCircle, Clock,
  KeyRound, Loader2, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Scissors, CalendarClock, UserPlus, ArrowLeft, Pencil, Ban, Trash2, Images,
} from 'lucide-react';
import BarberShifts from './BarberShifts';
import BarberLogin from './BarberLogin';
import { usePageMeta } from '../../hooks/usePageMeta';
import { getBarberBookings, setBarberBookingStatus, changeBarberPin, setBarberWorkHours, barberDeleteBooking, BarberPortalError } from '../../services/barberPortal';
import EditBookingModal from '../../components/admin/EditBookingModal';
import WorkHoursEditor, { validWorkHours } from '../../components/admin/WorkHoursEditor';
import { formatCOP } from '../../data';
import { todayKey, addDays, dayShort, dayOfMonth, monthShort, monthLong, formatDateLong, nowMinutes, timeToMinutes, time12, time12Parts } from '../../lib/dates';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import type { Barber, Booking, WorkHours } from '../../types';
import BarberAvatar from '../../components/common/BarberAvatar';
import ShiftedTag from '../../components/common/ShiftedTag';
import { isShifted } from '../../lib/shifted';
import ThemeToggle from '../../components/common/ThemeToggle';
import NewClientModal from '../../components/admin/NewClientModal';
import BarberHome from './BarberHome';
import BarberWorks from './BarberWorks';
import { barberEarnings, barberShare } from '../../lib/earnings';
import { Timeline } from '../../components/admin/MobileAgenda';
import { getAllServices } from '../../services/services';
import { Panel, KpiCard, StatusBadge, Initials, EmptyState } from '../../components/admin/ui';
import { GoldBarChart } from '../../components/admin/charts';

// Portal del barbero: su agenda, lo que gana, su historial y su perfil.
// Cada consulta al servidor va con el PIN, que se valida allá.

type BarberTab = 'inicio' | 'agenda' | 'turnos' | 'trabajos' | 'ganancias' | 'historial' | 'perfil';

const TABS: { id: BarberTab; label: string; icon: React.ElementType }[] = [
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'turnos', label: 'Turnos', icon: CalendarClock },
  { id: 'trabajos', label: 'Mis trabajos', icon: Images },
  { id: 'ganancias', label: 'Ganancias', icon: Wallet },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'perfil', label: 'Mi perfil', icon: User },
];

const isOpen = (b: Booking) => b.status === 'pending' || b.status === 'confirmed';
const whatsappLink = (phone: string) => `https://wa.me/57${phone.replace(/\D/g, '').slice(-10)}`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function inMinutes(time: string): string {
  const diff = timeToMinutes(time) - nowMinutes();
  if (diff <= 0) return 'ahora';
  if (diff < 60) return `en ${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `en ${h} h${m ? ` ${m} min` : ''}`;
}

// ---------------------------------------------------------------------------

function AppointmentCard({ b, onStatus, busy, onEdit, onDelete }: { b: Booking; onStatus: (id: string, s: Booking['status']) => void; busy: boolean; onEdit: (b: Booking) => void; onDelete: (b: Booking) => void }) {
  return (
    <li className={`flex gap-3 sm:gap-4 rounded-2xl border p-3.5 sm:p-4 transition-colors ${
      isOpen(b) ? 'border-white/10 bg-white/[0.03]' : 'border-white/[0.05] bg-white/[0.015]'
    } ${b.status === 'cancelled' || b.status === 'no-show' ? 'opacity-55' : ''}`}>
      <div className="flex flex-col items-center w-14 shrink-0 pt-0.5">
        <span className="font-mono text-lg font-bold text-gold leading-none">{time12Parts(b.time).hm}</span>
        <span className="text-[10px] text-gold/80 mt-0.5">{time12Parts(b.time).suffix}</span>
        <span className="w-px flex-1 bg-gradient-to-b from-gold/40 to-transparent mt-2" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{b.clientName}</p>
            <p className="text-zinc-400 text-sm truncate">{b.serviceName}</p>
          </div>
          <StatusBadge status={b.status} />
        </div>
        {isShifted(b) && <div className="mt-1.5"><ShiftedTag b={b} /></div>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
          <span className="font-mono text-gold font-semibold">{formatCOP(b.price)}</span>
          <a href={whatsappLink(b.clientPhone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300">
            <MessageCircle size={12} /> {b.clientPhone}
          </a>
        </div>
        {isOpen(b) && (
          <div className="grid grid-cols-2 sm:flex gap-2 mt-3">
            {b.status === 'pending' && (
              <button disabled={busy} onClick={() => onStatus(b.id, 'confirmed')} className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-semibold hover:bg-sky-500/20 disabled:opacity-50">
                <CheckCheck size={14} /> Confirmar
              </button>
            )}
            <button disabled={busy} onClick={() => onStatus(b.id, 'completed')} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 disabled:opacity-50">
              <Check size={14} /> Completado
            </button>
            <button disabled={busy} onClick={() => onStatus(b.id, 'no-show')} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-500/25 text-rose-300 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-50">
              <X size={14} /> No asistió
            </button>
          </div>
        )}
        {/* Editar, cancelar o eliminar (solo sus propias citas) */}
        <div className="flex flex-wrap gap-2 mt-2">
          <button disabled={busy} onClick={() => onEdit(b)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10 disabled:opacity-50">
            <Pencil size={13} /> Editar
          </button>
          {isOpen(b) && (
            <button
              disabled={busy}
              onClick={() => { if (window.confirm(`¿Cancelar la cita de ${b.clientName} (${time12(b.time)})? La hora queda libre.`)) onStatus(b.id, 'cancelled'); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-zinc-300 text-xs font-semibold hover:bg-white/5 disabled:opacity-50"
            >
              <Ban size={13} /> Cancelar
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => { if (window.confirm(`¿Eliminar la cita de ${b.clientName} (${time12(b.time)})? No se puede deshacer.`)) onDelete(b); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/25 text-rose-300 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>
    </li>
  );
}

function AgendaTab({ appts, barber, onStatus, busyId, onNewClient, onEdit, onDelete }: { appts: Booking[]; barber: Barber; onStatus: (id: string, s: Booking['status']) => void; busyId: string | null; onNewClient: () => void; onEdit: (b: Booking) => void; onDelete: (b: Booking) => void }) {
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const circleDays = Array.from({ length: 21 }, (_, i) => addDays(today, i - 3));
  const [day, setDay] = useState(today);
  const [view, setView] = useState<'lista' | 'linea'>('lista');
  const [durations, setDurations] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    getAllServices().then((s) => setDurations(new Map(s.map((x) => [x.id, x.duration])))).catch(() => undefined);
  }, []);
  const list = appts.filter((b) => b.date === day).sort((a, b) => a.time.localeCompare(b.time));
  const active = list.filter((b) => b.status !== 'cancelled');
  const done = list.filter((b) => b.status === 'completed');
  const pendingCount = list.filter(isOpen).length;
  const earned = barberEarnings(done, barber);
  const next = day === today ? list.find((b) => isOpen(b) && timeToMinutes(b.time) + 30 >= nowMinutes()) : undefined;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onNewClient} className="btn-gold w-full sm:w-auto min-h-[50px] px-6 rounded-2xl text-base font-bold">
        <UserPlus size={19} /> <span>Cliente nuevo</span>
      </button>
      {/* Teléfono: días en círculos */}
      <div className="sm:hidden flex gap-3 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        {circleDays.map((d) => {
          const count = appts.filter((b) => b.date === d && isOpen(b)).length;
          const selected = d === day;
          return (
            <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={selected} className="relative flex flex-col items-center gap-1 shrink-0">
              <span className={`w-14 h-14 rounded-full border-2 flex items-center justify-center font-mono text-xl font-bold ${
                selected ? 'bg-gold border-gold text-dark' : d === today ? 'border-emerald-400 text-emerald-300' : 'border-gold/40 text-white'
              } ${d < today && !selected ? 'opacity-50' : ''}`}>
                {dayOfMonth(d)}
              </span>
              {count > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gold text-dark text-[11px] font-bold flex items-center justify-center">{count}</span>}
              <span className={`text-[11px] ${selected ? 'text-gold font-semibold' : 'text-zinc-400'}`}>{d === today ? 'Hoy' : dayShort(d)}</span>
            </button>
          );
        })}
      </div>
      <div className="sm:hidden grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/10">
        {([['lista', 'Lista'], ['linea', 'Línea de tiempo']] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`py-2.5 rounded-xl text-sm font-semibold ${view === v ? 'bg-gold text-dark' : 'text-zinc-300'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="hidden sm:flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {days.map((d, i) => {
          const count = appts.filter((b) => b.date === d && isOpen(b)).length;
          const selected = d === day;
          return (
            <button
              key={d}
              onClick={() => setDay(d)}
              aria-pressed={selected}
              className={`flex flex-col items-center min-w-[64px] px-3 py-2.5 rounded-2xl border shrink-0 transition-all ${
                selected ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <span className={`text-[10px] font-semibold uppercase ${selected ? 'text-gold' : 'text-zinc-500'}`}>{i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : dayShort(d)}</span>
              <span className={`text-xl font-bold font-mono ${selected ? 'text-gold' : 'text-white'}`}>{dayOfMonth(d)}</span>
              <span className={`text-[10px] ${count ? 'text-emerald-400 font-semibold' : 'text-zinc-600'}`}>{count ? `${count} citas` : monthShort(d)}</span>
            </button>
          );
        })}
      </div>

      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Citas" value={active.length} sub={day === today ? 'hoy' : formatDateLong(day)} icon={CalendarDays} accent="blue" />
        <KpiCard label="Por atender" value={pendingCount} sub="pendientes o confirmadas" icon={Clock} accent="violet" />
        <KpiCard label="Completadas" value={done.length} sub={`de ${active.length}`} icon={CheckCircle2} accent="emerald" />
        <KpiCard label="Tu ganancia" value={formatCOP(earned)} sub="de los servicios completados" icon={Wallet} />
      </div>

      {next && (
        <div className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/20 via-gold/[0.06] to-transparent p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Próxima cita · {inMinutes(next.time)}</p>
          <div className="flex items-end justify-between gap-4 mt-2">
            <div className="flex items-center gap-3 min-w-0">
              <Initials name={next.clientName} className="w-12 h-12 text-sm" />
              <div className="min-w-0">
                <p className="text-white text-lg font-semibold truncate">{next.clientName}</p>
                <p className="text-zinc-300 text-sm truncate">{next.serviceName}</p>
              </div>
            </div>
            <span className="font-mono text-3xl font-bold gold-text shrink-0 text-right">{time12Parts(next.time).hm}<span className="block font-sans text-xs text-gold/80">{time12Parts(next.time).suffix}</span></span>
          </div>
        </div>
      )}

      {view === 'linea' && (
        <div className="sm:hidden">
          <h3 className="text-white font-semibold capitalize mb-3">{day === today ? 'Hoy · ' : ''}{formatDateLong(day)}</h3>
          <Timeline date={day} barber={barber} bookings={appts} durations={durations} />
        </div>
      )}

      <div className={view === 'linea' ? 'hidden sm:block' : ''}>
      <Panel title={day === today ? 'Agenda de hoy' : formatDateLong(day)} subtitle={`${active.length} ${active.length === 1 ? 'cita' : 'citas'}`} bodyClassName="p-3 sm:p-4">
        {list.length === 0 ? (
          <EmptyState icon={CalendarDays}>No tienes citas este día.</EmptyState>
        ) : (
          <ul className="space-y-2.5">
            {list.map((b) => <AppointmentCard key={b.id} b={b} onStatus={onStatus} busy={busyId === b.id} onEdit={onEdit} onDelete={onDelete} />)}
          </ul>
        )}
      </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Cuentas del mes: lo facturado, lo que se entrega al salón y lo que le queda al barbero */
function MonthSettlement({ done, barber, monthName }: { done: Booking[]; barber: Barber; monthName: string }) {
  const billed = done.reduce((s, b) => s + b.price, 0);
  const mine = barberEarnings(done, barber);
  const toSalon = billed - mine;
  return (
    <Panel title={`Cuentas de ${monthName}`} subtitle="Lo que te corresponde a ti y lo que le corresponde al administrador">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <dt className="text-zinc-400 text-xs uppercase tracking-wider">Facturado</dt>
          <dd className="font-serif text-2xl font-extrabold text-white mt-1">{formatCOP(billed)}</dd>
        </div>
        <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-4">
          <dt className="text-zinc-400 text-xs uppercase tracking-wider">Para el administrador</dt>
          <dd className="font-serif text-2xl font-extrabold text-gold mt-1">{formatCOP(toSalon)}</dd>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
          <dt className="text-zinc-400 text-xs uppercase tracking-wider">Te corresponde</dt>
          <dd className="font-serif text-2xl font-extrabold text-emerald-400 mt-1">{formatCOP(mine)}</dd>
        </div>
      </dl>
    </Panel>
  );
}

function EarningsTab({ appts, barber }: { appts: Booking[]; barber: Barber }) {
  const today = todayKey();
  const commission = (list: Booking[]) => barberEarnings(list, barber);
  const done = appts.filter((b) => b.status === 'completed');
  const weekStart = addDays(today, -6);
  const month = today.slice(0, 7);
  const doneToday = done.filter((b) => b.date === today);
  const doneWeek = done.filter((b) => b.date >= weekStart && b.date <= today);
  const doneMonth = done.filter((b) => b.date.startsWith(month));
  const series = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((d) => ({
    name: `${dayOfMonth(d)}`,
    revenue: commission(done.filter((b) => b.date === d)),
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Hoy" value={formatCOP(commission(doneToday))} sub={`${doneToday.length} servicios`} icon={Wallet} />
        <KpiCard label="Últimos 7 días" value={formatCOP(commission(doneWeek))} sub={`${doneWeek.length} servicios`} icon={Wallet} accent="emerald" />
        <KpiCard label={`En ${monthLong(today)}`} value={formatCOP(commission(doneMonth))} sub={`${doneMonth.length} servicios`} icon={Wallet} accent="violet" />
      </div>
      <MonthSettlement done={doneMonth} barber={barber} monthName={monthLong(today)} />
      <Panel title="Lo que has ganado" subtitle={`Lo que te queda por día · últimos 14 días`}>
        <GoldBarChart data={series} dataKey="revenue" nameKey="name" height={230} emptyText="Todavía no tienes servicios completados en estos días." />
      </Panel>
      <Panel title="Servicios completados hoy" subtitle={`${doneToday.length} servicios`} bodyClassName="p-3 sm:p-4">
        {doneToday.length === 0 ? (
          <EmptyState icon={Scissors}>Aún no has completado servicios hoy.</EmptyState>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {doneToday.sort((a, b) => a.time.localeCompare(b.time)).map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-2 py-3">
                <span className="font-mono text-sm text-zinc-400 w-[4.5rem] whitespace-nowrap">{time12(b.time)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{b.clientName}</p>
                  <p className="text-zinc-500 text-xs truncate">{b.serviceName} · {formatCOP(b.price)}</p>
                </div>
                <span className="font-mono text-emerald-400 text-sm font-semibold">+{formatCOP(barberShare(b, barber))}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HistoryTab({ appts }: { appts: Booking[] }) {
  const [nowY, nowM] = todayKey().split('-').map(Number);
  const [ym, setYm] = useState({ y: nowY, m: nowM });
  const key = `${ym.y}-${String(ym.m).padStart(2, '0')}`;
  const list = appts.filter((b) => b.date.startsWith(key)).sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time));
  const done = list.filter((b) => b.status === 'completed');
  const byDate = list.reduce<Record<string, Booking[]>>((acc, b) => { (acc[b.date] ??= []).push(b); return acc; }, {});
  const move = (dir: number) => setYm(({ y, m }) => {
    const n = m + dir;
    return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n };
  });
  const atPresent = ym.y === nowY && ym.m === nowM;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/10">
          <button onClick={() => move(-1)} aria-label="Mes anterior" className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-gold"><ChevronLeft size={16} /></button>
          <span className="text-white text-sm font-semibold min-w-[130px] text-center capitalize">{monthLong(`${key}-01`)} {ym.y}</span>
          <button onClick={() => move(1)} disabled={atPresent} aria-label="Mes siguiente" className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-gold disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
        <p className="text-right text-xs text-zinc-500">
          <span className="text-white font-semibold">{done.length}</span> completados · <span className="text-gold font-mono">{formatCOP(done.reduce((s, b) => s + b.price, 0))}</span>
        </p>
      </div>

      {list.length === 0 ? (
        <Panel><EmptyState icon={History}>No tienes citas en este mes.</EmptyState></Panel>
      ) : (
        Object.entries(byDate).map(([date, items]) => (
          <Panel key={date} title={formatDateLong(date)} subtitle={`${items.length} ${items.length === 1 ? 'cita' : 'citas'}`} bodyClassName="px-3 sm:px-4 pb-3 pt-2">
            <ul className="divide-y divide-white/[0.06]">
              {items.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-2 py-3">
                  <span className="font-mono text-sm text-gold w-[4.5rem] shrink-0 whitespace-nowrap">{time12(b.time)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{b.clientName}</p>
                    <p className="text-zinc-500 text-xs truncate">{b.serviceName} · {formatCOP(b.price)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Mi horario de trabajo: el barbero escoge día por día como el salón, su horario propio o descanso. */
function WorkHoursPanel({ barber, pin, onSaved }: { barber: Barber; pin: string; onSaved: (hours: WorkHours) => void }) {
  const [hours, setHours] = useState<WorkHours>(barber.workHours ?? {});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(hours) !== JSON.stringify(barber.workHours ?? {});

  const save = async () => {
    if (!validWorkHours(hours)) return setStatus({ ok: false, text: 'La hora de salida debe ser después de la de entrada.' });
    setSaving(true);
    setStatus(null);
    try {
      const result = await setBarberWorkHours(barber.id, pin, hours);
      if (result === 'OK') {
        onSaved(hours);
        setStatus({ ok: true, text: 'Horario guardado. Los clientes ya ven tus turnos con este horario.' });
      } else {
        setStatus({ ok: false, text: result === 'PIN_LOCKED' ? 'Demasiados intentos. Espera 15 minutos.' : result === 'INVALID_PIN' ? 'Tu PIN cambió. Sal y vuelve a entrar.' : 'Revisa las horas del horario.' });
      }
    } catch (err) {
      console.error('No se pudo guardar el horario', err);
      setStatus({ ok: false, text: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Mi horario de trabajo" subtitle="Hasta qué hora trabajas cada día. Fuera de tu horario no te reservan turnos">
      <WorkHoursEditor value={hours} onChange={(next) => { setHours(next); setStatus(null); }} />
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
        {status && (
          <p className={`flex items-center gap-1.5 text-sm ${status.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {status.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {status.text}
          </p>
        )}
        <button onClick={save} disabled={saving || !dirty} className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 sm:ml-auto">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />} Guardar mi horario
        </button>
      </div>
    </Panel>
  );
}

function ProfileTab({ barber, appts, pin, onPinChanged, onWorkHoursChanged }: { barber: Barber; appts: Booking[]; pin: string; onPinChanged: (pin: string) => void; onWorkHoursChanged: (hours: WorkHours) => void }) {
  const month = todayKey().slice(0, 7);
  const doneMonth = appts.filter((b) => b.status === 'completed' && b.date.startsWith(month));
  const revenue = doneMonth.reduce((s, b) => s + b.price, 0);
  const mine = barberEarnings(doneMonth, barber);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  const save = async () => {
    if (form.current !== pin) return setStatus({ ok: false, text: 'El PIN actual no es correcto.' });
    if (!/^\d{4}$/.test(form.next)) return setStatus({ ok: false, text: 'El PIN nuevo debe tener 4 números.' });
    if (form.next !== form.confirm) return setStatus({ ok: false, text: 'La confirmación no coincide.' });
    if (form.next === form.current) return setStatus({ ok: false, text: 'El PIN nuevo debe ser distinto al actual.' });
    setSaving(true);
    setStatus(null);
    try {
      const result = await changeBarberPin(barber.id, form.current, form.next);
      if (result === 'OK') {
        onPinChanged(form.next);
        setForm({ current: '', next: '', confirm: '' });
        setStatus({ ok: true, text: 'PIN cambiado. Úsalo la próxima vez que entres.' });
      } else {
        setStatus({ ok: false, text: result === 'PIN_LOCKED' ? 'Demasiados intentos. Espera 15 minutos.' : 'No se pudo cambiar el PIN.' });
      }
    } catch (err) {
      console.error('No se pudo cambiar el PIN', err);
      setStatus({ ok: false, text: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  const pinInput = (label: string, key: keyof typeof form, autoComplete: string) => (
    <label className="block">
      <span className="text-xs text-zinc-400 font-medium block mb-1.5">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        maxLength={4}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: digits(e.target.value) })}
        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-mono tracking-[0.5em] focus:outline-none focus:border-gold/50"
      />
    </label>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <div className="table-card p-6 text-center">
          <BarberAvatar barber={barber} className="w-24 h-24 rounded-full text-2xl mx-auto border-2 border-gold/50 shadow-gold" />
          <h2 className="font-serif text-2xl font-bold text-white mt-4">{barber.name}</h2>
          <p className="flex items-center justify-center gap-1.5 mt-1 text-sm">
            <Star size={14} className="text-gold fill-gold" />
            <span className="text-white font-mono font-semibold">{barber.rating}</span>
            <span className="text-zinc-500">({barber.reviewCount} reseñas)</span>
          </p>
          {barber.bio && <p className="text-zinc-400 text-sm mt-4 leading-relaxed">{barber.bio}</p>}
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {barber.specialties.map((s) => (
              <span key={s} className="text-xs px-3 py-1.5 rounded-full border border-gold/25 bg-gold/10 text-gold">{s}</span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Servicios" value={doneMonth.length} sub="este mes" icon={Scissors} />
          <KpiCard label="Facturado" value={formatCOP(revenue)} sub="este mes" icon={Wallet} />
          <KpiCard label="Te corresponde" value={formatCOP(mine)} sub="este mes" icon={Wallet} accent="emerald" />
          <KpiCard label="Para el administrador" value={formatCOP(revenue - mine)} sub="este mes" icon={Star} accent="violet" />
        </div>
      </div>

      <Panel title="Cambiar mi PIN" subtitle="El PIN de 4 números con el que entras a este portal">
        <div className="space-y-4">
          {pinInput('PIN actual', 'current', 'current-password')}
          {pinInput('PIN nuevo', 'next', 'new-password')}
          {pinInput('Repite el PIN nuevo', 'confirm', 'new-password')}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-5 border-t border-white/[0.06]">
          {status && (
            <p role="status" className={`flex items-center gap-2 text-sm ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {status.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {status.text}
            </p>
          )}
          <button onClick={save} disabled={saving} className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 sm:ml-auto">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Cambiar PIN
          </button>
        </div>
      </Panel>

      <div className="lg:col-span-2">
        <WorkHoursPanel barber={barber} pin={pin} onSaved={onWorkHoursChanged} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BarberDashboard({ barber, pin, onLogout, onPinChanged, onWorkHoursChanged }: { barber: Barber; pin: string; onLogout: () => void; onPinChanged: (pin: string) => void; onWorkHoursChanged: (hours: WorkHours) => void }) {
  const [tab, setTabState] = useState<BarberTab>(() => (window.innerWidth < 1024 ? 'inicio' : 'agenda'));
  const setTab = (next: BarberTab) => { setTabState(next); window.scrollTo(0, 0); };
  const [appts, setAppts] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shiftNotice, setShiftNotice] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  // Porcentajes por servicio (para lo que gana en cada uno): al cargarlos se vuelve a dibujar
  const [, setRatesLoaded] = useState(false);
  useEffect(() => { getAllServices().then(() => setRatesLoaded(true)).catch(() => undefined); }, []);
  const removeBooking = async (b: Booking) => {
    setBusyId(b.id);
    try {
      const result = await barberDeleteBooking(barber.id, pin, b.id);
      if (result === 'OK') { setAppts((prev) => prev.filter((x) => x.id !== b.id)); setShiftNotice(`Se eliminó la cita de ${b.clientName}.`); }
      else if (result === 'INVALID_PIN' || result === 'PIN_LOCKED') onLogout();
      else setError('Esa cita ya no existe.');
    } catch (err) {
      handlePortalError(err, 'No se pudo eliminar la cita. Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };
  const [error, setError] = useState('');

  const handlePortalError = (err: unknown, fallback: string) => {
    console.error(fallback, err);
    if (err instanceof BarberPortalError && (err.code === 'INVALID_PIN' || err.code === 'PIN_LOCKED')) {
      onLogout();
      return;
    }
    setError(fallback);
  };

  useAutoRefresh(() => {
    getBarberBookings(barber.id, pin)
      .then((list) => { setAppts(list); setError(''); setLoaded(true); })
      .catch((err) => handlePortalError(err, 'No se pudieron cargar tus citas. Se reintentará automáticamente.'));
  }, [barber.id, pin]);

  const updateStatus = async (id: string, status: Booking['status']) => {
    setBusyId(id);
    try {
      await setBarberBookingStatus(barber.id, pin, id, status);
      setAppts((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
      setError('');
      // Si terminó antes de tiempo, la base adelantó las citas pegadas: se recarga la agenda
      if (status === 'completed') {
        const fresh = await getBarberBookings(barber.id, pin);
        setAppts(fresh);
        const since = Date.now() - 2 * 60 * 1000;
        const moved = fresh.filter((b) => isShifted(b) && b.shiftedAt && new Date(b.shiftedAt).getTime() >= since);
        if (moved.length) setShiftNotice(`Se ${moved.length === 1 ? 'adelantó 1 cita' : `adelantaron ${moved.length} citas`}: ${moved.map((b) => `${b.clientName.split(' ')[0]} ahora a las ${time12(b.time)}`).join(', ')}. Toca «Avisar al cliente» para escribirles.`);
      }
    } catch (err) {
      handlePortalError(err, 'No se pudo guardar el cambio. Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const today = todayKey();
  const openToday = appts.filter((b) => b.date === today && isOpen(b)).length;
  const hour = Math.floor(nowMinutes() / 60);
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="min-h-screen bg-dark/90 relative z-10 pb-10">
      <header className="sticky top-0 z-30 glass border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <img src="/logo-salon-hermanos.png" alt="" width={900} height={594} className="hidden sm:block w-16 h-auto object-contain" />
          {tab !== 'inicio' && (
            <button onClick={() => setTab('inicio')} aria-label="Volver al inicio" className="lg:hidden w-10 h-10 -ml-1 rounded-xl flex items-center justify-center text-gold active:bg-gold/10">
              <ArrowLeft size={22} />
            </button>
          )}
          {tab !== 'inicio' && (
            <p className="lg:hidden flex-1 min-w-0 flex items-center gap-2 text-white font-semibold text-base truncate">
              {(() => { const Icon = TABS.find((x) => x.id === tab)?.icon; return Icon ? <Icon size={19} className="text-gold shrink-0" /> : null; })()}
              {TABS.find((x) => x.id === tab)?.label}
            </p>
          )}
          <BarberAvatar barber={barber} className={`w-10 h-10 rounded-full text-sm border border-gold/40 sm:hidden ${tab !== 'inicio' ? 'hidden' : ''}`} />
          <div className={`min-w-0 flex-1 ${tab !== 'inicio' ? 'hidden lg:block' : ''}`}>
            <p className="text-white font-semibold leading-tight truncate">{greeting}, {barber.shortName}</p>
            <p className="text-zinc-500 text-xs truncate">
              {formatDateLong(today)} · {openToday ? `${openToday} ${openToday === 1 ? 'cita' : 'citas'} por atender hoy` : 'sin citas pendientes hoy'}
            </p>
          </div>
          <nav className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10" aria-label="Secciones">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id || (tab === 'inicio' && id === 'agenda') ? 'page' : undefined}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${tab === id || (tab === 'inicio' && id === 'agenda') ? 'bg-gold text-dark font-semibold' : 'text-zinc-400 hover:text-white'}`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
          <BarberAvatar barber={barber} className="hidden sm:flex w-10 h-10 rounded-full text-sm border border-gold/40" />
          <ThemeToggle className="!w-10 !h-10 !rounded-xl" />
          <button onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión" className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7">
        <h1 className={`font-serif text-2xl sm:text-3xl font-bold text-white mb-5 ${tab === 'inicio' ? 'hidden' : 'hidden lg:block'}`}>
          {TABS.find((t) => t.id === tab)?.label}
          {tab === 'agenda' && <span className="block text-sm font-sans font-normal text-zinc-500 mt-1">Toca un día para ver sus citas · {lowerFirst(formatDateLong(today))}</span>}
        </h1>
        {error && <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        {shiftNotice && (
          <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-sm flex items-start justify-between gap-3">
            <span>{shiftNotice}</span>
            <button onClick={() => setShiftNotice('')} className="text-amber-200/70 hover:text-amber-100 text-xs shrink-0">Cerrar</button>
          </div>
        )}
        {!loaded ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 size={26} className="animate-spin text-gold" />
            <p className="text-zinc-500 text-sm">Cargando tu agenda...</p>
          </div>
        ) : (
          <>
            {tab === 'inicio' && (
              <>
                <div className="lg:hidden">
                  <BarberHome
                    barber={barber}
                    appts={appts}
                    greeting={greeting}
                    onNavigate={setTab}
                    onNewClient={() => { setShowNewClient(true); setShiftNotice(''); }}
                    onLogout={onLogout}
                  />
                </div>
                <div className="hidden lg:block">
                  <AgendaTab appts={appts} barber={barber} onStatus={updateStatus} busyId={busyId} onNewClient={() => { setShowNewClient(true); setShiftNotice(''); }} onEdit={setEditing} onDelete={removeBooking} />
                </div>
              </>
            )}
            {tab === 'agenda' && <AgendaTab appts={appts} barber={barber} onStatus={updateStatus} busyId={busyId} onNewClient={() => { setShowNewClient(true); setShiftNotice(''); }} onEdit={setEditing} onDelete={removeBooking} />}
            {tab === 'turnos' && <BarberShifts barber={barber} pin={pin} appts={appts} />}
            {tab === 'trabajos' && <BarberWorks barber={barber} pin={pin} />}
            {tab === 'ganancias' && <EarningsTab appts={appts} barber={barber} />}
            {tab === 'historial' && <HistoryTab appts={appts} />}
            {tab === 'perfil' && <ProfileTab barber={barber} appts={appts} pin={pin} onPinChanged={onPinChanged} onWorkHoursChanged={onWorkHoursChanged} />}
          </>
        )}
      </main>

      {editing && (
        <EditBookingModal
          booking={editing}
          barberSession={{ barber, pin }}
          onClose={() => setEditing(null)}
          onSaved={() => { getBarberBookings(barber.id, pin).then(setAppts).catch((err) => handlePortalError(err, 'No se pudieron recargar tus citas.')); }}
        />
      )}

      {showNewClient && (
        <NewClientModal
          barberSession={{ barber, pin }}
          onClose={() => setShowNewClient(false)}
          onSaved={(count, clientName, scheduled) => {
            setShowNewClient(false);
            setShiftNotice(scheduled
              ? `Cita agendada para ${clientName}: ${formatDateLong(scheduled.date)} a las ${time12(scheduled.time)}.`
              : `Registrado ${clientName}: ${count === 1 ? 'el servicio quedó completado' : `${count} servicios completados`} y ya cuenta en tus ganancias.`);
            getBarberBookings(barber.id, pin).then(setAppts).catch((err) => handlePortalError(err, 'No se pudieron recargar tus citas.'));
          }}
        />
      )}

    </div>
  );
}

export default function BarberPage() {
  usePageMeta({ title: 'Portal del barbero | Salón Hermanos', noindex: true });
  const [session, setSession] = useState<{ barber: Barber; pin: string } | null>(null);

  if (!session) {
    return <BarberLogin onLogin={(barber, pin) => setSession({ barber, pin })} />;
  }

  return (
    <BarberDashboard
      barber={session.barber}
      pin={session.pin}
      onLogout={() => setSession(null)}
      onPinChanged={(pin) => setSession({ ...session, pin })}
      onWorkHoursChanged={(workHours) => setSession({ ...session, barber: { ...session.barber, workHours } })}
    />
  );
}
