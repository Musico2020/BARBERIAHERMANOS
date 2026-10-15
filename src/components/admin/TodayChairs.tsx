import { Coffee, Scissors, CheckCircle2, Clock } from 'lucide-react';
import { formatCOP } from '../../data';
import { timeToMinutes, minutesToTime } from '../../lib/dates';
import { revenueOf } from '../../lib/stats';
import type { Barber, Booking } from '../../types';
import BarberAvatar from '../common/BarberAvatar';
import { StatusBadge } from './ui';

// «La jornada de hoy»: una columna por silla (barbero) con sus turnos del día, quién está
// atendiendo ahora, quién está libre y cuál es su siguiente cliente.

const isOpenStatus = (b: Booking) => b.status === 'pending' || b.status === 'confirmed';

interface Props {
  barbers: Barber[];
  /** Citas de hoy, ordenadas por hora */
  bookings: Booking[];
  /** Minutos desde la medianoche (hora de Colombia) */
  now: number;
  /** Duración en minutos de cada servicio, por id */
  durations: Map<string, number>;
  /** Almuerzo de hoy en minutos, si aplica */
  lunch: { start: number; end: number } | null;
}

type ChairState = { kind: 'busy'; booking: Booking; until: number } | { kind: 'lunch'; until: number } | { kind: 'free' } | { kind: 'away' };

export default function TodayChairs({ barbers, bookings, now, durations, lunch }: Props) {
  const endOf = (b: Booking) => timeToMinutes(b.time) + (durations.get(b.serviceId) ?? 30);

  if (barbers.length === 0) {
    return <p className="text-zinc-500 text-sm">No hay barberos registrados.</p>;
  }

  return (
    <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${barbers.length >= 3 ? 'xl:grid-cols-3' : ''}`}>
      {barbers.map((barber) => {
        const mine = bookings.filter((b) => b.barberId === barber.id);
        const active = mine.filter((b) => b.status !== 'cancelled');
        const current = active.find((b) => isOpenStatus(b) && timeToMinutes(b.time) <= now && now < endOf(b));
        const next = active.find((b) => isOpenStatus(b) && timeToMinutes(b.time) > now);
        const inLunch = lunch && now >= lunch.start && now < lunch.end;
        const state: ChairState = !barber.available
          ? { kind: 'away' }
          : current
            ? { kind: 'busy', booking: current, until: endOf(current) }
            : inLunch
              ? { kind: 'lunch', until: lunch.end }
              : { kind: 'free' };
        const done = mine.filter((b) => b.status === 'completed').length;

        return (
          <section key={barber.id} className="chair-card rounded-2xl overflow-hidden flex flex-col min-w-0">
            <header className="flex items-center gap-3 px-4 pt-4 pb-3">
              <BarberAvatar barber={barber} className="w-12 h-12 rounded-full text-sm border-2 border-gold/50 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-serif font-bold text-white text-base leading-tight truncate">{barber.name}</p>
                <ChairStatus state={state} />
              </div>
              <div className="text-right shrink-0">
                <p className="font-serif font-extrabold text-gold text-lg leading-none">{active.length}</p>
                <p className="text-zinc-500 text-[10px] uppercase tracking-wider mt-0.5">turnos</p>
              </div>
            </header>

            {next && state.kind !== 'away' && (
              <p className="mx-4 mb-3 text-xs rounded-lg px-3 py-2 bg-gold/10 border border-gold/25 text-zinc-300 truncate">
                <span className="text-gold font-semibold">Siguiente {next.time}</span> · {next.clientName}
              </p>
            )}

            <ol className="flex-1 border-t border-white/8 divide-y divide-white/[0.06] max-h-[320px] overflow-y-auto">
              {mine.length === 0 && (
                <li className="px-4 py-6 text-center text-zinc-500 text-sm">{barber.available ? 'Sin turnos hoy' : 'No atiende hoy'}</li>
              )}
              {mine.map((b) => {
                const isNow = current?.id === b.id;
                const past = endOf(b) <= now;
                return (
                  <li
                    key={b.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${isNow ? 'bg-gold/[0.08] shadow-[inset_3px_0_0_#D9AD50]' : ''} ${
                      b.status === 'cancelled' || b.status === 'no-show' || (past && !isNow && b.status !== 'completed') ? 'opacity-50' : ''
                    }`}
                  >
                    <span className="font-mono text-sm font-bold text-gold w-11 shrink-0">{b.time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{b.clientName}</p>
                      <p className="text-zinc-500 text-xs truncate">{b.serviceName}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </li>
                );
              })}
            </ol>

            <footer className="flex items-center justify-between px-4 py-3 border-t border-white/8 text-xs">
              <span className="inline-flex items-center gap-1.5 text-zinc-400"><CheckCircle2 size={13} className="text-emerald-400" /> {done} {done === 1 ? 'atendido' : 'atendidos'}</span>
              <span className="font-mono font-semibold text-gold">{formatCOP(revenueOf(mine))}</span>
            </footer>
          </section>
        );
      })}
    </div>
  );
}

function ChairStatus({ state }: { state: ChairState }) {
  if (state.kind === 'busy') {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-amber-300 mt-0.5 min-w-0 max-w-full">
        <Scissors size={12} className="shrink-0" />
        <span className="truncate">Atendiendo a {state.booking.clientName.split(' ')[0]} · hasta {minutesToTime(state.until)}</span>
      </p>
    );
  }
  if (state.kind === 'lunch') {
    return <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5"><Coffee size={12} /> En almuerzo · vuelve {minutesToTime(state.until)}</p>;
  }
  if (state.kind === 'away') {
    return <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5"><Clock size={12} /> No disponible</p>;
  }
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-emerald-400 mt-0.5">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Libre ahora
    </p>
  );
}
