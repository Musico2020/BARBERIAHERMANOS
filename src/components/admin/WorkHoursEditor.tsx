import { businessConfig } from '../../config/business';
import { minutesToTime, time12 } from '../../lib/dates';
import type { WorkDay, WorkHours } from '../../types';

// Horario de trabajo de un barbero, día por día: como el salón, en dos jornadas (mañana y tarde, con el
// almuerzo en medio, que se puede mover o quitar) o descansa.
// businessConfig.hours va de lunes (0) a domingo (6); work_hours usa el día de la semana (0 = domingo).

type DayKey = keyof WorkHours;
type Mode = 'salon' | 'custom' | 'off';
type Custom = Extract<WorkDay, { open: string }>;

const keyOf = (index: number) => String((index + 1) % 7) as DayKey;
const TIME_OPTIONS = Array.from({ length: (23 - 5) * 4 + 1 }, (_, i) => minutesToTime(5 * 60 + i * 15));
const SHORT: Record<string, string> = { Lunes: 'Lun', Martes: 'Mar', 'Miércoles': 'Mié', Jueves: 'Jue', Viernes: 'Vie', 'Sábado': 'Sáb', Domingo: 'Dom' };

const modeOf = (d: WorkDay | undefined): Mode => (!d ? 'salon' : d.off ? 'off' : 'custom');

/** Almuerzo del salón ese día de la semana (no hay los domingos) */
function salonLunch(key: DayKey): { start: string; end: string } | null {
  const { enabled, start, end } = businessConfig.lunch;
  return enabled && key !== '0' ? { start, end } : null;
}

/** Almuerzo que aplica a un día con horario propio: el suyo, ninguno o el del salón */
function lunchOf(key: DayKey, day: Custom): { start: string; end: string } | null {
  if (day.lunch === false) return null;
  return day.lunch ?? salonLunch(key);
}

function shiftsText(open: string, close: string, lunch: { start: string; end: string } | null): string {
  if (!lunch || lunch.start <= open || lunch.end >= close) return `${time12(open)} a ${time12(close)}`;
  return `${time12(open)} a ${time12(lunch.start)} y ${time12(lunch.end)} a ${time12(close)}`;
}

/** Días con horario propio, para mostrar en la tarjeta del barbero. Vacío = horario del salón. */
export function workHoursSummary(hours: WorkHours | undefined): string[] {
  return businessConfig.hours.flatMap((h, i) => {
    const key = keyOf(i);
    const d = hours?.[key];
    if (!d) return [];
    return [`${SHORT[h.day] ?? h.day} ${d.off ? 'descansa' : shiftsText(d.open, d.close, lunchOf(key, d))}`];
  });
}

function dayError(key: DayKey, day: WorkDay | undefined): string {
  if (!day || day.off) return '';
  if (day.open >= day.close) return 'La salida debe ser después de la entrada.';
  const lunch = lunchOf(key, day);
  if (day.lunch && lunch && !(day.open < lunch.start && lunch.start < lunch.end && lunch.end < day.close)) {
    return 'El almuerzo debe quedar entre la entrada y la salida, y terminar después de empezar.';
  }
  return '';
}

/** ¿Todos los días personalizados tienen la entrada antes de la salida y el almuerzo en medio? */
export function validWorkHours(hours: WorkHours): boolean {
  return (Object.keys(hours) as DayKey[]).every((k) => !dayError(k, hours[k]));
}

interface Props {
  value: WorkHours;
  onChange: (next: WorkHours) => void;
}

const selectClass = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-gold/50 [color-scheme:dark]';

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const options = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort();
  return (
    <select aria-label={label} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
    </select>
  );
}

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
        const sLunch = salonLunch(key);
        const salonText = h.closed ? 'Salón cerrado' : `Salón: ${shiftsText(h.open, h.close, sLunch)}`;
        const error = dayError(key, day);
        const custom = day && !day.off ? day : null;
        const lunch = custom ? lunchOf(key, custom) : null;
        return (
          <div key={key} className={`rounded-xl border px-3 py-2.5 ${error ? 'border-red-500/50' : 'border-white/[0.08]'} bg-white/[0.02]`}>
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
                  else setDay(key, { open: h.closed ? '08:00' : h.open, close: h.closed ? '19:00' : h.close, lunch: sLunch ?? false });
                }}
              >
                <option value="salon">Como el salón</option>
                <option value="custom">Horario propio</option>
                <option value="off">Descansa</option>
              </select>
            </div>
            {custom && (
              <div className="mt-2.5 space-y-2 text-xs text-zinc-400">
                {lunch ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-14 text-zinc-300 font-medium">Mañana</span>
                      <TimeSelect label={`Entrada del ${h.day}`} value={custom.open} onChange={(v) => setDay(key, { ...custom, open: v })} />
                      <span>a</span>
                      <TimeSelect label={`Sale a almorzar el ${h.day}`} value={lunch.start} onChange={(v) => setDay(key, { ...custom, lunch: { start: v, end: lunch.end } })} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-14 text-zinc-300 font-medium">Tarde</span>
                      <TimeSelect label={`Vuelve del almuerzo el ${h.day}`} value={lunch.end} onChange={(v) => setDay(key, { ...custom, lunch: { start: lunch.start, end: v } })} />
                      <span>a</span>
                      <TimeSelect label={`Salida del ${h.day}`} value={custom.close} onChange={(v) => setDay(key, { ...custom, close: v })} />
                    </div>
                    <p className="text-[11px] text-gold/70">Almuerzo de {time12(lunch.start)} a {time12(lunch.end)}</p>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Desde</span>
                    <TimeSelect label={`Entrada del ${h.day}`} value={custom.open} onChange={(v) => setDay(key, { ...custom, open: v })} />
                    <span>hasta</span>
                    <TimeSelect label={`Salida del ${h.day}`} value={custom.close} onChange={(v) => setDay(key, { ...custom, close: v })} />
                  </div>
                )}
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-[#d9ad50] w-4 h-4"
                    checked={!lunch}
                    onChange={(e) => setDay(key, { ...custom, lunch: e.target.checked ? false : (sLunch ?? { start: '12:00', end: '14:00' }) })}
                  />
                  <span>Trabaja de corrido (sin almuerzo)</span>
                </label>
                {error && <p className="text-red-400">{error}</p>}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-zinc-600 text-xs">
        Con «Horario propio» se le ofrecen turnos en la mañana y en la tarde, aunque sea antes o después del horario del salón (ej.: hasta las 8:00 p. m.). En su almuerzo la web no recibe reservas, pero desde la Agenda sí puedes poner o mover clientes a esa hora.
      </p>
    </div>
  );
}
