const CACHE = 'vibe-coat-v2';
const SHELL = [
  '/vibe-coat/',
  '/vibe-coat/index.html',
  '/vibe-coat/main.js',
  '/vibe-coat/style.css',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for shell assets, network-first for HLS streams
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Let HLS/video requests go straight to network — never cache them
  if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Only cache same-origin GET requests
        if (e.request.method !== 'GET' || url.origin !== self.location.origin) {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      });
    })
  );
});
