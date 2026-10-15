import { useState, useEffect, lazy, Suspense } from 'react';
import LandingPage from './pages/Landing';
import GalleryPage from './pages/GalleryPage';
import ShopPage from './pages/ShopPage';

// El panel y el portal del barbero (con gráficas y PDF) se descargan solo al abrirlos,
// así la página pública carga rápido para los clientes.
const AdminPage = lazy(() => import('./pages/Admin/index'));
const BarberPage = lazy(() => import('./pages/Barber/index'));

const loadingScreen = <div className="min-h-screen bg-dark" />;

type Route = 'landing' | 'admin' | 'barber' | 'galeria' | 'shop';

const ROUTE_PATHS: Record<Route, string> = {
  landing: '/',
  admin: '/admin',
  barber: '/barber',
  galeria: '/galeria',
  shop: '/shop',
};

function getRoute(): Route {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/barber')) return 'barber';
  if (path.startsWith('/galeria')) return 'galeria';
  if (path.startsWith('/shop')) return 'shop';
  return 'landing';
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const handler = () => setRoute(getRoute());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  useEffect(() => {
    const expected = ROUTE_PATHS[route];
    if (window.location.pathname !== expected) {
      window.history.pushState(null, '', expected + window.location.hash);
    }
  }, [route]);

  if (route === 'admin') return <Suspense fallback={loadingScreen}><AdminPage /></Suspense>;
  if (route === 'barber') return <Suspense fallback={loadingScreen}><BarberPage /></Suspense>;
  if (route === 'galeria') return <GalleryPage />;
  if (route === 'shop') return <ShopPage />;
  return <LandingPage />;
}
