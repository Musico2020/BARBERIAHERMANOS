import type { CSSProperties } from 'react';

// Fondo animado de la web: el ambiente de un club de caballeros. Paño negro carbón con raya
// diplomática dorada, dos focos de luz cálida que se desplazan despacio, un brillo que recorre
// las rayas y polvo dorado que sube como en la luz de un salón antiguo.
// Es solo decorativo; con «reducir movimiento» activado en el sistema queda quieto (ver index.css).

// Posiciones fijas (no aleatorias) para que el fondo sea igual en cada visita
const DUST = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  size: 1.5 + ((i * 7) % 5) * 0.6,
  duration: 16 + ((i * 11) % 14),
  delay: -((i * 13) % 30),
  drift: ((i % 2 ? 1 : -1) * (10 + ((i * 5) % 30))),
}));

export default function ClubBackground() {
  return (
    <div aria-hidden className="club-bg fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="club-bg__pinstripe absolute inset-0" />
      <div className="club-bg__glow club-bg__glow--a" />
      <div className="club-bg__glow club-bg__glow--b" />
      <div className="club-bg__sheen absolute inset-0" />
      {DUST.map((d, i) => (
        <span
          key={i}
          className="club-bg__dust"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
            '--dust-drift': `${d.drift}px`,
          } as CSSProperties}
        />
      ))}
      <div className="club-bg__vignette absolute inset-0" />
    </div>
  );
}
