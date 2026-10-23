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

export type OwnerKey = 'walter' | 'daniel';

/**
 * Identifica si un barbero es dueño (Walter o Daniel).
 */
export function getBarberOwnerKey(
  barber?: (Pick<Barber, 'name' | 'shortName'> & { isOwner?: boolean; ownerName?: 'walter' | 'daniel' }) | null,
): OwnerKey | null {
  if (!barber) return null;
  if (barber.ownerName === 'walter' || barber.ownerName === 'daniel') return barber.ownerName;
  const name = `${barber.shortName || ''} ${barber.name || ''}`.toLowerCase();
  if (name.includes('walter')) return 'walter';
  if (name.includes('daniel') || name.includes('dani')) return 'daniel';
  if (barber.isOwner) return 'walter';
  return null;
}

/**
 * Identifica si un barbero es propietario / socio (Walter o Daniel).
 * Los propietarios NO rinden cuentas de comisión: el 100% de lo que producen
 * entra directamente a la caja de la administración del sistema.
 */
export function isBarberOwner(
  barber?: (Pick<Barber, 'name' | 'shortName'> & { isOwner?: boolean; ownerName?: 'walter' | 'daniel'; commission?: number }) | null,
): boolean {
  return getBarberOwnerKey(barber) !== null;
}

/**
 * Identifica a qué dueño le rinde cuentas / entrega su porcentaje un barbero colaborador.
 * Regla de negocio establecida:
 * - Gerardo entrega su porcentaje (22%) a Walter.
 * - Nelson entrega su porcentaje (23%) a Daniel.
 * - Es configurable en la edición de cada barbero.
 */
export function getOwnerBeneficiary(
  barber?: (Pick<Barber, 'name' | 'shortName'> & { ownerBeneficiary?: 'walter' | 'daniel' | 'general' }) | null,
): 'walter' | 'daniel' | 'general' {
  if (!barber) return 'walter';
  if (barber.ownerBeneficiary === 'walter' || barber.ownerBeneficiary === 'daniel' || barber.ownerBeneficiary === 'general') {
    return barber.ownerBeneficiary;
  }
  const name = `${barber.shortName || ''} ${barber.name || ''}`.toLowerCase();
  if (name.includes('nelson')) return 'daniel';
  if (name.includes('gerardo')) return 'walter';
  return 'walter';
}

/** Porcentaje pactado que se lleva el barbero en esta cita */
export function barberPercentFor(
  booking: Pick<Booking, 'serviceId'>,
  barber?: (Pick<Barber, 'name' | 'shortName' | 'commission'> & { isOwner?: boolean; ownerName?: 'walter' | 'daniel' }) | null,
): number {
  if (isBarberOwner(barber)) return 100;
  return servicePercents.get(booking.serviceId) ?? barber?.commission ?? 0;
}

export interface BookingFinancialSplit {
  price: number;
  isOwner: boolean;
  ownerKey: OwnerKey | null;
  beneficiary: 'walter' | 'daniel' | 'general';
  barberPercent: number;   // Porcentaje del barbero colaborador
  barberPay: number;       // Dinero que se le paga como comisión al barbero
  adminPercent: number;    // Margen para la administración del sistema
  adminKeep: number;       // Dinero que REALMENTE se queda en el sistema / administración ($)
  barberProduction: number;// Valor facturado total por el barbero
  walterAmount: number;    // Cuánto de este servicio le corresponde a Walter (100% de Walter + 22% de Gerardo)
  danielAmount: number;    // Cuánto de este servicio le corresponde a Daniel (100% de Daniel + 23% de Nelson)
}

/**
 * Calcula de forma exacta cómo se divide cada servicio:
 * - Walter (Dueño 1): 100% entra a la administración (asignado a Walter).
 * - Daniel (Dueño 2): 100% entra a la administración (asignado a Daniel).
 * - Gerardo: 78% para él, 22% queda en el sistema para Walter.
 * - Nelson: 77% para él, 23% queda en el sistema para Daniel.
 * - Todo margen queda registrado en el sistema.
 */
export function calculateSplit(
  booking: Pick<Booking, 'serviceId' | 'price'>,
  barber?: (Pick<Barber, 'name' | 'shortName' | 'commission'> & { isOwner?: boolean; ownerName?: 'walter' | 'daniel'; ownerBeneficiary?: 'walter' | 'daniel' | 'general' }) | null,
): BookingFinancialSplit {
  const price = booking.price || 0;
  const ownerKey = getBarberOwnerKey(barber);
  const isOwner = ownerKey !== null;

  if (isOwner) {
    const isDaniel = ownerKey === 'daniel';
    return {
      price,
      isOwner: true,
      ownerKey,
      beneficiary: isDaniel ? 'daniel' : 'walter',
      barberPercent: 100,
      barberPay: 0, // No es comisión/deuda con terceros
      adminPercent: 100,
      adminKeep: price, // 100% queda en el sistema
      barberProduction: price,
      walterAmount: isDaniel ? 0 : price,
      danielAmount: isDaniel ? price : 0,
    };
  }

  const bPercent = servicePercents.get(booking.serviceId) ?? barber?.commission ?? 0;
  const barberPay = Math.round((price * bPercent) / 100);
  const adminKeep = Math.max(0, price - barberPay);
  const adminPercent = price > 0 ? Math.max(0, 100 - bPercent) : 0;
  const beneficiary = getOwnerBeneficiary(barber);

  const walterAmount = beneficiary === 'walter' ? adminKeep : 0;
  const danielAmount = beneficiary === 'daniel' ? adminKeep : 0;

  return {
    price,
    isOwner: false,
    ownerKey: null,
    beneficiary,
    barberPercent: bPercent,
    barberPay,
    adminPercent,
    adminKeep,
    barberProduction: price,
    walterAmount,
    danielAmount,
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

/** Total retenido para Walter (su propia producción + 22% de Gerardo y demás barberos asignados) */
export function totalWalterEarnings(
  list: Pick<Booking, 'serviceId' | 'price' | 'barberId'>[],
  barbers: Barber[],
): number {
  return list.reduce((sum, b) => {
    const barber = barbers.find((x) => x.id === b.barberId);
    return sum + calculateSplit(b, barber).walterAmount;
  }, 0);
}

/** Total retenido para Daniel (su propia producción + 23% de Nelson y demás barberos asignados) */
export function totalDanielEarnings(
  list: Pick<Booking, 'serviceId' | 'price' | 'barberId'>[],
  barbers: Barber[],
): number {
  return list.reduce((sum, b) => {
    const barber = barbers.find((x) => x.id === b.barberId);
    return sum + calculateSplit(b, barber).danielAmount;
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
