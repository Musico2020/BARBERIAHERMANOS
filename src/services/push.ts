import { supabase } from '../lib/supabase';

// Avisos al teléfono (notificaciones push de la web). El administrador los activa en cada teléfono
// desde el panel; api/notify-push.js los envía cuando alguien reserva o manda un comprobante.
// Android: funciona en Chrome directamente. iPhone (iOS 16.4+): solo desde la página agregada a la
// pantalla de inicio.

export type PushSupport = 'ok' | 'ios-install' | 'unsupported';

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'ios-install';
  return capable ? 'ok' : 'unsupported';
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (isIos()) return 'iPhone';
  if (/android/i.test(ua)) return 'Android';
  return 'Computador';
}

function base64ToBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** La suscripción de este teléfono, si ya activó los avisos y siguen con permiso. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Pide permiso, registra este teléfono y lo guarda en la base de datos. */
export async function enablePush(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('PERMISSION_DENIED');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const response = await fetch('/api/notify-push');
  if (!response.ok) throw new Error('NOT_CONFIGURED');
  const { publicKey } = (await response.json()) as { publicKey: string };
  const subscription = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) }));
  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    device: deviceLabel(),
  });
  if (error) throw error;
  return subscription;
}

/** Quita los avisos de este teléfono. */
export async function disablePush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}

/** Aviso de prueba a este teléfono. */
export async function sendTestPush(subscription: PushSubscription): Promise<void> {
  const response = await fetch('/api/notify-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'test', endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error('TEST_FAILED');
}

/** Cuántos teléfonos tienen los avisos activados. */
export async function countPushDevices(): Promise<number> {
  const { count, error } = await supabase.from('push_subscriptions').select('endpoint', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Desde la web pública: avisa al administrador de una reserva nueva o de un comprobante enviado. */
export function notifyPush(event: 'booking' | 'deposit', bookingIds: string[]): void {
  fetch('/api/notify-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, bookingIds }),
    keepalive: true,
  }).catch((err) => console.warn('No se pudo enviar el aviso al teléfono', err));
}
