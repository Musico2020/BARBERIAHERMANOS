export interface Service {
  id: string;
  name: string;
  category: 'cortes' | 'barba' | 'tratamientos' | 'depilacion' | 'masajes' | 'cejas' | 'manicura';
  duration: number;
  price: number;
  description: string;
  popular?: boolean;
  /** Porcentaje que se lleva el barbero en este servicio; null = el porcentaje de cada barbero */
  barberPercent?: number | null;
}

/** 'barbero' o 'manicurista': define qué servicios puede atender */
export type StaffRole = 'barbero' | 'manicurista';

export interface Barber {
  id: string;
  name: string;
  role: StaffRole;
  shortName: string;
  specialties: string[];
  rating: number;
  reviewCount: number;
  available: boolean;
  /** Solo para crear o cambiar el PIN; nunca se lee desde la base de datos. */
  pin?: string;
  commission: number;
  phone: string;
  avatar: string;
  /** URL pública de la foto de perfil; vacía si no tiene */
  photoUrl: string;
  bio: string;
  totalServicesMonth: number;
  earningsMonth: number;
  /** Horario de trabajo por día de la semana ("0" = domingo … "6" = sábado); el día que falta sigue el horario del salón */
  workHours?: WorkHours;
}

export type WorkDay = { off: true } | { off?: false; open: string; close: string };
export type WorkHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', WorkDay>>;

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface Booking {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  serviceId: string;
  serviceName: string;
  barberId: string;
  barberName: string;
  date: string;
  time: string;
  price: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  createdAt: string;
  /** Hora que tenía antes de adelantarse (el barbero terminó la cita anterior antes de tiempo) */
  originalTime?: string;
  /** Cuándo se adelantó */
  shiftedAt?: string;
  /** Anticipo pedido al reservar por la web (0 = no aplica) */
  depositAmount: number;
  /** none: sin anticipo · awaiting: esperando pago · submitted: comprobante enviado · verified · rejected · expired */
  depositStatus: DepositStatus;
  depositExpiresAt?: string;
  depositPayer?: string;
  depositReceiptPath?: string;
  depositSubmittedAt?: string;
  /** transfer: Nequi / Bre-B · cash: efectivo en el salón */
  depositMethod?: 'transfer' | 'cash';
  /** Cuándo aceptó el cliente las condiciones del anticipo */
  depositTermsAt?: string;
}

export type DepositStatus = 'none' | 'awaiting' | 'submitted' | 'cash_pending' | 'verified' | 'rejected' | 'expired';

/** Anticipo al reservar por la web (Panel → Configuración → Reglas) */
export interface DepositConfig {
  enabled: boolean;
  /** Porcentaje del precio (se redondea hacia arriba a $100) */
  percent: number;
  /** Minutos para pagar antes de que la reserva se cancele sola */
  minutes: number;
  /** Llave Bre-B / Nequi que se muestra con el QR */
  key: string;
  /** Titular de la cuenta */
  holder: string;
  /** El cliente puede pagar el 100 % por transferencia */
  allowFull?: boolean;
  /** El cliente puede elegir pagar el anticipo en efectivo en el salón */
  allowCash?: boolean;
}

export interface Testimonial {
  id: string;
  name: string;
  date: string;
  rating: number;
  text: string;
  avatar: string;
}

export interface GalleryItem {
  id: string;
  url: string;
  category: string;
  alt: string;
}

export interface BusinessHours {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

/** 'walk-in': abierto sin reservas por la web (orden de llegada). 'closed': no se trabaja. */
export interface SpecialDay {
  date: string;
  type: 'walk-in' | 'closed';
  /** Mensaje opcional para el aviso de la página principal */
  note?: string;
  /** Desde qué fecha se muestra el aviso; si falta, desde el día anterior */
  noticeFrom?: string;
}

/** Hora cerrada de un día con ajuste. Sin barberId cierra para todo el salón. */
export interface ClosedRange {
  start: string;
  end: string;
  barberId?: string;
}

/**
 * Ajuste de una fecha (Panel → Turnos): ese día usa su propio horario (sirve para abrir un domingo,
 * un festivo o un día cerrado) y sus horas cerradas reemplazan al almuerzo por defecto.
 */
export interface DayOverride {
  date: string;
  open: string;
  close: string;
  closed: ClosedRange[];
}

export interface LunchBreak {
  enabled: boolean;
  start: string;
  end: string;
}

export interface BusinessConfig {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  city: string;
  country: string;
  hours: BusinessHours[];
  holidayHours: BusinessHours;
  specialDays: SpecialDay[];
  /** Ajustes de fechas puntuales hechos en Panel → Turnos */
  dayOverrides: DayOverride[];
  deposit: DepositConfig;
  /** Mostrar «El primero que esté libre» al reservar */
  allowAnyBarber: boolean;
  /** Almuerzo: sin reservas por la web en ese rango (no aplica domingos ni festivos) */
  lunch: LunchBreak;
  /** Cada cuántos minutos empieza una cita (09:00, 09:30…) */
  slotStep: number;
  /** Con cuántos días de anticipación se puede reservar por la web */
  daysAhead: number;
  mapEmbedUrl: string;
  /** Punto exacto del local; null = el mapa busca la dirección */
  location: { lat: number; lng: number } | null;
  primaryColor: string;
  accentColor: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  description: string;
  image: string;
  category: string;
  /** false = oculto en la web */
  active: boolean;
}

