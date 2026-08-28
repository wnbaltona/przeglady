// Celowo nie przechowujemy danych przeglądów ani odpowiedzi Supabase w pamięci
// urządzenia. Dzięki temu instalacja PWA nie tworzy lokalnej kopii danych firmy.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }

  const title = message.title || 'Przeglądy wymagają uwagi';
  const notificationTag = message.tag || 'inspection-deadlines';
  const destinationUrl = message.url || './?filter=attention';
  const options = {
    body: message.body || 'Otwórz aplikację, aby sprawdzić zbliżające się terminy.',
    icon: './icons/pwa-icon-192.png?v=20260827-logo3',
    badge: './icons/pwa-icon-192.png?v=20260827-logo3',
    tag: notificationTag,
    renotify: true,
    data: { url: destinationUrl }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || './', self.registration.scope).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appWindow = windows.find(client => {
      try {
        return new URL(client.url).origin === new URL(destination).origin;
      } catch {
        return false;
      }
    });

    if (appWindow) {
      try {
        await appWindow.focus();
      } catch {
        // Przechodzimy dalej — samo przekierowanie może nadal zadziałać.
      }
      try {
        if ('navigate' in appWindow) {
          const navigated = await appWindow.navigate(destination);
          if (navigated) await navigated.focus();
          return;
        }
      } catch {
        // Jeżeli system nie pozwala przekierować istniejącego okna, otwieramy nowe.
      }
    }

    return self.clients.openWindow(destination);
  })());
});
