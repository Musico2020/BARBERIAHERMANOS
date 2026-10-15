// Formatos y colores para las gráficas del panel.

/** $1,2 M · $850 mil · $20 mil: para ejes donde no cabe la cifra completa. */
export function compactCOP(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)} mil`;
  return `$${value}`;
}

/** Paleta para series sin color propio (barberos, servicios). */
export const SERIES_COLORS = ['#D9AD50', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#94a3b8'];
