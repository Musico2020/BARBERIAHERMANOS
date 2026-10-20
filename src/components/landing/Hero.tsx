import { ChevronDown, MapPin, Wallet, Scissors } from 'lucide-react';
import { businessConfig } from '../../config/business';
import SpecialDaysNotice from './SpecialDaysNotice';

interface HeroProps {
  onBooking: () => void;
}

// Portada tipográfica: «Club de Caballeros» como titular, con las letras de la marca
// (Lobster para «Club de», Alfa Slab One para CABALLEROS), filetes dorados y estrellas del sello.
export default function Hero({ onBooking }: HeroProps) {
  return (
    <section id="inicio" className="relative min-h-[100svh] flex flex-col items-center justify-center overflow-hidden">
      {/* Marco dorado doble, como un letrero clásico */}
      <div aria-hidden className="pointer-events-none absolute inset-3 sm:inset-6 border border-gold/20 rounded-[1.75rem]" />
      <div aria-hidden className="pointer-events-none absolute inset-5 sm:inset-9 border border-gold/[0.07] rounded-[1.5rem]" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 text-center pt-32 sm:pt-40 pb-10">
        <SpecialDaysNotice />

        <div className="animate-fade-in">
          <h1 className="leading-none">
            <span className="block font-script text-gold text-5xl sm:text-7xl lg:text-8xl -mb-1 sm:-mb-3 drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]">
              Club de
            </span>
            <span className="brand-title block text-[clamp(2.6rem,11.5vw,8.5rem)] drop-shadow-[0_8px_30px_rgba(0,0,0,0.75)]">
              CABALLEROS
            </span>
          </h1>

          <div className="gold-rule max-w-xl mx-auto mt-6 sm:mt-8">
            <span className="brand-kicker whitespace-nowrap">Barbería <span className="text-gold mx-1.5">✦</span> Tradicional</span>
          </div>
        </div>

        <p className="text-ivory-muted text-base sm:text-lg max-w-xl mx-auto mt-8 mb-9 leading-relaxed animate-fade-in">
          El oficio clásico de la navaja y la tijera, con el trato de casa.
          Reserva tu turno en línea y te atendemos sin esperas.
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

        <ul className="mt-12 grid grid-cols-1 sm:grid-cols-3 border-y border-gold/20 sm:divide-x divide-gold/20 text-left sm:text-center">
          <li className="flex sm:flex-col items-center gap-3 sm:gap-1.5 px-4 py-4">
            <Scissors size={18} className="text-gold shrink-0" />
            <span className="text-sm text-ivory"><strong className="font-semibold">Cortes desde $15.000</strong></span>
          </li>
          <li className="flex sm:flex-col items-center gap-3 sm:gap-1.5 px-4 py-4 border-t sm:border-t-0 border-gold/20">
            <Wallet size={18} className="text-gold shrink-0" />
            <span className="text-sm text-ivory">{businessConfig.deposit.enabled
              ? <>Separas con el <strong className="font-semibold">{businessConfig.deposit.percent} %</strong> por Nequi</>
              : <>Pagas en el salón, <strong className="font-semibold">sin anticipo</strong></>}</span>
          </li>
          <li className="flex sm:flex-col items-center gap-3 sm:gap-1.5 px-4 py-4 border-t sm:border-t-0 border-gold/20">
            <MapPin size={18} className="text-gold shrink-0" />
            <span className="text-sm text-ivory">Barrio Tobías Daza · {businessConfig.city}</span>
          </li>
        </ul>
      </div>

      <a href="/#servicios" className="relative z-10 mb-8 group" aria-label="Ir a los servicios">
        <ChevronDown size={20} className="text-gold animate-bounce group-hover:translate-y-1 transition-transform" />
      </a>

      <div className="barber-stripe barber-stripe--animated absolute bottom-0 left-0 right-0 opacity-90" />
    </section>
  );
}
