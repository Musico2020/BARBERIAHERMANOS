import { useState } from 'react';
import { Wallet, CalendarCheck, Receipt, XCircle, Users, Clock, Crown } from 'lucide-react';
import { getBookings } from '../../services/bookings';
import { getBarbers } from '../../services/barbers';
import { getClientsCount } from '../../services/clients';
import { formatCOP } from '../../data';
import { todayKey, addDays, dayOfMonth, monthShort, monthLong, formatDateLong } from '../../lib/dates';
import {
  inRange, revenueOf, dailySeries, statusBreakdown, popularServices, percentChange, isCompleted,
} from '../../lib/stats';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import type { Booking, Barber } from '../../types';
import BarberAvatar from '../../components/common/BarberAvatar';
import { Panel, KpiCard, Trend, StatusBadge, EmptyState, Initials } from '../../components/admin/ui';
import { RevenueTrendChart, GoldBarChart, DonutChart, Sparkline } from '../../components/admin/charts';
import DataTable, { type Column } from '../../components/admin/DataTable';

/** Del 1 del mes a hoy, y el mismo tramo del mes anterior, para comparar en igualdad de días. */
function monthToDate(today: string) {
  const [y, m, d] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevLastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  return {
    from: `${y}-${pad(m)}-01`,
    to: today,
    prevFrom: `${prevY}-${pad(prevM)}-01`,
    prevTo: `${prevY}-${pad(prevM)}-${pad(Math.min(d, prevLastDay))}`,
  };
}

const shortDate = (key: string) => `${dayOfMonth(key)} ${monthShort(key)}`;

const recentColumns: Column<Booking>[] = [
  {
    key: 'client', header: 'Cliente', primary: true,
    render: (b) => (
      <div className="flex items-center gap-3 min-w-0">
        <Initials name={b.clientName} className="w-9 h-9 text-xs" />
        <div className="min-w-0">
          <p className="text-white font-medium text-sm truncate">{b.clientName}</p>
          <p className="text-zinc-500 text-xs truncate">{b.serviceName}</p>
        </div>
      </div>
    ),
  },
  { key: 'barber', header: 'Barbero', render: (b) => <span className="text-zinc-300 text-xs">{b.barberName}</span> },
  { key: 'date', header: 'Cita', render: (b) => <span className="text-zinc-300 text-xs font-mono whitespace-nowrap">{shortDate(b.date)} · {b.time}</span> },
  { key: 'status', header: 'Estado', aside: true, render: (b) => <StatusBadge status={b.status} /> },
  { key: 'price', header: 'Total', align: 'right', render: (b) => <span className="text-gold font-mono font-semibold whitespace-nowrap">{formatCOP(b.price)}</span> },
];

export default function AdminDashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [clientsCount, setClientsCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  useAutoRefresh(() => {
    Promise.all([getBookings(), getBarbers(), getClientsCount()])
      .then(([bookingList, barberList, totalClients]) => {
        setBookings(bookingList);
        setBarbers(barberList);
        setClientsCount(totalClients);
        setLoadError('');
        setLoaded(true);
      })
      .catch((err) => {
        console.error('No se pudo cargar el dashboard', err);
        setLoadError('No se pudieron cargar los datos. Se reintentará automáticamente.');
      });
  }, []);

  const today = todayKey();
  const range = monthToDate(today);
  const month = inRange(bookings, range.from, range.to);
  const prevMonth = inRange(bookings, range.prevFrom, range.prevTo);

  const monthRevenue = revenueOf(month);
  const prevRevenue = revenueOf(prevMonth);
  const monthDone = month.filter(isCompleted).length;
  const prevDone = prevMonth.filter(isCompleted).length;
  const avgTicket = monthDone ? Math.round(monthRevenue / monthDone) : 0;
  const prevAvgTicket = prevDone ? Math.round(prevRevenue / prevDone) : 0;
  const cancelRate = month.length ? Math.round((month.filter((b) => b.status === 'cancelled').length / month.length) * 100) : 0;
  const prevCancelRate = prevMonth.length ? Math.round((prevMonth.filter((b) => b.status === 'cancelled').length / prevMonth.length) * 100) : 0;

  const todayList = bookings
    .filter((b) => b.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
  const todayActive = todayList.filter((b) => b.status !== 'cancelled');
  const todayPending = todayList.filter((b) => b.status === 'pending').length;

  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const series = dailySeries(bookings, last30).map((d) => ({ ...d, label: shortDate(d.date) }));
  const services = popularServices(month.length ? month : bookings, 6);

  const barberRows = barbers
    .map((barber) => {
      const mine = month.filter((b) => b.barberId === barber.id);
      const revenue = revenueOf(mine);
      return { barber, revenue, services: mine.filter(isCompleted).length, earnings: Math.round((revenue * barber.commission) / 100) };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const topRevenue = Math.max(...barberRows.map((r) => r.revenue), 1);

  const recent = [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const monthName = monthLong(today);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-semibold">Resumen del negocio</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white mt-1 ">{formatDateLong(today)}</h2>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-zinc-400 bg-white/[0.04] border border-white/10 rounded-full px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Datos en vivo · {clientsCount} clientes
        </span>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{loadError}</div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          label={`Ingresos de ${monthName}`}
          value={formatCOP(monthRevenue)}
          sub={`${monthDone} servicios completados`}
          icon={Wallet}
          trend={<Trend value={percentChange(monthRevenue, prevRevenue)} label="Frente a los mismos días del mes pasado" />}
        >
          <Sparkline data={series.map((d) => ({ value: d.revenue }))} />
        </KpiCard>
        <KpiCard
          label="Citas de hoy"
          value={todayActive.length}
          sub={todayPending ? `${todayPending} por confirmar` : 'Todas confirmadas'}
          icon={CalendarCheck}
          accent="blue"
        />
        <KpiCard
          label="Ticket promedio"
          value={formatCOP(avgTicket)}
          sub="por servicio este mes"
          icon={Receipt}
          accent="emerald"
          trend={<Trend value={percentChange(avgTicket, prevAvgTicket)} label="Frente a los mismos días del mes pasado" />}
        />
        <KpiCard
          label="Cancelaciones"
          value={`${cancelRate}%`}
          sub={`de ${month.length} reservas del mes`}
          icon={XCircle}
          accent="rose"
          trend={<Trend value={cancelRate - prevCancelRate} inverse label="Puntos frente al mes pasado" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Panel
          className="lg:col-span-2"
          title="Ingresos y citas"
          subtitle="Últimos 30 días · área dorada: ingresos · línea azul: citas"
          action={<span className="text-xs font-mono text-gold bg-gold/10 px-3 py-1.5 rounded-full border border-gold/25 font-semibold">{formatCOP(series.reduce((s, d) => s + d.revenue, 0))}</span>}
        >
          {loaded ? <RevenueTrendChart data={series} /> : <div className="h-[280px]" />}
        </Panel>
        <Panel title="Estado de las reservas" subtitle={`Reservas de ${monthName}`}>
          <DonutChart data={statusBreakdown(month).map((s) => ({ name: s.label, value: s.value, color: s.color }))} centerLabel="reservas" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Panel title="Agenda de hoy" subtitle={`${todayActive.length} citas`} bodyClassName="p-3 sm:p-4">
          {todayList.length === 0 ? (
            <EmptyState icon={Clock}>No hay citas para hoy.</EmptyState>
          ) : (
            <ul className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {todayList.map((b) => (
                <li key={b.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] ${b.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <span className="font-mono text-sm font-bold text-gold w-12 shrink-0">{b.time}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{b.clientName}</p>
                    <p className="text-zinc-500 text-xs truncate">{b.serviceName} · {b.barberName}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Servicios más pedidos" subtitle={month.length ? `En ${monthName}` : 'Histórico'}>
          <GoldBarChart data={services} dataKey="count" nameKey="name" layout="vertical" height={Math.max(160, services.length * 42)} />
        </Panel>

        <Panel title="Rendimiento de barberos" subtitle={`Ingresos de ${monthName}`}>
          {barberRows.length === 0 ? (
            <EmptyState>No hay barberos registrados.</EmptyState>
          ) : (
            <ul className="space-y-4">
              {barberRows.map(({ barber, revenue, services: count, earnings }, i) => (
                <li key={barber.id}>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <BarberAvatar barber={barber} className="w-11 h-11 rounded-full text-sm border border-gold/30" />
                      {i === 0 && revenue > 0 && (
                        <Crown size={15} className="absolute -top-2 -right-1 text-gold fill-gold drop-shadow" aria-label="Más ingresos del mes" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-semibold truncate">{barber.name}</p>
                      <p className="text-zinc-500 text-xs">{count} servicios · gana {formatCOP(earnings)} ({barber.commission}%)</p>
                    </div>
                    <span className="font-mono text-gold text-sm font-bold">{formatCOP(revenue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 mt-2.5 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#8C6A2A] to-[#E6C27A] transition-all duration-700" style={{ width: `${(revenue / topRevenue) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Reservas recientes"
        subtitle="Las últimas creadas en el sistema"
        action={<span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400"><Users size={13} /> {bookings.length} en total</span>}
        bodyClassName="pt-4"
      >
        <DataTable rows={recent} columns={recentColumns} rowKey={(b) => b.id} empty="Todavía no hay reservas." />
      </Panel>
    </div>
  );
}
