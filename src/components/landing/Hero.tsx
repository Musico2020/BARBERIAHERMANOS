import { ChevronDown, MapPin, Wallet, Scissors } from 'lucide-react';
import { businessConfig } from '../../config/business';
import SpecialDaysNotice from './SpecialDaysNotice';

interface HeroProps {
  onBooking: () => void;
}

// Portada: el logo es el protagonista (manual de marca: HERMANOS dominante, navajas simétricas,
// cinta «Club de Caballeros»), sobre negro carbón con detalles dorados y la franja del poste.
export default function Hero({ onBooking }: HeroProps) {
  return (
    <section
      id="inicio"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 70% 55% at 50% 42%, rgba(217, 173, 80, 0.13) 0%, rgba(17, 17, 17, 0.35) 55%, rgba(17, 17, 17, 0.85) 100%)',
      }}
    >
      {/* Marco dorado fino, como un letrero clásico */}
      <div className="pointer-events-none absolute inset-4 sm:inset-8 border border-gold/15 rounded-[2rem]" />

      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 text-center pt-28 sm:pt-32 pb-10">
        <SpecialDaysNotice />

        <h1 className="sr-only">{businessConfig.name} — Barbería tradicional · Club de Caballeros en {businessConfig.city}</h1>

        <img
          src="/logo-salon-hermanos.png"
          alt={`${businessConfig.name} — Barbería tradicional · Club de Caballeros`}
          width={900}
          height={594}
          className="mx-auto w-full max-w-[min(560px,92vw)] h-auto animate-fade-in drop-shadow-[0_18px_40px_rgba(0,0,0,0.6)]"
        />

        <div className="gold-rule max-w-md mx-auto mt-6 mb-5">
          <span className="brand-kicker whitespace-nowrap">Desde el barrio Tobías Daza</span>
        </div>

        <p className="text-ivory-muted text-base sm:text-lg max-w-xl mx-auto mb-9 leading-relaxed animate-fade-in">
          El oficio clásico de la barbería, con el trato de casa. Reserva tu turno en línea y
          te atendemos sin esperas.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-slide-up">
          <button
            onClick={onBooking}
            className="btn-gold min-h-[48px] px-9 py-3.5 rounded-full text-base font-bold tracking-wide w-full sm:w-auto"
          >
            <Scissors size={18} />
            <span>Reservar mi turno</span>
          </button>
          <a
            href="/#servicios"
            className="btn-outline-gold min-h-[48px] px-9 py-3.5 rounded-full text-base font-semibold tracking-wide w-full sm:w-auto text-center"
          >
            Ver servicios y precios
          </a>
        </div>

        <ul className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left sm:text-center">
          <li className="flex sm:flex-col items-center gap-3 sm:gap-1.5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <Scissors size={18} className="text-gold shrink-0" />
            <span className="text-sm text-ivory"><strong className="font-semibold">Cortes desde $15.000</strong></span>
          </li>
          <li className="flex sm:flex-col items-center gap-3 sm:gap-1.5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <Wallet size={18} className="text-gold shrink-0" />
            <span className="text-sm text-ivory">Pagas en el salón, <strong className="font-semibold">sin anticipo</strong></span>
          </li>
          <li className="flex sm:flex-col items-center gap-3 sm:gap-1.5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <MapPin size={18} className="text-gold shrink-0" />
            <span className="text-sm text-ivory">Mz B casa 16, 2.ª etapa · {businessConfig.city}</span>
          </li>
        </ul>
      </div>

      <a
        href="/#servicios"
        className="relative z-10 flex flex-col items-center gap-1.5 mb-8 group cursor-pointer"
        aria-label="Ir a los servicios"
      >
        <ChevronDown size={20} className="text-gold animate-bounce group-hover:translate-y-1 transition-transform" />
      </a>

      <div className="barber-stripe barber-stripe--animated absolute bottom-0 left-0 right-0 opacity-90" />
    </section>
  );
}
