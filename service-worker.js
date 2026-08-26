// Celowo nie przechowujemy danych przeglądów ani odpowiedzi Supabase w pamięci
// urządzenia. Dzięki temu instalacja PWA nie tworzy lokalnej kopii danych firmy.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
