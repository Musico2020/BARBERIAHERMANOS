import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard, Calendar, ClipboardList, Users,
  UserCircle, BarChart2, Settings, LogOut, ExternalLink, Menu, Bell,
  CheckCheck, AlertCircle, CalendarCheck, MessageCircle, BellRing, ShoppingBag, Images, CalendarClock,
} from 'lucide-react';
import { ClipperIcon } from '../../components/common/BarberIcons';
import ThemeToggle from '../../components/common/ThemeToggle';
import { useAdminNotifications, relativeTime, type AdminNotificationType } from '../../hooks/useAdminNotifications';

export type AdminTab = 'dashboard' | 'calendar' | 'shifts' | 'bookings' | 'messages' | 'barbers' | 'services' | 'products' | 'gallery' | 'clients' | 'reports' | 'settings';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const notifIcon = (type: AdminNotificationType) => {
  switch (type) {
    case 'booking': return <CalendarCheck size={14} className="text-gold" />;
    case 'cancelled': return <AlertCircle size={14} className="text-red-400" />;
    case 'message': return <MessageCircle size={14} className="text-green-400" />;
  }
};

const notifBg = (type: AdminNotificationType) => {
  switch (type) {
    case 'booking': return 'bg-gold/10 border-gold/20';
    case 'cancelled': return 'bg-red-500/10 border-red-500/20';
    case 'message': return 'bg-green-500/10 border-green-500/20';
  }
};

const navItems: { id: AdminTab; label: string; icon: React.ElementType; group: string; description: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Día a día', description: 'Cómo va el negocio hoy y este mes' },
  { id: 'calendar', label: 'Calendario', icon: Calendar, group: 'Día a día', description: 'Agenda por día y por semana' },
  { id: 'shifts', label: 'Turnos', icon: CalendarClock, group: 'Día a día', description: 'Abrir o cerrar horas de un día' },
  { id: 'bookings', label: 'Reservas', icon: ClipboardList, group: 'Día a día', description: 'Todas las citas y su estado' },
  { id: 'messages', label: 'Mensajes', icon: MessageCircle, group: 'Día a día', description: 'Lo que escriben desde la web' },
  { id: 'barbers', label: 'Barberos', icon: Users, group: 'Negocio', description: 'Equipo, fotos, PIN y porcentajes' },
  { id: 'services', label: 'Servicios', icon: ClipperIcon, group: 'Negocio', description: 'Precios y duración de cada servicio' },
  { id: 'products', label: 'Productos', icon: ShoppingBag, group: 'Negocio', description: 'Lo que se muestra en el Shop' },
  { id: 'gallery', label: 'Galería', icon: Images, group: 'Negocio', description: 'Fotos de los trabajos para la web' },
  { id: 'clients', label: 'Clientes', icon: UserCircle, group: 'Negocio', description: 'Directorio y fidelización' },
  { id: 'reports', label: 'Reportes', icon: BarChart2, group: 'Análisis', description: 'Ingresos, horas pico y PDF' },
  { id: 'settings', label: 'Configuración', icon: Settings, group: 'Análisis', description: 'Datos y horario del negocio' },
];
const navGroups = [...new Set(navItems.map((n) => n.group))];

export default function AdminLayout({ activeTab, onTabChange, onLogout, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, unreadMessages, permission, requestPermission, markRead, markAllRead } = useAdminNotifications();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          <img
            src="/logo-salon-hermanos.png"
            alt="Salón Hermanos"
            width={900}
            height={594}
            className="w-16 h-auto object-contain"
          />
          <div>
            <div className="flex flex-col leading-none">
              <span className="font-script text-lg text-gold-300">Salón</span>
              <span className="font-display text-base tracking-wide text-white uppercase">Hermanos</span>
            </div>
            <p className="text-zinc-500 text-[10px] font-mono tracking-wider uppercase mt-1">Panel Admin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group} className="mb-4 last:mb-0">
            <p className="px-3.5 mb-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold text-zinc-600">{group}</p>
            <div className="space-y-0.5">
              {navItems.filter((n) => n.group === group).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { onTabChange(id); setSidebarOpen(false); }}
                  aria-current={activeTab === id ? 'page' : undefined}
                  className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                    activeTab === id
                      ? 'bg-gradient-to-r from-gold/20 to-gold/[0.04] text-gold font-semibold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  {activeTab === id && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gold" />}
                  <Icon size={17} strokeWidth={1.75} className={activeTab === id ? 'text-gold' : 'text-zinc-500'} />
                  <span className="flex-1 text-left">{label}</span>
                  {id === 'messages' && unreadMessages > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadMessages}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/8 space-y-1">
        <a
          href="/"
          target="_blank"
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-all"
        >
          <ExternalLink size={16} strokeWidth={1.75} />
          Ver sitio
        </a>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
        >
          <LogOut size={16} strokeWidth={1.75} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-dark/85 relative z-10">
      <aside className="admin-sidebar hidden lg:flex flex-col w-56 glass border-r border-white/8 shrink-0 fixed inset-y-0 left-0">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-dark/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="admin-sidebar absolute left-0 top-0 bottom-0 w-56 glass border-r border-white/8 z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 lg:ml-56 flex flex-col min-h-screen">
        <header className="admin-topbar sticky top-0 z-30 glass border-b border-white/8 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-8 h-8 glass rounded-lg flex items-center justify-center text-zinc-400"
            >
              <Menu size={16} />
            </button>
            <div className="min-w-0">
              <h1 className="font-semibold text-white text-base leading-tight">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h1>
              <p className="hidden sm:block text-zinc-500 text-xs truncate">
                {navItems.find((n) => n.id === activeTab)?.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle className="!w-8 !h-8" />
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notificaciones"
                className="relative w-8 h-8 glass rounded-lg flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              >
                <Bell size={15} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-10 w-80 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50" style={{ background: '#1a1a1a' }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/8" style={{ background: '#1a1a1a' }}>
                    <div className="flex items-center gap-2">
                      <Bell size={14} className="text-gold" />
                      <span className="text-white text-sm font-semibold">Notificaciones</span>
                      {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-gold transition-colors"
                      >
                        <CheckCheck size={12} />
                        Marcar todas
                      </button>
                    )}
                  </div>

                  {permission === 'default' && (
                    <button
                      onClick={requestPermission}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gold bg-gold/5 hover:bg-gold/10 border-b border-white/8 transition-colors"
                    >
                      <BellRing size={13} />
                      Activar avisos del navegador para reservas y mensajes nuevos
                    </button>
                  )}

                  <div className="max-h-[360px] overflow-y-auto divide-y divide-white/5" style={{ background: '#1a1a1a' }}>
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-zinc-600 text-sm">
                        Sin reservas ni mensajes nuevos en las últimas 48 horas
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <button
                          key={notif.id}
                          onClick={() => {
                            markRead(notif.id);
                            onTabChange(notif.type === 'message' ? 'messages' : 'bookings');
                            setNotifOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors hover:bg-white/3 ${
                            !notif.read ? 'bg-white/2' : ''
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${notifBg(notif.type)}`}>
                            {notifIcon(notif.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <p className={`text-xs font-semibold truncate ${notif.read ? 'text-zinc-400' : 'text-white'}`}>
                                {notif.title}
                              </p>
                              {!notif.read && (
                                <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                              )}
                            </div>
                            <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2">
                              {notif.description}
                            </p>
                            <p className="text-zinc-600 text-[10px] mt-1">{relativeTime(notif.createdAt)}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <div className="px-4 py-3 border-t border-white/8" style={{ background: '#1a1a1a' }}>
                      <button
                        onClick={() => { onTabChange('bookings'); setNotifOpen(false); }}
                        className="w-full text-center text-xs text-zinc-500 hover:text-gold transition-colors"
                      >
                        Ver todas las reservas
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-300 to-gold-500 flex items-center justify-center text-xs font-bold text-dark">
              A
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
