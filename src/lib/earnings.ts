import type { Barber, Booking } from '../types';

// Cuánto se lleva el barbero de cada servicio. Si el servicio tiene su propio porcentaje
// (Panel → Servicios), ese manda; si no, el porcentaje del barbero (Panel → Barberos).
// Los porcentajes de los servicios se guardan aquí cada vez que se cargan los servicios.

const servicePercents = new Map<string, number>();

/** Lo llama services.ts al leer los servicios */
export function rememberServicePercent(serviceId: string, percent: number | null | undefined) {
  if (percent === null || percent === undefined) servicePercents.delete(serviceId);
  else servicePercents.set(serviceId, percent);
}

/**
 * Identifica si un barbero es el propietario / socio principal (Walter).
 * El propietario NO rinde cuentas de comisión: el 100% de lo que produce
 * entra directamente a la caja de la administración.
 */
export function isBarberOwner(
  barber?: (Pick<Barber, 'name' | 'shortName'> & { isOwner?: boolean; commission?: number }) | null,
): boolean {
  if (!barber) return false;
  if (barber.isOwner !== undefined && barber.isOwner !== null) return Boolean(barber.isOwner);
  const name = `${barber.shortName || ''} ${barber.name || ''}`.toLowerCase();
  return name.includes('walter');
}

/** Porcentaje pactado que se lleva el barbero en esta cita */
export function barberPercentFor(
  booking: Pick<Booking, 'serviceId'>,
  barber?: (Pick<Barber, 'name' | 'shortName' | 'commission'> & { isOwner?: boolean }) | null,
): number {
  if (isBarberOwner(barber)) return 100;
  return servicePercents.get(booking.serviceId) ?? barber?.commission ?? 0;
}

export interface BookingFinancialSplit {
  price: number;
  isOwner: boolean;
  barberPercent: number; // Porcentaje del barbero
  barberPay: number;     // Dinero que se le paga como comisión ($0 para el dueño, $X para empleados)
  adminPercent: number;  // Porcentaje para la administración (100% para el dueño, 100-% para empleados)
  adminKeep: number;     // Dinero que REALMENTE se queda en la administración ($)
  barberProduction: number; // Valor facturado total por el barbero
}

/**
 * Calcula de forma exacta cómo se divide cada servicio entre el barbero y la administración:
 * - Walter (Dueño): No rinde cuentas. El 100% ingresa a la administración.
 * - Otros barberos: Se les paga su comisión y el restante se queda en la administración.
 */
export function calculateSplit(
  booking: Pick<Booking, 'serviceId' | 'price'>,
  barber?: (Pick<Barber, 'name' | 'shortName' | 'commission'> & { isOwner?: boolean }) | null,
): BookingFinancialSplit {
  const price = booking.price || 0;
  const isOwner = isBarberOwner(barber);

  if (isOwner) {
    return {
      price,
      isOwner: true,
      barberPercent: 100,
      barberPay: 0, // No es deuda de nómina/comisión con terceros
      adminPercent: 100,
      adminKeep: price, // 100% queda en el negocio
      barberProduction: price,
    };
  }

  const bPercent = servicePercents.get(booking.serviceId) ?? barber?.commission ?? 0;
  const barberPay = Math.round((price * bPercent) / 100);
  const adminKeep = Math.max(0, price - barberPay);
  const adminPercent = price > 0 ? Math.max(0, 100 - bPercent) : 0;

  return {
    price,
    isOwner: false,
    barberPercent: bPercent,
    barberPay,
    adminPercent,
    adminKeep,
    barberProduction: price,
  };
}

/** Lo que se lleva el barbero de una cita */
export function barberShare(
  booking: Pick<Booking, 'serviceId' | 'price'>,
  barber?: (Pick<Barber, 'name' | 'shortName' | 'commission'> & { isOwner?: boolean }) | null,
): number {
  return calculateSplit(booking, barber).barberPay;
}

/** Total de comisiones que la administración debe pagar a los barberos empleados */
export function totalBarberCommissionToPay(
  list: Pick<Booking, 'serviceId' | 'price' | 'barberId'>[],
  barbers: Barber[],
): number {
  return list.reduce((sum, b) => {
    const barber = barbers.find((x) => x.id === b.barberId);
    return sum + calculateSplit(b, barber).barberPay;
  }, 0);
}

/** Total neto que realmente queda en la Administración (100% del dueño + margen retenido a barberos) */
export function totalAdminNetKept(
  list: Pick<Booking, 'serviceId' | 'price' | 'barberId'>[],
  barbers: Barber[],
): number {
  return list.reduce((sum, b) => {
    const barber = barbers.find((x) => x.id === b.barberId);
    return sum + calculateSplit(b, barber).adminKeep;
  }, 0);
}

/** Lo que se lleva el barbero de varias citas (en su propio portal ve lo que él generó/ganó) */
export function barberEarnings(
  list: Pick<Booking, 'serviceId' | 'price'>[],
  barber?: (Pick<Barber, 'name' | 'shortName' | 'commission'> & { isOwner?: boolean }) | null,
): number {
  const isOwner = isBarberOwner(barber);
  if (isOwner) {
    return list.reduce((sum, b) => sum + (b.price || 0), 0);
  }
  return list.reduce((sum, b) => sum + calculateSplit(b, barber).barberPay, 0);
}

/** ¿Algún servicio tiene porcentaje propio? (para avisar que el % del barbero no aplica a todo) */
export const hasServicePercents = () => servicePercents.size > 0;
