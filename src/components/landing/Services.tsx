import { useState, useEffect } from 'react';
import { Clock, ChevronRight } from 'lucide-react';
import { CategoryIcon } from '../common/BarberIcons';
import { formatCOP } from '../../data';
import { getServices } from '../../services/services';
import type { Service } from '../../types';

// Lista de precios al estilo de un tablero de barbería clásica: marco dorado, nombre y precio
// unidos por puntos, agrupados por tipo de servicio.

const CATEGORY_LABEL: Record<Service['category'], string> = {
  cortes: 'Cortes',
  barba: 'Barba',
  cejas: 'Cejas',
  tratamientos: 'Tratamientos',
  depilacion: 'Depilación',
  masajes: 'Masajes',
  manicura: 'Manicura',
};
const CATEGORY_ORDER: Service['category'][] = ['cortes', 'barba', 'cejas', 'tratamientos', 'depilacion', 'masajes', 'manicura'];

interface ServicesProps {
  onBooking: (service?: Service) => void;
}

function PriceRow({ service, onBooking }: { service: Service; onBooking: (service: Service) => void }) {
  return (
    <li>
      <button
        onClick={() => onBooking(service)}
        className="w-full text-left group rounded-xl px-3 py-3 -mx-3 hover:bg-gold/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold transition-colors"
        aria-label={`Reservar ${service.name}, ${formatCOP(service.price)}`}
      >
        <span className="flex items-baseline gap-2">
          <span className="font-serif font-bold text-ivory text-base sm:text-lg leading-snug group-hover:text-gold transition-colors">
            {service.name}
          </span>
          {service.popular && (
            <span className="shrink-0 self-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-barber-red text-white">
              Favorito
            </span>
          )}
          <span aria-hidden className="flex-1 min-w-4 border-b-2 border-dotted border-gold/35 translate-y-[-4px]" />
          <span className="font-serif font-extrabold text-lg sm:text-xl text-gold whitespace-nowrap">{formatCOP(service.price)}</span>
        </span>
        <span className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap"><Clock size={11} />{service.duration} min</span>
          {service.description && <span className="line-clamp-1">{service.description}</span>}
          <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-gold opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
            Reservar <ChevronRight size={12} />
          </span>
        </span>
      </button>
    </li>
  );
}

export default function Services({ onBooking }: ServicesProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    getServices()
      .then(setServices)
      .catch((err) => {
        console.error('No se pudieron cargar los servicios', err);
        setLoadError('No pudimos cargar los precios. Revisa tu conexión e intenta de nuevo.');
      });
  }, []);

  // Por tipo y, dentro de cada uno, del más económico al más completo
  const groups = CATEGORY_ORDER
    .map((cat) => ({ cat, items: services.filter((s) => s.category === cat).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);
  // Cortes en una columna; lo demás en la otra
  const [first, ...rest] = groups;

  return (
    <section id="servicios" className="py-24 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="section-label mb-3">Servicios y precios</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-extrabold text-ivory mb-4">
            La carta del <span className="font-script font-normal text-gold">Salón</span>
          </h2>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
            Toca cualquier servicio para reservarlo. Pagas en el salón, sin anticipo.
          </p>
        </div>

        {loadError && <p className="text-center text-rose-400 text-sm mb-6">{loadError}</p>}

        <div className="frame-gold rounded-3xl p-5 sm:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-14 gap-y-10">
            {[first ? [first] : [], rest].map((column, i) => (
              <div key={i} className="space-y-10">
                {column.map(({ cat, items }) => (
                  <div key={cat}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-9 h-9 rounded-full border border-gold/50 flex items-center justify-center">
                        <CategoryIcon category={cat} size={16} className="text-gold" />
                      </span>
                      <h3 className="brand-kicker !text-gold">{CATEGORY_LABEL[cat]}</h3>
                      <span aria-hidden className="flex-1 h-px bg-gradient-to-r from-gold/40 to-transparent" />
                    </div>
                    <ul className="space-y-0.5">
                      {items.map((service) => <PriceRow key={service.id} service={service} onBooking={onBooking} />)}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-gold/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-zinc-400 text-sm text-center sm:text-left">
              ¿Quieres varios servicios? En la reserva puedes sumar los que necesites.
            </p>
            <button onClick={() => onBooking()} className="btn-gold min-h-[44px] px-7 py-2.5 rounded-full text-sm font-bold whitespace-nowrap">
              <span>Reservar turno</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
