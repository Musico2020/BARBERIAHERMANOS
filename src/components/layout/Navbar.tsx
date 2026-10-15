import { useState, useEffect, useRef } from 'react';
import { Menu, X, MessageCircle, KeyRound, ChevronDown, ShieldCheck } from 'lucide-react';
import { ClipperIcon } from '../common/BarberIcons';
import { businessConfig } from '../../config/business';
import ThemeToggle from '../common/ThemeToggle';

interface NavbarProps {
  onBooking: () => void;
}

// Las secciones de la página principal llevan "/" delante para que funcionen
// también desde /galeria y /shop.
const navLinks = [
  { label: 'Inicio', href: '/#inicio' },
  { label: 'Servicios', href: '/#servicios' },
  { label: 'Equipo', href: '/#equipo' },
  { label: 'Galería', href: '/galeria' },
  { label: 'Shop', href: '/shop' },
  { label: 'Contacto', href: '/#contacto' },
];

const accessLinks = [
  { label: 'Barbero', description: 'Portal del barbero', href: '/barber', icon: ClipperIcon },
  { label: 'Administrador', description: 'Panel de administración', href: '/admin', icon: ShieldCheck },
];

function isCurrentPage(href: string): boolean {
  return !href.includes('#') && window.location.pathname.startsWith(href);
}

export default function Navbar({ onBooking }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const accessRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cerrar el menú de acceso al hacer clic fuera o al presionar Escape
  useEffect(() => {
    if (!accessOpen) return;
    const onClick = (e: MouseEvent) => {
      if (accessRef.current && !accessRef.current.contains(e.target as Node)) setAccessOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccessOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [accessOpen]);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'py-3 backdrop-blur-2xl bg-dark/80 border-b border-gold/20 shadow-xl'
            : 'py-5 bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <a href="/" className="flex items-center group" aria-label={`${businessConfig.name} — inicio`}>
            <img
              src="/logo-salon-hermanos.png"
              alt={businessConfig.name}
              width={900}
              height={594}
              className={`w-auto object-contain transition-all duration-300 group-hover:scale-105 ${scrolled ? 'h-11 sm:h-12' : 'h-12 sm:h-16'}`}
            />
          </a>

          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => {
              const current = isCurrentPage(link.href);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={`text-sm font-medium tracking-wide transition-colors duration-200 relative group ${
                    current ? 'text-gold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {link.label}
                  <span className={`absolute -bottom-1 left-0 h-px bg-gold-300 transition-all duration-300 ${current ? 'w-full' : 'w-0 group-hover:w-full'}`} />
                </a>
              );
            })}
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <ThemeToggle />
            <div ref={accessRef} className="relative">
              <button
                onClick={() => setAccessOpen((v) => !v)}
                aria-expanded={accessOpen}
                aria-haspopup="menu"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-gold/60 text-gold text-sm font-semibold tracking-wide hover:bg-gold/10 transition-colors"
              >
                <KeyRound size={14} />
                Acceso
                <ChevronDown size={14} className={`transition-transform ${accessOpen ? 'rotate-180' : ''}`} />
              </button>
              {accessOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-60 border border-gold/20 rounded-2xl p-2 shadow-2xl bg-[#141414]">
                  {accessLinks.map(({ label, description, href, icon: Icon }) => (
                    <a
                      key={href}
                      href={href}
                      role="menuitem"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gold/10 transition-colors group"
                    >
                      <span className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/20 flex items-center justify-center text-gold">
                        <Icon size={15} />
                      </span>
                      <span>
                        <span className="block text-white text-sm font-medium group-hover:text-gold">{label}</span>
                        <span className="block text-zinc-500 text-xs">{description}</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onBooking}
              className="btn-gold px-5 py-2 rounded-full text-sm font-semibold tracking-wide"
            >
              <span>Reservar ahora</span>
            </button>
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            className="lg:hidden w-9 h-9 glass rounded-full flex items-center justify-center text-zinc-300 hover:text-gold transition-colors"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden animate-fade-in">
          <div className="absolute inset-0 bg-dark/95 backdrop-blur-xl" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-0 right-0 w-72 h-full glass border-l border-white/10 flex flex-col pt-24 pb-8 px-8 animate-slide-in-right overflow-y-auto">
            <div className="flex flex-col gap-1 mb-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`py-3 px-4 hover:bg-white/5 rounded-xl text-lg font-medium transition-all ${
                    isCurrentPage(link.href) ? 'text-gold' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-3 mt-auto">
              <ThemeToggle withLabel className="mb-2" />
              <p className="text-xs text-gold uppercase tracking-wider px-1 flex items-center gap-1.5">
                <KeyRound size={12} /> Acceso
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {accessLinks.map(({ label, href, icon: Icon }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-gold/40 text-gold text-sm font-medium hover:bg-gold/10 transition-colors"
                  >
                    <Icon size={16} />
                    {label}
                  </a>
                ))}
              </div>
              <a
                href={`https://wa.me/${businessConfig.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 px-5 rounded-full glass border border-green-500/30 text-green-400 font-medium text-sm"
              >
                <MessageCircle size={16} />
                WhatsApp
              </a>
              <button
                onClick={() => { onBooking(); setMenuOpen(false); }}
                className="btn-gold py-3 px-5 rounded-full text-sm font-semibold"
              >
                <span>Reservar ahora</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
