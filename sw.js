const CACHE = 'vibe-coat-v7';
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

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Let video/stream requests go straight to network — never cache
  if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts')) return;

  // Network-first for shell assets — always fetch fresh, cache for offline fallback
  if (SHELL.some(p => url.pathname === p || url.href === e.request.url)) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (icons, manifest, etc.)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (e.request.method !== 'GET' || url.origin !== self.location.origin) return response;
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      });
    })
  );
});
