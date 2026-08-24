/* stepbystep — service worker « réseau d'abord »
   - En ligne : sert TOUJOURS la dernière version publiée (auto-mise-à-jour).
   - Hors-ligne : sert la dernière version connue.
   Les données de l'app (localStorage) ne passent pas par ce cache : elles restent sur l'appareil. */
const CACHE = 'sbs-net-v4';
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // laisse passer Google Fonts, etc.
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    // réseau d'abord : dernière version si en ligne, sinon cache
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); return res; })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    );
  } else {
    // autres ressources : cache d'abord, puis réseau
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
      }).catch(() => hit))
    );
  }
});
