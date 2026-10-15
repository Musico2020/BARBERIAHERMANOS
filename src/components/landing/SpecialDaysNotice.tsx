import { Megaphone, Users, CalendarX } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { todayKey, addDays, dayShort, dayOfMonth, monthLong, formatDateLong } from '../../lib/dates';
import { noticeStart } from '../../lib/businessHours';
import type { SpecialDay } from '../../types';

// Aviso en la página principal para los días especiales (Panel → Configuración).
// Cada día se anuncia desde su fecha noticeFrom (por defecto, el día anterior) hasta que pasa.

function joinDays(keys: string[]): string {
  const names = keys.map((k) => `${dayShort(k).toLowerCase()} ${dayOfMonth(k)}`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
}

function datesText(keys: string[]): string {
  const months = [...new Set(keys.map(monthLong))];
  if (months.length === 1) return `${joinDays(keys)} de ${months[0]}`;
  return keys.map((k) => `${dayShort(k).toLowerCase()} ${dayOfMonth(k)} de ${monthLong(k)}`).join(', ');
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export default function SpecialDaysNotice() {
  const today = todayKey();
  const visible = businessConfig.specialDays
    .filter((d) => noticeStart(d) <= today && today <= d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (visible.length === 0) return null;

  const byType = (type: SpecialDay['type']) => visible.filter((d) => d.type === type).map((d) => d.date);
  const walkIn = byType('walk-in');
  const closed = byType('closed');
  const todayType = visible.find((d) => d.date === today)?.type;
  const notes = visible.filter((d) => d.note?.trim());
  const single = visible.length === 1 ? visible[0] : null;
  const months = [...new Set(visible.map((d) => monthLong(d.date)))].join(' y ');

  return (
    <aside
      role="note"
      aria-label="Horario especial"
      className="keep-dark max-w-2xl mx-auto mb-8 text-left rounded-2xl border border-gold/40 bg-black/75 backdrop-blur-sm shadow-gold p-5 animate-fade-in"
    >
      <p className="flex items-center gap-2 text-gold font-semibold text-sm uppercase tracking-wider">
        <Megaphone size={17} className="shrink-0" />
        {single ? 'Aviso importante' : `Horario especial de ${months}`}
      </p>

      {todayType && (
        <p className="mt-3 rounded-xl bg-gold text-dark font-semibold text-sm px-3.5 py-2">
          {todayType === 'walk-in' ? 'Hoy atendemos por orden de llegada, sin reserva.' : 'Hoy la barbería no abre.'}
        </p>
      )}

      {single && single.date !== today ? (
        <p className="mt-3 text-white text-base font-medium flex gap-2.5">
          {single.type === 'closed'
            ? <CalendarX size={19} className="text-red-300 shrink-0 mt-0.5" />
            : <Users size={19} className="text-gold shrink-0 mt-0.5" />}
          <span>
            {single.date === addDays(today, 1) ? 'Mañana' : `El ${lower(formatDateLong(single.date))}`}{' '}
            {single.type === 'closed' ? 'no trabajaremos.' : 'atendemos solo por orden de llegada (sin reservas por la web).'}
          </span>
        </p>
      ) : !single && (
        <ul className="mt-3 space-y-2.5 text-sm text-zinc-300">
          {walkIn.length > 0 && (
            <li className="flex gap-2.5">
              <Users size={17} className="text-gold shrink-0 mt-0.5" />
              <span><strong className="text-white">Por orden de llegada (sin reserva por la web):</strong> {datesText(walkIn)}.</span>
            </li>
          )}
          {closed.length > 0 && (
            <li className="flex gap-2.5">
              <CalendarX size={17} className="text-red-300 shrink-0 mt-0.5" />
              <span><strong className="text-white">No trabajamos:</strong> {datesText(closed)}.</span>
            </li>
          )}
        </ul>
      )}

      {notes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
          {notes.map((d) => (
            <p key={d.date} className="text-sm text-zinc-300">
              {!single && <span className="text-gold font-semibold">{dayShort(d.date)} {dayOfMonth(d.date)}: </span>}
              {d.note}
            </p>
          ))}
        </div>
      )}
    </aside>
  );
}
