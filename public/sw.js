// Basic Service Worker to trigger PWA installation
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Let the browser do its default thing for all requests.
  // The mere presence of a fetch handler is enough to satisfy the PWA installability criteria.
});
