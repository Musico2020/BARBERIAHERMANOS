import { useEffect, useRef, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { todayKey, addDays } from '../../lib/dates';
import { quincenaOf, rangeLabel, MONTHS_LONG as MONTHS, pad, dateKeyOf as key, lastDay, type DateRange } from '../../lib/dateRange';

// Calendario para elegir un rango de fechas: primer toque = día de inicio, segundo = día final.
// Trae atajos para la primera y la segunda quincena del mes que se está viendo.

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => value.start.slice(0, 7));
  const [picking, setPicking] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const today = todayKey();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) { setOpen(false); setPicking(null); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setPicking(null); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const [vy, vm] = view.split('-').map(Number);
  const firstWeekday = (new Date(Date.UTC(vy, vm - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: lastDay(vy, vm) }, (_, i) => key(vy, vm, i + 1)),
  ];

  const moveMonth = (dir: number) => {
    const d = new Date(Date.UTC(vy, vm - 1 + dir, 1));
    setView(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  const apply = (range: DateRange) => {
    onChange(range);
    setPicking(null);
    setOpen(false);
  };

  const pick = (day: string) => {
    if (!picking) { setPicking(day); return; }
    apply(day < picking ? { start: day, end: picking } : { start: picking, end: day });
  };

  // Rango que se ve resaltado: el elegido, o el que se está eligiendo hasta donde está el puntero
  const shown: DateRange = picking
    ? (hover && hover < picking ? { start: hover, end: picking } : { start: picking, end: hover ?? picking })
    : value;

  const first = { start: key(vy, vm, 1), end: key(vy, vm, 15) };
  const second = { start: key(vy, vm, 16), end: key(vy, vm, lastDay(vy, vm)) };
  const prevQ = quincenaOf(addDays(quincenaOf(today).start, -1));

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setView(value.start.slice(0, 7)); setPicking(null); }}
        aria-expanded={open}
        className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3.5 py-2.5 border border-white/10 hover:border-gold/40 text-sm text-white font-semibold"
      >
        <CalendarRange size={16} className="text-gold" />
        {rangeLabel(value)}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-40 w-[min(320px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-[#121212] shadow-2xl p-4" role="dialog" aria-label="Elegir fechas del reporte">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              ['1ª quincena', first],
              ['2ª quincena', second],
              ['Quincena anterior', prevQ],
            ].map(([label, range]) => (
              <button
                key={label as string}
                type="button"
                onClick={() => apply(range as DateRange)}
                className="px-2.5 py-1.5 rounded-lg border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10"
              >
                {label as string}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior" className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-gold hover:bg-white/5">
              <ChevronLeft size={16} />
            </button>
            <span className="text-white text-sm font-semibold">{MONTHS[vm - 1]} {vy}</span>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente" className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-gold hover:bg-white/5">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEK.map((d, i) => <span key={i} className="text-[10px] font-semibold text-zinc-500 py-1">{d}</span>)}
            {cells.map((day, i) => {
              if (!day) return <span key={`e${i}`} />;
              const inside = day >= shown.start && day <= shown.end;
              const edge = day === shown.start || day === shown.end;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  onMouseEnter={() => setHover(day)}
                  aria-label={day}
                  aria-pressed={edge}
                  className={`h-9 text-sm font-mono transition-colors ${
                    edge ? 'bg-gold text-dark font-bold rounded-lg' : inside ? 'bg-gold/15 text-gold' : 'text-zinc-300 hover:bg-white/5 rounded-lg'
                  } ${day === today && !edge ? 'underline decoration-gold underline-offset-4' : ''}`}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-zinc-500 mt-3">
            {picking ? 'Ahora toca el día final.' : 'Toca el día de inicio y luego el día final.'}
          </p>
        </div>
      )}
    </div>
  );
}
