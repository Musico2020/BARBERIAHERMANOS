import type { Service, StaffRole } from '../types';
import { timeToMinutes, minutesToTime } from './dates';

// Pedido de la reserva: varios servicios, cada uno con su cantidad
// (por ejemplo 2 cortes de cabello + 1 cerquillo). Se atienden uno detrás de otro.

export interface CartItem {
  service: Service;
  qty: number;
}

/** Máximo de servicios en una sola reserva (sumando cantidades) */
export const MAX_CART_UNITS = 10;

/** Quién hace cada servicio: manicura → manicurista; lo demás → barbero */
export const roleFor = (service: Service | null | undefined): StaffRole =>
  service?.category === 'manicura' ? 'manicurista' : 'barbero';

/** El profesional que atiende el pedido (lo decide el primer servicio elegido) */
export const cartRole = (items: CartItem[]): StaffRole | null => (items.length ? roleFor(items[0].service) : null);

export const cartUnits = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);
export const cartDuration = (items: CartItem[]) => items.reduce((n, i) => n + i.qty * i.service.duration, 0);
export const cartPrice = (items: CartItem[]) => items.reduce((n, i) => n + i.qty * i.service.price, 0);

/** Suma o resta una unidad de un servicio; con 0 se quita del pedido */
export function changeQty(items: CartItem[], service: Service, delta: number): CartItem[] {
  const current = items.find((i) => i.service.id === service.id)?.qty ?? 0;
  const qty = Math.max(0, current + delta);
  if (delta > 0 && cartUnits(items) >= MAX_CART_UNITS) return items;
  if (qty === 0) return items.filter((i) => i.service.id !== service.id);
  if (current === 0) return [...items, { service, qty }];
  return items.map((i) => (i.service.id === service.id ? { ...i, qty } : i));
}

/** Cada unidad del pedido con su hora de inicio, en el orden en que se atienden */
export function cartSchedule(items: CartItem[], startTime: string): { service: Service; time: string }[] {
  let start = timeToMinutes(startTime);
  const list: { service: Service; time: string }[] = [];
  for (const { service, qty } of items) {
    for (let k = 0; k < qty; k++) {
      list.push({ service, time: minutesToTime(start) });
      start += service.duration;
    }
  }
  return list;
}

/** «2 × Corte de cabello, 1 × Cerquillos» */
export const cartLabel = (items: CartItem[]) => items.map((i) => `${i.qty} × ${i.service.name}`).join(', ');
