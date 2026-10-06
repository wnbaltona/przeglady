// Worker instalowanej aplikacji. Nie obsługuje powiadomień push.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/* Powiadomienia systemowe dla zainstalowanej aplikacji. */
self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch {}
  const ticketId = typeof message.ticketId === 'string' ? message.ticketId : '';
  const url = new URL('./index.html', self.registration.scope);
  if (ticketId) url.searchParams.set('ticket', ticketId);
  event.waitUntil(self.registration.showNotification(
    typeof message.title === 'string' ? message.title : 'Serwis Lokali',
    {
      body: typeof message.body === 'string' ? message.body : 'Masz nową informację o zgłoszeniu.',
      icon: './icon-transparent-192.png',
      badge: './icon-transparent-192.png',
      tag: typeof message.tag === 'string' ? message.tag : undefined,
      data: { url: url.href },
    }
  ));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || new URL('./index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return clients.openWindow(target);
  })());
});
