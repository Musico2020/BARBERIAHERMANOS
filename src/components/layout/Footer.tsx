import { Instagram, Facebook, MapPin } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { socialUrl } from '../../lib/social';

export default function Footer() {
  const year = new Date().getFullYear();
  const socials = [
    { key: 'instagram' as const, label: 'Instagram', icon: Instagram, value: businessConfig.instagram },
    { key: 'facebook' as const, label: 'Facebook', icon: Facebook, value: businessConfig.facebook },
  ].filter((s) => s.value);

  return (
    <footer className="relative pt-16 pb-8">
      <div className="barber-stripe absolute top-0 left-0 right-0 opacity-80" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div className="lg:col-span-2">
            <img
              src="/logo-salon-hermanos.png"
              alt={businessConfig.name}
              width={900}
              height={594}
              className="w-44 h-auto object-contain mb-5"
            />
            <p className="text-zinc-400 text-sm leading-relaxed max-w-xs mb-4">
              Barbería tradicional en {businessConfig.city}. El oficio clásico de la navaja y la tijera,
              con el trato de un club de caballeros.
            </p>
            <p className="flex items-start gap-2 text-zinc-400 text-sm max-w-xs mb-5">
              <MapPin size={16} className="text-gold shrink-0 mt-0.5" />
              {businessConfig.address}
            </p>
            {socials.length > 0 && (
              <div className="flex gap-3">
                {socials.map(({ key, label, icon: Icon }) => (
                  <a
                    key={key}
                    href={socialUrl(key)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} de ${businessConfig.name}`}
                    className="w-11 h-11 rounded-full flex items-center justify-center text-gold border border-gold/40 hover:bg-gold/10 transition-colors"
                  >
                    <Icon size={16} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-serif font-bold text-ivory text-sm uppercase tracking-[0.18em] mb-4">Servicios</h4>
            <ul className="space-y-2.5">
              {['Corte caballero', 'Corte degradado', 'Corte de niño y dama', 'Barba y cejas', 'Corte + keratina'].map((s) => (
                <li key={s}>
                  <a href="/#servicios" className="text-zinc-400 text-sm hover:text-gold transition-colors">
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-serif font-bold text-ivory text-sm uppercase tracking-[0.18em] mb-4">El salón</h4>
            <ul className="space-y-2.5">
              {[
                { label: 'Inicio', href: '/#inicio' },
                { label: 'Equipo', href: '/#equipo' },
                { label: 'Galería', href: '/galeria' },
                { label: 'Productos', href: '/shop' },
                { label: 'Ubicación y horario', href: '/#contacto' },
              ].map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-zinc-400 text-sm hover:text-gold transition-colors">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
          <p className="text-zinc-500 text-xs">
            © {year} {businessConfig.name} · Barbería tradicional · Club de Caballeros
          </p>
          <p className="font-script text-gold text-lg leading-none">Hecho en {businessConfig.city}</p>
        </div>
      </div>
    </footer>
  );
}
