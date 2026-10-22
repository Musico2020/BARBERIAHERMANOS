import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import AdminLogin from './AdminLogin';
import { usePageMeta } from '../../hooks/usePageMeta';
import AdminLayout, { type AdminTab } from './AdminLayout';
import AdminDashboard from './AdminDashboard';
import AdminBookings from './AdminBookings';
import AdminMessages from './AdminMessages';
import AdminBarbers from './AdminBarbers';
import AdminServices from './AdminServices';
import AdminProducts from './AdminProducts';
import AdminGallery from './AdminGallery';
import AdminCalendar from './AdminCalendar';
import AdminShifts from './AdminShifts';
import AdminPayments from './AdminPayments';
import AdminClients from './AdminClients';
import AdminReports from './AdminReports';
import AdminSettings from './AdminSettings';
import { hasAdminSession, signOutAdmin } from '../../services/adminAuth';

const TABS: AdminTab[] = ['dashboard', 'calendar', 'shifts', 'payments', 'bookings', 'messages', 'barbers', 'services', 'products', 'gallery', 'clients', 'reports', 'settings'];
const asTab = (value: unknown): AdminTab | null => (TABS.includes(value as AdminTab) ? (value as AdminTab) : null);

/** /admin?tab=payments abre esa sección (lo usan los avisos al teléfono) */
function tabFromUrl(): AdminTab {
  const tab = asTab(new URLSearchParams(window.location.search).get('tab'));
  if (tab) window.history.replaceState(null, '', window.location.pathname);
  return tab ?? 'dashboard';
}

export default function AdminPage() {
  usePageMeta({ title: 'Panel de administración | Salón Hermanos', noindex: true });
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>(tabFromUrl);

  // Manifiesto del panel: «Agregar a inicio» abre /admin como app (en iPhone es necesario para los avisos)
  useEffect(() => {
    const added: HTMLElement[] = [];
    const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
      added.push(el);
    };
    add('link', { rel: 'manifest', href: '/manifest-admin.webmanifest' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Panel Hermanos' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    return () => added.forEach((el) => el.remove());
  }, []);

  // Al cambiar de sección se empieza desde arriba (en el teléfono cada sección es una pantalla)
  useEffect(() => { window.scrollTo(0, 0); }, [activeTab]);

  // Si el panel ya estaba abierto, el aviso tocado le pide cambiar de sección
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const tab = e.data?.type === 'open-tab' ? asTab(e.data.tab) : null;
      if (tab) setActiveTab(tab);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    hasAdminSession()
      .then(setLoggedIn)
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogout = async () => {
    await signOutAdmin();
    setLoggedIn(false);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gold" />
      </div>
    );
  }

  if (!loggedIn) {
    return <AdminLogin onLogin={() => setLoggedIn(true)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <AdminDashboard onNavigate={setActiveTab} onLogout={handleLogout} />;
      case 'calendar': return <AdminCalendar />;
      case 'shifts': return <AdminShifts />;
      case 'payments': return <AdminPayments />;
      case 'bookings': return <AdminBookings />;
      case 'messages': return <AdminMessages />;
      case 'barbers': return <AdminBarbers />;
      case 'services': return <AdminServices />;
      case 'products': return <AdminProducts />;
      case 'gallery': return <AdminGallery />;
      case 'clients': return <AdminClients />;
      case 'reports': return <AdminReports />;
      case 'settings': return <AdminSettings />;
      default: return <AdminDashboard onNavigate={setActiveTab} onLogout={handleLogout} />;
    }
  };

  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout}>
      {renderContent()}
    </AdminLayout>
  );
}
