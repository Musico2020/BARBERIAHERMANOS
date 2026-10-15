import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus, Inbox } from 'lucide-react';
import { STATUS_LABEL, type BookingStatus } from '../../lib/stats';

// Piezas visuales compartidas por todas las pantallas del panel de administración.

/** Tarjeta con título, subtítulo y una acción opcional a la derecha. */
export function Panel({
  title, subtitle, action, children, className = '', bodyClassName = 'p-5 sm:p-6',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`table-card min-w-0 ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 sm:px-6 pt-5 sm:pt-6">
          <div className="min-w-0">
            {title && <h3 className="font-semibold text-white text-[15px] leading-tight">{title}</h3>}
            {subtitle && <p className="text-zinc-500 text-xs mt-1">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Flecha y porcentaje frente al período anterior. `inverse`: subir es malo (p. ej. cancelaciones). */
export function Trend({ value, inverse = false, label }: { value: number | null; inverse?: boolean; label?: string }) {
  if (value === null) {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">Nuevo</span>;
  }
  const good = inverse ? value < 0 : value > 0;
  const Icon = value === 0 ? Minus : value > 0 ? TrendingUp : TrendingDown;
  const color = value === 0 ? 'text-zinc-500 bg-white/5' : good ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${color}`} title={label}>
      <Icon size={12} />
      {value > 0 ? '+' : ''}{value}%
    </span>
  );
}

const ACCENTS = {
  gold: { icon: 'text-gold', ring: 'from-gold/25 to-gold/5 border-gold/30' },
  emerald: { icon: 'text-emerald-400', ring: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/25' },
  blue: { icon: 'text-sky-400', ring: 'from-sky-500/20 to-sky-500/5 border-sky-500/25' },
  rose: { icon: 'text-rose-400', ring: 'from-rose-500/20 to-rose-500/5 border-rose-500/25' },
  violet: { icon: 'text-violet-400', ring: 'from-violet-500/20 to-violet-500/5 border-violet-500/25' },
} as const;

export type Accent = keyof typeof ACCENTS;

/** Cifra principal con ícono, variación y un detalle opcional (p. ej. una mini gráfica). */
export function KpiCard({
  label, value, sub, icon: Icon, accent = 'gold', trend, children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: React.ElementType;
  accent?: Accent;
  trend?: ReactNode;
  children?: ReactNode;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="table-card p-4 sm:p-5 min-w-0 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className={`w-10 h-10 rounded-xl border bg-gradient-to-br flex items-center justify-center shrink-0 ${a.ring}`}>
          <Icon size={19} strokeWidth={1.9} className={a.icon} />
        </span>
        {trend}
      </div>
      <p className="text-zinc-400 text-xs font-medium mt-4">{label}</p>
      <p className="font-mono text-xl sm:text-2xl font-bold text-white tracking-tight mt-1 truncate">{value}</p>
      {sub && <p className="text-zinc-500 text-[11px] mt-1 truncate">{sub}</p>}
      {children && <div className="mt-3 -mx-1">{children}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function EmptyState({ children, icon: Icon = Inbox }: { children: ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-2">
      <span className="w-11 h-11 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
        <Icon size={19} className="text-zinc-500" />
      </span>
      <p className="text-zinc-500 text-sm max-w-xs">{children}</p>
    </div>
  );
}

/** Botones tipo pestaña (Mensual / Anual, etc.). */
export function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            value === o.value ? 'bg-gold text-dark shadow-gold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Iniciales en un círculo dorado, para clientes sin foto. */
export function Initials({ name, className = 'w-9 h-9 text-xs' }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <span className={`rounded-full bg-gradient-to-br from-gold/30 to-gold/5 border border-gold/30 flex items-center justify-center font-bold text-gold shrink-0 ${className}`}>
      {initials || '?'}
    </span>
  );
}
