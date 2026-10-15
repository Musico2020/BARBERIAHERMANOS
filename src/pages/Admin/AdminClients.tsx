import { useState, useEffect } from 'react';
import { Search, Star, Loader2, MessageCircle, AlertTriangle, Users, Crown, UserCheck } from 'lucide-react';
import { getBookings } from '../../services/bookings';
import { getClients, normalizePhone, type ClientRecord } from '../../services/clients';
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
}

// Une la lista de clientes con sus citas (por celular normalizado)
function buildClients(records: ClientRecord[], bookings: Booking[]): Client[] {
  const byPhone = new Map<string, Booking[]>();
  for (const b of bookings) {
    const phone = normalizePhone(b.clientPhone);
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), b]);
  }

  const toClient = (name: string, phone: string, notes: string): Client => {
    const list = (byPhone.get(phone) ?? []).filter((b) => b.status !== 'cancelled');
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
    };
  };

  const clients = records.map((r) => toClient(r.name, r.phone, r.notes));
  // Citas de celulares que no están en la lista (por ejemplo, anteriores a la tabla de clientes)
  const known = new Set(records.map((r) => r.phone));
  for (const [phone, list] of byPhone) {
    if (!known.has(phone)) clients.push(toClient(list[0].clientName, phone, ''));
  }
  return clients.sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
}

function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}

const columns: Column<Client>[] = [
  {
    key: 'name', header: 'Cliente', primary: true,
    render: (c) => (
      <div className="flex items-center gap-3 min-w-0">
        <Initials name={c.name} />
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className="break-words md:truncate">{c.name}</span>
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
        href={`https://wa.me/57${c.phone}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-xs font-mono transition-all whitespace-nowrap"
        title="Escribir por WhatsApp"
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

  const clients = buildClients(records, bookings);
  const reviewCount = clients.filter((c) => c.notes).length;
  const vipCount = clients.filter((c) => c.visits >= 3).length;
  const withVisits = clients.filter((c) => c.visits > 0).length;
  const query = search.toLowerCase().trim();
  const queryDigits = search.replace(/\D/g, '');
  const filtered = clients.filter((c) =>
    (!onlyReview || c.notes) &&
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
            resetKey={`${search}|${onlyReview}`}
            empty="No se encontraron clientes con esa búsqueda."
          />
        )}
      </Panel>
    </div>
  );
}
