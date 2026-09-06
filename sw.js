const CACHE_NAME = 'matrix-notes-v3'; // Bumping to v3 forces the updated script.js to load
const ASSETS = [
  './',
  './index.html',
  './script.js',
  './manifest.json',
  './launchericon-192x192.png',
  'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.5/peerjs.min.js'
];

// Install Event: Cache essential assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate Event: Delete old cache versions (v1, v2) automatically
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Network-first for app files, cache-first fallback for static CDN assets
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('index.html') || e.request.url.includes('script.js')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const resCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resCopy));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
