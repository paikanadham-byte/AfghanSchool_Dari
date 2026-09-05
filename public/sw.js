/* Afghan Care & School — service worker.
   Precaches the app shell so the app opens with no signal, serves API GETs
   from cache when offline, and never caches write requests. */
const VERSION = 'acs-v2.2.0';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/icons.js',
  '/js/i18n.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/views/common.js',
  '/js/views/school.js',
  '/js/views/clinic.js',
  '/js/views/tutor.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // writes are handled by the outbox in api.js
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network first, fall back to cache so screens work offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || new Response(JSON.stringify({ ok: false, error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })))
    );
    return;
  }

  // App shell: cache first, then network
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // refresh in the background
        fetch(req).then((res) => caches.open(VERSION).then((c) => c.put(req, res))).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()));
    })
  );
});
