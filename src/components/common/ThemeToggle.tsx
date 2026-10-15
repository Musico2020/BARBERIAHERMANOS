import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getTheme, setTheme, type Theme } from '../../lib/theme';

/** Botón sol/luna para cambiar entre tema oscuro y claro. */
export default function ThemeToggle({ className = '', withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [theme, setLocal] = useState<Theme>(getTheme);

  useEffect(() => {
    const onChange = (e: Event) => setLocal((e as CustomEvent<Theme>).detail);
    window.addEventListener('sh-theme', onChange);
    return () => window.removeEventListener('sh-theme', onChange);
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-gold/40 text-gold hover:bg-gold/10 transition-colors ${withLabel ? 'px-4 py-2.5 text-sm font-medium' : 'w-9 h-9'} ${className}`}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      {withLabel && <span>{next === 'light' ? 'Modo claro' : 'Modo oscuro'}</span>}
    </button>
  );
}
