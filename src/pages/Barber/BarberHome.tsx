import { CalendarDays, CalendarClock, Wallet, History, User, LogOut, UserPlus, Star, CalendarCheck, Clock, CheckCircle2 } from 'lucide-react';
import BarberAvatar from '../../components/common/BarberAvatar';
import { formatCOP } from '../../data';
import { todayKey, nowMinutes, timeToMinutes, time12 } from '../../lib/dates';
import type { Barber, Booking } from '../../types';

// Inicio del portal del barbero en el teléfono: su perfil, cómo va su día y botones grandes por
// secciones (igual que el inicio del panel del administrador).

export type BarberHomeTab = 'agenda' | 'turnos' | 'ganancias' | 'historial' | 'perfil';

interface Props {
  barber: Barber;
  appts: Booking[];
  greeting: string;
  onNavigate: (tab: BarberHomeTab) => void;
  onNewClient: () => void;
  onLogout: () => void;
}

const isOpen = (b: Booking) => b.status === 'pending' || b.status === 'confirmed';

export default function BarberHome({ barber, appts, greeting, onNavigate, onNewClient, onLogout }: Props) {
  const today = todayKey();
  const todayList = appts.filter((b) => b.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const pending = todayList.filter(isOpen);
  const done = todayList.filter((b) => b.status === 'completed');
  const earned = Math.round((done.reduce((s, b) => s + b.price, 0) * barber.commission) / 100);
  const next = pending.find((b) => timeToMinutes(b.time) + 30 >= nowMinutes());

  const tiles: { label: string; icon: React.ElementType; onClick: () => void }[] = [
    { label: 'Agenda', icon: CalendarDays, onClick: () => onNavigate('agenda') },
    { label: 'Turnos', icon: CalendarClock, onClick: () => onNavigate('turnos') },
    { label: 'Ganancias', icon: Wallet, onClick: () => onNavigate('ganancias') },
    { label: 'Historial', icon: History, onClick: () => onNavigate('historial') },
    { label: 'Mi perfil', icon: User, onClick: () => onNavigate('perfil') },
    { label: 'Cerrar sesión', icon: LogOut, onClick: onLogout },
  ];

  return (
    <div className="space-y-6">
      {/* Perfil */}
      <section className="frame-gold rounded-3xl overflow-hidden">
        <div className="barber-stripe" />
        <div className="p-5">
          <div className="flex items-center gap-4">
            <BarberAvatar barber={barber} className="w-20 h-20 rounded-full text-2xl border-2 border-gold/60 shrink-0" />
            <div className="min-w-0">
              <p className="text-zinc-400 text-sm">{greeting},</p>
              <p className="font-serif text-2xl font-extrabold text-gold leading-tight truncate">{barber.shortName}</p>
              <p className="text-zinc-300 text-xs mt-0.5">Barbero · Salón Hermanos</p>
              {barber.reviewCount > 0 && (
                <p className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                  <Star size={12} className="text-gold fill-gold" /> {barber.rating} ({barber.reviewCount} reseñas)
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1 mt-5 text-center">
            {[
              { icon: CalendarCheck, value: todayList.filter((b) => b.status !== 'cancelled').length, label: 'Citas hoy' },
              { icon: Clock, value: pending.length, label: 'Por atender' },
              { icon: CheckCircle2, value: done.length, label: 'Atendidos' },
              { icon: Wallet, value: formatCOP(earned), label: 'Ganado hoy', small: true },
            ].map(({ icon: Icon, value, label, small }) => (
              <button key={label} type="button" onClick={() => onNavigate(label === 'Ganado hoy' ? 'ganancias' : 'agenda')} className="flex flex-col items-center gap-1 rounded-xl py-1 active:bg-gold/10">
                <Icon size={20} className="text-gold" />
                <span className={`font-mono font-bold text-white leading-none ${small ? 'text-[13px]' : 'text-lg'}`}>{value}</span>
                <span className="text-[11px] text-zinc-400 leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {next && (
        <button type="button" onClick={() => onNavigate('agenda')} className="w-full text-left rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/20 via-gold/[0.06] to-transparent p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Tu próxima cita</p>
          <div className="flex items-center justify-between gap-3 mt-1.5">
            <div className="min-w-0">
              <p className="text-white text-lg font-semibold truncate">{next.clientName}</p>
              <p className="text-zinc-300 text-sm truncate">{next.serviceName}</p>
            </div>
            <span className="font-mono text-2xl font-bold text-gold shrink-0">{time12(next.time)}</span>
          </div>
        </button>
      )}

      <button type="button" onClick={onNewClient} className="btn-gold w-full min-h-[54px] rounded-2xl text-base font-bold">
        <UserPlus size={20} /> <span>Cliente nuevo</span>
      </button>

      <section>
        <h3 className="font-serif text-lg font-bold text-gold mb-2.5 px-1">Mi trabajo</h3>
        <div className="table-card rounded-3xl p-3 grid grid-cols-3 gap-1">
          {tiles.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex flex-col items-center justify-start gap-2 rounded-2xl px-1 py-4 min-h-[96px] active:scale-95 active:bg-gold/10 transition-transform"
            >
              <Icon size={30} strokeWidth={1.6} className="text-gold" />
              <span className="text-[13px] leading-tight text-center text-zinc-200">{label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
