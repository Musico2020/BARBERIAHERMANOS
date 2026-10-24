import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Users } from 'lucide-react';
import BarberAvatar from '../common/BarberAvatar';
import CalendarAgenda from './CalendarAgenda';
import AgendaBoard from './AgendaBoard';
import { todayKey, addDays, dayOfMonth, formatDateLong, monthLong } from '../../lib/dates';
import type { Barber, Booking } from '../../types';

// Agenda en el teléfono: días en círculos, foto de cada barbero para escogerlo y, por barbero, la
// línea de tiempo del día (citas, horas no disponibles y almuerzo), donde se tocan los espacios libres
// para agregar clientes y se mueven las citas. «Todos» muestra la lista del día.

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const weekdayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

type BoardActions = Pick<ComponentProps<typeof AgendaBoard>, 'onAdd' | 'onEdit' | 'saveMove' | 'onChanged'>;

interface Props extends BoardActions {
  date: string;
  onDateChange: (date: string) => void;
  barbers: Barber[];
  bookings: Booking[];
  durations: Map<string, number>;
}

export default function MobileAgenda({ date, onDateChange, barbers, bookings, durations, ...actions }: Props) {
  const today = todayKey();
  const [barberId, setBarberId] = useState('');
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-day="${date}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [date]);

  const days = [...new Set([...Array.from({ length: 52 }, (_, i) => addDays(today, i - 7)), date])].sort();
  const barber = barbers.find((b) => b.id === barberId);
  const count = (id: string) => bookings.filter((b) => b.date === date && b.barberId === id && b.status !== 'cancelled' && b.status !== 'no-show').length;

  return (
    <div className="space-y-5">
      <p className="text-center text-sm font-semibold text-gold capitalize">{monthLong(date)} {date.slice(0, 4)}</p>

      {/* Días en círculos */}
      <div ref={stripRef} className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        {days.map((d) => {
          const selected = d === date;
          return (
            <button key={d} data-day={d} type="button" onClick={() => onDateChange(d)} className="flex flex-col items-center gap-1 shrink-0">
              <span className={`w-14 h-14 rounded-full border-2 flex items-center justify-center font-mono text-xl font-bold transition-colors ${
                selected ? 'bg-gold border-gold text-dark' : d === today ? 'border-emerald-400 text-emerald-300' : 'border-gold/40 text-white'
              }`}>
                {dayOfMonth(d)}
              </span>
              <span className={`text-[11px] ${selected ? 'text-gold font-semibold' : 'text-zinc-400'}`}>{d === today ? 'Hoy' : DAY_NAMES[weekdayOf(d)]}</span>
            </button>
          );
        })}
      </div>

      {/* Barberos */}
      <div className="flex gap-4 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        {[{ id: '', name: 'Todos' }, ...barbers.map((b) => ({ id: b.id, name: b.shortName }))].map((o) => {
          const selected = barberId === o.id;
          const b = barbers.find((x) => x.id === o.id);
          return (
            <button key={o.id || 'todos'} type="button" onClick={() => setBarberId(o.id)} className="relative flex flex-col items-center gap-1.5 shrink-0 w-[76px]">
              <span className={`w-[68px] h-[68px] rounded-full p-[3px] ${selected ? 'bg-gold' : 'bg-white/10'}`}>
                {b ? (
                  <BarberAvatar barber={b} className="w-full h-full rounded-full text-lg" />
                ) : (
                  <span className="w-full h-full rounded-full bg-[#141414] flex items-center justify-center text-gold"><Users size={26} /></span>
                )}
              </span>
              {b && count(b.id) > 0 && (
                <span className="absolute top-0 right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-gold text-dark text-[11px] font-bold flex items-center justify-center">{count(b.id)}</span>
              )}
              <span className={`text-xs truncate max-w-full ${selected ? 'text-gold font-semibold' : 'text-zinc-300'}`}>{o.name}</span>
            </button>
          );
        })}
      </div>

      {barber && <h3 className="text-white font-semibold capitalize">{date === today ? 'Hoy · ' : ''}{formatDateLong(date)} · {barber.shortName}</h3>}

      {barber ? (
        <AgendaBoard date={date} barbers={[barber]} bookings={bookings} durations={durations} lunchOverClosed {...actions} />
      ) : (
        <CalendarAgenda dates={[date]} bookings={bookings} barberId="" />
      )}
    </div>
  );
}
