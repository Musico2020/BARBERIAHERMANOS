import { useState, useEffect } from 'react';
import { Camera, Expand, Scissors, Users } from 'lucide-react';
import { getGallery } from '../../services/gallery';
import { getBarbers } from '../../services/barbers';
import Lightbox from '../common/Lightbox';
import BarberAvatar from '../common/BarberAvatar';
import type { Barber, GalleryItem } from '../../types';

// Galería de trabajos. Las fotos se suben desde Panel → Galería y cada barbero sube las suyas desde su
// portal («Mis trabajos»). Se puede ver por barbero y reservar con él. Mosaico de 2 columnas en celular,
// 3 en tableta y 4 en computador.

interface Props {
  /** Abre la reserva con ese barbero ya escogido */
  onBookWith?: (barber: Barber) => void;
}

export default function Gallery({ onBookWith }: Props) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('Todas');
  const [barberId, setBarberId] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('barbero') || '';
    }
    return '';
  });
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getGallery(), getBarbers()])
      .then(([g, b]) => { setItems(g); setBarbers(b); })
      .catch((err) => console.error('No se pudo cargar la galería', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectBarber = (id: string) => {
    setBarberId(id);
    setCategory('Todas');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('barbero', id);
      } else {
        url.searchParams.delete('barbero');
      }
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  };

  // Si hay barberos con fotos, mostramos los que tienen fotos; si aún no hay fotos asignadas, mostramos los activos del equipo
  const withPhotos = barbers.filter((b) => items.some((i) => i.barberId === b.id));
  const barbersToShow = withPhotos.length > 0 ? withPhotos : barbers.filter((b) => b.available);
  const byBarber = barberId ? items.filter((i) => i.barberId === barberId) : items;
  const categories = ['Todas', ...new Set(byBarber.map((i) => i.category))];
  const shown = category === 'Todas' ? byBarber : byBarber.filter((i) => i.category === category);
  const selected = barbers.find((b) => b.id === barberId);
  const nameOf = (id?: string | null) => barbers.find((b) => b.id === id)?.shortName;

  return (
    <section id="galeria" className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-12">
          <p className="section-label mb-3">Galería</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-bold text-white mb-4">
            Nuestro <span className="gold-text">Trabajo</span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Mira los trabajos de cada barbero, escoge el que más te guste y reserva con él.
          </p>
        </div>

        {/* Barberos */}
        {barbersToShow.length > 0 && (
          <div className="flex gap-4 overflow-x-auto sm:justify-center pb-3 mb-6 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
            {[{ id: '', name: 'Todos' }, ...barbersToShow.map((b) => ({ id: b.id, name: b.shortName }))].map((o) => {
              const active = barberId === o.id;
              const b = barbers.find((x) => x.id === o.id);
              const count = o.id ? items.filter((i) => i.barberId === o.id).length : items.length;
              return (
                <button key={o.id || 'todos'} type="button" onClick={() => handleSelectBarber(o.id)} aria-pressed={active} className="flex flex-col items-center gap-1.5 shrink-0 w-[84px]">
                  <span className={`w-[72px] h-[72px] rounded-full p-[3px] transition-colors ${active ? 'bg-gold' : 'bg-white/10 hover:bg-gold/50'}`}>
                    {b ? (
                      <BarberAvatar barber={b} className="w-full h-full rounded-full text-lg" />
                    ) : (
                      <span className="w-full h-full rounded-full bg-[#141414] flex items-center justify-center text-gold"><Users size={26} /></span>
                    )}
                  </span>
                  <span className={`text-sm truncate max-w-full ${active ? 'text-gold font-semibold' : 'text-zinc-300'}`}>{o.name}</span>
                  <span className="text-[11px] text-zinc-500 -mt-1">{count} {count === 1 ? 'foto' : 'fotos'}</span>
                </button>
              );
            })}
          </div>
        )}

        {selected && onBookWith && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8 text-center animate-fade-in">
            <p className="text-zinc-300">Trabajos de <span className="text-gold font-semibold">{selected.name}</span></p>
            <button type="button" onClick={() => onBookWith(selected)} className="btn-gold px-6 min-h-[46px] rounded-full font-bold shadow-gold">
              <Scissors size={17} /> <span>Reservar con {selected.shortName}</span>
            </button>
          </div>
        )}

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
          <div className="text-center py-16 rounded-3xl border border-white/10 bg-white/[0.02] max-w-lg mx-auto">
            <Camera size={36} className="mx-auto mb-3 text-zinc-600" />
            <p className="text-zinc-300 font-medium mb-1">
              {selected ? `${selected.name} aún no ha subido fotos a la galería.` : 'Muy pronto subiremos fotos de nuestros trabajos.'}
            </p>
            {selected && onBookWith ? (
              <>
                <p className="text-zinc-400 text-sm mb-5">Pero puedes reservar tu turno con él ahora mismo.</p>
                <button type="button" onClick={() => onBookWith(selected)} className="btn-gold px-6 py-2.5 rounded-full font-bold inline-flex items-center gap-2">
                  <Scissors size={16} /> <span>Reservar con {selected.shortName}</span>
                </button>
              </>
            ) : null}
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
                <span className="keep-dark absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap gap-1">
                  <span className="text-[11px] font-semibold text-gold bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded-full">{item.category}</span>
                  {nameOf(item.barberId) && !barberId && (
                    <span className="text-[11px] font-semibold text-white bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded-full">✂ {nameOf(item.barberId)}</span>
                  )}
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
          items={shown.map((i) => {
            const b = barbers.find((x) => x.id === i.barberId);
            return {
              url: i.url,
              alt: i.alt,
              caption: b ? `${i.category} · Realizado por ${b.name}` : i.category,
              barber: b ?? null,
            };
          })}
          index={open}
          onClose={() => setOpen(null)}
          onNavigate={setOpen}
          onBookWith={(barber) => {
            if (barber) onBookWith?.(barber);
            else if (selected) onBookWith?.(selected);
            else if (onBookWith && barbers.length > 0) onBookWith(barbers[0]);
          }}
        />
      )}
    </section>
  );
}
