import { useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// Foto ampliada a pantalla completa. Flechas del teclado, Esc, o deslizar con el dedo en celular.

export interface LightboxItem {
  url: string;
  alt: string;
  caption?: string;
}

interface Props {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function Lightbox({ items, index, onClose, onNavigate }: Props) {
  const touchX = useRef<number | null>(null);
  const item = items[index];
  const go = (dir: number) => onNavigate((index + dir + items.length) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNavigate((index + 1) % items.length);
      else if (e.key === 'ArrowLeft') onNavigate((index - 1 + items.length) % items.length);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, items.length, onClose, onNavigate]);

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.alt}
      className="keep-dark fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col animate-fade-in"
      onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-sm text-zinc-400" onClick={(e) => e.stopPropagation()}>
        <span className="font-mono">{index + 1} / {items.length}</span>
        <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center text-white hover:border-gold/60 hover:text-gold">
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-16 pb-4">
        <img
          src={item.url}
          alt={item.alt}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl select-none"
          draggable={false}
        />
        {items.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label="Foto anterior"
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 border border-white/15 items-center justify-center text-white hover:border-gold/60 hover:text-gold"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label="Foto siguiente"
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 border border-white/15 items-center justify-center text-white hover:border-gold/60 hover:text-gold"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {(item.caption || items.length > 1) && (
        <p className="text-center text-sm text-zinc-300 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
          {item.caption}
          {items.length > 1 && <span className="sm:hidden block text-xs text-zinc-500 mt-1">Desliza para ver más</span>}
        </p>
      )}
    </div>
  );
}
