import { useState, useEffect, type ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import ClubBackground from './ClubBackground';
import WhatsAppChat from './WhatsAppChat';
import SocialFloat from './SocialFloat';
import BookingModal from '../booking/BookingModal';
import type { Barber, Service } from '../../types';

interface Props {
  /** Recibe la función para abrir la reserva (opcionalmente con un servicio ya elegido). */
  children: (openBooking: (service?: Service, barber?: Barber) => void) => ReactNode;
}

/** Estructura común de las páginas públicas: menú, contenido, pie de página y ventana de reserva. */
export default function PublicLayout({ children }: Props) {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [preselectedService, setPreselectedService] = useState<Service | null>(null);
  const [preselectedBarber, setPreselectedBarber] = useState<Barber | null>(null);

  const openBooking = (service?: Service, barber?: Barber) => {
    setPreselectedService(service || null);
    setPreselectedBarber(barber || null);
    setBookingOpen(true);
  };

  // Manejo de escaneo de QR o enlaces directos (#servicios, #reservar, ?reservar=1)
  useEffect(() => {
    const handleUrlTriggers = () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(window.location.search);
      const wantsBooking = hash === '#reservar' || params.has('reservar') || params.get('qr') === '1';

      if (wantsBooking) {
        setBookingOpen(true);
      }

      if (hash === '#servicios' || wantsBooking) {
        setTimeout(() => {
          const el = document.getElementById('servicios');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
        }, 300);
      }
    };

    handleUrlTriggers();
    window.addEventListener('hashchange', handleUrlTriggers);
    return () => window.removeEventListener('hashchange', handleUrlTriggers);
  }, []);

  return (
    <div className="min-h-screen bg-dark relative">
      <div className="grain-overlay" />
      <ClubBackground />

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
        preselectedBarber={preselectedBarber}
      />
    </div>
  );
}
