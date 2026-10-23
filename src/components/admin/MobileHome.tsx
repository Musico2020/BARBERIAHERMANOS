import { useEffect, useState } from 'react';
import {
  CalendarDays, ClipboardList, CalendarClock, Banknote, Users, UserCircle, MessageCircle, ShoppingBag, Images,
  BarChart2, Settings, ExternalLink, LogOut, UserPlus, Star, CalendarCheck, Wallet, Receipt,
} from 'lucide-react';
import { ClipperIcon } from '../common/BarberIcons';
import { currentAdminEmail } from '../../services/adminAuth';
import { countDepositsToReview } from '../../services/deposits';
import { formatCOP } from '../../data';
import { openStatus } from '../../lib/businessHours';
import type { AdminTab } from '../../pages/Admin/AdminLayout';
import type { Barber } from '../../types';

// Inicio del panel en el teléfono: perfil, cifras de hoy y botones grandes por secciones
// (como una app). En el computador se sigue viendo el dashboard de siempre.

/** Nombre para el saludo según el correo del administrador */
const NAMES: Record<string, string> = {
  'walcamanbla@gmail.com': 'Walter',
  'dani.yesid.manjarrez@gmail.com': 'Dani',
};

interface Tile {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  badge?: number;
}

interface Props {
  greeting: string;
  barbers: Barber[];
  clientsCount: number;
  todayCount: number;
  todayRevenue: number;
  onNavigate: (tab: AdminTab) => void;
  onNewClient: () => void;
  onLogout?: () => void;
}

function TileGroup({ title, tiles }: { title: string; tiles: Tile[] }) {
  return (
    <section>
      <h3 className="font-serif text-lg font-bold text-gold mb-2.5 px-1">{title}</h3>
      <div className="table-card rounded-3xl p-3 grid grid-cols-3 gap-1">
        {tiles.map(({ label, icon: Icon, onClick, badge }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="relative flex flex-col items-center justify-start gap-2 rounded-2xl px-1 py-4 min-h-[96px] active:scale-95 active:bg-gold/10 transition-transform"
          >
            <span className="relative">
              <Icon size={30} strokeWidth={1.6} className="text-gold" />
              {!!badge && (
                <span className="absolute -top-2 -right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-dark text-[11px] font-bold flex items-center justify-center">{badge}</span>
              )}
            </span>
            <span className="text-[13px] leading-tight text-center text-zinc-200">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function MobileHome({ greeting, barbers, clientsCount, todayCount, todayRevenue, onNavigate, onNewClient, onLogout }: Props) {
  const [email, setEmail] = useState('');
  const [toReview, setToReview] = useState(0);
  useEffect(() => {
    currentAdminEmail().then(setEmail).catch(() => setEmail(''));
    countDepositsToReview().then(setToReview).catch(() => setToReview(0));
  }, []);

  const name = NAMES[email.toLowerCase()] ?? 'Administrador';
  const status = openStatus();
  const rated = barbers.filter((b) => b.reviewCount > 0);
  const reviews = rated.reduce((s, b) => s + b.reviewCount, 0);
  const rating = reviews ? (rated.reduce((s, b) => s + b.rating * b.reviewCount, 0) / reviews).toFixed(1) : '—';

  const go = (tab: AdminTab) => () => onNavigate(tab);

  return (
    <div className="space-y-6 lg:hidden">
      {/* Perfil */}
      <section className="frame-gold rounded-3xl overflow-hidden">
        <div className="barber-stripe" />
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-[#111] border-2 border-gold/60 flex items-center justify-center shrink-0 overflow-hidden keep-dark">
              <img src="/logo-salon-hermanos.png" alt="Salón Hermanos" className="w-16 h-auto object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-zinc-400 text-sm">{greeting},</p>
              <p className="font-serif text-2xl font-extrabold text-gold leading-tight">{name}</p>
              <p className="text-zinc-300 text-xs mt-0.5">Administrador · Salón Hermanos</p>
              {email && <p className="text-zinc-500 text-xs truncate">{email}</p>}
            </div>
          </div>
          <p className={`inline-flex items-center gap-2 text-xs font-semibold mt-4 px-3 py-1.5 rounded-full border ${
            status.open ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-zinc-300 bg-white/[0.04] border-white/10'
          }`}>
            <span className={`w-2 h-2 rounded-full ${status.open ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
            {status.label}
          </p>

          <div className="grid grid-cols-4 gap-1 mt-5 text-center">
            {[
              { icon: Users, value: clientsCount, label: 'Clientes', tab: 'clients' as AdminTab },
              { icon: CalendarCheck, value: todayCount, label: 'Citas hoy', tab: 'bookings' as AdminTab },
              { icon: Star, value: rating, label: reviews ? `(${reviews})` : 'Reseñas', tab: 'barbers' as AdminTab, star: true },
              { icon: Wallet, value: formatCOP(todayRevenue), label: 'Caja hoy', tab: 'reports' as AdminTab, small: true },
            ].map(({ icon: Icon, value, label, tab, star, small }) => (
              <button key={label} type="button" onClick={go(tab)} className="flex flex-col items-center gap-1 rounded-xl py-1 active:bg-gold/10">
                <Icon size={20} className={star ? 'text-gold fill-gold' : 'text-gold'} />
                <span className={`font-mono font-bold text-white leading-none ${small ? 'text-[13px]' : 'text-lg'}`}>{value}</span>
                <span className="text-[11px] text-zinc-400 leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <button type="button" onClick={onNewClient} className="btn-gold w-full min-h-[54px] rounded-2xl text-base font-bold">
        <UserPlus size={20} /> <span>Cliente nuevo</span>
      </button>

      <TileGroup
        title="Mi negocio"
        tiles={[
          { label: 'Agenda', icon: CalendarDays, onClick: go('calendar') },
          { label: 'Reservas', icon: ClipboardList, onClick: go('bookings') },
          { label: 'Facturas', icon: Receipt, onClick: go('invoices') },
          { label: 'Turnos', icon: CalendarClock, onClick: go('shifts') },
          { label: 'Pagos', icon: Banknote, onClick: go('payments'), badge: toReview },
          { label: 'Servicios', icon: ClipperIcon, onClick: go('services') },
          { label: 'Productos', icon: ShoppingBag, onClick: go('products') },
        ]}
      />
      <TileGroup
        title="Equipo y clientes"
        tiles={[
          { label: 'Barberos', icon: Users, onClick: go('barbers') },
          { label: 'Clientes', icon: UserCircle, onClick: go('clients') },
          { label: 'Mensajes', icon: MessageCircle, onClick: go('messages') },
          { label: 'Galería', icon: Images, onClick: go('gallery') },
          { label: 'Informes', icon: BarChart2, onClick: go('reports') },
          { label: 'Configuración', icon: Settings, onClick: go('settings') },
        ]}
      />
      <TileGroup
        title="Más"
        tiles={[
          { label: 'Ver sitio', icon: ExternalLink, onClick: () => window.open('/', '_blank') },
          ...(onLogout ? [{ label: 'Cerrar sesión', icon: LogOut, onClick: onLogout }] : []),
        ]}
      />
    </div>
  );
}
