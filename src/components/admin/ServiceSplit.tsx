import { formatCOP } from '../../data';
import { formatDateLong, time12 } from '../../lib/dates';
import { calculateSplit, bossName, isBarberOwner } from '../../lib/earnings';
import type { Barber, Booking } from '../../types';

// «Factura» de cada servicio: lo que se cobró, lo que gana el barbero y lo que le entrega a su jefe
// (según el porcentaje del servicio o del barbero). Solo valores, sin mostrar el porcentaje.

/** Para un dueño todo es suyo; para los demás, su parte y la del jefe */
function splitOf(booking: Booking, barber: Barber) {
  const owner = isBarberOwner(barber);
  const split = calculateSplit(booking, barber);
  return { owner, mine: owner ? booking.price : split.barberPay, boss: owner ? 0 : split.adminKeep };
}

/** Una línea con la ganancia del barbero y lo del jefe en ese servicio */
export function ServiceSplitLine({ booking, barber }: { booking: Booking; barber: Barber }) {
  const { owner, mine, boss } = splitOf(booking, barber);
  if (owner) return <p className="text-[11px] text-emerald-300">Es dueño: los {formatCOP(booking.price)} son suyos</p>;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
      <span className="text-emerald-300">Ganancia de {barber.shortName}: <b className="font-mono">{formatCOP(mine)}</b></span>
      <span className="text-gold">Para {bossName(barber)}: <b className="font-mono">{formatCOP(boss)}</b></span>
    </p>
  );
}

/** Totales de una lista de servicios completados */
export function splitTotals(list: Booking[], barber: Barber) {
  return list.reduce((t, b) => {
    const s = splitOf(b, barber);
    return { billed: t.billed + b.price, mine: t.mine + s.mine, boss: t.boss + s.boss };
  }, { billed: 0, mine: 0, boss: 0 });
}

/**
 * Lista de facturas: cada servicio completado con lo cobrado, lo que gana el barbero y lo del jefe,
 * agrupada por día (del más reciente al más viejo).
 */
export function InvoiceList({ list, barber, you = false }: { list: Booking[]; barber: Barber; you?: boolean }) {
  const owner = isBarberOwner(barber);
  const boss = bossName(barber);
  const days = [...new Set(list.map((b) => b.date))].sort().reverse();
  if (list.length === 0) return <p className="text-zinc-500 text-sm text-center py-8">No hay servicios completados en este periodo.</p>;
  return (
    <div className="space-y-4">
      {days.map((d) => {
        const items = list.filter((b) => b.date === d).sort((a, b) => a.time.localeCompare(b.time));
        const t = splitTotals(items, barber);
        return (
          <section key={d}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
              <h4 className="text-sm font-semibold text-white capitalize">{formatDateLong(d)}</h4>
              <span className="text-[11px] text-zinc-400 font-mono">
                {formatCOP(t.billed)} · <span className="text-emerald-300">{formatCOP(t.mine)}</span>{!owner && <> · <span className="text-gold">{formatCOP(t.boss)}</span></>}
              </span>
            </div>
            <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10 bg-white/[0.02]">
              {items.map((b) => {
                const s = splitOf(b, barber);
                return (
                  <li key={b.id} className="px-3 py-2.5 grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-xs text-zinc-400 w-[4.2rem]">{time12(b.time)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm text-white truncate">{b.serviceName}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">{b.clientName}</span>
                    </span>
                    <span className="col-start-2 sm:col-start-auto text-xs text-zinc-300 font-mono sm:text-right">Cobrado {formatCOP(b.price)}</span>
                    <span className="col-start-2 sm:col-start-auto text-xs text-emerald-300 font-mono sm:text-right">{you ? 'Tú' : barber.shortName} {formatCOP(s.mine)}</span>
                    {!owner && <span className="col-start-2 sm:col-start-auto text-xs text-gold font-mono sm:text-right">{boss} {formatCOP(s.boss)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
