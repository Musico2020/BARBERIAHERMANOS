import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Trash2, Check, Scissors } from 'lucide-react';
import { getBookingsByMonth, updateBookingStatus, updateBookingPrice, deleteBooking } from '../../services/bookings';
import { formatCOP } from '../../data';
import { getAllServices } from '../../services/services';
import { todayKey, formatDateLong, time12, monthLong } from '../../lib/dates';
import { STATUS_LABEL, type BookingStatus } from '../../lib/stats';
import type { Barber, Booking } from '../../types';
import { bossName, isBarberOwner } from '../../lib/earnings';
import { InvoiceList, ServiceSplitLine, splitTotals } from './ServiceSplit';

// Panel → Barberos → «Servicios»: los servicios de un barbero en el mes.
//   · Facturas: cada servicio completado con lo cobrado, lo que gana el barbero y lo que le entrega a su jefe.
//   · Administrar: cambiar el estado, corregir el valor cobrado o eliminar.
// Solo los completados cuentan en «Ingresos».

interface Props {
  barber: Barber;
  onClose: () => void;
  /** Avisa que algo cambió, para recalcular las cifras de la tarjeta */
  onChanged: () => void;
}

const STATUSES = Object.keys(STATUS_LABEL) as BookingStatus[];
const STATUS_TONE: Record<BookingStatus, string> = {
  pending: 'text-amber-300',
  confirmed: 'text-sky-300',
  completed: 'text-emerald-300',
  cancelled: 'text-zinc-500',
  'no-show': 'text-rose-300',
};

const monthKeyOf = (key: string) => key.slice(0, 7);
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export default function BarberServicesModal({ barber, onClose, onChanged }: Props) {
  const [month, setMonth] = useState(monthKeyOf(todayKey()));
  const [list, setList] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<BookingStatus | 'todos'>('completed');
  const [view, setView] = useState<'facturas' | 'administrar'>('facturas');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const [y, m] = month.split('-').map(Number);
    // Los servicios se cargan para saber el porcentaje del barbero en cada uno
    Promise.all([getBookingsByMonth(y, m), getAllServices()])
      .then(([all]) => { if (alive) { setList(all.filter((b) => b.barberId === barber.id)); setError(''); } })
      .catch((err) => { console.error('No se pudieron cargar los servicios', err); if (alive) setError('No se pudieron cargar los servicios. Intenta de nuevo.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month, barber.id]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const done = list.filter((b) => b.status === 'completed');
  const totals = splitTotals(done, barber);
  const owner = isBarberOwner(barber);
  const shown = list
    .filter((b) => filter === 'todos' || b.status === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const count = (s: BookingStatus | 'todos') => (s === 'todos' ? list.length : list.filter((b) => b.status === s).length);

  const run = async (id: string, action: () => Promise<void>, apply: (b: Booking) => Booking | null) => {
    setBusyId(id);
    setError('');
    try {
      await action();
      setList((prev) => prev.flatMap((b) => {
        if (b.id !== id) return [b];
        const next = apply(b);
        return next ? [next] : [];
      }));
      onChanged();
    } catch (err) {
      console.error('No se pudo guardar el cambio', err);
      setError('No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = (b: Booking, status: BookingStatus) =>
    run(b.id, () => updateBookingStatus(b.id, status), (x) => ({ ...x, status }));
  const savePrice = (b: Booking) => {
    const price = Number((prices[b.id] ?? '').replace(/\D/g, ''));
    if (!Number.isFinite(price) || price === b.price) return;
    run(b.id, () => updateBookingPrice(b.id, price), (x) => ({ ...x, price }));
    setPrices((p) => { const n = { ...p }; delete n[b.id]; return n; });
  };
  const remove = (b: Booking) => {
    if (!window.confirm(`¿Eliminar el servicio de ${b.clientName} (${b.serviceName}, ${formatDateLong(b.date)} ${time12(b.time)})? No se puede deshacer.`)) return;
    run(b.id, () => deleteBooking(b.id), () => null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Servicios de ${barber.name}`}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-[#0d0d0d] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden h-[92vh] sm:h-[min(90vh,820px)] flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center shrink-0">
              <Scissors size={16} className="text-gold" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Servicios</p>
              <h2 className="font-serif text-xl font-bold text-white truncate">{barber.name}</h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-4 border-b border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior" className="w-9 h-9 rounded-full border border-white/10 text-zinc-300 hover:text-gold hover:border-gold/50 flex items-center justify-center"><ChevronLeft size={16} /></button>
            <p className="text-white font-semibold capitalize">{monthLong(`${month}-01`)} {month.slice(0, 4)}</p>
            <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= monthKeyOf(todayKey())} aria-label="Mes siguiente" className="w-9 h-9 rounded-full border border-white/10 text-zinc-300 hover:text-gold hover:border-gold/50 flex items-center justify-center disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2">
              <p className="font-mono text-base font-bold text-white">{done.length}</p>
              <p className="text-[10px] uppercase text-zinc-500">Completados</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2">
              <p className="font-mono text-sm font-bold text-white">{formatCOP(totals.billed)}</p>
              <p className="text-[10px] uppercase text-zinc-500">Cobrado</p>
            </div>
            <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 p-2">
              <p className="font-mono text-sm font-bold text-emerald-300">{formatCOP(totals.mine)}</p>
              <p className="text-[10px] uppercase text-zinc-500">Gana {barber.shortName}</p>
            </div>
            <div className="rounded-xl bg-gold/[0.06] border border-gold/25 p-2">
              <p className="font-mono text-sm font-bold text-gold">{formatCOP(totals.boss)}</p>
              <p className="text-[10px] uppercase text-zinc-500">{owner ? 'Es dueño' : `Para ${bossName(barber)}`}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
            {([['facturas', 'Facturas'], ['administrar', 'Administrar']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`py-2 rounded-lg text-sm font-semibold ${view === v ? 'bg-gold text-dark' : 'text-zinc-300'}`}>{label}</button>
            ))}
          </div>
          <div className={`flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 ${view === 'facturas' ? 'hidden' : ''}`} style={{ scrollbarWidth: 'none' }}>
            {(['completed', 'todos', 'pending', 'confirmed', 'no-show', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === s ? 'bg-gold text-dark border-gold' : 'border-white/10 text-zinc-400 hover:text-white'}`}
              >
                {s === 'todos' ? 'Todos' : STATUS_LABEL[s]}
                <span className={`font-mono text-[10px] px-1.5 rounded-full ${filter === s ? 'bg-dark/15' : 'bg-white/5'}`}>{count(s)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">
          {error && <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-gold" /></div>
          ) : view === 'facturas' ? (
            <InvoiceList list={done} barber={barber} />
          ) : shown.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-12">No hay servicios {filter === 'todos' ? '' : `«${STATUS_LABEL[filter]}» `}en este mes.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((b) => {
                const priceDraft = prices[b.id];
                const dirty = priceDraft !== undefined && Number(priceDraft.replace(/\D/g, '')) !== b.price;
                return (
                  <li key={b.id} className={`rounded-xl border border-white/10 bg-white/[0.02] p-3 ${busyId === b.id ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{b.serviceName}</p>
                        <p className="text-zinc-400 text-xs truncate">{b.clientName}{b.clientPhone ? ` · ${b.clientPhone}` : ''}</p>
                        <p className="text-zinc-500 text-[11px] capitalize">{formatDateLong(b.date)} · {time12(b.time)}</p>
                        {b.status === 'completed' && <ServiceSplitLine booking={b} barber={barber} />}
                      </div>
                      <button onClick={() => remove(b)} disabled={busyId === b.id} title="Eliminar" aria-label={`Eliminar el servicio de ${b.clientName}`} className="btn-danger-glass p-2 rounded-lg shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <select
                        value={b.status}
                        disabled={busyId === b.id}
                        onChange={(e) => changeStatus(b, e.target.value as BookingStatus)}
                        aria-label="Estado"
                        className={`bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none focus:border-gold/50 ${STATUS_TONE[b.status]}`}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                      <span className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                        <input
                          inputMode="numeric"
                          aria-label="Valor cobrado"
                          value={priceDraft ?? String(b.price)}
                          onChange={(e) => setPrices({ ...prices, [b.id]: e.target.value.replace(/\D/g, '') })}
                          onKeyDown={(e) => { if (e.key === 'Enter') savePrice(b); }}
                          className="w-28 pl-6 pr-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-right font-mono text-xs text-white focus:outline-none focus:border-gold/60"
                        />
                      </span>
                      {dirty && (
                        <button onClick={() => savePrice(b)} disabled={busyId === b.id} className="btn-gold px-2.5 py-1.5 rounded-lg text-xs font-semibold">
                          {busyId === b.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar valor
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
