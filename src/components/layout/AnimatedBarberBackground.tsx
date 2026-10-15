import type { CSSProperties, ReactNode } from 'react';

// Fondo negro con siluetas de herramientas de barbería que flotan despacio.
// Es solo decorativo: no recibe clics y lo ignoran los lectores de pantalla.
// Si la persona pidió "reducir movimiento" en su sistema, las siluetas quedan quietas.

type Tool = 'clipper' | 'scissors' | 'razor' | 'comb';

const ICONS: Record<Tool, ReactNode> = {
  // Máquina de cortar cabello
  clipper: (
    <>
      <rect x="18" y="16" width="28" height="44" rx="11" fill="currentColor" />
      <rect x="14" y="7" width="36" height="11" rx="2.5" fill="currentColor" />
      {[17, 22, 27, 32, 37, 42, 47].map((x) => (
        <rect key={x} x={x - 1} y="2" width="2.2" height="6" rx="1" fill="currentColor" />
      ))}
      <rect x="29" y="26" width="6" height="12" rx="3" fill="#111111" opacity="0.55" />
    </>
  ),
  // Tijeras
  scissors: (
    <g fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round">
      <circle cx="17" cy="48" r="8" />
      <circle cx="47" cy="48" r="8" />
      <path d="M22 42 L46 5" />
      <path d="M42 42 L18 5" />
      <circle cx="32" cy="26" r="1.8" fill="currentColor" stroke="none" />
    </g>
  ),
  // Navaja barbera
  razor: (
    <>
      <path d="M4 20 H38 Q47 20 47 29 V33 H4 Z" fill="currentColor" />
      <path d="M44 30 L60 52" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <circle cx="44" cy="30" r="3" fill="#111111" opacity="0.55" />
    </>
  ),
  // Peine
  comb: (
    <>
      <rect x="4" y="12" width="56" height="11" rx="4" fill="currentColor" />
      {Array.from({ length: 11 }, (_, i) => (
        <rect key={i} x={7 + i * 5} y="22" width="2.6" height={i % 2 === 0 ? 26 : 20} rx="1.2" fill="currentColor" />
      ))}
    </>
  ),
};

// Posición (%), tamaño (px), giro inicial, duración y retraso de cada silueta.
// Están repartidas para que siempre haya algunas a la vista sin amontonarse.
const ITEMS: { tool: Tool; top: number; left: number; size: number; rotate: number; duration: number; delay: number }[] = [
  { tool: 'scissors', top: 8, left: 6, size: 70, rotate: -20, duration: 26, delay: 0 },
  { tool: 'clipper', top: 18, left: 82, size: 84, rotate: 15, duration: 32, delay: -6 },
  { tool: 'comb', top: 42, left: 12, size: 90, rotate: 30, duration: 30, delay: -12 },
  { tool: 'razor', top: 60, left: 74, size: 78, rotate: -35, duration: 28, delay: -3 },
  { tool: 'scissors', top: 78, left: 34, size: 62, rotate: 40, duration: 34, delay: -18 },
  { tool: 'clipper', top: 70, left: 4, size: 58, rotate: -10, duration: 24, delay: -9 },
  { tool: 'comb', top: 6, left: 48, size: 64, rotate: -15, duration: 36, delay: -21 },
  { tool: 'razor', top: 32, left: 56, size: 56, rotate: 25, duration: 27, delay: -14 },
  { tool: 'scissors', top: 50, left: 90, size: 54, rotate: 5, duration: 31, delay: -25 },
  { tool: 'clipper', top: 88, left: 62, size: 66, rotate: 20, duration: 29, delay: -7 },
  { tool: 'comb', top: 86, left: 86, size: 58, rotate: -40, duration: 33, delay: -16 },
  { tool: 'razor', top: 24, left: 28, size: 50, rotate: 60, duration: 25, delay: -11 },
];

export default function AnimatedBarberBackground() {
  return (
    <div aria-hidden="true" className="barber-bg fixed inset-0 z-0 overflow-hidden pointer-events-none bg-dark">
      {ITEMS.map((item, i) => (
        <svg
          key={i}
          viewBox="0 0 64 64"
          className="barber-bg__tool absolute text-gold"
          style={{
            top: `${item.top}%`,
            left: `${item.left}%`,
            width: item.size,
            height: item.size,
            '--tool-rotate': `${item.rotate}deg`,
            animationDuration: `${item.duration}s`,
            animationDelay: `${item.delay}s`,
          } as CSSProperties}
        >
          {ICONS[item.tool]}
        </svg>
      ))}
      {/* Viñeta: oscurece los bordes para que el texto siempre se lea bien */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(17,17,17,0.6)_100%)]" />
    </div>
  );
}
