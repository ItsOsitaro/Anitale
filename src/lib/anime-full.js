// Full title record. The catalog lists are lite, so the detail page needs this; hovering a
// card starts the request early and the page reuses it.
const cache = new Map();

export function fetchTitleFull(type, slug) {
  if (!slug) return Promise.resolve(null);
  const key = `${type}:${slug}`;
  if (!cache.has(key)) {
    const request = fetch(`/api/title/${type}/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        if (!data) cache.delete(key);
        return data;
      });
    cache.set(key, request);
  }
  return cache.get(key);
}

export const fetchAnimeFull = (slug) => fetchTitleFull('anime', slug);
