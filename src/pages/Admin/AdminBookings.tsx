import { useState } from 'react';
import { Search, Download, ChevronDown, Loader2, MessageCircle, UserPlus, CheckCircle2, Trash2, CalendarCheck, X } from 'lucide-react';
import { getBookings, updateBookingStatus, deleteBooking } from '../../services/bookings';
import { formatCOP } from '../../data';
import { dayOfMonth, monthShort, dayShort, todayKey, formatDateLong } from '../../lib/dates';
import { STATUS_LABEL, type BookingStatus } from '../../lib/stats';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import type { Booking } from '../../types';
import { Panel, StatusBadge, Initials } from '../../components/admin/ui';
import DataTable, { type Column } from '../../components/admin/DataTable';
import NewClientModal from '../../components/admin/NewClientModal';
import ShiftedTag from '../../components/common/ShiftedTag';
import { isShifted } from '../../lib/shifted';

const STATUSES = Object.keys(STATUS_LABEL) as BookingStatus[];

const whatsappLink = (phone: string) => `https://wa.me/57${phone.replace(/\D/g, '').slice(-10)}`;

/** CSV que Excel abre bien: con BOM (tildes) y comillas (nombres con comas). */
function toCSV(rows: (string | number)[][]): string {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export default function AdminBookings() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'todos'>('todos');
  // «Hoy»: solo las citas del día de hoy (hora de Colombia)
  const [onlyToday, setOnlyToday] = useState(false);
  const [list, setList] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  // Reserva que pide confirmación antes de eliminarse, y la que se está eliminando
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useAutoRefresh(() => {
    getBookings()
      .then((bookings) => { setList(bookings); setError(''); })
      .catch((err) => {
        console.error('No se pudieron cargar las reservas', err);
        setError('No se pudieron cargar las reservas. Se reintentará automáticamente.');
      })
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const query = search.toLowerCase().trim();
  const digits = search.replace(/\D/g, '');
  const matchesSearch = (b: Booking) =>
    !query ||
    b.clientName.toLowerCase().includes(query) ||
    b.serviceName.toLowerCase().includes(query) ||
    b.barberName.toLowerCase().includes(query) ||
    (digits.length >= 3 && b.clientPhone.replace(/\D/g, '').includes(digits));
  const today = todayKey();
  const todayCount = list.filter((b) => b.date === today && b.status !== 'cancelled').length;
  // De la última reserva (fecha y hora más tardía) a la primera; con «Hoy», solo las de hoy
  const searched = list
    .filter((b) => matchesSearch(b) && (!onlyToday || b.date === today))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.createdAt.localeCompare(a.createdAt));
  const filtered = searched.filter((b) => statusFilter === 'todos' || b.status === statusFilter);
  const counts = new Map<string, number>(STATUSES.map((s) => [s, searched.filter((b) => b.status === s).length]));

  const changeStatus = async (id: string, newStatus: BookingStatus) => {
    const previous = list.find((b) => b.id === id)?.status;
    setList((prev) => prev.map((b) => (b.id === id ? { ...b, status: newStatus } : b)));
    try {
      await updateBookingStatus(id, newStatus);
      setError('');
      // Al completar antes de tiempo, la base adelanta las citas que venían pegadas: se recargan y se avisa
      if (newStatus === 'completed') {
        const fresh = await getBookings();
        setList(fresh);
        const since = Date.now() - 2 * 60 * 1000;
        const moved = fresh.filter((b) => isShifted(b) && b.shiftedAt && new Date(b.shiftedAt).getTime() >= since);
        if (moved.length) {
          setNotice(`Se ${moved.length === 1 ? 'adelantó 1 cita' : `adelantaron ${moved.length} citas`} de hoy: ${moved.map((b) => `${b.clientName} (${b.originalTime} → ${b.time})`).join(', ')}. Usa «Avisar al cliente» en cada una.`);
        }
      }
    } catch (err) {
      console.error('No se pudo cambiar el estado de la reserva', err);
      if (previous) setList((prev) => prev.map((b) => (b.id === id ? { ...b, status: previous } : b)));
      setError('No se pudo guardar el cambio de estado. Intenta de nuevo.');
    }
  };

  const removeBooking = async (b: Booking) => {
    setDeletingId(b.id);
    try {
      await deleteBooking(b.id);
      setList((prev) => prev.filter((x) => x.id !== b.id));
      setConfirmId(null);
      setError('');
      setNotice(`Reserva de ${b.clientName} (${b.serviceName}, ${b.date} ${b.time}) eliminada.`);
    } catch (err) {
      console.error('No se pudo eliminar la reserva', err);
      setError('No se pudo eliminar la reserva. Intenta de nuevo.');
    } finally {
      setDeletingId(null);
    }
  };

  const exportCSV = () => {
    const header = ['ID', 'Cliente', 'Teléfono', 'Servicio', 'Barbero', 'Fecha', 'Hora', 'Total', 'Estado'];
    const rows = filtered.map((b) => [b.id, b.clientName, b.clientPhone, b.serviceName, b.barberName, b.date, b.time, b.price, STATUS_LABEL[b.status]]);
    const url = URL.createObjectURL(new Blob([toCSV([header, ...rows])], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reservas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<Booking>[] = [
    {
      key: 'client', header: 'Cliente', primary: true,
      render: (b) => (
        <div className="flex items-center gap-3 min-w-0">
          <Initials name={b.clientName} />
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{b.clientName}</p>
            <a
              href={whatsappLink(b.clientPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-500 hover:text-emerald-400 text-xs font-mono transition-colors"
              title="Escribir por WhatsApp"
            >
              <MessageCircle size={11} /> {b.clientPhone}
            </a>
          </div>
        </div>
      ),
    },
    { key: 'service', header: 'Servicio', render: (b) => <span className="text-zinc-200 text-sm">{b.serviceName}</span> },
    { key: 'barber', header: 'Barbero', render: (b) => <span className="text-zinc-400 text-sm">{b.barberName}</span> },
    {
      key: 'date', header: 'Cita',
      render: (b) => (
        <span className="flex flex-col gap-1">
          <span className="whitespace-nowrap">
            <span className="text-zinc-200 text-sm">{dayShort(b.date)} {dayOfMonth(b.date)} {monthShort(b.date)}</span>
            <span className="text-gold font-mono text-sm font-semibold ml-2">{b.time}</span>
          </span>
          <ShiftedTag b={b} />
        </span>
      ),
    },
    { key: 'price', header: 'Total', align: 'right', render: (b) => <span className="text-gold font-mono font-bold whitespace-nowrap">{formatCOP(b.price)}</span> },
    { key: 'status', header: 'Estado', aside: true, render: (b) => <StatusBadge status={b.status} /> },
    {
      key: 'change', header: 'Estado / eliminar',
      render: (b) =>
        confirmId === b.id ? (
          // Confirmación en el mismo lugar, para que la tabla no crezca
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <button
              type="button"
              onClick={() => removeBooking(b)}
              disabled={deletingId === b.id}
              title="Confirmar: eliminar esta reserva"
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/90 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-60"
            >
              {deletingId === b.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Eliminar
            </button>
            <button
              type="button"
              onClick={() => setConfirmId(null)}
              disabled={deletingId === b.id}
              title="Cancelar"
              className="px-3 py-2 rounded-lg border border-white/12 text-zinc-300 hover:text-white text-xs font-semibold"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 md:flex-none">
              <select
                value={b.status}
                onChange={(e) => changeStatus(b.id, e.target.value as BookingStatus)}
                aria-label={`Cambiar estado de la cita de ${b.clientName}`}
                className="w-full md:w-auto text-xs pl-3 pr-8 py-2 bg-[#141414] border border-white/12 hover:border-gold/40 rounded-lg text-zinc-200 focus:outline-none focus:border-gold/60 cursor-pointer appearance-none transition-colors"
              >
                {STATUSES.map((s) => <option key={s} value={s} className="bg-[#181818]">{STATUS_LABEL[s]}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>
            <button
              type="button"
              onClick={() => { setConfirmId(b.id); setNotice(''); }}
              aria-label={`Eliminar la reserva de ${b.clientName}`}
              title="Eliminar reserva"
              className="shrink-0 p-2 rounded-lg border border-white/10 text-zinc-500 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
    },
  ];

  const chip = (value: BookingStatus | 'todos', label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setStatusFilter(value)}
      aria-pressed={statusFilter === value}
      className={`shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        statusFilter === value ? 'bg-gold text-dark border-gold' : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/25'
      }`}
    >
      {label}
      <span className={`font-mono text-[10px] px-1.5 rounded-full ${statusFilter === value ? 'bg-dark/15' : 'bg-white/5'}`}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      {notice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          <CheckCircle2 size={16} className="shrink-0" /> {notice}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => { setNotice(''); setShowNewClient(true); }}
          className="btn-gold px-4 py-3 rounded-xl text-sm font-semibold justify-center sm:order-last"
          title="Registrar un cliente atendido en la barbería o fuera del horario"
        >
          <UserPlus size={15} />
          <span>Cliente nuevo</span>
        </button>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, celular, servicio o barbero..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="btn-dark-glass px-4 py-3 rounded-xl text-sm font-medium hover:border-gold/40 hover:text-gold justify-center disabled:opacity-40"
          title="Descargar las reservas filtradas para abrir en Excel"
        >
          <Download size={15} />
          Exportar Excel (CSV)
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        <button
          type="button"
          onClick={() => setOnlyToday(!onlyToday)}
          aria-pressed={onlyToday}
          title="Ver solo las reservas de hoy"
          className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
            onlyToday ? 'bg-emerald-500 text-white border-emerald-500' : 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'
          }`}
        >
          <CalendarCheck size={14} />
          Hoy
          <span className={`font-mono text-[10px] px-1.5 rounded-full ${onlyToday ? 'bg-black/15' : 'bg-emerald-500/15'}`}>{todayCount}</span>
          {onlyToday && <X size={12} aria-label="Quitar filtro de hoy" />}
        </button>
        <span className="shrink-0 w-px bg-white/10 my-1" aria-hidden="true" />
        {chip('todos', 'Todas', searched.length)}
        {STATUSES.map((s) => chip(s, STATUS_LABEL[s], counts.get(s) ?? 0))}
      </div>

      <Panel
        title={onlyToday ? 'Reservas de hoy' : 'Registro de citas'}
        subtitle={onlyToday ? formatDateLong(today) : 'Cambia el estado de cada cita a medida que avanza el día'}
        action={<span className="text-[11px] font-mono text-zinc-400 bg-white/[0.04] border border-white/10 px-3 py-1 rounded-full">{filtered.length} {filtered.length === 1 ? 'reserva' : 'reservas'}</span>}
        bodyClassName="pt-4"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={26} className="animate-spin text-gold" />
            <p className="text-zinc-500 text-xs">Cargando reservas...</p>
          </div>
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(b) => b.id}
            pageSize={25}
            resetKey={`${search}|${statusFilter}|${onlyToday}`}
            empty={onlyToday ? 'Hoy no hay reservas con estos filtros.' : 'No se encontraron reservas con estos filtros.'}
            rowClassName={(b) => (b.status === 'cancelled' ? 'opacity-60' : '')}
          />
        )}
      </Panel>

      {showNewClient && (
        <NewClientModal
          onClose={() => setShowNewClient(false)}
          onSaved={(count, clientName) => {
            setShowNewClient(false);
            setNotice(count === 1 ? 'Cliente registrado: el servicio quedó como completado y ya cuenta en los reportes.' : `Cliente registrado: sus ${count} servicios quedaron como completados y ya cuentan en los reportes.`);
            setReloadKey((k) => k + 1);
            // Se muestra lo recién registrado (la tabla va de la fecha más lejana a la más cercana)
            setSearch(clientName);
            setStatusFilter('todos');
          }}
        />
      )}
    </div>
  );
}
