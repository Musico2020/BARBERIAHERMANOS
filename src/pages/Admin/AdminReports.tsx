import { useState, useEffect } from 'react';
import { FileText, FileSpreadsheet, ChevronLeft, ChevronRight, Wallet, CheckCircle2, Receipt, XCircle, Loader2, Clock, CalendarDays } from 'lucide-react';
import { getBookingsByMonth, getBookingsByYear, getBookingsInRange } from '../../services/bookings';
import { getBarbers } from '../../services/barbers';
import { getAllServices } from '../../services/services';
import { formatCOP } from '../../data';
import { todayKey, addDays } from '../../lib/dates';
import { businessConfig } from '../../config/business';
import {
  revenueOf, isCompleted, percentChange, dailySeries, revenueBy, bookingsByHour, bookingsByWeekday, STATUS_LABEL,
} from '../../lib/stats';
import { SERIES_COLORS } from '../../lib/chartFormat';
import { exportReportPdf } from '../../lib/reportPdf';
import { exportReportExcel } from '../../lib/reportExcel';
import type { ReportData } from '../../lib/report';
import DateRangePicker from '../../components/admin/DateRangePicker';
import { quincenaOf, rangeLabel, type DateRange } from '../../lib/dateRange';
import type { Booking, Barber } from '../../types';
import { barberShare } from '../../lib/earnings';
import { Panel, KpiCard, Trend, Segmented, Initials } from '../../components/admin/ui';
import { RevenueTrendChart, GoldBarChart, DonutChart } from '../../components/admin/charts';
import DataTable, { type Column } from '../../components/admin/DataTable';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface MonthRow { month: string; bookings: number; completed: number; cancelled: number; revenue: number }
interface ClientRow { name: string; phone: string; visits: number; revenue: number }

const monthColumns: Column<MonthRow>[] = [
  { key: 'month', header: 'Mes', primary: true, render: (r) => <span className="text-white font-medium">{r.month}</span> },
  { key: 'revenue', header: 'Ingresos', aside: true, align: 'right', render: (r) => <span className="font-mono text-gold font-semibold">{formatCOP(r.revenue)}</span> },
  { key: 'bookings', header: 'Reservas', render: (r) => <span className="font-mono text-zinc-300">{r.bookings}</span> },
  { key: 'completed', header: 'Completadas', render: (r) => <span className="font-mono text-emerald-400">{r.completed}</span> },
  { key: 'cancelled', header: 'Canceladas', render: (r) => <span className="font-mono text-rose-400">{r.cancelled}</span> },
];

const clientColumns: Column<ClientRow>[] = [
  {
    key: 'name', header: 'Cliente', primary: true,
    render: (c) => (
      <div className="flex items-center gap-3 min-w-0">
        <Initials name={c.name} className="w-8 h-8 text-[11px]" />
        <span className="text-white font-medium truncate">{c.name}</span>
      </div>
    ),
  },
  { key: 'revenue', header: 'Gastado', aside: true, align: 'right', render: (c) => <span className="font-mono text-gold font-semibold">{formatCOP(c.revenue)}</span> },
  { key: 'visits', header: 'Visitas', render: (c) => <span className="font-mono text-zinc-300">{c.visits}</span> },
  { key: 'phone', header: 'Celular', render: (c) => <span className="font-mono text-zinc-400 text-xs">{c.phone}</span> },
];

/** Todas las fechas de un rango, ambas incluidas */
function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

type ViewMode = 'range' | 'month' | 'year';

function daysOfMonth(year: number, month: number): string[] {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return Array.from({ length: last }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, '0')}`);
}

export default function AdminReports() {
  const [nowYear, nowMonth] = todayKey().split('-').map(Number);
  const [viewMode, setViewMode] = useState<ViewMode>('range');
  // Quincena (o cualquier rango de fechas) del reporte; por defecto, la quincena actual
  const [range, setRange] = useState<DateRange>(() => quincenaOf(todayKey()));
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(nowMonth);
  const [current, setCurrent] = useState<Booking[]>([]);
  const [previous, setPrevious] = useState<Booking[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  useEffect(() => {
    setLoading(true);
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;
    // Para comparar: el período anterior del mismo largo
    const rangeDays = daysBetween(range.start, range.end).length;
    const requests = viewMode === 'range'
      ? [getBookingsInRange(range.start, range.end), getBookingsInRange(addDays(range.start, -rangeDays), addDays(range.start, -1))]
      : viewMode === 'month'
        ? [getBookingsByMonth(year, month), getBookingsByMonth(prevY, prevM)]
        : [getBookingsByYear(year), getBookingsByYear(year - 1)];
    // Los servicios se cargan para saber el porcentaje del barbero en cada uno
    Promise.all([...requests, getBarbers(), getAllServices()])
      .then(([curr, prev, barberList]) => {
        setCurrent(curr as Booking[]);
        setPrevious(prev as Booking[]);
        setBarbers(barberList as Barber[]);
        setError('');
      })
      .catch((err) => {
        console.error('No se pudo cargar el reporte', err);
        setError('No se pudo cargar el reporte. Intenta de nuevo.');
      })
      .finally(() => setLoading(false));
  }, [viewMode, year, month, range]);

  const navMonth = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };
  const atPresent = viewMode === 'month' ? year === nowYear && month === nowMonth : year >= nowYear;

  // Cifras del período
  const revenue = revenueOf(current);
  const done = current.filter(isCompleted).length;
  const cancelled = current.filter((b) => b.status === 'cancelled').length;
  const avgTicket = done ? Math.round(revenue / done) : 0;
  const prevRevenue = revenueOf(previous);
  const prevDone = previous.filter(isCompleted).length;
  const prevCancelled = previous.filter((b) => b.status === 'cancelled').length;
  const prevAvg = prevDone ? Math.round(prevRevenue / prevDone) : 0;
  const compareLabel = viewMode === 'range' ? 'Frente al período anterior' : viewMode === 'month' ? 'Frente al mes anterior' : 'Frente al año anterior';

  const barberName = (b: Booking) => barbers.find((x) => x.id === b.barberId)?.name ?? b.barberName;
  const byBarber = revenueBy(current, barberName);
  const byService = revenueBy(current, (b) => b.serviceName);

  const trendDays = viewMode === 'range' ? daysBetween(range.start, range.end) : viewMode === 'month' ? daysOfMonth(year, month) : [];
  const trend = dailySeries(current, trendDays).map((d) => ({ ...d, label: String(Number(d.date.slice(8))) }));
  const monthRows: MonthRow[] = MONTHS.map((name, i) => {
    const list = current.filter((b) => Number(b.date.slice(5, 7)) === i + 1);
    return {
      month: name,
      bookings: list.length,
      completed: list.filter(isCompleted).length,
      cancelled: list.filter((b) => b.status === 'cancelled').length,
      revenue: revenueOf(list),
    };
  });

  const clientMap = new Map<string, ClientRow>();
  for (const b of current) {
    if (!isCompleted(b)) continue;
    const key = b.clientPhone.replace(/\D/g, '').slice(-10);
    const row = clientMap.get(key) ?? { name: b.clientName, phone: key, visits: 0, revenue: 0 };
    row.visits += 1;
    row.revenue += b.price;
    clientMap.set(key, row);
  }
  const topClients = [...clientMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const hours = bookingsByHour(current);
  const weekdays = bookingsByWeekday(current);
  const busiestHour = hours.reduce<{ name: string; bookings: number } | null>((best, h) => (!best || h.bookings > best.bookings ? h : best), null);
  const busiestDay = weekdays.reduce<{ name: string; bookings: number } | null>((best, d) => (!best || d.bookings > best.bookings ? d : best), null);

  const periodLabel = viewMode === 'range' ? rangeLabel(range) : viewMode === 'month' ? `${MONTHS[month - 1]} ${year}` : String(year);

  // Liquidación: ingresos de cada barbero × su comisión
  const barberRows = (() => {
    const map = new Map<string, { name: string; services: number; revenue: number; commission: number | null; pay: number | null }>();
    for (const b of current) {
      if (!isCompleted(b)) continue;
      const barber = barbers.find((x) => x.id === b.barberId);
      const id = barber?.id ?? `nombre:${b.barberName}`;
      const row = map.get(id) ?? { name: barber?.name ?? (b.barberName || 'Sin asignar'), services: 0, revenue: 0, commission: barber ? barber.commission : null, pay: null };
      row.services += 1;
      row.revenue += b.price;
      if (barber) row.pay = (row.pay ?? 0) + barberShare(b, barber);
      map.set(id, row);
    }
    return [...map.values()]
      // % efectivo: si hay servicios con porcentaje propio, el del barbero no aplica a todo
      .map((r) => ({ ...r, commission: r.commission === null || !r.revenue ? r.commission : Math.round(((r.pay ?? 0) * 100) / r.revenue) }))
      .sort((a, b) => b.revenue - a.revenue);
  })();
  const totalPay = barberRows.reduce((sum, r) => sum + (r.pay ?? 0), 0);

  const buildReport = (): ReportData => {
    const [y, m, d] = todayKey().split('-');
    const breakdownRows = viewMode === 'year'
      ? monthRows.map((r) => ({ label: r.month, bookings: r.bookings, completed: r.completed, revenue: r.revenue }))
      : trendDays.map((day) => {
        const list = current.filter((b) => b.date === day);
        return { label: day.split('-').reverse().join('/'), bookings: list.length, completed: list.filter(isCompleted).length, revenue: revenueOf(list) };
      }).filter((r) => r.bookings > 0);
    return {
      title: viewMode === 'range' ? 'Reporte de quincena' : viewMode === 'month' ? 'Reporte mensual' : 'Reporte anual',
      period: viewMode === 'range' ? rangeLabel(range).replace(/^./, (c) => c.toUpperCase()) : periodLabel,
      fileBase: viewMode === 'range'
        ? `reporte-${range.start}-a-${range.end}`
        : viewMode === 'month' ? `reporte-${year}-${String(month).padStart(2, '0')}` : `reporte-${year}`,
      generatedAt: `${d}/${m}/${y}`,
      business: { name: businessConfig.name, address: businessConfig.address.trim(), phone: businessConfig.phone },
      kpis: [
        { label: 'Ingresos', value: formatCOP(revenue), note: `${done} servicios completados` },
        { label: 'Servicios completados', value: String(done), note: `de ${current.length} reservas` },
        { label: 'Ticket promedio', value: formatCOP(avgTicket), note: 'por servicio' },
        { label: 'Pago a barberos', value: formatCOP(totalPay), note: `queda al negocio ${formatCOP(revenue - totalPay)}` },
      ],
      barbers: barberRows,
      services: byService.map((x) => ({ name: x.name, count: x.count, revenue: x.revenue })),
      breakdown: {
        title: viewMode === 'year' ? `Movimiento por mes · ${year}` : 'Movimiento por día',
        label: viewMode === 'year' ? 'Mes' : 'Día',
        rows: breakdownRows,
      },
      topClients: topClients.map((c) => ({ name: c.name, phone: c.phone, visits: c.visits, revenue: c.revenue })),
      detail: [...current]
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
        .map((b) => ({
          date: b.date, time: b.time, client: b.clientName, phone: b.clientPhone,
          service: b.serviceName, barber: barberName(b), status: STATUS_LABEL[b.status], price: b.price,
        })),
    };
  };

  const handleExport = async (kind: 'pdf' | 'excel') => {
    setExporting(kind);
    try {
      const data = buildReport();
      if (kind === 'pdf') await exportReportPdf(data);
      else await exportReportExcel(data);
    } catch (err) {
      console.error('No se pudo generar el reporte', err);
      setError(kind === 'pdf' ? 'No se pudo generar el PDF. Intenta de nuevo.' : 'No se pudo generar el Excel. Intenta de nuevo.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={viewMode}
            onChange={setViewMode}
            options={[{ value: 'range', label: 'Quincena' }, { value: 'month', label: 'Mensual' }, { value: 'year', label: 'Anual' }]}
          />
          {viewMode === 'range' ? (
            <DateRangePicker value={range} onChange={setRange} />
          ) : (
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/10">
            <button
              onClick={() => (viewMode === 'month' ? navMonth(-1) : setYear((y) => y - 1))}
              aria-label="Período anterior"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-gold hover:bg-white/5"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-white text-sm font-semibold min-w-[130px] text-center">{periodLabel}</span>
            <button
              onClick={() => (viewMode === 'month' ? navMonth(1) : setYear((y) => y + 1))}
              disabled={atPresent}
              aria-label="Período siguiente"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-gold hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('excel')}
            disabled={loading || exporting !== null}
            className="btn-dark-glass px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-60"
          >
            {exporting === 'excel' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} className="text-emerald-400" />}
            Excel
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={loading || exporting !== null}
            className="btn-gold px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
          >
            {exporting === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            <span>PDF</span>
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 size={26} className="animate-spin text-gold" />
          <p className="text-zinc-500 text-xs">Generando reporte...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard label="Ingresos" value={formatCOP(revenue)} sub={`${done} servicios completados`} icon={Wallet}
              trend={<Trend value={percentChange(revenue, prevRevenue)} label={compareLabel} />} />
            <KpiCard label="Completadas" value={done} sub={`de ${current.length} reservas`} icon={CheckCircle2} accent="emerald"
              trend={<Trend value={percentChange(done, prevDone)} label={compareLabel} />} />
            <KpiCard label="Ticket promedio" value={formatCOP(avgTicket)} sub="por servicio" icon={Receipt} accent="blue"
              trend={<Trend value={percentChange(avgTicket, prevAvg)} label={compareLabel} />} />
            <KpiCard label="Cancelaciones" value={cancelled} sub={current.length ? `${Math.round((cancelled / current.length) * 100)}% de las reservas` : 'sin reservas'} icon={XCircle} accent="rose"
              trend={<Trend value={percentChange(cancelled, prevCancelled)} inverse label={compareLabel} />} />
          </div>

          {viewMode !== 'year' ? (
            <Panel title={`Ingresos por día · ${periodLabel}`} subtitle="Área dorada: ingresos · línea azul: citas">
              <RevenueTrendChart data={trend} />
            </Panel>
          ) : (
            <Panel title={`Ingresos por mes · ${year}`} subtitle="Servicios completados de cada mes">
              <GoldBarChart data={monthRows.map((r) => ({ name: r.month.slice(0, 3), revenue: r.revenue }))} dataKey="revenue" nameKey="name" height={280} />
            </Panel>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Panel title="Ingresos por barbero" subtitle={periodLabel}>
              <DonutChart
                data={byBarber.map((b, i) => ({ name: b.name, value: b.revenue, color: SERIES_COLORS[i % SERIES_COLORS.length] }))}
                centerLabel="ingresos"
                format={formatCOP}
              />
            </Panel>
            <Panel title="Ingresos por servicio" subtitle={periodLabel}>
              <GoldBarChart data={byService.slice(0, 7)} dataKey="revenue" nameKey="name" layout="vertical" height={Math.max(180, Math.min(byService.length, 7) * 40)} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Panel
              title="Horas pico"
              subtitle="Citas según la hora de inicio"
              action={busiestHour && busiestHour.bookings > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gold bg-gold/10 border border-gold/25 rounded-full px-3 py-1.5 font-semibold">
                  <Clock size={13} /> Más llena: {busiestHour.name}
                </span>
              )}
            >
              <GoldBarChart data={hours} dataKey="bookings" nameKey="name" height={240} />
            </Panel>
            <Panel
              title="Días más ocupados"
              subtitle="Citas según el día de la semana"
              action={busiestDay && busiestDay.bookings > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gold bg-gold/10 border border-gold/25 rounded-full px-3 py-1.5 font-semibold">
                  <CalendarDays size={13} /> {busiestDay.name}
                </span>
              )}
            >
              <GoldBarChart data={weekdays} dataKey="bookings" nameKey="name" height={240} />
            </Panel>
          </div>

          {viewMode === 'year' && (
            <Panel title={`Resumen mensual ${year}`} bodyClassName="pt-4">
              <DataTable
                rows={monthRows}
                columns={monthColumns}
                rowKey={(r) => r.month}
                rowClassName={(r) => (r.bookings === 0 ? 'opacity-40' : '')}
              />
            </Panel>
          )}

          <Panel title="Mejores clientes" subtitle={`Los que más gastaron · ${periodLabel}`} bodyClassName="pt-4">
            <DataTable rows={topClients} columns={clientColumns} rowKey={(c) => c.phone} empty="No hay servicios completados en este período." />
          </Panel>
        </>
      )}
    </div>
  );
}
