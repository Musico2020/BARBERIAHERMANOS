import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, Image as ImageIcon, MessageCircle, X, Banknote } from 'lucide-react';
import { getDepositBookings, receiptUrl, reviewDeposit } from '../../services/deposits';
import { formatCOP } from '../../data';
import { formatDateLong } from '../../lib/dates';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { waNumber } from '../../lib/whatsapp';
import { Panel, EmptyState } from '../../components/admin/ui';
import type { Booking } from '../../types';

// Panel → Pagos: anticipos de las reservas hechas en la web. El administrador revisa en su Nequi que el
// pago haya entrado y marca «Pago recibido» (la cita queda confirmada) o «No llegó» (se cancela).

interface Group {
  key: string;
  bookings: Booking[];
  first: Booking;
  total: number;
  deposit: number;
}

/** Las citas de una misma reserva (varios servicios) se muestran juntas */
function groupBookings(list: Booking[]): Group[] {
  const map = new Map<string, Booking[]>();
  for (const b of list) {
    const key = b.depositReceiptPath ?? `${b.clientPhone}|${b.date}|${b.createdAt.slice(0, 16)}`;
    map.set(key, [...(map.get(key) ?? []), b]);
  }
  return [...map.entries()].map(([key, bookings]) => {
    const sorted = [...bookings].sort((a, b) => a.time.localeCompare(b.time));
    return {
      key,
      bookings: sorted,
      first: sorted[0],
      total: sorted.reduce((s, b) => s + b.price, 0),
      deposit: sorted.reduce((s, b) => s + b.depositAmount, 0),
    };
  });
}

const timeLeft = (iso?: string) => {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 'vencido' : `${Math.ceil(ms / 60000)} min para pagar`;
};
const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

const STATUS_TEXT: Record<string, { text: string; tone: string }> = {
  verified: { text: 'Pago recibido', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  rejected: { text: 'No llegó · cancelada', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
  expired: { text: 'Venció sin pago', tone: 'text-zinc-400 bg-white/5 border-white/10' },
  submitted: { text: 'Por verificar', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  awaiting: { text: 'Esperando pago', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
};

function GroupCard({ g, busy, onReview, onReceipt }: {
  g: Group;
  busy: boolean;
  onReview?: (g: Group, received: boolean) => void;
  onReceipt: (path: string) => void;
}) {
  const s = STATUS_TEXT[g.first.depositStatus];
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-semibold">{g.first.clientName}</p>
          <a
            href={`https://wa.me/${waNumber(g.first.clientPhone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-mono"
          >
            <MessageCircle size={12} /> {g.first.clientPhone}
          </a>
        </div>
        {s && <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${s.tone}`}>{s.text}</span>}
      </div>

      <div className="text-sm text-zinc-300">
        <p>{formatDateLong(g.first.date)} · {g.first.time} · con {g.first.barberName}</p>
        <p className="text-zinc-500 text-xs">{g.bookings.map((b) => b.serviceName).join(' + ')}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2">
          <p className="text-[10px] uppercase text-zinc-500">Total</p>
          <p className="font-mono text-sm font-bold text-white">{formatCOP(g.total)}</p>
        </div>
        <div className="rounded-xl bg-gold/10 border border-gold/25 p-2">
          <p className="text-[10px] uppercase text-zinc-400">Anticipo</p>
          <p className="font-mono text-sm font-bold text-gold">{formatCOP(g.deposit)}</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2">
          <p className="text-[10px] uppercase text-zinc-500">En el salón</p>
          <p className="font-mono text-sm font-bold text-white">{formatCOP(g.total - g.deposit)}</p>
        </div>
      </div>

      {g.first.depositStatus === 'awaiting' && (
        <p className="inline-flex items-center gap-1.5 text-xs text-sky-300"><Clock size={12} /> {timeLeft(g.first.depositExpiresAt)}</p>
      )}
      {g.first.depositPayer && (
        <p className="text-xs text-zinc-400">Pagó: <span className="text-white">{g.first.depositPayer}</span> · {when(g.first.depositSubmittedAt)}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {g.first.depositReceiptPath && (
          <button onClick={() => onReceipt(g.first.depositReceiptPath!)} className="btn-dark-glass px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px]">
            <ImageIcon size={14} /> Ver comprobante
          </button>
        )}
        {onReview && (
          <>
            <button disabled={busy} onClick={() => onReview(g, true)} className="btn-success-glass px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px] disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Pago recibido
            </button>
            <button disabled={busy} onClick={() => onReview(g, false)} className="btn-danger-glass px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px] disabled:opacity-50">
              <XCircle size={14} /> No llegó
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export default function AdminPayments() {
  const [list, setList] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string } | null>(null);
  const [reload, setReload] = useState(0);

  useAutoRefresh(() => {
    getDepositBookings()
      .then((data) => { setList(data); setError(''); })
      .catch((err) => {
        console.error('No se pudieron cargar los pagos', err);
        setError('No se pudieron cargar los pagos. Se reintentará automáticamente.');
      })
      .finally(() => setLoaded(true));
  }, [reload], 30_000);

  const groups = groupBookings(list);
  const toReview = groups.filter((g) => g.first.depositStatus === 'submitted');
  const waiting = groups.filter((g) => g.first.depositStatus === 'awaiting');
  const history = groups.filter((g) => ['verified', 'rejected', 'expired'].includes(g.first.depositStatus));
  const verifiedTotal = history.filter((g) => g.first.depositStatus === 'verified').reduce((s, g) => s + g.deposit, 0);

  const review = async (g: Group, received: boolean) => {
    if (!received && !window.confirm(`¿Seguro que el pago de ${g.first.clientName} no llegó? La cita se cancela y la hora queda libre.`)) return;
    setBusyKey(g.key);
    try {
      await reviewDeposit(g.bookings.map((b) => b.id), received);
      setReload((n) => n + 1);
    } catch (err) {
      console.error('No se pudo guardar la revisión del pago', err);
      setError('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusyKey(null);
    }
  };

  const openReceipt = async (path: string) => {
    try {
      setReceipt({ url: await receiptUrl(path) });
    } catch (err) {
      console.error('No se pudo abrir el comprobante', err);
      setError('No se pudo abrir el comprobante.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="section-label">Pagos</p>
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1">Anticipos de las reservas</h2>
        <p className="text-zinc-400 text-sm mt-1 max-w-2xl">
          Revisa en tu app de Nequi Negocios que el pago haya entrado (mismo valor y nombre) y luego toca
          «Pago recibido». Si no aparece, toca «No llegó» y la hora se libera.
        </p>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      <Panel title="Por verificar" subtitle={`${toReview.length} comprobante${toReview.length === 1 ? '' : 's'} esperando tu revisión`}>
        {!loaded ? <div className="h-24" /> : toReview.length === 0 ? (
          <EmptyState icon={Banknote}>No hay comprobantes por revisar.</EmptyState>
        ) : (
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {toReview.map((g) => <GroupCard key={g.key} g={g} busy={busyKey === g.key} onReview={review} onReceipt={openReceipt} />)}
          </ul>
        )}
      </Panel>

      <Panel title="Esperando pago" subtitle="Reservaron pero todavía no envían el comprobante; si se vence el tiempo, la cita se cancela sola">
        {waiting.length === 0 ? <EmptyState icon={Clock}>Nadie está pendiente de pagar.</EmptyState> : (
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {waiting.map((g) => <GroupCard key={g.key} g={g} busy={busyKey === g.key} onReview={review} onReceipt={openReceipt} />)}
          </ul>
        )}
      </Panel>

      <Panel title="Últimos 30 días" subtitle={`Anticipos recibidos: ${formatCOP(verifiedTotal)}`}>
        {history.length === 0 ? <EmptyState>Todavía no hay pagos revisados.</EmptyState> : (
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {history.map((g) => <GroupCard key={g.key} g={g} busy={false} onReceipt={openReceipt} />)}
          </ul>
        )}
      </Panel>

      {receipt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Comprobante de pago">
          <div className="absolute inset-0 bg-black/85" onClick={() => setReceipt(null)} />
          <div className="relative max-w-md w-full">
            <button onClick={() => setReceipt(null)} aria-label="Cerrar" className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-[#161616] border border-white/15 text-white flex items-center justify-center">
              <X size={18} />
            </button>
            <img src={receipt.url} alt="Comprobante de pago enviado por el cliente" className="w-full max-h-[85vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
