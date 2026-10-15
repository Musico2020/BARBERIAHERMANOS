import type { SVGProps } from 'react';
import { Feather, HeartHandshake, Hand } from 'lucide-react';

// Íconos de barbería con el mismo estilo de trazo que lucide-react (24 px, línea redondeada),
// para que combinen con el resto de íconos de la web.

export interface BarberIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number;
  strokeWidth?: number;
}

function Icon({ size = 24, strokeWidth = 1.75, children, ...props }: BarberIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Máquina de cortar cabello */
export function ClipperIcon(props: BarberIconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4.5h10a1 1 0 0 1 1 1V8H6V5.5a1 1 0 0 1 1-1Z" />
      <path d="M8 4.5V2.5M10.67 4.5V2.5M13.33 4.5V2.5M16 4.5V2.5" />
      <path d="M7.5 8h9v10.5a3.5 3.5 0 0 1-3.5 3.5h-2a3.5 3.5 0 0 1-3.5-3.5Z" />
      <path d="M12 11.5v3" />
    </Icon>
  );
}

/** Navaja barbera */
export function RazorIcon(props: BarberIconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 8.5h11a3 3 0 0 1 3 3v1.5h-14Z" />
      <path d="M16.5 12.5 21 20" />
      <circle cx="16.5" cy="12.5" r="0.6" fill="currentColor" />
    </Icon>
  );
}

/** Peine */
export function CombIcon(props: BarberIconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="6" width="19" height="4" rx="1.5" />
      <path d="M5 10v7M8 10v5M11 10v7M14 10v5M17 10v7M20 10v5" />
    </Icon>
  );
}

/** Barba y bigote */
export function BeardIcon(props: BarberIconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5c0 8.5 3.6 15 8 15s8-6.5 8-15" />
      <path d="M7.5 12.5c1.6-1.6 3.1-1.6 4.5-.3 1.4-1.3 2.9-1.3 4.5.3" />
      <path d="M10.5 16h3" />
    </Icon>
  );
}

/** Frasco de tratamiento capilar */
export function TreatmentIcon(props: BarberIconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2.5h4v3l2.5 3.5v10.5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V9L10 5.5Z" />
      <path d="M12 12.5c-1.2 1.4-1.8 2.4-1.8 3.2a1.8 1.8 0 0 0 3.6 0c0-.8-.6-1.8-1.8-3.2Z" />
    </Icon>
  );
}

/** Diseño de cejas */
export function EyebrowIcon(props: BarberIconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9.5c4.5-4 12-4.5 18-.5" />
      <path d="M4.5 15.5c4.5-4 10.5-4 15 0-4.5 3.5-10.5 3.5-15 0Z" />
      <circle cx="12" cy="15" r="1.6" />
    </Icon>
  );
}

/** Ícono de cada categoría de servicio */
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  cortes: ClipperIcon,
  barba: BeardIcon,
  tratamientos: TreatmentIcon,
  depilacion: Feather,
  masajes: HeartHandshake,
  cejas: EyebrowIcon,
  manicura: Hand,
};

export function CategoryIcon({ category, ...props }: BarberIconProps & { category: string }) {
  const Component = CATEGORY_ICONS[category] ?? ClipperIcon;
  return <Component {...props} />;
}
