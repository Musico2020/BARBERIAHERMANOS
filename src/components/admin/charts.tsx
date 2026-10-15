import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, Bar, BarChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, type TooltipProps,
} from 'recharts';
import { formatCOP } from '../../data';
import { EmptyState } from './ui';
import { compactCOP } from '../../lib/chartFormat';

// Gráficas del panel (Recharts) con los colores de la marca.

export const GOLD = '#D9AD50';
export const GOLD_LIGHT = '#E6C27A';
const AXIS = { stroke: '#52525b', fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />;

type Formatter = (value: number, key: string) => string;

const SERIES_LABEL: Record<string, string> = { revenue: 'Ingresos', bookings: 'Citas', value: 'Total' };

function ChartTooltip({ active, payload, label, format }: TooltipProps<number, string> & { format: Formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="keep-dark rounded-xl border border-gold/30 bg-[#0e0e0e]/95 backdrop-blur px-3.5 py-2.5 shadow-2xl text-xs">
      {label !== undefined && <p className="text-zinc-400 mb-1.5 font-medium">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-white">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color ?? GOLD }} />
          <span className="text-zinc-400">{SERIES_LABEL[String(p.dataKey)] ?? p.name}:</span>
          <span className="font-mono font-semibold">{format(Number(p.value), String(p.dataKey))}</span>
        </p>
      ))}
    </div>
  );
}

const defaultFormat: Formatter = (v, key) => (key === 'revenue' ? formatCOP(v) : String(v));

/** Ingresos (área dorada) y número de citas (línea) a lo largo del tiempo. */
export function RevenueTrendChart({
  data, height = 280, showBookings = true,
}: {
  data: { label: string; revenue: number; bookings: number }[];
  height?: number;
  showBookings?: boolean;
}) {
  if (!data.some((d) => d.revenue || d.bookings)) return <EmptyState>Todavía no hay citas en este período.</EmptyState>;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="goldArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.45} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
          </defs>
          {GRID}
          <XAxis dataKey="label" {...AXIS} minTickGap={18} />
          <YAxis yAxisId="revenue" {...AXIS} tickFormatter={compactCOP} width={72} />
          {showBookings && <YAxis yAxisId="bookings" orientation="right" {...AXIS} allowDecimals={false} width={28} />}
          <Tooltip content={<ChartTooltip format={defaultFormat} />} cursor={{ stroke: 'rgba(217,173,80,0.35)' }} />
          <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.2} fill="url(#goldArea)" activeDot={{ r: 5, fill: GOLD, stroke: '#0b0b0b', strokeWidth: 2 }} />
          {showBookings && (
            <Line yAxisId="bookings" type="monotone" dataKey="bookings" stroke="#60a5fa" strokeWidth={1.8} dot={false} strokeDasharray="4 4" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras doradas; la más alta se resalta. `layout="vertical"` para nombres largos (servicios). */
export function GoldBarChart<T extends Record<string, string | number>>({
  data, dataKey, nameKey, height = 260, layout = 'horizontal', format = defaultFormat, emptyText = 'Sin datos en este período.',
}: {
  data: T[];
  dataKey: keyof T & string;
  nameKey: keyof T & string;
  height?: number;
  layout?: 'horizontal' | 'vertical';
  format?: Formatter;
  emptyText?: string;
}) {
  if (!data.some((d) => Number(d[dataKey]) > 0)) return <EmptyState>{emptyText}</EmptyState>;
  const max = Math.max(...data.map((d) => Number(d[dataKey])));
  const vertical = layout === 'vertical';
  const axisFormat = (v: number) => (dataKey === 'revenue' ? compactCOP(v) : String(v));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={vertical ? 'vertical' : 'horizontal'} margin={{ top: 6, right: vertical ? 16 : 4, left: vertical ? 0 : -8, bottom: 0 }}>
          <defs>
            <linearGradient id="goldBar" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#8C6A2A" />
              <stop offset="100%" stopColor={GOLD_LIGHT} />
            </linearGradient>
            <linearGradient id="goldBarH" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8C6A2A" />
              <stop offset="100%" stopColor={GOLD_LIGHT} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" {...AXIS} tickFormatter={axisFormat} allowDecimals={false} />
              <YAxis type="category" dataKey={nameKey} {...AXIS} width={132} tick={{ fill: '#a1a1aa', fontSize: 11 }} />
            </>
          ) : (
            <>
              <XAxis dataKey={nameKey} {...AXIS} interval={0} tick={{ fill: '#a1a1aa', fontSize: 11 }} />
              <YAxis {...AXIS} tickFormatter={axisFormat} allowDecimals={false} width={dataKey === 'revenue' ? 72 : 36} />
            </>
          )}
          <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: 'rgba(217,173,80,0.07)' }} />
          <Bar dataKey={dataKey} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={vertical ? 22 : 42}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={Number(d[dataKey]) === max ? (vertical ? 'url(#goldBarH)' : 'url(#goldBar)') : 'rgba(217,173,80,0.32)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Dona con el total en el centro y la leyenda al lado (debajo en celular). */
export function DonutChart({
  data, centerLabel, format = (v) => String(v), emptyText = 'Sin datos en este período.',
}: {
  data: { name: string; value: number; color: string }[];
  centerLabel: string;
  format?: (v: number) => string;
  emptyText?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-5">
      <div className="relative w-44 h-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip content={<ChartTooltip format={(v) => format(v)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-mono text-lg font-bold text-white leading-none">{format(total)}</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 min-w-0">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2.5 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-zinc-300 truncate flex-1">{d.name}</span>
            <span className="font-mono text-white text-xs font-semibold">{format(d.value)}</span>
            <span className="font-mono text-zinc-500 text-[11px] w-9 text-right">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mini gráfica sin ejes, para las tarjetas de cifras. */
export function Sparkline({ data, dataKey = 'value', height = 44 }: { data: Record<string, number | string>[]; dataKey?: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sparkGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.4} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={GOLD} strokeWidth={1.8} fill="url(#sparkGold)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

