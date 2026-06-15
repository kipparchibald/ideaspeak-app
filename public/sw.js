// IdeaSpeak Service Worker
// Supports PWA install, offline caching for the builder, and push notifications for "build complete"

const CACHE_NAME = 'ideaspeak-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
  // Add more hashed assets if you build for production
];

// Install - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - serve from cache when possible (offline support for the builder UI)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch fresh
        return response || fetch(event.request);
      })
  );
});

// Push notification handling (for when a build finishes in background)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'IdeaSpeak';
  const options = {
    body: data.body || 'Your app build is complete!',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: data.data || { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click - open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
