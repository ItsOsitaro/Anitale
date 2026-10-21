// The catalog comes from the local CMS API (/api/anime, /api/manga). If the API is not running,
// it falls back to the static JSON files in public/data so the site still works.
const baseUrl = import.meta.env.BASE_URL;
const PLACEHOLDER = `${baseUrl}covers/placeholder.svg`;

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
};

// Queue 28: ETag-backed catalog cache. The first visit stores { etag, data }
// in localStorage; later visits revalidate with If-None-Match and, on 304,
// hydrate instantly from the stored copy without re-parsing 240 KB of JSON.
const CATALOG_CACHE_KEYS = {
  '/api/anime': 'malCatalogCacheAnime',
  '/api/manga': 'malCatalogCacheManga',
};

const fetchJsonCached = async (url) => {
  const cacheKey = CATALOG_CACHE_KEYS[url];
  if (!cacheKey) return fetchJson(url);

  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { cached = null; }
  if (cached && !Array.isArray(cached.data)) cached = null;

  const headers = cached?.etag ? { 'if-none-match': cached.etag } : undefined;
  const response = await fetch(url, { headers });
  if (response.status === 304 && cached) return cached.data;
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  const data = await response.json();
  const etag = response.headers.get('etag');
  if (etag) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ etag, data })); } catch { /* quota — cache is best effort */ }
  }
  return data;
};

const fromApi = async () => {
  const items = await fetchJsonCached('/api/anime');
  if (!Array.isArray(items)) throw new Error('Unexpected API response');
  return items.map((item) => ({
    ...item,
    image: item.image ? `${baseUrl.replace(/\/$/, '')}${item.image}?v=${encodeURIComponent(item.updatedAt || '')}` : PLACEHOLDER,
  }));
};

const fromStaticFiles = async () => {
  const [anime, details] = await Promise.all([
    fetchJson(`${baseUrl}data/anime.json`),
    fetchJson(`${baseUrl}data/anime-details.json`).catch(() => []),
  ]);
  const detailsBySlug = new Map(details.map((entry) => [entry.slug, entry]));
  // Covers carry mixed extensions in the wild (.jpg from imports, .png from
  // seeds): probe cheaply so the offline fallback never shows broken images.
  const probeCover = async (slug) => {
    for (const ext of ['jpg', 'png', 'webp']) {
      try {
        const res = await fetch(`${baseUrl}covers/${slug}.${ext}`, { method: 'HEAD' });
        if (res.ok) return `${baseUrl}covers/${slug}.${ext}`;
      } catch { /* offline probe — keep trying */ }
    }
    return null;
  };
  const images = await Promise.all(anime.map((item) => probeCover(item.slug)));
  return anime.map((item, index) => ({
    ...item,
    ...detailsBySlug.get(item.slug),
    image: images[index] || PLACEHOLDER,
  }));
};

export const loadAnimeCatalog = async () => {
  try {
    return await fromApi();
  } catch (error) {
    console.warn('CMS API unavailable, using static data files.', error);
    return fromStaticFiles();
  }
};

export const loadMangaCatalog = async () => {
  try {
    const items = await fetchJsonCached('/api/manga');
    if (!Array.isArray(items)) throw new Error('Unexpected API response');
    return items;
  } catch (error) {
    console.warn('Manga API unavailable, using the static file.', error);
    return (await fetchJson(`${baseUrl}data/manga.json`)) || [];
  }
};

export const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// MAL-style hrefs: /anime/136/Hunter_x_Hunter when the entry has a MyAnimeList id,
// otherwise the classic /anime/{slug} form. x becomes _ with other non-alphanumerics.
export const seoTitle = (title) => (
  String(title || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
) || 'title';

export const mediaHref = (item, mediaType = 'anime') => {
  const base = mediaType === 'manga' ? '/manga' : '/anime';
  return item.malId ? `${base}/${item.malId}/${seoTitle(item.title)}` : `${base}/${item.slug}`;
};

// The weekly airing schedule lives in the database (anime.airing_day, editable from the
// admin panel); this derives it from the loaded catalog instead of hardcoding it.
// Current weekday in the schedule's canonical short form ('Mon'…'Sun'),
// evaluated on the viewer's clock so the «airing today» highlight follows it.
export const currentWeekday = () => new Date().toLocaleDateString('en-US', { weekday: 'short' });

export const buildSchedule = (items) => items
  .filter((item) => item.airingDay && WEEKDAY_ORDER.includes(item.airingDay))
  .sort((a, b) => WEEKDAY_ORDER.indexOf(a.airingDay) - WEEKDAY_ORDER.indexOf(b.airingDay))
  .map((item) => ({ slug: item.slug, title: item.title, day: item.airingDay }));

// Forgiving title matching: lowercase, strip Arabic diacritics, fold Alef/Ee
// variants, unify Persian/Arabic Yeh, drop the soft hyphen and the
// zero-width joiners so «فریرن, فريرن» or «soûsou» all match the same title.
export const foldTitle = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036F\u064B-\u0652]/g, '')
  .toLocaleLowerCase()
  .replace(/[\u0622\u0623\u0625]/g, '\u0627')
  .replace(/\u064A/g, '\u06CC')
  .replace(/\u0643/g, '\u06A9')
  .replace(/[\u0640\u200B\u200C\u200D\u200E\u200F]/g, '');
