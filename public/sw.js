/* Anitale service worker. Never caches admin, auth or user APIs. */
const VERSION = 'v2';
const SHELL = `anitale-shell-${VERSION}`;
const ASSETS = `anitale-assets-${VERSION}`;
const COVERS = `anitale-covers-${VERSION}`;
const IMAGES = `anitale-images-${VERSION}`;
const MAX_COVERS = 600;
const MAX_IMAGES = 400;
const PUBLIC_API = /^\/api\/(anime|manga)(\/[^/]+)?$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, ASSETS, COVERS, IMAGES];
    for (const key of await caches.keys()) if (key.startsWith('anitale-') && !keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Oldest entries go first so the phone's storage stays small.
const trim = async (cache, max) => {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
};

const staleWhileRevalidate = async (request, cacheName, max = 0) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((res) => { if (res.ok) { cache.put(request, res.clone()).then(() => max && trim(cache, max)); } return res; }).catch(() => cached);
  return cached || fresh;
};

// Proxied MyAnimeList images (characters, posters) never change for a given URL.
const cacheFirst = async (request, cacheName, max) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).then(() => trim(cache, max));
  return res;
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
  if (url.pathname.startsWith('/covers/')) { event.respondWith(staleWhileRevalidate(request, COVERS, MAX_COVERS)); return; }
  if (url.pathname === '/api/ximg') { event.respondWith(cacheFirst(request, IMAGES, MAX_IMAGES)); return; }
  if (PUBLIC_API.test(url.pathname)) { event.respondWith(staleWhileRevalidate(request, SHELL)); }
});
