import { Phone, MessageCircle, Scissors, User } from 'lucide-react';
import { formatDateLong, time12, todayKey } from '../../lib/dates';
import { waNumber } from '../../lib/whatsapp';
import { lunchFor } from '../../lib/businessHours';
import { STATUS_LABEL } from '../../lib/stats';
import type { Booking } from '../../types';

// Calendario en el teléfono: en vez de la cuadrícula (que no cabe), una agenda en lista con todo
// visible — hora, cliente, su número (llamar o WhatsApp), servicio, barbero y estado.

const STATUS_STYLE: Record<Booking['status'], string> = {
  pending: 'border-l-amber-400 text-amber-300',
  confirmed: 'border-l-sky-400 text-sky-300',
  completed: 'border-l-emerald-400 text-emerald-300',
  cancelled: 'border-l-red-500/60 text-red-400',
  'no-show': 'border-l-red-500/60 text-red-400',
};

function BookingCard({ b, showBarber }: { b: Booking; showBarber: boolean }) {
  const off = b.status === 'cancelled' || b.status === 'no-show';
  const phone = b.clientPhone?.trim();
  return (
    <div className={`rounded-xl border border-white/10 border-l-4 bg-white/[0.03] p-3 ${STATUS_STYLE[b.status]} ${off ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-base font-bold text-gold leading-tight">{time12(b.time)}</p>
          <p className={`text-white font-semibold text-[15px] leading-snug mt-0.5 break-words ${off ? 'line-through' : ''}`}>{b.clientName}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 ${STATUS_STYLE[b.status].split(' ').pop()}`}>
          {STATUS_LABEL[b.status]}
        </span>
      </div>
      <p className="flex items-center gap-1.5 text-zinc-300 text-xs mt-1.5">
        <Scissors size={12} className="text-gold/70 shrink-0" /> {b.serviceName}
        {showBarber && <><span className="text-zinc-600">·</span><User size={12} className="text-gold/70 shrink-0" /> {b.barberName}</>}
      </p>
      {phone ? (
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm font-mono text-white">
            <Phone size={13} className="text-gold" /> {phone}
          </a>
          <a
            href={`https://wa.me/${waNumber(phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
        </div>
      ) : (
        <p className="text-zinc-600 text-xs mt-2">Sin número registrado</p>
      )}
    </div>
  );
}

interface Props {
  /** Días a mostrar (uno en la vista Día, siete en la vista Semana) */
  dates: string[];
  bookings: Booking[];
  /** Barbero escogido en los filtros; '' = todos */
  barberId: string;
}

export default function CalendarAgenda({ dates, bookings, barberId }: Props) {
  const today = todayKey();
  const rank = (b: Booking) => (b.status === 'cancelled' || b.status === 'no-show' ? 1 : 0);
  return (
    <div className="space-y-5">
      {dates.map((d) => {
        const list = bookings
          .filter((b) => b.date === d && (!barberId || b.barberId === barberId))
          .sort((a, b) => a.time.localeCompare(b.time) || rank(a) - rank(b));
        const active = list.filter((b) => rank(b) === 0).length;
        const lunch = lunchFor(d);
        if (dates.length > 1 && list.length === 0) return null;
        return (
          <section key={d}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h3 className={`text-sm font-semibold capitalize ${d === today ? 'text-gold' : 'text-white'}`}>
                {d === today ? 'Hoy · ' : ''}{formatDateLong(d)}
              </h3>
              <span className="text-[11px] text-zinc-500 shrink-0">{active} {active === 1 ? 'cita' : 'citas'}</span>
            </div>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500">No hay citas este día.</p>
            ) : (
              <div className="space-y-2">
                {list.map((b, i) => {
                  const showLunch = lunch && b.time >= lunch.endLabel && (i === 0 || list[i - 1].time < lunch.startLabel);
                  return (
                    <div key={b.id} className="space-y-2">
                      {showLunch && <p className="text-center text-[11px] text-gold/60">— Almuerzo {time12(lunch.startLabel)} a {time12(lunch.endLabel)} —</p>}
                      <BookingCard b={b} showBarber={!barberId} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      {dates.length > 1 && dates.every((d) => !bookings.some((b) => b.date === d && (!barberId || b.barberId === barberId))) && (
        <p className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500">No hay citas esta semana.</p>
      )}
    </div>
  );
}
