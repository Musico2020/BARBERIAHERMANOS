import { useState } from 'react';
import { CalendarDays, Crown } from 'lucide-react';
import { formatCOP } from '../../data';
import { formatDateLong, todayKey } from '../../lib/dates';
import { isBarberOwner, type BookingFinancialSplit } from '../../lib/earnings';
import BarberAvatar from '../common/BarberAvatar';
import type { Barber, Booking } from '../../types';

// Facturas → «Resumen por día»: una tarjeta por día con lo que hizo cada barbero, lo que se gana y lo
// que le entrega a su jefe, y al final con cuánto se queda cada dueño ese día.

interface Item { booking: Booking; barber?: Barber; split: BookingFinancialSplit }

const bossLabel = (key: 'walter' | 'daniel' | 'general') => (key === 'walter' ? 'Walter' : key === 'daniel' ? 'Daniel' : 'la administración');
const PAGE = 14;

export default function DailySummary({ items }: { items: Item[] }) {
  const [shown, setShown] = useState(PAGE);
  const today = todayKey();
  const days = [...new Set(items.map((i) => i.booking.date))].sort().reverse();
  if (days.length === 0) return null;

  return (
    <div className="space-y-3">
      {days.slice(0, shown).map((date) => {
        const list = items.filter((i) => i.booking.date === date);
        const billed = list.reduce((s, i) => s + i.split.price, 0);
        const walter = list.reduce((s, i) => s + i.split.walterAmount, 0);
        const daniel = list.reduce((s, i) => s + i.split.danielAmount, 0);
        const toBarbers = list.reduce((s, i) => s + i.split.barberPay, 0);
        // Por barbero
        const ids = [...new Set(list.map((i) => i.booking.barberId))];
        const rows = ids.map((id) => {
          const mine = list.filter((i) => i.booking.barberId === id);
          const barber = mine[0].barber;
          return {
            id,
            barber,
            name: barber?.shortName ?? mine[0].booking.barberName,
            owner: isBarberOwner(barber),
            count: mine.length,
            billed: mine.reduce((s, i) => s + i.split.price, 0),
            earns: mine.reduce((s, i) => s + i.split.barberPay, 0),
            gives: mine.reduce((s, i) => s + i.split.adminKeep, 0),
            boss: bossLabel(mine[0].split.beneficiary),
          };
        }).sort((a, b) => b.billed - a.billed);

        return (
          <section key={date} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/10 bg-gold/[0.04]">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-white capitalize">
                <CalendarDays size={15} className="text-gold" />
                {date === today ? 'Hoy · ' : ''}{formatDateLong(date)}
              </h4>
              <span className="text-xs text-zinc-400">
                {list.length} {list.length === 1 ? 'servicio' : 'servicios'} · <b className="font-mono text-gold">{formatCOP(billed)}</b>
              </span>
            </header>

            <ul className="divide-y divide-white/[0.06]">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3 flex items-start gap-3">
                  {r.barber ? <BarberAvatar barber={r.barber} className="w-9 h-9 rounded-full text-xs shrink-0" /> : <span className="w-9 h-9 rounded-full bg-white/5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-semibold flex items-center gap-1.5">
                      {r.name}{r.owner && <Crown size={12} className="text-gold" />}
                      <span className="text-[11px] font-normal text-zinc-500">· {r.count} {r.count === 1 ? 'servicio' : 'servicios'} · cobró {formatCOP(r.billed)}</span>
                    </p>
                    {r.owner ? (
                      <p className="text-xs text-zinc-300 mt-0.5">Es dueño: los <b className="font-mono text-gold">{formatCOP(r.billed)}</b> son suyos.</p>
                    ) : (
                      <p className="text-xs text-zinc-300 mt-0.5">
                        Se gana <b className="font-mono text-emerald-300">{formatCOP(r.earns)}</b> y le entrega <b className="font-mono text-gold">{formatCOP(r.gives)}</b> a {r.boss}.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <footer className="px-4 py-3 border-t border-white/10 bg-black/20 space-y-1.5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-1.5">
                  <p className="font-mono text-sm font-bold text-amber-300">{formatCOP(walter)}</p>
                  <p className="text-[10px] uppercase text-zinc-500">Se queda Walter</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-1.5">
                  <p className="font-mono text-sm font-bold text-amber-300">{formatCOP(daniel)}</p>
                  <p className="text-[10px] uppercase text-zinc-500">Se queda Daniel</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-1.5">
                  <p className="font-mono text-sm font-bold text-emerald-400">{formatCOP(toBarbers)}</p>
                  <p className="text-[10px] uppercase text-zinc-500">Para barberos</p>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Ese día se cobraron {formatCOP(billed)}:{' '}
                {rows.map((r) => (r.owner
                  ? `${r.name} (dueño) hizo ${formatCOP(r.billed)}`
                  : `${r.name} se ganó ${formatCOP(r.earns)} y entrega ${formatCOP(r.gives)} a ${r.boss}`)).join('; ')}.
                {' '}En total Walter se queda con {formatCOP(walter)}{daniel > 0 || rows.some((r) => r.boss === 'Daniel') ? ` y Daniel con ${formatCOP(daniel)}` : ''}.
              </p>
            </footer>
          </section>
        );
      })}
      {days.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="w-full btn-dark-glass py-2.5 rounded-xl text-sm font-semibold">
          Ver más días ({days.length - shown})
        </button>
      )}
    </div>
  );
}
