import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Receipt, Printer, Search, Scissors, Wallet, Building2,
  MessageCircle, X, Crown, RefreshCw, FileSpreadsheet, Eye,
} from 'lucide-react';
import { getBookings } from '../../services/bookings';
import { getBarbers } from '../../services/barbers';
import { getAllServices } from '../../services/services';
import { formatCOP } from '../../data';
import { todayKey, addDays, time12, formatDateLong, dayShort } from '../../lib/dates';
import { isCompleted } from '../../lib/stats';
import { calculateSplit, isBarberOwner, type BookingFinancialSplit } from '../../lib/earnings';
import { businessConfig } from '../../config/business';
import type { Booking, Barber, Service } from '../../types';
import { Panel, Initials, StatusBadge } from '../../components/admin/ui';
import BarberAvatar from '../../components/common/BarberAvatar';

// Facturación y registro de caja por servicio:
// Muestra cada servicio cobrado, el desglose exacto de lo que le queda al barbero
// y lo que realmente ingresa a la administración (respetando que Walter es dueño y no rinde cuentas).

type PeriodFilter = 'hoy' | 'ayer' | 'semana' | 'quincena' | 'mes' | 'todos';

interface InvoiceItem {
  booking: Booking;
  barber?: Barber;
  split: BookingFinancialSplit;
  invoiceNumber: string;
}

export default function AdminInvoices() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [period, setPeriod] = useState<PeriodFilter>('hoy');
  const [selectedBarberId, setSelectedBarberId] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<'completed' | 'all'>('completed');
  const [search, setSearch] = useState('');

  // Factura abierta en el modal de detalle / impresión
  const [activeInvoice, setActiveInvoice] = useState<InvoiceItem | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const [bList, barbList, servList] = await Promise.all([
        getBookings(),
        getBarbers(),
        getAllServices(),
      ]);
      setBookings(bList);
      setBarbers(barbList);
      setServices(servList);
    } catch (err) {
      console.error('No se pudieron cargar las facturas', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const today = todayKey();
  const yesterday = addDays(today, -1);
  const sevenDaysAgo = addDays(today, -6);
  const currentMonthPrefix = today.slice(0, 7);

  // 1. Filtrado de reservas por fecha
  const filteredByDate = useMemo(() => {
    return bookings.filter((b) => {
      if (period === 'hoy') return b.date === today;
      if (period === 'ayer') return b.date === yesterday;
      if (period === 'semana') return b.date >= sevenDaysAgo && b.date <= today;
      if (period === 'quincena') {
        const day = Number(b.date.slice(8, 10));
        const isFirstHalf = Number(today.slice(8, 10)) <= 15;
        const matchesMonth = b.date.startsWith(currentMonthPrefix);
        return matchesMonth && (isFirstHalf ? day <= 15 : day > 15);
      }
      if (period === 'mes') return b.date.startsWith(currentMonthPrefix);
      return true;
    });
  }, [bookings, period, today, yesterday, sevenDaysAgo, currentMonthPrefix]);

  // 2. Generación de facturas con desglose exacto para cada servicio
  const invoices: InvoiceItem[] = useMemo(() => {
    return filteredByDate
      .filter((b) => (statusFilter === 'completed' ? isCompleted(b) : true))
      .filter((b) => (selectedBarberId === 'todos' ? true : b.barberId === selectedBarberId))
      .filter((b) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase().trim();
        return (
          b.clientName.toLowerCase().includes(q) ||
          b.clientPhone.includes(q) ||
          b.serviceName.toLowerCase().includes(q) ||
          b.barberName.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
      .map((b, index) => {
        const barber = barbers.find((x) => x.id === b.barberId);
        const split = calculateSplit(b, barber);
        // Formato de número de factura: FAC-YYMMDD-CORRELATIVO
        const dateCode = b.date.replace(/-/g, '').slice(2);
        const seq = String(b.id.replace(/\D/g, '').slice(-3) || index + 1).padStart(3, '0');
        const invoiceNumber = `FAC-${dateCode}-${seq}`;
        return { booking: b, barber, split, invoiceNumber };
      });
  }, [filteredByDate, statusFilter, selectedBarberId, search, barbers]);

  // 3. Totales de Caja específicos
  const totals = useMemo(() => {
    let grossTotal = 0;       // Total facturado (bruto)
    let adminTotal = 0;       // Lo que realmente queda en la administración / sistema
    let barbersPayTotal = 0;  // Total comisiones que se deben pagar a barberos empleados
    let walterTotal = 0;      // Margen total que le corresponde a Walter (propio + 22% de Gerardo, etc.)
    let danielTotal = 0;      // Margen total que le corresponde a Daniel (propio + 23% de Nelson, etc.)

    invoices.forEach(({ split }) => {
      grossTotal += split.price;
      adminTotal += split.adminKeep;
      barbersPayTotal += split.barberPay;
      walterTotal += split.walterAmount;
      danielTotal += split.danielAmount;
    });

    return { grossTotal, adminTotal, barbersPayTotal, walterTotal, danielTotal, count: invoices.length };
  }, [invoices]);

  // 4. Exportar reporte de facturas a Excel
  const handleExportExcel = async () => {
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Salón Hermanos';
      wb.created = new Date();

      const ws = wb.addWorksheet('Facturas de Caja');

      ws.columns = [
        { header: 'Factura #', key: 'invoice', width: 16 },
        { header: 'Fecha', key: 'date', width: 12 },
        { header: 'Hora', key: 'time', width: 12 },
        { header: 'Cliente', key: 'client', width: 24 },
        { header: 'Teléfono', key: 'phone', width: 16 },
        { header: 'Servicio', key: 'service', width: 28 },
        { header: 'Barbero', key: 'barber', width: 20 },
        { header: 'Tipo Barbero', key: 'barberType', width: 18 },
        { header: 'Total Cobrado', key: 'price', width: 16 },
        { header: '% Barbero', key: 'barberPercent', width: 12 },
        { header: 'Pago al Barbero', key: 'barberPay', width: 16 },
        { header: '% Salón', key: 'adminPercent', width: 12 },
        { header: 'Queda a Administración', key: 'adminKeep', width: 22 },
        { header: 'Beneficiario Dueño', key: 'beneficiary', width: 20 },
        { header: 'Para Walter', key: 'walterAmount', width: 16 },
        { header: 'Para Daniel', key: 'danielAmount', width: 16 },
        { header: 'Estado', key: 'status', width: 14 },
      ];

      // Formato encabezado
      const headerRow = ws.getRow(1);
      headerRow.height = 26;
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };

      invoices.forEach(({ booking, barber, split, invoiceNumber }) => {
        const isOwner = split.isOwner;
        ws.addRow({
          invoice: invoiceNumber,
          date: booking.date,
          time: time12(booking.time),
          client: booking.clientName,
          phone: booking.clientPhone,
          service: booking.serviceName,
          barber: barber?.name || booking.barberName,
          barberType: isOwner
            ? `Dueño (${split.ownerKey === 'daniel' ? 'Daniel' : 'Walter'})`
            : 'Barbero empleado',
          price: split.price,
          barberPercent: isOwner ? '100% (Dueño)' : `${split.barberPercent}%`,
          barberPay: split.barberPay,
          adminPercent: `${split.adminPercent}%`,
          adminKeep: split.adminKeep,
          beneficiary: isOwner
            ? (split.ownerKey === 'daniel' ? 'Daniel (Dueño)' : 'Walter (Dueño)')
            : (split.beneficiary === 'daniel' ? 'Daniel' : split.beneficiary === 'walter' ? 'Walter' : 'Caja General'),
          walterAmount: split.walterAmount,
          danielAmount: split.danielAmount,
          status: booking.status,
        });
      });

      // Fila de totales
      const totalRow = ws.addRow({
        invoice: 'TOTALES',
        date: '',
        time: '',
        client: '',
        phone: '',
        service: '',
        barber: '',
        barberType: '',
        price: totals.grossTotal,
        barberPercent: '',
        barberPay: totals.barbersPayTotal,
        adminPercent: '',
        adminKeep: totals.adminTotal,
        beneficiary: 'TOTALES DUEÑOS',
        walterAmount: totals.walterTotal,
        danielAmount: totals.danielTotal,
        status: `${totals.count} facturas`,
      });
      totalRow.font = { bold: true };
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8C8' } };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Facturas-Salon-Hermanos-${period}-${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al exportar a Excel', err);
      alert('No se pudo generar el archivo Excel.');
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const sendWhatsAppReceipt = (inv: InvoiceItem) => {
    const phone = inv.booking.clientPhone.replace(/\D/g, '').slice(-10);
    if (!phone) return;
    const msg = `Hola ${inv.booking.clientName}! 💈 Aquí tienes el comprobante de tu servicio en *${businessConfig.name}*:

📄 *Factura:* ${inv.invoiceNumber}
📅 *Fecha:* ${inv.booking.date} · ${time12(inv.booking.time)}
✂️ *Servicio:* ${inv.booking.serviceName}
💈 *Atendido por:* ${inv.barber?.name || inv.booking.barberName}
💰 *Total pagado:* ${formatCOP(inv.booking.price)}

¡Gracias por tu visita a Salón Hermanos - Club de Caballeros! Esperamos verte pronto.`;
    window.open(`https://wa.me/57${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Encabezado y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-serif text-xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <Receipt className="text-gold shrink-0" size={24} />
            <span>Facturas y Caja</span>
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-0.5">
            Registro de servicios: desglose de lo que ingresa a la administración vs comisiones de barberos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex-1 sm:flex-initial btn-dark-glass px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:text-gold"
            title="Refrescar datos"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-gold' : ''} />
            <span>Actualizar</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex-1 sm:flex-initial btn-gold px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-gold"
          >
            <FileSpreadsheet size={15} />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Tarjetas Principales de Caja (2 columnas en móvil, 5 en computador) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {/* Total Bruto */}
        <div className="table-card p-3 sm:p-5 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-transparent to-transparent flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider line-clamp-1">Caja Cobrada</span>
            <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gold/15 flex items-center justify-center text-gold shrink-0">
              <Wallet size={14} />
            </span>
          </div>
          <p className="font-mono text-lg sm:text-2xl font-extrabold text-gold mt-1.5 sm:mt-2 truncate">
            {formatCOP(totals.grossTotal)}
          </p>
          <p className="text-zinc-400 text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate">
            {totals.count} {totals.count === 1 ? 'servicio' : 'servicios'}
          </p>
        </div>

        {/* Queda en el Sistema (Administración Total) */}
        <div className="table-card p-3 sm:p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-emerald-300 uppercase tracking-wider line-clamp-1">En el Sistema</span>
            <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
              <Building2 size={14} />
            </span>
          </div>
          <p className="font-mono text-lg sm:text-2xl font-extrabold text-emerald-400 mt-1.5 sm:mt-2 truncate">
            {formatCOP(totals.adminTotal)}
          </p>
          <p className="text-emerald-300/80 text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate font-medium">
            Walter + Daniel (Salón)
          </p>
        </div>

        {/* Margen para Walter (Dueño 1) */}
        <div className="table-card p-3 sm:p-5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-amber-300 uppercase tracking-wider line-clamp-1">Para Walter</span>
            <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <Crown size={14} />
            </span>
          </div>
          <p className="font-mono text-lg sm:text-2xl font-extrabold text-amber-300 mt-1.5 sm:mt-2 truncate">
            {formatCOP(totals.walterTotal)}
          </p>
          <p className="text-amber-300/80 text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate">
            Propio + 22% Gerardo
          </p>
        </div>

        {/* Margen para Daniel (Dueño 2) */}
        <div className="table-card p-3 sm:p-5 rounded-2xl border border-purple-500/30 bg-purple-500/[0.04] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-purple-300 uppercase tracking-wider line-clamp-1">Para Daniel</span>
            <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
              <Crown size={14} />
            </span>
          </div>
          <p className="font-mono text-lg sm:text-2xl font-extrabold text-purple-300 mt-1.5 sm:mt-2 truncate">
            {formatCOP(totals.danielTotal)}
          </p>
          <p className="text-purple-300/80 text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate">
            Propio + 23% Nelson
          </p>
        </div>

        {/* A Pagar a Barberos */}
        <div className="table-card p-3 sm:p-5 rounded-2xl border border-sky-500/30 bg-sky-500/[0.04] col-span-2 lg:col-span-1 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-sky-300 uppercase tracking-wider line-clamp-1">A Barberos</span>
            <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-400 shrink-0">
              <Scissors size={14} />
            </span>
          </div>
          <p className="font-mono text-lg sm:text-2xl font-extrabold text-sky-300 mt-1.5 sm:mt-2 truncate">
            {formatCOP(totals.barbersPayTotal)}
          </p>
          <p className="text-sky-300/80 text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate">
            Comisiones a pagar
          </p>
        </div>
      </div>

      {/* Filtros de Facturación */}
      <Panel>
        <div className="space-y-3">
          {/* Período (scroll horizontal en móvil) */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {[
              { id: 'hoy', label: 'Hoy' },
              { id: 'ayer', label: 'Ayer' },
              { id: 'semana', label: '7 días' },
              { id: 'quincena', label: 'Quincena' },
              { id: 'mes', label: 'Este mes' },
              { id: 'todos', label: 'Histórico' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPeriod(id as PeriodFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] flex items-center justify-center ${
                  period === id
                    ? 'bg-gold text-dark font-bold'
                    : 'text-zinc-400 hover:text-white bg-white/[0.03] hover:bg-white/5 border border-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filtro por Barbero, Estado y Búsqueda */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Selector de barbero */}
            <select
              value={selectedBarberId}
              onChange={(e) => setSelectedBarberId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-gold/50 min-h-[38px]"
            >
              <option value="todos">Todos los barberos</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {isBarberOwner(b) ? '(Dueño · 100%)' : `(${b.commission}% comisión)`}
                </option>
              ))}
            </select>

            {/* Selector de estado */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'completed' | 'all')}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-gold/50 min-h-[38px]"
            >
              <option value="completed">Solo cobradas / completadas</option>
              <option value="all">Todas las reservas</option>
            </select>

            {/* Buscador */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar cliente, servicio o factura..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white text-xs placeholder:text-zinc-600 focus:outline-none focus:border-gold/50 min-h-[38px]"
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* Lista de Facturas: Vista Móvil (Tarjetas) y Vista Escritorio (Tabla) */}
      <Panel
        title={`Facturas Emitidas (${invoices.length})`}
        subtitle="Desglose servicio por servicio con el porcentaje correspondiente a cada parte"
      >
        {loading ? (
          <div className="py-16 text-center text-zinc-500 text-sm">Cargando facturas de caja...</div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-dashed border-white/10 p-8">
            <Receipt size={36} className="mx-auto mb-3 text-zinc-600" />
            <p className="text-white font-medium text-sm">No hay facturas registradas en este período</p>
            <p className="text-zinc-500 text-xs mt-1">
              Prueba cambiando los filtros de fecha o barbero seleccionados.
            </p>
          </div>
        ) : (
          <>
            {/* VISTA MÓVIL: Tarjetas compactas adaptadas al teléfono */}
            <div className="block md:hidden space-y-3">
              {invoices.map((inv) => {
                const { booking, barber, split, invoiceNumber } = inv;
                const isOwner = split.isOwner;

                return (
                  <div
                    key={booking.id}
                    className="table-card rounded-2xl p-4 border border-white/[0.08] hover:border-gold/30 transition-all space-y-3"
                  >
                    {/* Encabezado de la factura */}
                    <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-gold text-xs block truncate">
                          {invoiceNumber}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono">
                          {dayShort(booking.date)} {booking.date.slice(8, 10)} · {time12(booking.time)}
                        </span>
                      </div>
                      <StatusBadge status={booking.status} />
                    </div>

                    {/* Cliente y Servicio */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Cliente</span>
                        <p className="font-semibold text-white truncate">{booking.clientName}</p>
                        <a
                          href={`https://wa.me/57${booking.clientPhone.replace(/\D/g, '').slice(-10)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-400 hover:text-emerald-400 text-[11px] font-mono inline-flex items-center gap-1 mt-0.5"
                        >
                          <MessageCircle size={11} className="text-emerald-400" />
                          <span>{booking.clientPhone}</span>
                        </a>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Servicio</span>
                        <p className="font-medium text-zinc-200 line-clamp-2">{booking.serviceName}</p>
                      </div>
                    </div>

                    {/* Barbero */}
                    <div className="flex items-center justify-between gap-2 bg-white/[0.02] rounded-xl p-2 border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        {barber ? (
                          <BarberAvatar barber={barber} className="w-7 h-7 rounded-full text-[10px]" />
                        ) : (
                          <Initials name={booking.barberName} className="w-7 h-7 rounded-full text-[10px]" />
                        )}
                        <span className="font-medium text-white text-xs truncate">
                          {barber?.shortName || booking.barberName}
                        </span>
                      </div>
                      <div>
                        {isOwner ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Crown size={10} /> Dueño ({split.ownerKey === 'daniel' ? 'Daniel' : 'Walter'})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/15 text-sky-300 border border-sky-500/25">
                            {split.barberPercent}% comisión · Rinde {split.adminPercent}% a {split.beneficiary === 'daniel' ? 'Daniel' : split.beneficiary === 'walter' ? 'Walter' : 'General'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Desglose de Caja Móvil */}
                    <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
                      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                        <span className="text-xs text-zinc-400 font-medium">Total Cobrado</span>
                        <span className="font-mono text-base font-extrabold text-gold">
                          {formatCOP(split.price)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
                        <div className="border-r border-white/10 pr-2">
                          <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Al Barbero</span>
                          {isOwner ? (
                            <div>
                              <span className="font-mono font-semibold text-amber-300 text-xs">
                                {formatCOP(split.barberProduction)}
                              </span>
                              <span className="text-[10px] text-zinc-500 block">Producido dueño</span>
                            </div>
                          ) : (
                            <div>
                              <span className="font-mono font-semibold text-sky-300 text-xs">
                                {formatCOP(split.barberPay)}
                              </span>
                              <span className="text-[10px] text-zinc-500 block">({split.barberPercent}%)</span>
                            </div>
                          )}
                        </div>

                        <div className="pl-1">
                          <span className="text-[10px] uppercase font-semibold text-zinc-400 block">A Administración</span>
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            {formatCOP(split.adminKeep)}
                          </span>
                          <span className="text-[10px] text-zinc-500 block truncate">
                            {isOwner
                              ? `100% Salón (${split.ownerKey === 'daniel' ? 'Daniel' : 'Walter'})`
                              : `(${split.adminPercent}% → ${split.beneficiary === 'daniel' ? 'Daniel' : split.beneficiary === 'walter' ? 'Walter' : 'General'})`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Botones de acción móvil */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveInvoice(inv)}
                        className="btn-dark-glass py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:text-gold min-h-[38px]"
                      >
                        <Eye size={14} />
                        <span>Ver Recibo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => sendWhatsAppReceipt(inv)}
                        className="btn-gold py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-gold min-h-[38px]"
                      >
                        <MessageCircle size={14} />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* VISTA ESCRITORIO: Tabla completa para computadores y tablets */}
            <div className="hidden md:block overflow-x-auto -mx-5 sm:mx-0">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Factura</th>
                    <th className="py-3 px-4">Fecha y Hora</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Barbero</th>
                    <th className="py-3 px-4">Servicio</th>
                    <th className="py-3 px-4 text-right">Total Cobrado</th>
                    <th className="py-3 px-4 text-right">Al Barbero</th>
                    <th className="py-3 px-4 text-right">A Administración</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {invoices.map((inv) => {
                    const { booking, barber, split, invoiceNumber } = inv;
                    const isOwner = split.isOwner;

                    return (
                      <tr key={booking.id} className="hover:bg-white/[0.02] transition-colors">
                        {/* # Factura */}
                        <td className="py-3.5 px-4 font-mono font-semibold text-zinc-300">
                          {invoiceNumber}
                        </td>

                        {/* Fecha y Hora */}
                        <td className="py-3.5 px-4 font-mono text-zinc-400 whitespace-nowrap">
                          <span className="text-white font-medium">{dayShort(booking.date)} {booking.date.slice(8, 10)}</span>
                          <span className="text-zinc-500 block text-[11px]">{time12(booking.time)}</span>
                        </td>

                        {/* Cliente */}
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-white">{booking.clientName}</p>
                          <a
                            href={`https://wa.me/57${booking.clientPhone.replace(/\D/g, '').slice(-10)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-500 hover:text-emerald-400 text-[11px] font-mono inline-flex items-center gap-1"
                          >
                            <MessageCircle size={10} /> {booking.clientPhone}
                          </a>
                        </td>

                        {/* Barbero */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {barber ? (
                              <BarberAvatar barber={barber} className="w-7 h-7 rounded-full text-[10px]" />
                            ) : (
                              <Initials name={booking.barberName} className="w-7 h-7 rounded-full text-[10px]" />
                            )}
                            <div>
                              <p className="font-medium text-white">{barber?.shortName || booking.barberName}</p>
                              {isOwner ? (
                                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                                  <Crown size={10} /> Dueño ({split.ownerKey === 'daniel' ? 'Daniel' : 'Walter'})
                                </span>
                              ) : (
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  Com: {split.barberPercent}% · Rinde {split.adminPercent}% a {split.beneficiary === 'daniel' ? 'Daniel' : split.beneficiary === 'walter' ? 'Walter' : 'General'}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Servicio */}
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-zinc-200">{booking.serviceName}</span>
                        </td>

                        {/* Total Cobrado */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-gold text-sm whitespace-nowrap">
                          {formatCOP(split.price)}
                        </td>

                        {/* Al Barbero */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono">
                          {isOwner ? (
                            <span className="text-amber-400 font-semibold text-xs">
                              {formatCOP(split.barberProduction)}
                              <span className="block text-[10px] text-zinc-500 font-sans">Producido dueño</span>
                            </span>
                          ) : (
                            <span className="text-sky-300 font-semibold text-xs">
                              {formatCOP(split.barberPay)}
                              <span className="block text-[10px] text-zinc-500 font-sans">({split.barberPercent}%)</span>
                            </span>
                          )}
                        </td>

                        {/* A Administración */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono">
                          <span className="text-emerald-400 font-bold text-xs">
                            {formatCOP(split.adminKeep)}
                          </span>
                          <span className="block text-[10px] text-zinc-500 font-sans">
                            {isOwner
                              ? `100% Salón (${split.ownerKey === 'daniel' ? 'Daniel' : 'Walter'})`
                              : `(${split.adminPercent}% → ${split.beneficiary === 'daniel' ? 'Daniel' : split.beneficiary === 'walter' ? 'Walter' : 'General'})`}
                          </span>
                        </td>

                        {/* Acciones */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setActiveInvoice(inv)}
                              className="btn-dark-glass px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:text-gold hover:border-gold/40"
                              title="Ver recibo térmico"
                            >
                              <Eye size={13} />
                              <span>Ver</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => sendWhatsAppReceipt(inv)}
                              className="btn-dark-glass px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 text-emerald-400 hover:border-emerald-500/40"
                              title="Enviar por WhatsApp"
                            >
                              <MessageCircle size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      {/* Modal de Detalle de Factura / Recibo Imprimible */}
      {activeInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setActiveInvoice(null)}
          />
          <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto glass border border-gold/40 rounded-3xl p-5 sm:p-7 shadow-2xl animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
            {/* Botón cerrar */}
            <button
              onClick={() => setActiveInvoice(null)}
              className="sticky top-0 float-right -mt-1 -mr-1 z-10 w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X size={16} />
            </button>

            {/* Recibo formato Salón Hermanos */}
            <div ref={printRef} className="space-y-5 text-white">
              {/* Encabezado del ticket */}
              <div className="text-center pb-4 border-b border-white/10">
                <p className="font-serif text-xl font-black text-gold tracking-wide">
                  {businessConfig.name}
                </p>
                <p className="text-[11px] text-zinc-400 uppercase tracking-widest mt-0.5">
                  {businessConfig.tagline}
                </p>
                <p className="text-zinc-500 text-xs mt-1">
                  {businessConfig.address}
                </p>
                <div className="mt-3 inline-block px-3 py-1 bg-gold/15 border border-gold/30 rounded-full font-mono text-xs text-gold font-bold">
                  {activeInvoice.invoiceNumber}
                </div>
              </div>

              {/* Datos de la cita */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Fecha y Hora:</span>
                  <span className="font-mono font-medium">{formatDateLong(activeInvoice.booking.date)} · {time12(activeInvoice.booking.time)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Cliente:</span>
                  <span className="font-semibold text-white">{activeInvoice.booking.clientName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Teléfono:</span>
                  <span className="font-mono text-zinc-300">{activeInvoice.booking.clientPhone}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Barbero que atendió:</span>
                  <span className="font-semibold text-gold">
                    {activeInvoice.barber?.name || activeInvoice.booking.barberName}
                    {activeInvoice.split.isOwner && ' (Dueño)'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Servicio prestado:</span>
                  <span className="font-medium text-white">{activeInvoice.booking.serviceName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Estado:</span>
                  <StatusBadge status={activeInvoice.booking.status} />
                </div>
              </div>

              {/* Total Cobrado */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 text-center">
                <p className="text-[11px] text-zinc-400 uppercase tracking-widest font-semibold">Valor Total Cobrado</p>
                <p className="font-mono text-3xl font-black text-gold mt-1">
                  {formatCOP(activeInvoice.split.price)}
                </p>
              </div>

              {/* Liquidación Interna para Administración */}
              <div className="p-3.5 rounded-2xl bg-gold/5 border border-gold/20 space-y-2 text-xs">
                <p className="text-[11px] font-bold text-gold uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={13} />
                  <span>Liquidación Interna de Caja</span>
                </p>
                <div className="flex justify-between items-center text-zinc-300">
                  <span>Queda en Administración:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatCOP(activeInvoice.split.adminKeep)} ({activeInvoice.split.adminPercent}%)
                  </span>
                </div>
                {/* Desglose de a qué dueño le corresponde */}
                {activeInvoice.split.walterAmount > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-amber-300/90 pl-3 border-l-2 border-amber-400/40">
                    <span>↳ Corresponde a Walter (Dueño):</span>
                    <span className="font-mono font-semibold">{formatCOP(activeInvoice.split.walterAmount)}</span>
                  </div>
                )}
                {activeInvoice.split.danielAmount > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-sky-300/90 pl-3 border-l-2 border-sky-400/40">
                    <span>↳ Corresponde a Daniel (Dueño):</span>
                    <span className="font-mono font-semibold">{formatCOP(activeInvoice.split.danielAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-zinc-300 pt-1 border-t border-white/5">
                  <span>Corresponde a Barbero:</span>
                  {activeInvoice.split.isOwner ? (
                    <span className="font-mono text-amber-300 font-medium">
                      {formatCOP(activeInvoice.split.barberProduction)} (Dueño - {activeInvoice.split.ownerKey === 'daniel' ? 'Daniel' : 'Walter'})
                    </span>
                  ) : (
                    <span className="font-mono text-sky-300 font-medium">
                      {formatCOP(activeInvoice.split.barberPay)} ({activeInvoice.split.barberPercent}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="btn-dark-glass py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 hover:border-gold/50 hover:text-gold"
                >
                  <Printer size={15} />
                  <span>Imprimir Recibo</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendWhatsAppReceipt(activeInvoice)}
                  className="btn-gold py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-gold"
                >
                  <MessageCircle size={15} />
                  <span>Enviar WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
