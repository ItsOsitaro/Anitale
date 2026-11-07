// Full title record (/api/anime/:slug). The catalog list is lite, so the detail
// page needs this; hovering a card starts the request early and the page reuses it.
const cache = new Map();

export function fetchAnimeFull(slug) {
  if (!slug) return Promise.resolve(null);
  if (!cache.has(slug)) {
    const request = fetch(`/api/anime/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        if (!data) cache.delete(slug);
        return data;
      });
    cache.set(slug, request);
  }
  return cache.get(slug);
}
