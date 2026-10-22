import PublicLayout from '../components/layout/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';
import Gallery from '../components/landing/Gallery';
import BookingCTA from '../components/landing/BookingCTA';

export default function GalleryPage() {
  usePageMeta({
    title: 'Galería de cortes y barbas | Salón Hermanos Valledupar',
    description: 'Mira nuestros trabajos: degradados, cortes clásicos, barba y cejas en Salón Hermanos, Valledupar.',
  });
  return (
    <PublicLayout>
      {(openBooking) => (
        <div className="pt-20">
          <Gallery onBookWith={(barber) => openBooking(undefined, barber)} />
          <BookingCTA onBooking={() => openBooking()} />
        </div>
      )}
    </PublicLayout>
  );
}
