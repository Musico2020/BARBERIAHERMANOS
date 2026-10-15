import { InstagramIcon, FacebookIcon, TikTokIcon } from '../common/BrandIcons';
import { socialLinks, type SocialKind } from '../../lib/social';

// Íconos de redes flotando a la izquierda (en celular, abajo a la izquierda para no tapar el texto),
// con los colores de la marca Salón Hermanos: negro carbón y dorado, igual que el botón de WhatsApp.
// Los enlaces se cambian en Panel → Configuración → Negocio; si una red no tiene enlace, no aparece.

const ICONS: Record<SocialKind, React.ElementType> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
};

export default function SocialFloat() {
  const links = socialLinks();
  if (links.length === 0) return null;
  return (
    <nav
      aria-label="Redes sociales"
      className="keep-dark fixed z-40 flex flex-col gap-2 left-3 bottom-6 sm:gap-3 sm:left-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
    >
      {links.map(({ kind, label, url }) => {
        const Icon = ICONS[kind];
        return (
          <a
            key={kind}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label} de Salón Hermanos`}
            title={label}
            className="group relative w-9 h-9 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-[#0b0b0b] border border-gold/70 text-gold shadow-[0_6px_18px_-6px_rgba(217,173,80,0.55)] transition-all duration-200 hover:scale-110 hover:bg-gradient-to-br hover:from-gold-300 hover:via-gold-400 hover:to-gold-600 hover:text-[#0b0b0b] hover:border-transparent focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Icon size={18} />
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-black/85 border border-gold/30 text-gold text-xs font-semibold whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all hidden sm:block">
              {label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
