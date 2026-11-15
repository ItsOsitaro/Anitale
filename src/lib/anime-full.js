import { primeExtrasCache } from '@/components/TitleExtras.jsx';

// Full title record + unified page data. The catalog lists are lite, so the detail page needs this; hovering a
// card starts the request early and the page reuses it.
const pageCache = new Map();

export async function fetchTitlePage(type, slug) {
  if (!slug) return null;
  const key = `${type}:${slug}`;
  if (!pageCache.has(key)) {
    const request = (async () => {
      try {
        const res = await fetch(`/api/page/${type}/${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.item?.malId && data?.extras) {
            primeExtrasCache(type, data.item.malId, data.extras);
          }
          return data;
        }
      } catch {
        // network error: fallback below
      }
      // Fallback: fetch title alone via /api/title/:type/:slug
      try {
        const res = await fetch(`/api/title/${type}/${encodeURIComponent(slug)}`);
        if (res.ok) {
          const item = await res.json();
          return { item, extras: null, community: null, recs: [] };
        }
      } catch {}
      return null;
    })().then((data) => {
      if (!data) pageCache.delete(key);
      return data;
    });
    pageCache.set(key, request);
  }
  return pageCache.get(key);
}

export function fetchTitleFull(type, slug) {
  if (!slug) return Promise.resolve(null);
  return fetchTitlePage(type, slug).then((page) => page?.item || null);
}

export const fetchAnimeFull = (slug) => fetchTitleFull('anime', slug);
