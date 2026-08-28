/* stepbystep — service worker « réseau d'abord »
   - En ligne : sert TOUJOURS la dernière version publiée (auto-mise-à-jour).
   - Hors-ligne : sert la dernière version connue.
   - Partage WhatsApp : intercepte l'image partagée (POST /?share-target), la stocke,
     puis redirige vers /?shared=1 où l'app la récupère.
   Les données de l'app (localStorage) ne passent pas par ce cache : elles restent sur l'appareil. */
const CACHE = 'sbs-net-v5';
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'sbs-share').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // — Partage entrant (WhatsApp « Partager » → stepbystep) —
  if (req.method === 'POST' && url.origin === self.location.origin && url.searchParams.has('share-target')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        let f = form.get('image');
        if (!(f instanceof File)) { for (const v of form.values()) { if (v instanceof File) { f = v; break; } } }
        if (f instanceof File) {
          const buf = await f.arrayBuffer();
          const cache = await caches.open('sbs-share');
          await cache.put('/__shared_image', new Response(buf, {
            headers: { 'Content-Type': f.type || 'image/jpeg', 'X-Name': f.name || 'partage.jpg' }
          }));
        }
      } catch (_) {}
      return Response.redirect('/?shared=1', 303);
    })());
    return;
  }

  if (req.method !== 'GET') return;
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
