import { useState, useRef, useCallback } from 'react';
import { getRecentlyCreatedBookings } from '../services/bookings';
import { getContactMessages, setContactMessageRead, markAllContactMessagesRead } from '../services/contactMessages';
import { formatDateLong } from '../lib/dates';
import { useAutoRefresh } from './useAutoRefresh';

// Notificaciones reales del panel: reservas nuevas (últimas 48 h) y mensajes del chat sin leer.
// Cuando llega algo nuevo con el panel abierto, suena un aviso y, si se dio permiso,
// aparece una notificación del navegador.

export type AdminNotificationType = 'booking' | 'cancelled' | 'message';

export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
}

const SEEN_KEY = 'salon-hermanos-admin-notif-seen';
const READ_IDS_KEY = 'salon-hermanos-admin-notif-read';
const WINDOW_MS = 48 * 60 * 60 * 1000;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: las notificaciones se marcan como leídas solo en esta sesión
  }
}

/** Sonido corto de aviso (sin archivos externos). */
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    window.setTimeout(() => ctx.close(), 1000);
  } catch {
    // El navegador puede bloquear el sonido hasta que la persona interactúe con la página
  }
}

export function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.round(hours / 24)} d`;
}

export function useAdminNotifications() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const knownIds = useRef<Set<string> | null>(null);
  const readIds = useRef<Set<string>>(new Set(readStorage<string[]>(READ_IDS_KEY, [])));
  const seenAt = useRef<string>(readStorage<string>(SEEN_KEY, ''));

  const load = useCallback(async () => {
    try {
      const since = new Date(Date.now() - WINDOW_MS).toISOString();
      const [bookings, messages] = await Promise.all([getRecentlyCreatedBookings(since), getContactMessages(50)]);
      const unreadMsgs = messages.filter((m) => !m.read);
      setUnreadMessages(unreadMsgs.length);

      const next: AdminNotification[] = [
        ...bookings.map((b) => ({
          id: `booking-${b.id}`,
          type: (b.status === 'cancelled' ? 'cancelled' : 'booking') as AdminNotificationType,
          title: b.status === 'cancelled' ? 'Reserva cancelada' : 'Nueva reserva',
          description: `${b.clientName} · ${b.serviceName} con ${b.barberName} · ${formatDateLong(b.date)}, ${b.time}`,
          createdAt: b.createdAt,
          read: false,
        })),
        ...unreadMsgs.map((m) => ({
          id: `message-${m.id}`,
          type: 'message' as AdminNotificationType,
          title: `Mensaje de ${m.name}`,
          description: m.message,
          createdAt: m.createdAt,
          read: false,
        })),
      ]
        .map((n) => ({ ...n, read: readIds.current.has(n.id) || (!!seenAt.current && n.createdAt <= seenAt.current) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      // Avisar solo de lo que llegó después de abrir el panel
      if (knownIds.current) {
        const fresh = next.filter((n) => !n.read && !knownIds.current!.has(n.id));
        if (fresh.length > 0) {
          playChime();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            fresh.slice(0, 3).forEach((n) => new Notification(n.title, { body: n.description, icon: '/logo-salon-hermanos.png', tag: n.id }));
          }
        }
      }
      knownIds.current = new Set(next.map((n) => n.id));
      setItems(next);
    } catch (err) {
      console.error('No se pudieron cargar las notificaciones', err);
    }
  }, []);

  // Sigue revisando aunque la pestaña esté en segundo plano: ahí es cuando más sirve el aviso
  useAutoRefresh(() => { load(); }, [load], 20_000, { whenHidden: true });

  const markRead = (id: string) => {
    readIds.current.add(id);
    writeStorage(READ_IDS_KEY, [...readIds.current].slice(-300));
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (id.startsWith('message-')) {
      setContactMessageRead(id.slice('message-'.length), true)
        .then(() => setUnreadMessages((c) => Math.max(0, c - 1)))
        .catch((err) => console.error('No se pudo marcar el mensaje como leído', err));
    }
  };

  const markAllRead = () => {
    seenAt.current = new Date().toISOString();
    writeStorage(SEEN_KEY, seenAt.current);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    if (items.some((n) => n.type === 'message' && !n.read)) {
      markAllContactMessagesRead()
        .then(() => setUnreadMessages(0))
        .catch((err) => console.error('No se pudieron marcar los mensajes como leídos', err));
    }
  };

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    setPermission(await Notification.requestPermission());
  };

  return {
    notifications: items,
    unreadCount: items.filter((n) => !n.read).length,
    unreadMessages,
    permission,
    requestPermission,
    markRead,
    markAllRead,
    refresh: load,
  };
}
