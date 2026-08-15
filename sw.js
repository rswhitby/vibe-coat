const CACHE = 'vibe-coating-v11';

// Relative to the service worker's scope, so this works both at the
// vibeco.at root and under a /vibe-coat/ project path.
const SHELL = [
  './',
  './index.html',
  './main.js',
  './style.css',
  './manifest.json',
];

// Resolved absolute URLs for the shell, used by the fetch handler.
const SHELL_URLS = SHELL.map(p => new URL(p, self.registration.scope).href);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(err => {
      console.warn('SW precache failed', err);
    })
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
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Streaming media always goes straight to the network
  if (url.pathname.endsWith('.m3u8') ||
      url.pathname.endsWith('.ts') ||
      url.pathname.includes('/webRTC/')) return;

  // Network-first for shell assets — fresh when online, cached fallback offline
  if (SHELL_URLS.includes(url.href)) {
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

  // Cache-first for everything else (backgrounds, icons)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (url.origin !== self.location.origin) return response;
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      });
    })
  );
});
