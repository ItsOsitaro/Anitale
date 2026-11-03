/* Anitale service worker. Never caches admin, auth or user APIs. */
const VERSION = 'v1';
const SHELL = `anitale-shell-${VERSION}`;
const ASSETS = `anitale-assets-${VERSION}`;
const COVERS = `anitale-covers-${VERSION}`;
const PUBLIC_API = /^\/api\/(anime|manga)(\/[^/]+)?$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, ASSETS, COVERS];
    for (const key of await caches.keys()) if (key.startsWith('anitale-') && !keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => cached);
  return cached || fresh;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    if (url.pathname.startsWith('/admin')) return;
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        if (res.ok) (await caches.open(SHELL)).put('/', res.clone());
        return res;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    })());
    return;
  }
  if (url.pathname.startsWith('/covers/')) { event.respondWith(staleWhileRevalidate(request, COVERS)); return; }
  if (PUBLIC_API.test(url.pathname)) { event.respondWith(staleWhileRevalidate(request, SHELL)); }
});
