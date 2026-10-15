import { useState, useEffect } from 'react';
import { ShoppingBag, PackageOpen, Expand } from 'lucide-react';
import { getProducts } from '../../services/products';
import { businessConfig } from '../../config/business';
import { formatCOP } from '../../data';
import Lightbox from '../common/Lightbox';
import type { Product } from '../../types';

function orderLink(product: Product): string {
  const text = `Hola, quiero pedir: ${product.name}${product.brand ? ` (${product.brand})` : ''} — ${formatCOP(product.price)}. ¿Está disponible?`;
  return `https://wa.me/${businessConfig.whatsapp}?text=${encodeURIComponent(text)}`;
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('Todos');
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    getProducts()
      .then((list) => setProducts(list.filter((p) => p.active)))
      .catch((err) => {
        console.error('No se pudieron cargar los productos', err);
        setError('No pudimos cargar los productos. Intenta de nuevo en un momento.');
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = ['Todos', ...new Set(products.map((p) => p.category).filter(Boolean))];
  const shown = category === 'Todos' ? products : products.filter((p) => p.category === category);

  return (
    <section id="shop" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <p className="section-label mb-3">Shop</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-bold text-white mb-4">
            Línea de <span className="gold-text">Cuidado Masculino</span>
          </h2>
          <p className="text-zinc-300 text-lg max-w-xl mx-auto">
            Los mejores productos para mantener tu look entre visitas. Pídelos por WhatsApp y recógelos en la barbería.
          </p>
        </div>

        {categories.length > 2 && (
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`px-5 py-2 rounded-full text-sm font-medium border transition-all ${
                  category === c ? 'bg-gold text-dark border-gold' : 'border-white/15 text-zinc-300 hover:border-gold/50 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-center text-red-400 text-sm mb-6">{error}</p>}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#121212] overflow-hidden animate-pulse">
                <div className="aspect-square bg-white/5" />
                <div className="p-6 space-y-3">
                  <div className="h-3 w-24 bg-white/10 rounded" />
                  <div className="h-5 w-48 bg-white/10 rounded" />
                  <div className="h-3 w-full bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 && !error ? (
          <div className="text-center py-16 text-zinc-500">
            <PackageOpen size={36} className="mx-auto mb-3 text-zinc-600" />
            Pronto tendremos productos disponibles.
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {shown.map((product, index) => (
              <article
                key={product.id}
                className="group rounded-2xl sm:rounded-3xl overflow-hidden border border-white/12 bg-[#121212] hover:border-gold/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(217,173,80,0.12)] flex flex-col"
              >
                <div className="relative aspect-square overflow-hidden bg-zinc-100">
                  {product.image ? (
                    <button type="button" onClick={() => setZoom(index)} aria-label={`Ver foto de ${product.name}`} className="block w-full h-full">
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <span className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <Expand size={14} />
                    </span>
                    </button>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                      <ShoppingBag size={40} className="text-zinc-600" />
                    </div>
                  )}
                  {product.category && (
                    <span className="absolute top-2 left-2 sm:top-4 sm:left-4 text-[10px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-black/80 text-gold border border-gold/40">
                      {product.category}
                    </span>
                  )}
                </div>
                <div className="p-3.5 sm:p-6 flex flex-col flex-1">
                  {product.brand && <p className="text-gold/80 text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-1 sm:mb-1.5 truncate">{product.brand}</p>}
                  <h3 className="font-serif text-base sm:text-xl font-bold text-white mb-1.5 sm:mb-2 leading-snug">{product.name}</h3>
                  <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed mb-3 sm:mb-5 flex-1 line-clamp-3 sm:line-clamp-none">{product.description}</p>
                  <div className="flex items-end justify-between gap-3">
                    <span className="font-mono text-lg sm:text-2xl font-bold gold-text">{formatCOP(product.price)}</span>
                  </div>
                  <a
                    href={orderLink(product)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 sm:mt-4 w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-full btn-gold text-xs sm:text-sm font-semibold"
                  >
                    <ShoppingBag size={16} />
                    <span className="sm:hidden">Pedir</span>
                    <span className="hidden sm:inline">Pedir por WhatsApp</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {zoom !== null && (
        <Lightbox
          items={shown.filter((p) => p.image).map((p) => ({ url: p.image, alt: p.name, caption: `${p.name} · ${formatCOP(p.price)}` }))}
          index={shown.filter((p) => p.image).indexOf(shown[zoom])}
          onClose={() => setZoom(null)}
          onNavigate={(i) => setZoom(shown.indexOf(shown.filter((p) => p.image)[i]))}
        />
      )}
    </section>
  );
}
