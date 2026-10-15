import { useState, type ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import AnimatedBarberBackground from './AnimatedBarberBackground';
import WhatsAppChat from './WhatsAppChat';
import SocialFloat from './SocialFloat';
import BookingModal from '../booking/BookingModal';
import type { Service } from '../../types';

interface Props {
  /** Recibe la función para abrir la reserva (opcionalmente con un servicio ya elegido). */
  children: (openBooking: (service?: Service) => void) => ReactNode;
}

/** Estructura común de las páginas públicas: menú, contenido, pie de página y ventana de reserva. */
export default function PublicLayout({ children }: Props) {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [preselectedService, setPreselectedService] = useState<Service | null>(null);

  const openBooking = (service?: Service) => {
    setPreselectedService(service || null);
    setBookingOpen(true);
  };

  return (
    <div className="min-h-screen bg-dark relative">
      <div className="grain-overlay" />
      <AnimatedBarberBackground />

      <Navbar onBooking={() => openBooking()} />

      <main className="relative z-10">{children(openBooking)}</main>

      <div className="relative z-10">
        <Footer />
      </div>

      <SocialFloat />
      <WhatsAppChat onBooking={() => openBooking()} />

      <BookingModal
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        preselectedService={preselectedService}
      />
    </div>
  );
}
