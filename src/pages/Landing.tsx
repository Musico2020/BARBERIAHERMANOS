import PublicLayout from '../components/layout/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';
import Hero from '../components/landing/Hero';
import Services from '../components/landing/Services';
import Team from '../components/landing/Team';
import WhyUs from '../components/landing/WhyUs';
import Location from '../components/landing/Location';
import BookingCTA from '../components/landing/BookingCTA';

interface LandingProps {
  autoOpenBooking?: boolean;
}

// La galería y la tienda tienen sus propias páginas: /galeria y /shop.
// Testimonios: oculto hasta tener reseñas reales (las de src/data eran inventadas).
export default function LandingPage({ autoOpenBooking }: LandingProps = {}) {
  usePageMeta({
    title: autoOpenBooking
      ? 'Reservar Cita | Salón Hermanos — Club de Caballeros'
      : 'Salón Hermanos | Barbería tradicional en Valledupar — Club de Caballeros',
    description: 'Salón Hermanos, barbería tradicional en Valledupar (barrio Tobías Daza). Corte caballero, niño y dama, degradado, barba, cejas y keratina. Reserva tu cita en línea.',
  });
  return (
    <PublicLayout initialBookingOpen={autoOpenBooking}>
      {(openBooking) => (
        <>
          <Hero onBooking={() => openBooking()} />
          <Services onBooking={openBooking} />
          <Team onBooking={(barber) => openBooking(undefined, barber)} />
          <WhyUs />
          <BookingCTA onBooking={() => openBooking()} />
          <Location />
        </>
      )}
    </PublicLayout>
  );
}
