import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getBookingsInRange } from '../../services/bookings';
import { getBarbers } from '../../services/barbers';
import { todayKey, addDays, startOfWeek, dayOfMonth } from '../../lib/dates';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { businessConfig } from '../../config/business';
import { lunchFor } from '../../lib/businessHours';
import type { Booking, Barber } from '../../types';

type ViewMode = 'day' | 'week';

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const UNASSIGNED = '__sin_asignar__';

const statusColors: Record<string, string> = {
  pending: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  confirmed: 'border-blue-500/50 bg-blue-500/10 text-blue-300',
  completed: 'border-green-500/50 bg-green-500/10 text-green-300',
  cancelled: 'border-red-500/50 bg-red-500/5 text-red-400 line-through',
  'no-show': 'border-red-500/30 bg-red-500/5 text-red-500',
};

function getWeekDates(dateKey: string): string[] {
  const monday = startOfWeek(dateKey);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Filas del calendario: desde las 8:00 (o antes si el horario abre más temprano) hasta la última
 * hora de atención configurada. Si hay citas por fuera (p. ej. clientes registrados fuera del
 * horario), el rango se amplía para que siempre se vean.
 */
function calendarHours(bookings: Booking[]): string[] {
  const days = [...businessConfig.hours, businessConfig.holidayHours].filter((h) => !h.closed);
  let first = Math.min(8, ...days.map((h) => Number(h.open.slice(0, 2))));
  // Una hora que cierra en punto (19:00) no necesita fila propia; 19:30 sí
  let last = Math.max(18, ...days.map((h) => Number(h.close.slice(0, 2)) - (h.close.endsWith(':00') ? 1 : 0)));
  for (const b of bookings) {
    const h = Number(b.time.slice(0, 2));
    if (Number.isFinite(h)) { first = Math.min(first, h); last = Math.max(last, h); }
  }
  return Array.from({ length: last - first + 1 }, (_, i) => `${String(first + i).padStart(2, '0')}:00`);
}

/** true si esa hora del calendario cae en el almuerzo de ese día (no aplica domingos ni festivos) */
function isLunchHour(dateKey: string, hour: string): boolean {
  const lunch = lunchFor(dateKey);
  const start = Number(hour.slice(0, 2)) * 60;
  return !!lunch && start < lunch.end && start + 60 > lunch.start;
}

const LUNCH_BG = 'bg-[repeating-linear-gradient(135deg,rgba(217,173,80,0.06)_0,rgba(217,173,80,0.06)_6px,transparent_6px,transparent_12px)]';

function inHour(booking: Booking, hour: string): boolean {
  return booking.time.slice(0, 2) === hour.slice(0, 2);
}

// Las activas primero y en orden de hora; las canceladas al final
function sortForDisplay(list: Booking[]): Booking[] {
  const rank = (b: Booking) => (b.status === 'cancelled' || b.status === 'no-show' ? 1 : 0);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.time.localeCompare(b.time));
}

export default function AdminCalendar() {
  const [view, setView] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState(todayKey());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getBarbers()
      .then(setBarbers)
      .catch((err) => console.error('No se pudieron cargar los barberos', err));
  }, []);

  const weekDates = getWeekDates(currentDate);
  const rangeStart = view === 'day' ? currentDate : weekDates[0];
  const rangeEnd = view === 'day' ? currentDate : weekDates[6];

  useAutoRefresh(() => {
    getBookingsInRange(rangeStart, rangeEnd)
      .then((list) => { setBookings(list); setError(''); })
      .catch((err) => {
        console.error('No se pudo cargar el calendario', err);
        setError('No se pudo cargar el calendario. Se reintentará automáticamente.');
      });
  }, [rangeStart, rangeEnd]);

  const navigateDate = (delta: number) => {
    setCurrentDate((d) => addDays(d, view === 'week' ? delta * 7 : delta));
  };

  const today = todayKey();
  const HOURS = calendarHours(bookings);
  const barberIds = new Set(barbers.map((b) => b.id));
  const dayBookings = bookings.filter((b) => b.date === currentDate);
  const unassigned = dayBookings.filter((b) => !barberIds.has(b.barberId));
  const columns: { id: string; label: string; available?: boolean }[] = [
    ...barbers.map((b) => ({ id: b.id, label: b.shortName, available: b.available })),
    ...(unassigned.length > 0 ? [{ id: UNASSIGNED, label: 'Sin asignar' }] : []),
  ];

  const formatDateLabel = () => {
    if (view === 'day') return currentDate;
    return `${weekDates[0]} — ${weekDates[6]}`;
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-white/[0.03] rounded-xl overflow-hidden border border-white/[0.08] p-1 gap-1">
          {(['day', 'week'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                view === v ? 'bg-gold/20 text-gold border border-gold/30 shadow-[0_0_12px_rgba(217,173,80,0.2)]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {v === 'day' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-4 py-2 border border-white/[0.08]">
          <button onClick={() => navigateDate(-1)} className="text-zinc-400 hover:text-gold transition-colors p-0.5">
            <ChevronLeft size={16} />
          </button>
          <span className="text-white text-xs font-semibold font-mono">{formatDateLabel()}</span>
          <button onClick={() => navigateDate(1)} className="text-zinc-400 hover:text-gold transition-colors p-0.5">
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setCurrentDate(today)}
          className="btn-dark-glass px-4 py-2 rounded-xl text-xs font-medium hover:border-gold/40 hover:text-gold"
        >
          Hoy
        </button>
      </div>

      {view === 'day' ? (
        <div className="table-card overflow-hidden overflow-x-auto">
          <div style={{ minWidth: `${64 + Math.max(columns.length, 1) * 140}px` }}>
            <div
              className="grid border-b border-white/8"
              style={{ gridTemplateColumns: `64px repeat(${Math.max(columns.length, 1)}, 1fr)` }}
            >
              <div className="p-3" />
              {columns.map((c) => (
                <div key={c.id} className="p-3 border-l border-white/8 text-center">
                  <p className="text-white text-sm font-medium">{c.label}</p>
                  {c.available !== undefined && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.available ? 'status-available' : 'status-busy'}`}>
                      {c.available ? 'Disponible' : 'Ocupado'}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="overflow-y-auto max-h-[500px]">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className={`grid border-b border-white/5 ${isLunchHour(currentDate, hour) ? LUNCH_BG : ''}`}
                  style={{ gridTemplateColumns: `64px repeat(${Math.max(columns.length, 1)}, 1fr)`, minHeight: '60px' }}
                >
                  <div className="p-3 text-zinc-600 text-xs font-mono">
                    {hour}
                    {isLunchHour(currentDate, hour) && <span className="block font-sans text-[10px] text-gold/70 mt-0.5">Almuerzo</span>}
                  </div>
                  {columns.map((c) => {
                    const source = c.id === UNASSIGNED ? unassigned : dayBookings.filter((b) => b.barberId === c.id);
                    const slots = sortForDisplay(source.filter((b) => inHour(b, hour)));
                    return (
                      <div key={c.id} className="border-l border-white/5 p-1.5 space-y-1">
                        {slots.map((slot) => (
                          <div key={slot.id} className={`rounded-lg border px-2.5 py-2 text-xs ${statusColors[slot.status] || 'border-white/20 text-zinc-300'}`}>
                            <p className="font-semibold truncate"><span className="font-mono opacity-70">{slot.time}</span> {slot.clientName}</p>
                            <p className="opacity-70 truncate">{slot.serviceName}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="table-card overflow-hidden overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-8 border-b border-white/8">
              <div className="p-3" />
              {weekDates.map((d, i) => {
                const isToday = d === today;
                const count = bookings.filter((b) => b.date === d).length;
                return (
                  <div key={d} className={`p-3 border-l border-white/8 text-center ${isToday ? 'bg-gold/5' : ''}`}>
                    <p className={`text-xs font-medium ${isToday ? 'text-gold' : 'text-zinc-500'}`}>{DAYS_ES[i]}</p>
                    <p className={`text-lg font-bold font-mono ${isToday ? 'text-gold' : 'text-white'}`}>{dayOfMonth(d)}</p>
                    <p className={`text-[10px] ${isToday ? 'text-gold/60' : 'text-zinc-700'}`}>
                      {count} citas
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="overflow-y-auto max-h-[480px]">
              {HOURS.map((hour) => (
                <div key={hour} className="grid grid-cols-8 border-b border-white/5" style={{ minHeight: '56px' }}>
                  <div className="p-3 text-zinc-600 text-xs font-mono">{hour}</div>
                  {weekDates.map((d) => {
                    const isToday = d === today;
                    const daySlots = sortForDisplay(bookings.filter((b) => b.date === d && inHour(b, hour)));
                    return (
                      <div key={d} className={`border-l border-white/5 p-1 space-y-1 ${isToday ? 'bg-gold/3' : ''} ${isLunchHour(d, hour) ? LUNCH_BG : ''}`}>
                        {isLunchHour(d, hour) && daySlots.length === 0 && <p className="text-[10px] text-gold/50 text-center pt-1">Almuerzo</p>}
                        {daySlots.map((slot) => (
                          <div key={slot.id} className={`rounded border px-1.5 py-1 text-[10px] ${statusColors[slot.status] || 'border-white/20 text-zinc-300'}`}>
                            <p className="font-semibold truncate leading-tight">{slot.time} {slot.clientName}</p>
                            <p className="opacity-60 truncate leading-tight">{slot.barberName}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { color: 'bg-amber-500/30', label: 'Pendiente' },
          { color: 'bg-blue-500/30', label: 'Confirmada' },
          { color: 'bg-green-500/30', label: 'Completada' },
          { color: 'bg-red-500/20', label: 'Cancelada' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${color}`} />
            <span className="text-zinc-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
