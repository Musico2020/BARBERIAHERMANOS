import type { Barber, Service } from '../types';
import type { CartItem } from './bookingCart';

// Qué servicios hace cada barbero y cuánto cobra por cada uno (Panel → Configuración → Barberos).
// Sin regla, el barbero hace el servicio al precio general. Igual que barber_does_service y
// barber_price_for en la base de datos.

export const doesService = (barber: Pick<Barber, 'services'> | null | undefined, serviceId: string): boolean =>
  barber?.services?.[serviceId]?.enabled !== false;

/** ¿Hace todos los servicios del pedido? */
export const doesAll = (barber: Pick<Barber, 'services'> | null | undefined, items: CartItem[]): boolean =>
  items.every((i) => doesService(barber, i.service.id));

export const priceFor = (barber: Pick<Barber, 'services'> | null | undefined, service: Pick<Service, 'id' | 'price'>): number =>
  barber?.services?.[service.id]?.price ?? service.price;

/** Total del pedido con los precios de ese barbero (sin barbero: los precios generales) */
export const cartPriceFor = (items: CartItem[], barber: Pick<Barber, 'services'> | null | undefined): number =>
  items.reduce((n, i) => n + i.qty * priceFor(barber, i.service), 0);
