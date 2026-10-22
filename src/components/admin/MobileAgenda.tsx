import { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, Users } from 'lucide-react';
import BarberAvatar from '../common/BarberAvatar';
import CalendarAgenda from './CalendarAgenda';
import { getBusySlots, type BusySlot } from '../../services/bookings';
import { getAllServices } from '../../services/services';
import { todayKey, addDays, dayOfMonth, formatDateLong, minutesToTime, time12, timeToMinutes, monthLong } from '../../lib/dates';
import { barberHoursFor, hoursFor, lunchFor } from '../../lib/businessHours';
import { waNumber } from '../../lib/whatsapp';
import { STATUS_LABEL } from '../../lib/stats';
import type { Barber, Booking } from '../../types';

// Agenda en el teléfono: días en círculos, foto de cada barbero para escogerlo y, por barbero, la
// línea de tiempo del día (citas, horas no disponibles y almuerzo). «Todos» muestra la lista del día.

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const PX_PER_MIN = 2.6;

const STATUS_BLOCK: Record<Booking['status'], string> = {
  pending: 'border-amber-400 bg-amber-500/15',
  confirmed: 'border-sky-400 bg-sky-500/15',
  completed: 'border-emerald-400 bg-emerald-500/15',
  cancelled: 'border-zinc-600 bg-white/5',
  'no-show': 'border-red-500/60 bg-red-500/10',
};

const weekdayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  barbers: Barber[];
  bookings: Booking[];
}

function Timeline({ date, barber, bookings, durations }: { date: string; barber: Barber; bookings: Booking[]; durations: Map<string, number> }) {
  const [closed, setClosed] = useState<BusySlot[]>([]);
  useEffect(() => {
    let alive = true;
    getBusySlots(date, barber.id)
      .then((list) => { if (alive) setClosed(list.filter((x) => x.kind === 'closed')); })
      .catch(() => { if (alive) setClosed([]); });
    return () => { alive = false; };
  }, [date, barber.id]);

  const mine = bookings.filter((b) => b.date === date && b.barberId === barber.id && b.status !== 'cancelled');
  const win = barberHoursFor(date, barber.workHours) ?? (hoursFor(date) ? { open: hoursFor(date)!.open, close: hoursFor(date)!.close } : null);
  const lunch = lunchFor(date);
  const dur = (b: Booking) => durations.get(b.serviceId) ?? 30;

  // Rango visible: el horario del día (o 8 a 7) ampliado si hay citas por fuera
  let start = win?.open ?? 8 * 60;
  let end = win?.close ?? 19 * 60;
  for (const b of mine) {
    start = Math.min(start, timeToMinutes(b.time));
    end = Math.max(end, timeToMinutes(b.time) + dur(b));
  }
  start = Math.floor(start / 30) * 30;
  end = Math.ceil(end / 30) * 30;
  const height = (end - start) * PX_PER_MIN;
  const y = (m: number) => (m - start) * PX_PER_MIN;
  const marks = Array.from({ length: (end - start) / 30 + 1 }, (_, i) => start + i * 30);

  const blocks = closed
    .map((c) => ({ s: Math.max(start, timeToMinutes(c.startTime)), e: Math.min(end, timeToMinutes(c.startTime) + c.duration) }))
    .filter((c) => c.e > c.s);

  return (
    <div>
      {!win && <p className="mb-3 text-sm text-amber-300">{barber.shortName} no trabaja este día (o el salón está cerrado).</p>}
      <div className="table-card rounded-2xl p-2 pr-3">
        <div className="relative" style={{ height }}>
          {/* Horas */}
          {marks.map((m) => (
            <div key={m} className="absolute left-0 right-0 flex items-start gap-2" style={{ top: y(m) }}>
              <span className={`w-[58px] shrink-0 -mt-2 text-right font-mono whitespace-nowrap ${m % 60 === 0 ? "text-[10.5px] text-zinc-300" : "text-[10px] text-zinc-600"}`}>
                {m % 60 === 0 ? time12(minutesToTime(m)) : ':30'}
              </span>
              <span className={`flex-1 border-t ${m % 60 === 0 ? 'border-white/10' : 'border-white/[0.04] border-dashed'}`} />
            </div>
          ))}
          <div className="absolute top-0 bottom-0 left-[66px] right-0">
            {/* No disponible */}
            {blocks.map((c, i) => (
              <div key={i} className="absolute left-0 right-0 rounded-lg bg-zinc-500/15 border border-zinc-500/20 px-2 py-1 overflow-hidden" style={{ top: y(c.s), height: (c.e - c.s) * PX_PER_MIN }}>
                <p className="text-[11px] text-zinc-400">{time12(minutesToTime(c.s))} – {time12(minutesToTime(c.e))} · No disponible</p>
              </div>
            ))}
            {/* Almuerzo */}
            {lunch && lunch.end > start && lunch.start < end && (
              <div
                className="absolute left-0 right-0 rounded-lg border border-gold/20 px-2 py-1 bg-[repeating-linear-gradient(135deg,rgba(217,173,80,0.10)_0,rgba(217,173,80,0.10)_6px,transparent_6px,transparent_12px)]"
                style={{ top: y(Math.max(start, lunch.start)), height: (Math.min(end, lunch.end) - Math.max(start, lunch.start)) * PX_PER_MIN }}
              >
                <p className="text-[11px] text-gold/80">Almuerzo · {time12(lunch.startLabel)} – {time12(lunch.endLabel)}</p>
              </div>
            )}
            {/* Citas */}
            {mine.map((b) => {
              const s = timeToMinutes(b.time);
              const d = dur(b);
              const phone = b.clientPhone?.trim();
              return (
                <div
                  key={b.id}
                  className={`absolute left-0 right-0 rounded-xl border-l-4 border px-2.5 py-1.5 overflow-hidden shadow-lg ${STATUS_BLOCK[b.status]}`}
                  style={{ top: y(s) + 1, height: Math.max(d * PX_PER_MIN - 2, 34) }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono text-zinc-300 truncate">{time12(b.time)} – {time12(minutesToTime(s + d))}</p>
                      <p className="text-sm font-semibold text-white truncate">{b.clientName}</p>
                      <p className="text-xs text-zinc-300 truncate">{b.serviceName} · <span className="text-zinc-400">{STATUS_LABEL[b.status]}</span></p>
                    </div>
                    {phone && (
                      <div className="flex gap-1.5 shrink-0">
                        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`Llamar a ${b.clientName}`} className="w-8 h-8 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center text-gold"><Phone size={14} /></a>
                        <a href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${b.clientName}`} className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300"><MessageCircle size={14} /></a>
                      </div>
                    )}
                  </div>
                  {d >= 45 && phone && <p className="text-[11px] font-mono text-zinc-400 mt-0.5">{phone}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {mine.length === 0 && win && <p className="text-center text-sm text-zinc-500 mt-3">{barber.shortName} no tiene citas este día.</p>}
    </div>
  );
}

export default function MobileAgenda({ date, onDateChange, barbers, bookings }: Props) {
  const today = todayKey();
  const [barberId, setBarberId] = useState('');
  const [durations, setDurations] = useState<Map<string, number>>(new Map());
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllServices().then((list) => setDurations(new Map(list.map((s) => [s.id, s.duration])))).catch(() => undefined);
  }, []);
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
        <Timeline date={date} barber={barber} bookings={bookings} durations={durations} />
      ) : (
        <CalendarAgenda dates={[date]} bookings={bookings} barberId="" />
      )}
    </div>
  );
}
