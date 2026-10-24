import { useState, useEffect } from 'react';
import { inviteToBookLink } from '../../lib/whatsapp';
import { Search, Star, Loader2, MessageCircle, AlertTriangle, Users, Crown, UserCheck, Ban, ShieldCheck, X } from 'lucide-react';
import { getBookings } from '../../services/bookings';
import { getClients, normalizePhone, getBlockedClients, blockClient, unblockClient, type ClientRecord, type BlockedClient } from '../../services/clients';
import { formatCOP } from '../../data';
import type { Booking } from '../../types';
import { Panel, KpiCard, Initials } from '../../components/admin/ui';
import DataTable, { type Column } from '../../components/admin/DataTable';

interface Client {
  name: string;
  phone: string;
  notes: string;
  visits: number;
  lastVisit: string;
  totalSpent: number;
  favoriteService: string;
  /** Citas en las que no llegó */
  noShows: number;
  blocked: BlockedClient | null;
}

// Une la lista de clientes con sus citas (por celular normalizado)
function buildClients(records: ClientRecord[], bookings: Booking[], blockedList: BlockedClient[]): Client[] {
  const blockedBy = new Map(blockedList.map((b) => [b.phone, b]));
  const byPhone = new Map<string, Booking[]>();
  for (const b of bookings) {
    const phone = normalizePhone(b.clientPhone);
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), b]);
  }

  const toClient = (name: string, phone: string, notes: string): Client => {
    const all = byPhone.get(phone) ?? [];
    const list = all.filter((b) => b.status !== 'cancelled' && b.status !== 'no-show');
    const serviceCounts = new Map<string, number>();
    list.forEach((b) => serviceCounts.set(b.serviceName, (serviceCounts.get(b.serviceName) ?? 0) + 1));
    const favorite = [...serviceCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return {
      name,
      phone,
      notes,
      visits: list.length,
      lastVisit: list.reduce((last, b) => (b.date > last ? b.date : last), ''),
      totalSpent: list.filter((b) => b.status === 'completed').reduce((sum, b) => sum + b.price, 0),
      favoriteService: favorite,
      noShows: all.filter((b) => b.status === 'no-show').length,
      blocked: blockedBy.get(phone) ?? null,
    };
  };

  const clients = records.map((r) => toClient(r.name, r.phone, r.notes));
  // Citas de celulares que no están en la lista (por ejemplo, anteriores a la tabla de clientes)
  const known = new Set(records.map((r) => r.phone));
  for (const [phone, list] of byPhone) {
    if (!known.has(phone)) { clients.push(toClient(list[0].clientName, phone, '')); known.add(phone); }
  }
  // Bloqueados que no tienen citas ni están en la lista
  for (const b of blockedList) {
    if (!known.has(b.phone)) clients.push(toClient(b.name || 'Sin nombre', b.phone, ''));
  }
  return clients.sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
}

function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}

const baseColumns: Column<Client>[] = [
  {
    key: 'name', header: 'Cliente', primary: true,
    render: (c) => (
      <div className="flex items-center gap-3 min-w-0">
        <Initials name={c.name} />
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className="break-words md:truncate">{c.name}</span>
            {c.blocked && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/15 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                <Ban size={9} /> Bloqueado
              </span>
            )}
            {c.noShows > 0 && (
              <span className="inline-flex items-center text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                No llegó {c.noShows} {c.noShows === 1 ? 'vez' : 'veces'}
              </span>
            )}
            {c.visits >= 3 && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-gold/15 text-gold border border-gold/30 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                <Star size={9} className="fill-gold" /> VIP
              </span>
            )}
          </p>
          {c.notes && (
            <p className="text-amber-400/90 text-xs flex items-center gap-1.5 mt-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 max-w-xs">
              <AlertTriangle size={11} className="shrink-0" />
              <span className="truncate">{c.notes}</span>
            </p>
          )}
        </div>
      </div>
    ),
  },
  {
    key: 'phone', header: 'WhatsApp', aside: true,
    render: (c) => (
      <a
        href={inviteToBookLink(c.name, c.phone)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-xs font-mono transition-all whitespace-nowrap"
        title="Invitar a reservar por WhatsApp (el mensaje ya lleva el enlace de la página)"
        aria-label={`Invitar a ${c.name} a reservar por WhatsApp`}
      >
        <MessageCircle size={13} />
        {formatPhone(c.phone)}
      </a>
    ),
  },
  { key: 'visits', header: 'Visitas', render: (c) => <span className="font-mono text-white font-bold">{c.visits}</span> },
  { key: 'last', header: 'Última visita', render: (c) => <span className="text-zinc-400 text-xs font-mono whitespace-nowrap">{c.lastVisit || '—'}</span> },
  { key: 'spent', header: 'Total gastado', align: 'right', render: (c) => <span className="font-mono font-bold text-gold whitespace-nowrap">{formatCOP(c.totalSpent)}</span> },
  {
    key: 'favorite', header: 'Servicio favorito',
    render: (c) => (c.favoriteService
      ? <span className="text-xs px-2.5 py-1 bg-white/[0.04] border border-white/10 rounded-full text-zinc-300 whitespace-nowrap">{c.favoriteService}</span>
      : <span className="text-zinc-600 text-xs">—</span>),
  },
];

export default function AdminClients() {
  const [records, setRecords] = useState<ClientRecord[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyReview, setOnlyReview] = useState(false);
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [blockedList, setBlockedList] = useState<BlockedClient[]>([]);
  const [toBlock, setToBlock] = useState<Client | null>(null);
  const [reason, setReason] = useState('');
  const [savingBlock, setSavingBlock] = useState('');

  const reloadBlocked = () => getBlockedClients().then(setBlockedList).catch((err) => console.error('No se pudieron cargar los bloqueados', err));
  useEffect(() => { reloadBlocked(); }, []);

  const toggleBlock = async (c: Client, block: boolean, why = '') => {
    setSavingBlock(c.phone);
    try {
      if (block) await blockClient(c.phone, c.name, why);
      else await unblockClient(c.phone);
      await reloadBlocked();
      setToBlock(null);
      setReason('');
    } catch (err) {
      console.error('No se pudo cambiar el bloqueo', err);
      setError('No se pudo guardar el bloqueo. Intenta de nuevo.');
    } finally {
      setSavingBlock('');
    }
  };

  const columns: Column<Client>[] = [
    ...baseColumns,
    {
      key: 'block', header: '', align: 'right',
      render: (c) => c.phone.length < 10 ? null : c.blocked ? (
        <button
          onClick={() => toggleBlock(c, false)}
          disabled={savingBlock === c.phone}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
          title={c.blocked.reason ? `Motivo: ${c.blocked.reason}` : undefined}
        >
          <ShieldCheck size={13} /> Desbloquear
        </button>
      ) : (
        <button
          onClick={() => { setToBlock(c); setReason(c.noShows ? `No llegó a ${c.noShows} ${c.noShows === 1 ? 'cita' : 'citas'}` : ''); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs font-semibold whitespace-nowrap"
        >
          <Ban size={13} /> Bloquear
        </button>
      ),
    },
  ];

  useEffect(() => {
    Promise.all([getClients(), getBookings()])
      .then(([clientList, bookingList]) => {
        setRecords(clientList);
        setBookings(bookingList);
      })
      .catch((err) => {
        console.error('No se pudieron cargar los clientes', err);
        setError('No se pudieron cargar los clientes. Recarga la página para intentarlo de nuevo.');
      })
      .finally(() => setLoading(false));
  }, []);

  const clients = buildClients(records, bookings, blockedList);
  const blockedCount = clients.filter((c) => c.blocked).length;
  const reviewCount = clients.filter((c) => c.notes).length;
  const vipCount = clients.filter((c) => c.visits >= 3).length;
  const withVisits = clients.filter((c) => c.visits > 0).length;
  const query = search.toLowerCase().trim();
  const queryDigits = search.replace(/\D/g, '');
  const filtered = clients.filter((c) =>
    (!onlyReview || c.notes) &&
    (!onlyBlocked || c.blocked) &&
    (!query || c.name.toLowerCase().includes(query) || (queryDigits !== '' && c.phone.includes(queryDigits)))
  );

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Clientes" value={clients.length} sub="en la lista" icon={Users} />
        <KpiCard label="Han venido" value={withVisits} sub="con al menos una cita" icon={UserCheck} accent="emerald" />
        <KpiCard label="Clientes VIP" value={vipCount} sub="3 visitas o más" icon={Crown} accent="violet" />
        <KpiCard label="Para revisar" value={reviewCount} sub="con alguna nota" icon={AlertTriangle} accent="rose" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente por nombre o celular..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
        {blockedCount > 0 && (
          <button
            onClick={() => setOnlyBlocked((v) => !v)}
            aria-pressed={onlyBlocked}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              onlyBlocked ? 'border-red-500/50 bg-red-500/15 text-red-300' : 'btn-dark-glass hover:text-red-300'
            }`}
          >
            <Ban size={14} className="text-red-400" />
            Bloqueados ({blockedCount})
          </button>
        )}
        {reviewCount > 0 && (
          <button
            onClick={() => setOnlyReview((v) => !v)}
            aria-pressed={onlyReview}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              onlyReview ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'btn-dark-glass hover:text-amber-300'
            }`}
          >
            <AlertTriangle size={14} className="text-amber-400" />
            Solo para revisar ({reviewCount})
          </button>
        )}
      </div>

      <Panel
        title="Directorio de clientes"
        subtitle="Ordenados por número de visitas"
        action={<span className="text-[11px] font-mono text-zinc-400 bg-white/[0.04] border border-white/10 px-3 py-1 rounded-full">{filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}</span>}
        bodyClassName="pt-4"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={26} className="animate-spin text-gold" />
            <p className="text-zinc-500 text-xs">Cargando clientes...</p>
          </div>
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(c) => c.phone}
            pageSize={25}
            resetKey={`${search}|${onlyReview}|${onlyBlocked}`}
            empty="No se encontraron clientes con esa búsqueda."
          />
        )}
      </Panel>

      {toBlock && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Bloquear cliente">
          <div className="absolute inset-0 bg-black/75" onClick={() => !savingBlock && setToBlock(null)} />
          <div className="relative w-full sm:max-w-md bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-serif text-xl font-bold text-white">¿Bloquear a {toBlock.name}?</h3>
              <button onClick={() => setToBlock(null)} aria-label="Cerrar" className="w-9 h-9 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400"><X size={16} /></button>
            </div>
            <p className="text-sm text-zinc-300">
              El celular <span className="font-mono text-white">{formatPhone(toBlock.phone)}</span> ya no podrá apartar citas ni reagendar por la web.
              Tú y los barberos sí pueden seguir registrándolo en el salón. Puedes desbloquearlo cuando quieras.
            </p>
            <label className="block">
              <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">Motivo (solo lo ves tú)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: apartó 3 citas y no llegó" className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm focus:outline-none focus:border-gold/60" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setToBlock(null)} className="btn-dark-glass py-3 rounded-full text-sm font-semibold">Cancelar</button>
              <button onClick={() => toggleBlock(toBlock, true, reason)} disabled={!!savingBlock} className="py-3 rounded-full font-semibold bg-red-500 hover:bg-red-400 text-white inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {savingBlock ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Bloquear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
