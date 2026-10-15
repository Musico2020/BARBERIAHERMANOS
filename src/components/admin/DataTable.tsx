import { useState, useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './ui';

// Tabla del panel que se adapta al celular: en pantallas grandes es una tabla normal y en
// celular cada fila se vuelve una tarjeta (sin desplazamiento horizontal). Pagina si hay muchas filas.

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Columna principal: en celular va arriba de la tarjeta, sin etiqueta. */
  primary?: boolean;
  /** En celular va en la esquina superior derecha de la tarjeta (p. ej. estado o precio). */
  aside?: boolean;
  /** No mostrar en la tarjeta de celular. */
  hideOnMobile?: boolean;
  align?: 'left' | 'right';
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  pageSize?: number;
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
  /** Cambia cuando cambian los filtros, para volver a la página 1. */
  resetKey?: string;
}

export default function DataTable<T>({ rows, columns, rowKey, pageSize = 0, empty = 'Sin resultados.', rowClassName, resetKey }: Props<T>) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey]);

  const pages = pageSize > 0 ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const visible = pageSize > 0 ? rows.slice(current * pageSize, (current + 1) * pageSize) : rows;

  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;

  const primary = columns.find((c) => c.primary);
  const aside = columns.filter((c) => c.aside);
  const details = columns.filter((c) => !c.primary && !c.aside && !c.hideOnMobile);

  return (
    <div>
      {/* Computador y tableta */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`table-th ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)} className={`table-row-hover ${rowClassName?.(row) ?? ''}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-5 py-3.5 align-middle ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: tarjetas */}
      <ul className="md:hidden divide-y divide-white/[0.06]">
        {visible.map((row) => (
          <li key={rowKey(row)} className={`px-4 py-4 ${rowClassName?.(row) ?? ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">{primary?.render(row)}</div>
              {aside.length > 0 && (
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {aside.map((c) => <div key={c.key}>{c.render(row)}</div>)}
                </div>
              )}
            </div>
            {details.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3">
                {details.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{c.header}</dt>
                    <dd className="text-sm text-zinc-200 mt-0.5 min-w-0 break-words">{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-white/[0.06]" aria-label="Paginación">
          <p className="text-xs text-zinc-500">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, rows.length)} de {rows.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Página anterior"
              className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-zinc-400 hover:text-gold hover:border-gold/40 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-zinc-400 font-mono px-2">{current + 1} / {pages}</span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
              aria-label="Página siguiente"
              className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-zinc-400 hover:text-gold hover:border-gold/40 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
