import { businessConfig } from '../../config/business';
import { minutesToTime, time12 } from '../../lib/dates';
import type { WorkDay, WorkHours } from '../../types';

// Horario de trabajo de un barbero, día por día: como el salón, de tal hora a tal hora, o descansa.
// businessConfig.hours va de lunes (0) a domingo (6); work_hours usa el día de la semana (0 = domingo).

type DayKey = keyof WorkHours;
type Mode = 'salon' | 'custom' | 'off';

const keyOf = (index: number) => String((index + 1) % 7) as DayKey;
const TIME_OPTIONS = Array.from({ length: (23 - 5) * 2 + 1 }, (_, i) => minutesToTime(5 * 60 + i * 30));
const SHORT: Record<string, string> = { Lunes: 'Lun', Martes: 'Mar', 'Miércoles': 'Mié', Jueves: 'Jue', Viernes: 'Vie', 'Sábado': 'Sáb', Domingo: 'Dom' };

const modeOf = (d: WorkDay | undefined): Mode => (!d ? 'salon' : d.off ? 'off' : 'custom');

/** Días con horario propio, para mostrar en la tarjeta del barbero. Vacío = horario del salón. */
export function workHoursSummary(hours: WorkHours | undefined): string[] {
  return businessConfig.hours.flatMap((h, i) => {
    const d = hours?.[keyOf(i)];
    if (!d) return [];
    return [`${SHORT[h.day] ?? h.day} ${d.off ? 'descansa' : `${time12(d.open)} a ${time12(d.close)}`}`];
  });
}

/** ¿Todos los días personalizados tienen la entrada antes de la salida? */
export function validWorkHours(hours: WorkHours): boolean {
  return Object.values(hours).every((d) => !d || d.off || (d.open < d.close));
}

interface Props {
  value: WorkHours;
  onChange: (next: WorkHours) => void;
}

const selectClass = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-gold/50 [color-scheme:dark]';

export default function WorkHoursEditor({ value, onChange }: Props) {
  const setDay = (key: DayKey, day: WorkDay | undefined) => {
    const next = { ...value };
    if (day) next[key] = day; else delete next[key];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {businessConfig.hours.map((h, i) => {
        const key = keyOf(i);
        const day = value[key];
        const mode = modeOf(day);
        const salonText = h.closed ? 'Salón cerrado' : `Salón: ${time12(h.open)} a ${time12(h.close)}`;
        const invalid = day && !day.off && day.open >= day.close;
        return (
          <div key={key} className={`rounded-xl border px-3 py-2.5 ${invalid ? 'border-red-500/50' : 'border-white/[0.08]'} bg-white/[0.02]`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-white font-medium">{h.day}</p>
                <p className="text-[11px] text-zinc-500">{salonText}</p>
              </div>
              <select
                aria-label={`Horario del ${h.day}`}
                className={selectClass}
                value={mode}
                onChange={(e) => {
                  const m = e.target.value as Mode;
                  if (m === 'salon') setDay(key, undefined);
                  else if (m === 'off') setDay(key, { off: true });
                  else setDay(key, { open: h.closed ? '08:00' : h.open, close: h.closed ? '19:00' : h.close });
                }}
              >
                <option value="salon">Como el salón</option>
                <option value="custom">Horario propio</option>
                <option value="off">Descansa</option>
              </select>
            </div>
            {day && !day.off && (
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-zinc-400">
                <span>Desde</span>
                <select aria-label={`Entrada del ${h.day}`} className={selectClass} value={day.open} onChange={(e) => setDay(key, { open: e.target.value, close: day.close })}>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                </select>
                <span>hasta</span>
                <select aria-label={`Salida del ${h.day}`} className={selectClass} value={day.close} onChange={(e) => setDay(key, { open: day.open, close: e.target.value })}>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                </select>
                {invalid && <span className="text-red-400 w-full">La salida debe ser después de la entrada.</span>}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-zinc-600 text-xs">
        Fuera de su horario no le aparecen turnos para reservar. El horario del salón y el almuerzo se siguen respetando.
      </p>
    </div>
  );
}
