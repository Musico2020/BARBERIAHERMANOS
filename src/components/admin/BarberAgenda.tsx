import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { generateSlots } from '../../lib/availability';
import { todayKey, formatDateLong, time12 } from '../../lib/dates';
import { STATUS_LABEL } from '../../lib/stats';
import type { BusySlot } from '../../services/bookings';
import type { Barber, Booking } from '../../types';

// Reservas de un barbero en su tarjeta de Panel → Barberos: cuántas tiene hoy, cuántos turnos libres
// le quedan hoy (los mismos que ve el cliente en la web, para un servicio de 30 min) y la lista de
// sus próximas reservas por día.

interface Props {
  barber: Barber;
  /** Reservas activas (pendientes o confirmadas) de hoy en adelante, de este barbero */
  upcoming: Booking[];
  /** Horas ocupadas de hoy (citas y horas cerradas) de todo el equipo */
  busyToday: BusySlot[] | null;
}

const MAX_SHOWN = 40;

export default function BarberAgenda({ barber, upcoming, busyToday }: Props) {
  const [open, setOpen] = useState(false);
  const today = todayKey();
  const todayCount = upcoming.filter((b) => b.date === today).length;
  const freeToday = busyToday && barber.available
    ? generateSlots(today, busyToday, [barber.id], 30, businessConfig.slotStep, () => barber.workHours).length
    : null;

  // Agrupadas por día, en orden de fecha y hora
  const sorted = [...upcoming].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, MAX_SHOWN);
  const days = sorted.reduce<{ date: string; items: Booking[] }[]>((acc, b) => {
    const last = acc[acc.length - 1];
    if (last && last.date === b.date) last.items.push(b);
    else acc.push({ date: b.date, items: [b] });
    return acc;
  }, []);

  return (
    <div className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div className="grid grid-cols-3 divide-x divide-white/[0.06] text-center">
        <div className="p-2.5">
          <p className="font-mono text-base font-bold text-white">{todayCount}</p>
          <p className="text-zinc-500 text-[10px] uppercase font-medium mt-0.5">Citas hoy</p>
        </div>
        <div className="p-2.5">
          <p className={`font-mono text-base font-bold ${freeToday ? 'text-emerald-300' : 'text-zinc-500'}`}>{freeToday ?? '—'}</p>
          <p className="text-zinc-500 text-[10px] uppercase font-medium mt-0.5">Libres hoy</p>
        </div>
        <div className="p-2.5">
          <p className="font-mono text-base font-bold text-gold">{upcoming.length}</p>
          <p className="text-zinc-500 text-[10px] uppercase font-medium mt-0.5">Próximas</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        disabled={upcoming.length === 0}
        className="w-full flex items-center justify-center gap-1.5 border-t border-white/[0.06] px-3 py-2.5 text-xs font-semibold text-gold hover:bg-gold/5 disabled:text-zinc-500 disabled:cursor-default"
      >
        <CalendarDays size={13} />
        {upcoming.length === 0 ? 'Sin reservas próximas' : open ? 'Ocultar reservas' : `Ver sus reservas (${upcoming.length})`}
        {upcoming.length > 0 && (open ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-3 py-3 space-y-3 max-h-80 overflow-y-auto">
          {days.map(({ date, items }) => (
            <div key={date}>
              <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${date === today ? 'text-emerald-300' : 'text-zinc-400'}`}>
                {date === today ? 'Hoy · ' : ''}{formatDateLong(date)} · {items.length} {items.length === 1 ? 'cita' : 'citas'}
              </p>
              <ul className="space-y-1">
                {items.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-gold w-[4.5rem] shrink-0 whitespace-nowrap">{time12(b.time)}</span>
                    <span className="flex-1 min-w-0 truncate text-zinc-200">
                      {b.clientName} <span className="text-zinc-500">· {b.serviceName}</span>
                    </span>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${b.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                      {STATUS_LABEL[b.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {upcoming.length > MAX_SHOWN && (
            <p className="text-[11px] text-zinc-500">Se muestran las primeras {MAX_SHOWN}. Mira todas en Reservas o en el Calendario.</p>
          )}
        </div>
      )}
    </div>
  );
}
