import { useState, useEffect } from 'react';
import {
  Search,
  Loader2,
  CalendarClock,
  Clock,
  Scissors,
  User,
  History,
  CalendarDays,
  MessageCircle,
  ShieldCheck,
  Star,
  XCircle,
  X,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Check,
} from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';
import { businessConfig } from '../config/business';
import { formatCOP } from '../data';
import { todayKey, nowMinutes, timeToMinutes, formatDateLong, time12, addDays } from '../lib/dates';
import { loadClientContact } from '../lib/clientContact';
import {
  findClientBookings,
  cancelClientBooking,
  rescheduleClientBooking,
  CLIENT_CHANGE_ERRORS,
  type ClientBooking,
} from '../services/clientLookup';
import { getBarbers } from '../services/barbers';
import { getBusySlots } from '../services/bookings';
import { generateSlots } from '../lib/availability';
import type { Barber } from '../types';
import RateBooking from '../components/booking/RateBooking';

// «Mis citas»: el cliente escribe su celular y su primer nombre y ve su próxima cita,
// las pendientes y el historial. Ahora también puede cancelar o reagendar turnos directamente.

const STATUS: Record<ClientBooking['status'], { label: string; tone: string }> = {
  pending: { label: 'Pendiente', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  confirmed: { label: 'Confirmada', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  completed: { label: 'Atendida', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  cancelled: { label: 'Cancelada', tone: 'text-zinc-400 bg-white/5 border-white/10' },
  'no-show': { label: 'No asistió', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
};

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-base placeholder-zinc-600 focus:outline-none focus:border-gold/60';

/** «Hoy», «Mañana» o «En 5 días» */
function whenLabel(date: string): string {
  const today = todayKey();
  if (date === today) return 'Hoy';
  if (date === addDays(today, 1)) return 'Mañana';
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return `En ${days} días`;
}

interface RowProps {
  b: ClientBooking;
  rate?: { phone: string; name: string; onRated: (rating: number, comment: string) => void };
  onReschedule?: (b: ClientBooking) => void;
  onCancel?: (b: ClientBooking) => void;
}

function Row({ b, rate, onReschedule, onCancel }: RowProps) {
  const s = STATUS[b.status];
  const canModify = b.status === 'pending' || b.status === 'confirmed';

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-semibold capitalize">{formatDateLong(b.date)}</p>
          <p className="text-gold font-mono text-sm">{time12(b.time)}</p>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.tone}`}>{s.label}</span>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-300 text-sm">
        <span className="inline-flex items-center gap-1.5"><Scissors size={13} className="text-gold/70" />{b.service}</span>
        <span className="inline-flex items-center gap-1.5"><User size={13} className="text-gold/70" />{b.barber}</span>
        <span className="font-mono text-zinc-400">{formatCOP(b.price)}</span>
      </p>

      {canModify && (onReschedule || onCancel) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          {onReschedule && (
            <button
              type="button"
              onClick={() => onReschedule(b)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold font-medium border border-gold/30 transition-colors inline-flex items-center gap-1.5"
            >
              <CalendarClock size={13} /> Reagendar
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={() => onCancel(b)}
              className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-medium border border-rose-500/30 transition-colors inline-flex items-center gap-1.5"
            >
              <XCircle size={13} /> Cancelar cita
            </button>
          )}
        </div>
      )}

      {rate && b.status === 'completed' && <RateBooking booking={b} phone={rate.phone} name={rate.name} onRated={rate.onRated} />}
    </li>
  );
}

// ==========================================
// MODAL DE CANCELACIÓN
// ==========================================
interface CancelModalProps {
  booking: ClientBooking;
  phone: string;
  name: string;
  onClose: () => void;
  onSuccess: (bookingId: string) => void;
  onWantReschedule: (booking: ClientBooking) => void;
}

function CancelModal({ booking, phone, name, onClose, onSuccess, onWantReschedule }: CancelModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await cancelClientBooking(phone, name, booking.id);
      if (result !== 'OK') { setError(CLIENT_CHANGE_ERRORS[result] ?? 'No pudimos cancelar la cita. Contáctanos por WhatsApp.'); return; }
      onSuccess(booking.id);
    } catch (err: unknown) {
      console.error('Error al cancelar cita:', err);
      setError('No pudimos cancelar la cita en este momento. Intenta de nuevo o contáctanos por WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-zinc-950 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition-colors"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 text-rose-400">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-white">¿Cancelar tu cita?</h3>
            <p className="text-xs text-zinc-400">Esta acción liberará tu turno en el salón</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm">
          <p className="text-white font-semibold capitalize">{formatDateLong(booking.date)} · <span className="text-gold font-mono">{time12(booking.time)}</span></p>
          <p className="text-zinc-300 flex items-center gap-2">
            <Scissors size={14} className="text-gold" /> {booking.service}
          </p>
          <p className="text-zinc-300 flex items-center gap-2">
            <User size={14} className="text-gold" /> Con {booking.barber}
          </p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 text-xs text-amber-200/90 leading-relaxed">
          <p className="font-semibold text-amber-300 mb-1">💡 ¿Prefieres cambiar de fecha u hora?</p>
          Puedes reagendarla en vez de cancelarla para no perder tu atención.
        </div>

        {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            <span>Sí, confirmar cancelación</span>
          </button>

          <button
            type="button"
            onClick={() => onWantReschedule(booking)}
            disabled={loading}
            className="btn-outline-gold w-full min-h-[44px] py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <CalendarClock size={15} /> Reagendar para otro momento
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full py-2 text-zinc-400 hover:text-white text-xs font-medium transition-colors"
          >
            Volver y mantener cita
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MODAL DE REAGENDAMIENTO
// ==========================================
interface RescheduleModalProps {
  booking: ClientBooking;
  phone: string;
  name: string;
  onClose: () => void;
  onSuccess: (bookingId: string, newDate: string, newTime: string) => void;
}

function RescheduleModal({ booking, phone, name, onClose, onSuccess }: RescheduleModalProps) {
  const minDate = todayKey();
  const maxDate = addDays(minDate, 30);
  const [selectedDate, setSelectedDate] = useState(booking.date >= minDate ? booking.date : minDate);
  const [selectedTime, setSelectedTime] = useState('');
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [slots, setSlots] = useState<{ time: string; recommended: boolean }[]>([]);
  const [loadingBarbers, setLoadingBarbers] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 1. Cargar barberos para identificar los horarios de trabajo
  useEffect(() => {
    let alive = true;
    getBarbers()
      .then((list) => {
        if (!alive) return;
        setBarbers(list);
      })
      .catch((err) => {
        console.error('No se pudieron cargar barberos', err);
      })
      .finally(() => {
        if (alive) setLoadingBarbers(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 2. Encontrar el barbero correspondiente
  const currentBarber = barbers.find(
    (b) =>
      (booking.barberId && b.id === booking.barberId) ||
      b.name.toLowerCase().includes(booking.barber.toLowerCase()) ||
      b.shortName.toLowerCase().includes(booking.barber.toLowerCase())
  );

  // 3. Cargar turnos disponibles para la fecha elegida
  useEffect(() => {
    if (!currentBarber || !selectedDate) return;
    let alive = true;
    setLoadingSlots(true);
    setSelectedTime('');

    getBusySlots(selectedDate, currentBarber.id)
      .then((busy) => {
        if (!alive) return;
        // Excluimos esta misma cita si es en el mismo día para que no bloquee su propio turno anterior
        const filteredBusy = busy.filter(
          (x) => !(booking.date === selectedDate && x.kind !== 'closed' && x.startTime === booking.time)
        );
        const duration = booking.duration || 30;
        const availableSlots = generateSlots(
          selectedDate,
          filteredBusy,
          [currentBarber.id],
          duration,
          businessConfig.slotStep,
          () => currentBarber.workHours
        );
        setSlots(availableSlots.map((s) => ({ time: s.time, recommended: s.recommended })));
      })
      .catch((err) => {
        console.error('Error calculando horas disponibles', err);
        if (alive) setSlots([]);
      })
      .finally(() => {
        if (alive) setLoadingSlots(false);
      });

    return () => {
      alive = false;
    };
  }, [currentBarber, selectedDate, booking.date, booking.time, booking.duration]);

  const handleConfirm = async () => {
    if (!selectedTime) return setError('Selecciona una hora para tu nueva cita.');
    setSaving(true);
    setError('');
    try {
      const result = await rescheduleClientBooking(phone, name, booking.id, selectedDate, selectedTime);
      if (result !== 'OK') { setError(CLIENT_CHANGE_ERRORS[result] ?? 'No pudimos reprogramar la cita. Contáctanos por WhatsApp.'); return; }
      onSuccess(booking.id, selectedDate, selectedTime);
    } catch (err: unknown) {
      console.error('Error al reagendar cita:', err);
      setError('No pudimos reprogramar la cita en este momento. Intenta de nuevo o contáctanos por WhatsApp.');
    } finally {
      setSaving(false);
    }
  };

  // Botones de acceso rápido para fechas comunes
  const quickDays = [
    { label: 'Hoy', date: minDate },
    { label: 'Mañana', date: addDays(minDate, 1) },
    { label: 'En 2 días', date: addDays(minDate, 2) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition-colors"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 text-gold">
          <div className="w-10 h-10 rounded-2xl bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
            <CalendarClock size={20} />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-white">Reagendar tu cita</h3>
            <p className="text-xs text-zinc-400">Escoge un nuevo día y hora para tu atención</p>
          </div>
        </div>

        {/* Resumen del servicio */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-xs text-zinc-300 flex flex-wrap items-center justify-between gap-2">
          <span>Servicio: <strong className="text-white">{booking.service}</strong></span>
          <span>Barbero: <strong className="text-gold">{booking.barber}</strong></span>
        </div>

        {/* Selector de Fecha */}
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1.5">
            <Calendar size={13} className="text-gold" /> Selecciona la nueva fecha
          </label>
          <div className="flex gap-2 mb-2">
            {quickDays.map((q) => (
              <button
                key={q.date}
                type="button"
                onClick={() => setSelectedDate(q.date)}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold border transition-all ${
                  selectedDate === q.date
                    ? 'border-gold bg-gold/15 text-gold'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            min={minDate}
            max={maxDate}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold/60"
          />
        </div>

        {/* Horas disponibles */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1.5">
              <Clock size={13} className="text-gold" /> Turnos disponibles
            </label>
            {slots.length > 0 && <span className="text-[11px] text-zinc-500">{slots.length} turnos</span>}
          </div>

          {loadingBarbers || loadingSlots ? (
            <div className="py-8 text-center text-zinc-400 text-xs flex flex-col items-center justify-center gap-2">
              <Loader2 size={20} className="animate-spin text-gold" />
              <span>Consultando disponibilidad en tiempo real...</span>
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-5 text-center text-zinc-400 text-xs">
              <p className="font-semibold text-zinc-300">No hay turnos libres para esta fecha.</p>
              <p className="mt-1">Prueba seleccionando otro día en el calendario.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
              {slots.map((s) => {
                const isSelected = selectedTime === s.time;
                return (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => {
                      setSelectedTime(s.time);
                      setError('');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-mono font-bold border transition-all text-center ${
                      isSelected
                        ? 'border-gold bg-gold text-black shadow-lg shadow-gold/20'
                        : 'border-white/10 bg-white/5 text-zinc-200 hover:border-gold/40 hover:bg-gold/5'
                    }`}
                  >
                    {time12(s.time)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}

        {/* Botones de acción */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedTime || saving}
            className="btn-gold w-full min-h-[46px] py-2.5 rounded-full font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            <span>Confirmar reagendamiento</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full py-2 text-zinc-400 hover:text-white text-xs font-medium transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL «MIS CITAS»
// ==========================================
export default function MyBookingsPage() {
  usePageMeta({
    title: 'Mis citas | Salón Hermanos',
    description: 'Consulta, reagenda o cancela tu cita en Salón Hermanos con tu número de celular.',
    noindex: true,
  });

  const saved = loadClientContact();
  const [phone, setPhone] = useState(saved.phone);
  const [name, setName] = useState(saved.name.split(' ')[0] ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ name: string; bookings: ClientBooking[] } | null>(null);
  // Celular y nombre con que se encontraron las citas (para calificar, cancelar y reagendar)
  const [query, setQuery] = useState({ phone: '', name: '' });

  // Modales de acción
  const [cancelTarget, setCancelTarget] = useState<ClientBooking | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<ClientBooking | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length < 10) return setError('Escribe tu número de celular de 10 dígitos.');
    if (name.trim().length < 2) return setError('Escribe tu primer nombre, como lo diste al reservar.');
    setLoading(true);
    setError('');
    setResult(null);
    setBannerNotice(null);
    try {
      const r = await findClientBookings(phone, name);
      if (r.status === 'OK') {
        setResult({ name: r.name, bookings: r.bookings });
        setQuery({ phone, name });
      } else if (r.status === 'TOO_MANY') {
        setError('Hiciste muchas consultas con este número. Intenta de nuevo en una hora.');
      } else {
        setError('No encontramos citas con ese celular y ese nombre. Revisa que sea el mismo número y el primer nombre con que reservaste.');
      }
    } catch (err) {
      console.error('No se pudo consultar', err);
      setError('No pudimos consultar en este momento. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSuccess = (bookingId: string) => {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            bookings: prev.bookings.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' as const } : b)),
          }
        : null
    );
    setCancelTarget(null);
    setBannerNotice({
      type: 'success',
      text: 'Tu cita ha sido cancelada correctamente.',
    });
  };

  const handleRescheduleSuccess = (bookingId: string, newDate: string, newTime: string) => {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            bookings: prev.bookings.map((b) =>
              b.id === bookingId ? { ...b, date: newDate, time: newTime, status: 'pending' as const } : b
            ),
          }
        : null
    );
    setRescheduleTarget(null);
    setBannerNotice({
      type: 'success',
      text: `Tu cita fue reagendada con éxito para el ${formatDateLong(newDate)} a las ${time12(newTime)}.`,
    });
  };

  const today = todayKey();
  const now = nowMinutes();
  const isUpcoming = (b: ClientBooking) =>
    (b.status === 'pending' || b.status === 'confirmed') &&
    (b.date > today || (b.date === today && timeToMinutes(b.time) >= now - 30));

  const upcoming = (result?.bookings ?? [])
    .filter(isUpcoming)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const history = (result?.bookings ?? []).filter((b) => !isUpcoming(b));
  const next = upcoming[0];
  const visits = history.filter((b) => b.status === 'completed').length;
  const toRate = history.filter((b) => b.status === 'completed' && b.rating === null).length;

  const rateProps = (id: string) => ({
    phone: query.phone,
    name: query.name,
    onRated: (rating: number, comment: string) =>
      setResult((r) =>
        r ? { ...r, bookings: r.bookings.map((x) => (x.id === id ? { ...x, rating, comment } : x)) } : r
      ),
  });

  const waText = encodeURIComponent(
    `Hola, soy ${result?.name ?? name}. Tengo una duda sobre mi cita${
      next ? ` del ${formatDateLong(next.date)} a las ${time12(next.time)}` : ''
    }.`
  );

  return (
    <PublicLayout>
      {(openBooking) => (
        <div className="pt-28 sm:pt-32 pb-20 px-4">
          <div className="max-w-2xl mx-auto">
            <p className="section-label text-center">Clientes</p>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white text-center mt-1">Mis citas</h1>
            <p className="text-zinc-400 text-center mt-2">
              Consulta tu próxima cita, reagéndala o cancélala con el celular con que reservaste.
            </p>

            <form onSubmit={search} className="mt-8 rounded-2xl border border-gold/25 bg-white/[0.02] p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Celular</span>
                  <input
                    className={inputClass}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="300 123 4567"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setError('');
                    }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Primer nombre</span>
                  <input
                    className={inputClass}
                    autoComplete="given-name"
                    placeholder="Ej: Carlos"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError('');
                    }}
                  />
                </label>
              </div>
              {error && <p className="text-rose-300 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="btn-gold w-full min-h-[48px] py-3 rounded-full text-base font-bold disabled:opacity-60"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                <span>Buscar mis citas</span>
              </button>
              <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                <ShieldCheck size={12} className="mt-0.5 shrink-0 text-gold" />
                Pedimos tu nombre además del celular para que nadie más pueda ver o modificar tus citas.
              </p>
            </form>

            {bannerNotice && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200 animate-fade-in">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-400" />
                <div className="flex-1 text-sm font-medium">{bannerNotice.text}</div>
                <button
                  type="button"
                  onClick={() => setBannerNotice(null)}
                  className="text-emerald-400 hover:text-emerald-200"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {result && (
              <div className="mt-8 space-y-7">
                <p className="text-white text-lg">
                  Hola, <span className="font-semibold text-gold">{result.name}</span>
                  {visits > 0 && (
                    <span className="text-zinc-400 text-sm">
                      {' '}· nos has visitado {visits} {visits === 1 ? 'vez' : 'veces'}
                    </span>
                  )}
                </p>

                {toRate > 0 && (
                  <p className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-zinc-200">
                    <Star size={16} className="text-gold fill-gold shrink-0" />
                    Tienes {toRate} {toRate === 1 ? 'servicio' : 'servicios'} por calificar. Abajo, en tu historial, toca las estrellas.
                  </p>
                )}

                {/* Próxima Cita destacada */}
                {next ? (
                  <section className="frame-gold rounded-3xl p-5 sm:p-6 space-y-4">
                    <div>
                      <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold font-semibold">
                        <CalendarClock size={15} /> Tu próxima cita · {whenLabel(next.date)}
                      </p>
                      <p className="font-serif text-2xl sm:text-3xl font-bold text-white mt-2 capitalize">
                        {formatDateLong(next.date)}
                      </p>
                      <p className="flex items-center gap-2 font-mono text-xl text-gold mt-1">
                        <Clock size={18} /> {time12(next.time)}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-200 mt-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Scissors size={15} className="text-gold/80" />
                          {next.service}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <User size={15} className="text-gold/80" />
                          con {next.barber}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS[next.status].tone}`}>
                          {STATUS[next.status].label}
                        </span>
                        <span className="text-zinc-400">Total {formatCOP(next.price)}</span>
                        {next.deposit > 0 && next.depositStatus === 'verified' && (
                          <span className="text-emerald-300">· anticipo de {formatCOP(next.deposit)} recibido</span>
                        )}
                        {next.deposit > 0 && next.depositStatus === 'submitted' && (
                          <span className="text-amber-300">· anticipo en revisión</span>
                        )}
                      </div>
                      <p className="text-zinc-500 text-xs mt-3">📍 {businessConfig.address.trim()}</p>
                    </div>

                    {/* Botones de acción directa sobre la próxima cita */}
                    <div className="pt-3 border-t border-white/10 flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => setRescheduleTarget(next)}
                        className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-gold/15 hover:bg-gold/25 border border-gold/40 text-gold font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        <CalendarClock size={16} /> Reagendar cita
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelTarget(next)}
                        className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/15 hover:border-rose-500/30 text-zinc-300 hover:text-rose-300 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all"
                      >
                        <XCircle size={16} /> Cancelar cita
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
                    <p className="text-white font-semibold">No tienes citas pendientes</p>
                    <p className="text-zinc-400 text-sm mt-1">Reserva tu próximo turno en segundos.</p>
                  </section>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => openBooking()} className="btn-gold flex-1 min-h-[46px] py-3 rounded-full font-bold">
                    <CalendarDays size={17} /> <span>Reservar otra cita</span>
                  </button>
                  <a
                    href={`https://wa.me/${businessConfig.whatsapp}?text=${waText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline-gold flex-1 min-h-[46px] py-3 rounded-full font-semibold text-center inline-flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={17} /> Escribir por WhatsApp
                  </a>
                </div>

                {upcoming.length > 1 && (
                  <section>
                    <h2 className="flex items-center gap-2 text-white font-semibold mb-3">
                      <CalendarClock size={17} className="text-gold" /> Citas pendientes ({upcoming.length})
                    </h2>
                    <ul className="space-y-2">
                      {upcoming.map((b) => (
                        <Row
                          key={b.id}
                          b={b}
                          onReschedule={(target) => setRescheduleTarget(target)}
                          onCancel={(target) => setCancelTarget(target)}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h2 className="flex items-center gap-2 text-white font-semibold mb-3">
                    <History size={17} className="text-gold" /> Historial ({history.length})
                  </h2>
                  {history.length === 0 ? (
                    <p className="text-zinc-500 text-sm">Todavía no tienes citas anteriores.</p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((b) => (
                        <Row key={b.id} b={b} rate={rateProps(b.id)} />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>

          {/* Modales de Reagendar y Cancelar */}
          {cancelTarget && (
            <CancelModal
              booking={cancelTarget}
              phone={query.phone}
              name={query.name}
              onClose={() => setCancelTarget(null)}
              onSuccess={handleCancelSuccess}
              onWantReschedule={(b) => {
                setCancelTarget(null);
                setRescheduleTarget(b);
              }}
            />
          )}

          {rescheduleTarget && (
            <RescheduleModal
              booking={rescheduleTarget}
              phone={query.phone}
              name={query.name}
              onClose={() => setRescheduleTarget(null)}
              onSuccess={handleRescheduleSuccess}
            />
          )}
        </div>
      )}
    </PublicLayout>
  );
}
