// Service worker de Salón Hermanos: recibe los avisos al teléfono (push) aunque la página esté
// cerrada, y al tocarlos abre el panel (o el portal del barbero) en la sección del aviso. No guarda la
// página en caché.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '💈 Salón Hermanos';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Tienes una novedad en el panel.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      vibrate: [120, 60, 120],
      data: { url: data.url || '/admin' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin);
  const tab = url.searchParams.get('tab');
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Si el panel (o el portal del barbero) ya está abierto, se trae al frente y cambia de sección
    const open = windows.find((w) => new URL(w.url).pathname.startsWith(url.pathname));
    if (open) {
      await open.focus();
      if (tab) open.postMessage({ type: 'open-tab', tab });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
