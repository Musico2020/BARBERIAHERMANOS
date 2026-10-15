import type { ReactNode } from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import AnimatedBarberBackground from './AnimatedBarberBackground';
import { ClipperIcon } from '../common/BarberIcons';
import { businessConfig } from '../../config/business';
import ThemeToggle from '../common/ThemeToggle';

// Pantalla de acceso compartida por el panel de administración y el portal del barbero.

type Role = 'admin' | 'barber';

interface Props {
  role: Role;
  title: string;
  subtitle: string;
  children: ReactNode;
}

const ROLES: { id: Role; label: string; href: string; icon: React.ElementType }[] = [
  { id: 'admin', label: 'Administrador', href: '/admin', icon: ShieldCheck },
  { id: 'barber', label: 'Barbero', href: '/barber', icon: ClipperIcon },
];

export default function AuthLayout({ role, title, subtitle, children }: Props) {
  return (
    <div className="min-h-screen relative bg-dark overflow-hidden">
      <AnimatedBarberBackground />

      {/* Resplandor dorado detrás del logo */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-gold/10 blur-[120px]" />

      <ThemeToggle className="absolute top-4 right-4 z-20" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-5 py-10">
        <main className="w-full max-w-md min-w-0">
          <div className="flex justify-center mb-8">
            <img
              src="/logo-salon-hermanos.png"
              alt={businessConfig.name}
              width={900}
              height={594}
              className="w-60 sm:w-72 h-auto object-contain drop-shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
            />
          </div>
          <div>

            <nav aria-label="Tipo de acceso" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/10 mb-6">
              {ROLES.map(({ id, label, href, icon: Icon }) => (
                <a
                  key={id}
                  href={href}
                  aria-current={role === id ? 'page' : undefined}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    role === id ? 'bg-gold text-dark shadow-gold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </a>
              ))}
            </nav>

            <section className="rounded-3xl border border-white/12 bg-[#101010]/95 shadow-2xl p-7 sm:p-8">
              <h1 className="font-serif text-2xl font-bold text-white">{title}</h1>
              <p className="text-zinc-400 text-sm mt-1 mb-6">{subtitle}</p>
              {children}
            </section>

            <a href="/" className="flex items-center justify-center gap-2 mt-6 text-zinc-500 hover:text-gold text-sm transition-colors">
              <ArrowLeft size={15} /> Volver al sitio
            </a>
          </div>
        </main>
        <p className="mt-10 text-zinc-600 text-xs text-center">Acceso exclusivo para el equipo de {businessConfig.name}.</p>
      </div>
    </div>
  );
}
