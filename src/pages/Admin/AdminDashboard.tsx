import { useState } from 'react';
import { Wallet, Receipt, XCircle, Users, UserPlus, CalendarDays, ClipboardList, Crown, MessageCircle } from 'lucide-react';
import { getBookings } from '../../services/bookings';
import { getBarbers } from '../../services/barbers';
import { getClientsCount } from '../../services/clients';
import { getAllServices } from '../../services/services';
import { formatCOP } from '../../data';
import { todayKey, addDays, dayOfMonth, monthShort, monthLong, formatDateLong, nowMinutes } from '../../lib/dates';
import { lunchFor, openStatus } from '../../lib/businessHours';
import {
  inRange, revenueOf, dailySeries, statusBreakdown, popularServices, percentChange, isCompleted,
} from '../../lib/stats';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import type { Booking, Barber } from '../../types';
import type { AdminTab } from './AdminLayout';
import BarberAvatar from '../../components/common/BarberAvatar';
import { Panel, KpiCard, Trend, StatusBadge, Initials } from '../../components/admin/ui';
import { RevenueTrendChart, GoldBarChart, DonutChart, Sparkline } from '../../components/admin/charts';
import DataTable, { type Column } from '../../components/admin/DataTable';
import TodayChairs from '../../components/admin/TodayChairs';
import NewClientModal from '../../components/admin/NewClientModal';

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

function greeting(minutes: number) {
  if (minutes < 12 * 60) return 'Buenos días';
  if (minutes < 19 * 60) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Cifra corta del encabezado del día */
function DayStat({ label, value, tone = 'text-white' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className={`font-serif font-extrabold text-2xl sm:text-3xl leading-none ${tone}`}>{value}</p>
      <p className="text-zinc-400 text-[11px] uppercase tracking-[0.14em] font-semibold mt-1.5">{label}</p>
    </div>
  );
}

export default function AdminDashboard({ onNavigate }: { onNavigate?: (tab: AdminTab) => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [durations, setDurations] = useState<Map<string, number>>(new Map());
  const [clientsCount, setClientsCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(nowMinutes);
  const [showNewClient, setShowNewClient] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => {
    setNow(nowMinutes());
    Promise.all([getBookings(), getBarbers(), getClientsCount(), getAllServices()])
      .then(([bookingList, barberList, totalClients, serviceList]) => {
        setBookings(bookingList);
        setBarbers(barberList);
        setClientsCount(totalClients);
        setDurations(new Map(serviceList.map((s) => [s.id, s.duration])));
        setLoadError('');
        setLoaded(true);
      })
      .catch((err) => {
        console.error('No se pudo cargar el dashboard', err);
        setLoadError('No se pudieron cargar los datos. Se reintentará automáticamente.');
      });
  };
  useAutoRefresh(load, []);

  const today = todayKey();
  const status = openStatus();
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

  const todayList = bookings.filter((b) => b.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const todayActive = todayList.filter((b) => b.status !== 'cancelled');
  const todayPending = todayList.filter((b) => b.status === 'pending').length;
  const todayRevenue = revenueOf(todayList);
  const lunch = lunchFor(today);

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

  const quickActions: { label: string; icon: React.ElementType; onClick: () => void; primary?: boolean }[] = [
    { label: 'Cliente nuevo', icon: UserPlus, onClick: () => setShowNewClient(true), primary: true },
    { label: 'Calendario', icon: CalendarDays, onClick: () => onNavigate?.('calendar') },
    { label: 'Reservas', icon: ClipboardList, onClick: () => onNavigate?.('bookings') },
    { label: 'Mensajes', icon: MessageCircle, onClick: () => onNavigate?.('messages') },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Encabezado del día */}
      <section className="frame-gold rounded-3xl overflow-hidden">
        <div className="barber-stripe" />
        <div className="p-5 sm:p-7 flex flex-col xl:flex-row xl:items-end gap-6 xl:gap-10">
          <div className="min-w-0 flex-1">
            <p className="font-script text-gold text-2xl leading-none">{greeting(now)}</p>
            <h2 className="font-serif text-3xl sm:text-4xl font-extrabold text-white mt-1">{formatDateLong(today)}</h2>
            <p className={`inline-flex items-center gap-2 text-xs font-semibold mt-3 px-3 py-1.5 rounded-full border ${
              status.open ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-zinc-300 bg-white/[0.04] border-white/10'
            }`}>
              <span className={`w-2 h-2 rounded-full ${status.open ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              {status.label}
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              {quickActions.map(({ label, icon: Icon, onClick, primary }) => (
                <button
                  key={label}
                  onClick={onClick}
                  className={`min-h-[40px] px-4 py-2 rounded-full text-sm font-semibold ${primary ? 'btn-gold' : 'btn-dark-glass'}`}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 sm:gap-8 xl:border-l xl:border-gold/20 xl:pl-10">
            <DayStat label="Turnos hoy" value={todayActive.length} />
            <DayStat label="Por confirmar" value={todayPending} tone={todayPending ? 'text-amber-300' : 'text-white'} />
            <DayStat label="Caja de hoy" value={formatCOP(todayRevenue)} tone="text-gold" />
            <DayStat label="Clientes" value={clientsCount} />
          </div>
        </div>
      </section>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center justify-between gap-3">
          {notice}
          <button onClick={() => setNotice('')} className="text-xs underline">Cerrar</button>
        </div>
      )}
      {loadError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{loadError}</div>
      )}

      {/* La jornada de hoy, silla por silla */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <p className="section-label">La jornada de hoy</p>
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-white mt-1">Silla por silla</h3>
          </div>
          <button onClick={() => onNavigate?.('calendar')} className="text-xs font-semibold text-gold hover:underline">
            Ver la semana →
          </button>
        </div>
        {loaded ? (
          <TodayChairs barbers={barbers} bookings={todayList} now={now} durations={durations} lunch={lunch} />
        ) : (
          <div className="h-48 rounded-2xl chair-card animate-pulse" />
        )}
      </section>

      {/* Los números del mes */}
      <section className="space-y-4 sm:space-y-6">
        <div>
          <p className="section-label">Los números de {monthName}</p>
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-white mt-1">Cómo va el mes</h3>
        </div>

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
            label="Ticket promedio"
            value={formatCOP(avgTicket)}
            sub="por servicio este mes"
            icon={Receipt}
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
          <KpiCard
            label="Reservas del mes"
            value={month.length}
            sub={`${prevMonth.length} en el mismo tramo del mes pasado`}
            icon={Users}
            accent="blue"
            trend={<Trend value={percentChange(month.length, prevMonth.length)} label="Frente a los mismos días del mes pasado" />}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Panel title="Servicios más pedidos" subtitle={month.length ? `En ${monthName}` : 'Histórico'}>
            <GoldBarChart data={services} dataKey="count" nameKey="name" layout="vertical" height={Math.max(160, services.length * 42)} />
          </Panel>

          <Panel title="Rendimiento de barberos" subtitle={`Ingresos de ${monthName}`}>
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
                      <p className="text-zinc-500 text-xs">
                        {count} servicios · entrega al salón <span className="text-gold font-semibold">{formatCOP(revenue - earnings)}</span> ({100 - barber.commission}%)
                        {' '}· se queda <span className="text-emerald-400 font-semibold">{formatCOP(earnings)}</span> ({barber.commission}%)
                      </p>
                    </div>
                    <span className="font-mono text-gold text-sm font-bold">{formatCOP(revenue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 mt-2.5 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#8C6A2A] to-[#E6C27A] transition-all duration-700" style={{ width: `${(revenue / topRevenue) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
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
      </section>

      {showNewClient && (
        <NewClientModal
          onClose={() => setShowNewClient(false)}
          onSaved={(count, clientName) => {
            setShowNewClient(false);
            setNotice(`Se registró ${clientName} con ${count} ${count === 1 ? 'servicio' : 'servicios'}.`);
            load();
          }}
        />
      )}
    </div>
  );
}
