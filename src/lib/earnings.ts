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

/** Porcentaje que se lleva el barbero en esta cita */
export function barberPercentFor(booking: Pick<Booking, 'serviceId'>, barber: Pick<Barber, 'commission'> | undefined | null): number {
  return servicePercents.get(booking.serviceId) ?? barber?.commission ?? 0;
}

/** Lo que se lleva el barbero de una cita */
export function barberShare(booking: Pick<Booking, 'serviceId' | 'price'>, barber: Pick<Barber, 'commission'> | undefined | null): number {
  return Math.round((booking.price * barberPercentFor(booking, barber)) / 100);
}

/** Lo que se lleva el barbero de varias citas */
export function barberEarnings(list: Pick<Booking, 'serviceId' | 'price'>[], barber: Pick<Barber, 'commission'> | undefined | null): number {
  return list.reduce((sum, b) => sum + barberShare(b, barber), 0);
}

/** ¿Algún servicio tiene porcentaje propio? (para avisar que el % del barbero no aplica a todo) */
export const hasServicePercents = () => servicePercents.size > 0;
