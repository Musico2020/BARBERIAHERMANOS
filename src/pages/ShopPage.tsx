import PublicLayout from '../components/layout/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';
import Products from '../components/landing/Products';

export default function ShopPage() {
  usePageMeta({
    title: 'Productos para cabello y barba | Salón Hermanos Valledupar',
    description: 'Productos de cuidado para cabello y barba. Pídelos por WhatsApp y recógelos en Salón Hermanos, Valledupar.',
  });
  return (
    <PublicLayout>
      {() => (
        <div className="pt-20">
          <Products />
        </div>
      )}
    </PublicLayout>
  );
}
