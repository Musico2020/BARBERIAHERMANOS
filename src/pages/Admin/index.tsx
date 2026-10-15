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
import AdminClients from './AdminClients';
import AdminReports from './AdminReports';
import AdminSettings from './AdminSettings';
import { hasAdminSession, signOutAdmin } from '../../services/adminAuth';

export default function AdminPage() {
  usePageMeta({ title: 'Panel de administración | Salón Hermanos', noindex: true });
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

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
      case 'dashboard': return <AdminDashboard onNavigate={setActiveTab} />;
      case 'calendar': return <AdminCalendar />;
      case 'bookings': return <AdminBookings />;
      case 'messages': return <AdminMessages />;
      case 'barbers': return <AdminBarbers />;
      case 'services': return <AdminServices />;
      case 'products': return <AdminProducts />;
      case 'gallery': return <AdminGallery />;
      case 'clients': return <AdminClients />;
      case 'reports': return <AdminReports />;
      case 'settings': return <AdminSettings />;
      default: return <AdminDashboard onNavigate={setActiveTab} />;
    }
  };

  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout}>
      {renderContent()}
    </AdminLayout>
  );
}
