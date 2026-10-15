import { useState, useEffect } from 'react';
import { Camera, Expand } from 'lucide-react';
import { getGallery } from '../../services/gallery';
import Lightbox from '../common/Lightbox';
import type { GalleryItem } from '../../types';

// Galería de trabajos. Las fotos se suben desde Panel → Galería.
// Mosaico que se adapta: 2 columnas en celular, 3 en tableta y 4 en computador.

export default function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('Todas');
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    getGallery()
      .then(setItems)
      .catch((err) => console.error('No se pudo cargar la galería', err))
      .finally(() => setLoading(false));
  }, []);

  const categories = ['Todas', ...new Set(items.map((i) => i.category))];
  const shown = category === 'Todas' ? items : items.filter((i) => i.category === category);

  return (
    <section id="galeria" className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-12">
          <p className="section-label mb-3">Galería</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-bold text-white mb-4">
            Nuestro <span className="gold-text">Trabajo</span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Cada corte es una obra de arte. Aquí algunos de nuestros mejores trabajos.
          </p>
        </div>

        {categories.length > 2 && (
          <div className="flex gap-2 overflow-x-auto sm:flex-wrap sm:justify-center pb-2 mb-8 -mx-4 px-4 sm:mx-0" style={{ scrollbarWidth: 'none' }}>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`shrink-0 px-4 sm:px-5 py-2 rounded-full text-sm font-medium border transition-all ${
                  category === c ? 'bg-gold text-dark border-gold' : 'border-white/15 text-zinc-300 hover:border-gold/50 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 sm:gap-4">
            {[260, 180, 220, 300, 200, 240, 180, 260].map((h, i) => (
              <div key={i} className="mb-3 sm:mb-4 rounded-2xl bg-white/[0.04] animate-pulse break-inside-avoid" style={{ height: h }} />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-16 rounded-3xl border border-white/10 bg-white/[0.02]">
            <Camera size={36} className="mx-auto mb-3 text-zinc-600" />
            <p className="text-zinc-400">Muy pronto subiremos fotos de nuestros trabajos.</p>
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 sm:gap-4">
            {shown.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOpen(i)}
                className="group relative mb-3 sm:mb-4 w-full block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] break-inside-avoid focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                aria-label={`Ver foto: ${item.alt}`}
              >
                <img
                  src={item.url}
                  alt={item.alt}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto block transition-transform duration-700 group-hover:scale-105"
                />
                <span className="keep-dark absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="keep-dark absolute bottom-2.5 left-2.5 text-[11px] font-semibold text-gold bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  {item.category}
                </span>
                <span className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Expand size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {open !== null && (
        <Lightbox
          items={shown.map((i) => ({ url: i.url, alt: i.alt, caption: i.category }))}
          index={open}
          onClose={() => setOpen(null)}
          onNavigate={setOpen}
        />
      )}
    </section>
  );
}
