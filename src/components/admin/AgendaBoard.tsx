import { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, Pencil, Move, X, Loader2, CheckCircle2, Plus, ArrowRight } from 'lucide-react';
import BarberAvatar from '../common/BarberAvatar';
import { getBusySlots, type BusySlot } from '../../services/bookings';
import { freeGaps } from '../../lib/availability';
import { barberHoursFor, barberLunchFor, dayOverrideOf, hoursFor, specialDayOf } from '../../lib/businessHours';
import { businessConfig } from '../../config/business';
import { todayKey, nowMinutes, minutesToTime, time12, timeToMinutes, formatDateLong } from '../../lib/dates';
import { waNumber } from '../../lib/whatsapp';
import { STATUS_LABEL } from '../../lib/stats';
import { changeMessage } from './EditBookingModal';
import { doesService } from '../../lib/barberServices';
import type { Barber, Booking } from '../../types';

// Agenda del día en columnas, una por barbero, con la línea de tiempo de cada uno:
//   · Tocar un espacio libre abre «Cliente nuevo» a esa hora (también en el almuerzo y en horas que ya
//     pasaron hoy, para registrar al cliente que se atendió sin cita).
//   · Arrastrar una cita (computador) o tocarla → «Mover» (teléfono) la pasa a otro espacio libre, del
//     mismo barbero o de otro. Antes de guardar se confirma, y después se puede avisar al cliente.

const STATUS_BLOCK: Record<Booking['status'], string> = {
  pending: 'border-amber-400 bg-amber-500/15',
  confirmed: 'border-sky-400 bg-sky-500/15',
  completed: 'border-emerald-400 bg-emerald-500/15',
  cancelled: 'border-zinc-600 bg-white/5',
  'no-show': 'border-red-500/60 bg-red-500/10',
};

const LUNCH_BG = 'bg-[repeating-linear-gradient(135deg,rgba(217,173,80,0.10)_0,rgba(217,173,80,0.10)_6px,transparent_6px,transparent_12px)]';

/** ¿Esta cita ocupa la hora? (las canceladas y las de «no asistió» la dejan libre) */
const holds = (b: Booking) => b.status !== 'cancelled' && b.status !== 'no-show';

interface Range { s: number; e: number }

interface Column {
  barber: Barber;
  win: { open: number; close: number } | null;
  lunch: ReturnType<typeof barberLunchFor>;
  bookings: Booking[];
  closed: Range[];
}

interface Props {
  date: string;
  barbers: Barber[];
  /** Citas (de cualquier día: se filtran las de `date`) */
  bookings: Booking[];
  durations: Map<string, number>;
  /** Encabezado con foto y nombre de cada barbero (vista de varias columnas) */
  showHeaders?: boolean;
  pxPerMin?: number;
  /** Tocar un espacio libre. Sin esta función no se pueden agregar clientes desde aquí. */
  onAdd?: (barber: Barber, time: string) => void;
  onEdit?: (booking: Booking) => void;
  /** Guarda el cambio de hora (y de barbero). Devuelve un mensaje de error, o nada si salió bien. */
  saveMove?: (booking: Booking, barber: Barber, time: string) => Promise<string | void>;
  /** Después de mover una cita, para recargar */
  onChanged?: () => void;
  /** No dejar agregar en días que ya pasaron (el barbero solo registra clientes de hoy) */
  addFromToday?: boolean;
  /**
   * Panel: si el día tiene ajuste en Turnos, su almuerzo queda como hora cerrada para todos; aquí se
   * muestra como almuerzo y se puede agendar encima (el portal del barbero no puede).
   */
  lunchOverClosed?: boolean;
}

export default function AgendaBoard({
  date, barbers, bookings, durations, showHeaders = false, pxPerMin = 2.4, onAdd, onEdit, saveMove, onChanged, addFromToday = false, lunchOverClosed = false,
}: Props) {
  const [closedSlots, setClosedSlots] = useState<BusySlot[]>([]);
  const [sheet, setSheet] = useState<Booking | null>(null);
  const [moving, setMoving] = useState<Booking | null>(null);
  const [grab, setGrab] = useState(0);
  const [hover, setHover] = useState<{ barberId: string; t: number; valid: boolean } | null>(null);
  const [pending, setPending] = useState<{ booking: Booking; barber: Barber; time: string } | null>(null);
  const [notice, setNotice] = useState('');
  const today = todayKey();
  const [now, setNow] = useState(nowMinutes());
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMinutes()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const barberKey = barbers.map((b) => b.id).join(',');
  // Se vuelve a leer cada vez que se recargan las citas: así se ven al momento las horas que se cerraron en Turnos
  useEffect(() => {
    let alive = true;
    getBusySlots(date, barbers.length === 1 ? barbers[0].id : undefined)
      .then((list) => { if (alive) setClosedSlots(list.filter((x) => x.kind === 'closed')); })
      .catch(() => { if (alive) setClosedSlots([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, barberKey, bookings]);

  const dur = (b: Booking) => durations.get(b.serviceId) ?? 30;
  const dayBookings = bookings.filter((b) => b.date === date && b.status !== 'cancelled');

  // El almuerzo del salón que quedó como hora cerrada de todos en el ajuste del día
  const { start: lunchStart, end: lunchEnd } = businessConfig.lunch;
  const closedLunch = lunchOverClosed && businessConfig.lunch.enabled
    && dayOverrideOf(date)?.closed.some((c) => !c.barberId && c.start === lunchStart && c.end === lunchEnd)
    ? { start: timeToMinutes(lunchStart), end: timeToMinutes(lunchEnd), startLabel: lunchStart, endLabel: lunchEnd }
    : null;

  const columns: Column[] = barbers.map((barber) => {
    // Mismo horario que la web y Turnos; los días por orden de llegada se muestra el del salón para
    // poder registrar a quien llegue
    const salon = specialDayOf(date) === 'walk-in' ? hoursFor(date) : null;
    return {
      barber,
      win: barberHoursFor(date, barber.workHours, barber.id) ?? (salon ? { open: salon.open, close: salon.close } : null),
      lunch: barberLunchFor(date, barber.workHours) ?? closedLunch,
      bookings: dayBookings.filter((b) => b.barberId === barber.id).sort((a, b) => a.time.localeCompare(b.time)),
      closed: closedSlots
        .filter((c) => c.barberId === barber.id)
        .map((c) => ({ s: timeToMinutes(c.startTime), e: timeToMinutes(c.startTime) + c.duration }))
        .filter((c) => !closedLunch || c.s !== closedLunch.start || c.e !== closedLunch.end),
    };
  });

  // Rango visible: de la primera entrada a la última salida (o 8 a 7), ampliado si hay citas por fuera
  let start = Math.min(...columns.map((c) => c.win?.open ?? 8 * 60));
  let end = Math.max(...columns.map((c) => c.win?.close ?? 19 * 60));
  if (!Number.isFinite(start) || start >= end) { start = 8 * 60; end = 19 * 60; }
  for (const b of dayBookings) {
    start = Math.min(start, timeToMinutes(b.time));
    end = Math.max(end, timeToMinutes(b.time) + dur(b));
  }
  start = Math.floor(start / 30) * 30;
  end = Math.ceil(end / 30) * 30;
  const height = (end - start) * pxPerMin;
  const y = (m: number) => (m - start) * pxPerMin;
  const marks = Array.from({ length: (end - start) / 30 + 1 }, (_, i) => start + i * 30);

  /** Bloques que ocupan la columna (citas y horas cerradas), sin contar la cita que se está moviendo */
  const blocksOf = (col: Column, exceptId?: string) => [
    ...col.bookings.filter((b) => holds(b) && b.id !== exceptId).map((b) => ({ start: timeToMinutes(b.time), end: timeToMinutes(b.time) + dur(b), kind: 'booking' as const })),
    ...col.closed.map((c) => ({ start: c.s, end: c.e, kind: 'other' as const })),
  ];
  const gapsOf = (col: Column, exceptId?: string) => (col.win ? freeGaps(col.win.open, col.win.close, blocksOf(col, exceptId)) : []);

  const isFree = (col: Column, t: number, d: number, exceptId?: string) =>
    !!col.win && t >= col.win.open && t + d <= col.win.close &&
    !blocksOf(col, exceptId).some((b) => b.start < t + d && b.end > t);

  const minuteAt = (clientY: number, el: HTMLElement) => start + (clientY - el.getBoundingClientRect().top) / pxPerMin;

  /** Hora de inicio para mover la cita a ese punto: de a 5 minutos, pegada al borde del espacio si queda cerca */
  const moveTarget = (col: Column, m: number, booking: Booking): { t: number; valid: boolean } => {
    const d = dur(booking);
    let t = Math.round((m - grab) / 5) * 5;
    for (const g of gapsOf(col, booking.id)) {
      if (Math.abs(t - g.start) <= 10) { t = g.start; break; }
      if (Math.abs(t + d - g.end) <= 10 && g.end - d >= g.start) { t = g.end - d; break; }
    }
    // Otro barbero solo si es del mismo rol y hace ese servicio
    const sameRole = (barbers.find((b) => b.id === booking.barberId)?.role ?? col.barber.role) === col.barber.role
      && (col.barber.id === booking.barberId || doesService(col.barber, booking.serviceId));
    const unchanged = col.barber.id === booking.barberId && minutesToTime(t) === booking.time;
    return { t, valid: sameRole && !unchanged && isFree(col, t, d, booking.id) };
  };

  /** Hora para un cliente nuevo al tocar un espacio libre: el cuarto de hora, sin salirse del espacio */
  const addTarget = (col: Column, m: number): number | null => {
    const gap = gapsOf(col).find((g) => m >= g.start && m < g.end);
    if (!gap) return null;
    let t = Math.max(gap.start, Math.floor(m / 15) * 15);
    // Hoy, si se toca a partir de la hora actual, la cita empieza ya (no en el cuarto de hora que pasó)
    if (date === today && m >= now && t < now) t = Math.min(Math.ceil(now / 5) * 5, gap.end - 5);
    return t + 5 <= gap.end ? t : null;
  };

  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 3500); };

  const pick = (col: Column, m: number) => {
    if (moving) {
      const { t, valid } = moveTarget(col, m, moving);
      if (!valid) return flash('Ese espacio no está libre para esta cita. Toca otro.');
      setPending({ booking: moving, barber: col.barber, time: minutesToTime(t) });
      setMoving(null);
      setHover(null);
      return;
    }
    if (!onAdd) return;
    if (addFromToday && date < today) return flash('Solo puedes registrar clientes de hoy en adelante.');
    const t = addTarget(col, m);
    if (t === null) return flash('Ese espacio no está libre.');
    onAdd(col.barber, minutesToTime(t));
  };

  const canMove = !!saveMove;
  const multi = columns.length > 1;

  return (
    <div className="space-y-2">
      {moving && (
        <div className="sticky top-16 z-20 flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-[#1a1a1a] px-3 py-2.5 text-sm shadow-lg">
          <span className="text-gold">
            <Move size={14} className="inline -mt-0.5 mr-1" />
            Toca el espacio libre donde quieres poner a <b>{moving.clientName}</b>{multi ? ' (puede ser de otro barbero)' : ''}.
          </span>
          <button type="button" onClick={() => { setMoving(null); setHover(null); }} className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-300">Cancelar</button>
        </div>
      )}
      {notice && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{notice}</p>}

      <div className="table-card rounded-2xl overflow-x-auto">
        <div style={{ minWidth: multi ? 62 + columns.length * 170 : undefined }}>
          {showHeaders && (
            <div className="flex border-b border-white/10 sticky top-0 z-10 bg-[#141414]">
              <div className="w-[62px] shrink-0" />
              {columns.map((c) => {
                const count = c.bookings.filter(holds).length;
                return (
                  <div key={c.barber.id} className="flex-1 min-w-[170px] flex items-center gap-2 px-2 py-2.5 border-l border-white/10">
                    <BarberAvatar barber={c.barber} className="w-8 h-8 rounded-full text-xs shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{c.barber.shortName}</p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {c.win ? `${time12(minutesToTime(c.win.open))} – ${time12(minutesToTime(c.win.close))}` : 'No trabaja'} · {count} {count === 1 ? 'cita' : 'citas'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex p-2 pr-3">
            {/* Horas */}
            <div className="relative w-[58px] shrink-0" style={{ height }}>
              {marks.map((m) => (
                <span key={m} className={`absolute right-1 -mt-2 font-mono whitespace-nowrap ${m % 60 === 0 ? 'text-[10.5px] text-zinc-300' : 'text-[10px] text-zinc-600'}`} style={{ top: y(m) }}>
                  {m % 60 === 0 ? time12(minutesToTime(m)) : ':30'}
                </span>
              ))}
            </div>

            {columns.map((col) => {
              const gaps = gapsOf(col, moving?.id);
              const ghost = hover && hover.barberId === col.barber.id ? hover : null;
              const ghostDur = moving ? dur(moving) : 0;
              return (
                <div
                  key={col.barber.id}
                  className={`relative flex-1 ${multi ? 'min-w-[170px] border-l border-white/[0.06] px-1' : 'ml-1'} ${onAdd || moving ? 'cursor-pointer' : ''}`}
                  style={{ height }}
                  onClick={(e) => pick(col, minuteAt(e.clientY, e.currentTarget))}
                  onMouseMove={(e) => {
                    if (!moving) return;
                    const { t, valid } = moveTarget(col, minuteAt(e.clientY, e.currentTarget), moving);
                    setHover({ barberId: col.barber.id, t, valid });
                  }}
                  onDragOver={(e) => {
                    if (!moving) return;
                    e.preventDefault();
                    const { t, valid } = moveTarget(col, minuteAt(e.clientY, e.currentTarget), moving);
                    e.dataTransfer.dropEffect = valid ? 'move' : 'none';
                    if (hover?.barberId !== col.barber.id || hover.t !== t) setHover({ barberId: col.barber.id, t, valid });
                  }}
                  onDrop={(e) => { e.preventDefault(); pick(col, minuteAt(e.clientY, e.currentTarget)); }}
                >
                  {/* Líneas de las horas */}
                  {marks.map((m) => (
                    <span key={m} className={`absolute left-0 right-0 border-t pointer-events-none ${m % 60 === 0 ? 'border-white/10' : 'border-white/[0.04] border-dashed'}`} style={{ top: y(m) }} />
                  ))}
                  {!col.win && (
                    <div className="absolute inset-x-1 top-2 rounded-lg bg-zinc-500/10 border border-zinc-500/20 px-2 py-1.5 text-[11px] text-zinc-400 pointer-events-none">
                      {col.barber.shortName} no trabaja este día.
                    </div>
                  )}
                  {/* Fuera de su horario */}
                  {col.win && col.win.open > start && <div className="absolute inset-x-0 top-0 bg-black/30 pointer-events-none" style={{ height: y(col.win.open) }} />}
                  {col.win && col.win.close < end && <div className="absolute inset-x-0 bottom-0 bg-black/30 pointer-events-none" style={{ top: y(col.win.close) }} />}
                  {/* Espacios libres */}
                  {gaps.filter((g) => g.end - g.start >= 15).map((g) => {
                    const past = date < today || (date === today && g.end <= now);
                    // Si el espacio empieza en el almuerzo, el letrero va después (el almuerzo ya tiene el suyo)
                    const label = col.lunch && g.start >= col.lunch.start && g.start < col.lunch.end ? col.lunch.end : g.start;
                    return (
                      <div key={g.start} className="absolute inset-x-1 rounded-lg border border-dashed border-emerald-500/25 bg-emerald-500/[0.03] pointer-events-none overflow-hidden" style={{ top: y(g.start) + 1, height: (g.end - g.start) * pxPerMin - 2 }}>
                        {(onAdd || moving) && (g.end - label) * pxPerMin >= 26 && (
                          <p className={`flex items-center gap-1 px-2 pt-1 text-[11px] ${past ? 'text-zinc-500' : 'text-emerald-400/90'}`} style={{ marginTop: (label - g.start) * pxPerMin }}>
                            <Plus size={11} /> Libre {time12(minutesToTime(label))}{past ? ' · ya pasó' : ''}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {/* No disponible */}
                  {col.closed.map((c, i) => {
                    const s = Math.max(start, c.s);
                    const e = Math.min(end, c.e);
                    if (e <= s) return null;
                    return (
                      <div key={i} className="absolute inset-x-1 rounded-lg bg-zinc-500/15 border border-zinc-500/20 px-2 py-1 overflow-hidden pointer-events-none" style={{ top: y(s), height: (e - s) * pxPerMin }}>
                        <p className="text-[11px] text-zinc-400 truncate">{time12(minutesToTime(s))} – {time12(minutesToTime(e))} · No disponible</p>
                      </div>
                    );
                  })}
                  {/* Almuerzo: se ve, pero se puede agendar encima desde aquí */}
                  {col.lunch && col.lunch.end > start && col.lunch.start < end && (
                    <div
                      className={`absolute inset-x-1 rounded-lg border border-gold/20 px-2 py-1 pointer-events-none ${LUNCH_BG}`}
                      style={{ top: y(Math.max(start, col.lunch.start)), height: (Math.min(end, col.lunch.end) - Math.max(start, col.lunch.start)) * pxPerMin }}
                    >
                      <p className="text-[11px] text-gold/80 truncate">Almuerzo · {time12(col.lunch.startLabel)} – {time12(col.lunch.endLabel)}</p>
                    </div>
                  )}
                  {/* Hora actual */}
                  {date === today && now >= start && now <= end && (
                    <div className="absolute inset-x-0 z-[5] pointer-events-none" style={{ top: y(now) }}>
                      <span className="block border-t-2 border-rose-500/80" />
                    </div>
                  )}
                  {/* Citas */}
                  {col.bookings.map((b) => {
                    const s = timeToMinutes(b.time);
                    const d = dur(b);
                    const phone = b.clientPhone?.trim();
                    const isMoving = moving?.id === b.id;
                    const h = Math.max(d * pxPerMin - 2, 34);
                    return (
                      <div
                        key={b.id}
                        draggable={canMove}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', b.id);
                          e.dataTransfer.effectAllowed = 'move';
                          const rect = e.currentTarget.getBoundingClientRect();
                          setGrab((e.clientY - rect.top) / pxPerMin);
                          setMoving(b);
                          setSheet(null);
                        }}
                        onDragEnd={() => { setMoving(null); setHover(null); setGrab(0); }}
                        onClick={(e) => { e.stopPropagation(); if (moving) return; setSheet(b); }}
                        className={`absolute inset-x-1 z-[6] rounded-xl border-l-4 border px-2 py-1 overflow-hidden shadow-lg ${STATUS_BLOCK[b.status]} ${canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isMoving ? 'opacity-40 ring-2 ring-gold' : ''} ${!holds(b) ? 'opacity-60' : ''}`}
                        style={{ top: y(s) + 1, height: h }}
                        title={canMove ? 'Arrastra para mover · toca para ver opciones' : undefined}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <p className="text-[10.5px] font-mono text-zinc-300 truncate">{time12(b.time)} – {time12(minutesToTime(s + d))}</p>
                            <p className="text-[13px] font-semibold text-white truncate leading-tight">{b.clientName}</p>
                            {h >= 50 && <p className="text-[11px] text-zinc-300 truncate">{b.serviceName} · <span className="text-zinc-400">{STATUS_LABEL[b.status]}</span></p>}
                            {h >= 70 && phone && <p className="text-[11px] font-mono text-zinc-400 truncate">{phone}</p>}
                          </div>
                          {!multi && phone && (
                            <div className="flex gap-1.5 shrink-0">
                              <a onClick={(e) => e.stopPropagation()} href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`Llamar a ${b.clientName}`} className="w-8 h-8 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center text-gold"><Phone size={14} /></a>
                              <a onClick={(e) => e.stopPropagation()} href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${b.clientName}`} className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300"><MessageCircle size={14} /></a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Dónde quedaría la cita que se mueve */}
                  {moving && ghost && (
                    <div
                      className={`absolute inset-x-1 z-[7] rounded-xl border-2 border-dashed px-2 py-1 pointer-events-none ${ghost.valid ? 'border-emerald-400 bg-emerald-500/20' : 'border-rose-500 bg-rose-500/15'}`}
                      style={{ top: y(ghost.t) + 1, height: Math.max(ghostDur * pxPerMin - 2, 30) }}
                    >
                      <p className={`text-[11px] font-mono font-semibold ${ghost.valid ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {time12(minutesToTime(ghost.t))}{ghost.valid ? '' : ' · ocupado'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {(onAdd || canMove) && (
        <p className="text-[11px] text-zinc-500">
          {onAdd ? 'Toca un espacio libre para agregar un cliente (también en el almuerzo o en una hora que ya pasó, si lo atendiste sin cita). ' : ''}
          {canMove ? (multi ? 'Arrastra una cita a otro espacio, o tócala y elige «Mover».' : 'Toca una cita y elige «Mover» para pasarla a otro espacio.') : ''}
        </p>
      )}

      {sheet && (
        <BookingSheet
          booking={sheet}
          duration={dur(sheet)}
          onClose={() => setSheet(null)}
          onEdit={onEdit ? () => { onEdit(sheet); setSheet(null); } : undefined}
          onMove={canMove ? () => { setGrab(0); setMoving(sheet); setSheet(null); } : undefined}
        />
      )}
      {pending && saveMove && (
        <MoveDialog
          {...pending}
          save={saveMove}
          onClose={(changed) => { setPending(null); if (changed) onChanged?.(); }}
        />
      )}
    </div>
  );
}

function BookingSheet({ booking: b, duration, onClose, onEdit, onMove }: { booking: Booking; duration: number; onClose: () => void; onEdit?: () => void; onMove?: () => void }) {
  const phone = b.clientPhone?.trim();
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Cita de ${b.clientName}`}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-gold font-bold">{time12(b.time)} – {time12(minutesToTime(timeToMinutes(b.time) + duration))}</p>
            <p className="text-white text-lg font-semibold break-words">{b.clientName}</p>
            <p className="text-zinc-400 text-sm">{b.serviceName} · {b.barberName} · {STATUS_LABEL[b.status]}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400"><X size={16} /></button>
        </div>
        {phone && (
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-mono text-white"><Phone size={14} className="text-gold" /> {phone}</a>
            <a href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-300"><MessageCircle size={14} /> WhatsApp</a>
          </div>
        )}
        <div className="grid gap-2">
          {onMove && (
            <button type="button" onClick={onMove} className="btn-gold w-full py-3 rounded-xl font-semibold"><Move size={16} /> <span>Mover a otro espacio</span></button>
          )}
          {onEdit && (
            <button type="button" onClick={onEdit} className="w-full btn-dark-glass py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2"><Pencil size={15} /> Editar cita</button>
          )}
        </div>
      </div>
    </div>
  );
}

function MoveDialog({ booking, barber, time, save, onClose }: {
  booking: Booking; barber: Barber; time: string;
  save: (booking: Booking, barber: Barber, time: string) => Promise<string | void>;
  onClose: (changed: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const closeRef = useRef(false);
  const after: Booking = { ...booking, barberId: barber.id, barberName: barber.shortName, time };
  const phoneOk = (booking.clientPhone ?? '').replace(/\D/g, '').length >= 10;
  const future = booking.date > todayKey() || (booking.date === todayKey() && timeToMinutes(time) > nowMinutes());

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      const problem = await save(booking, barber, time);
      if (problem) setError(problem);
      else setDone(true);
    } catch (err) {
      console.error('No se pudo mover la cita', err);
      setError('No se pudo mover. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const close = () => { if (closeRef.current) return; closeRef.current = true; onClose(done); };

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Mover cita">
      <div className="absolute inset-0 bg-black/75" onClick={() => !saving && close()} />
      <div className="relative w-full sm:max-w-md bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
        <h3 className="font-serif text-xl font-bold text-white">{done ? 'Cita movida' : `¿Mover a ${booking.clientName}?`}</h3>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-zinc-500 text-[11px] uppercase tracking-wider">Antes</p>
            <p className="text-zinc-300 font-mono">{time12(booking.time)}</p>
            <p className="text-zinc-400 text-xs truncate">{booking.barberName}</p>
          </div>
          <ArrowRight size={18} className="text-gold shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-gold text-[11px] uppercase tracking-wider">Ahora</p>
            <p className="text-white font-mono font-bold">{time12(time)}</p>
            <p className="text-zinc-300 text-xs truncate">{barber.shortName}</p>
          </div>
        </div>
        <p className="text-zinc-500 text-xs capitalize">{formatDateLong(booking.date)} · {booking.serviceName}</p>
        {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
        {done ? (
          <>
            <p className="flex items-center gap-2 text-emerald-300 text-sm font-semibold"><CheckCircle2 size={17} /> Guardado</p>
            {phoneOk && future && (
              <a
                href={`https://wa.me/${waNumber(booking.clientPhone)}?text=${encodeURIComponent(changeMessage(booking, after))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3"
              >
                <MessageCircle size={17} /> Avisar al cliente por WhatsApp
              </a>
            )}
            <button type="button" onClick={close} className="w-full btn-dark-glass py-3 rounded-full text-sm font-semibold">Listo</button>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={close} disabled={saving} className="btn-dark-glass py-3 rounded-full text-sm font-semibold">Cancelar</button>
            <button type="button" onClick={confirm} disabled={saving} className="btn-gold py-3 rounded-full font-semibold">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Move size={16} />} <span>Mover</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
