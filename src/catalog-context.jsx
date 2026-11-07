import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { isSensitive, rankCatalog, useShowSensitive } from './lib/catalog-rules.js';
import { extraTitles, requestTitles, subscribeTitles, titleSettled, titlesVersion } from './lib/title-cache.js';

// Shared catalog contexts (declared here so user pages can consume them
// without importing App.jsx, which itself imports the pages).

// The contexts hold the CORE catalog (most popular titles). useCatalog()/useMangaCatalog() add
// whatever else was fetched on demand (see lib/title-cache.js) so lookups by slug / MAL id work
// for every title; ranking and discovery pages keep using the core only.
export const CatalogContext = createContext([]);
export const MangaCatalogContext = createContext([]);

const useTitlesVersion = () => useSyncExternalStore(subscribeTitles, titlesVersion);
const merge = (core, extra) => {
  if (!extra.length) return core;
  const have = new Set(core.map((entry) => entry.slug));
  const add = extra.filter((entry) => !have.has(entry.slug));
  return add.length ? [...core, ...add] : core;
};
export const useCatalog = () => {
  const core = useContext(CatalogContext);
  const version = useTitlesVersion();
  return useMemo(() => merge(core, extraTitles('anime')), [core, version]);
};
export const useMangaCatalog = () => {
  const core = useContext(MangaCatalogContext);
  const version = useTitlesVersion();
  return useMemo(() => merge(core, extraTitles('manga')), [core, version]);
};
const useCatalogOf = (type) => {
  const anime = useCatalog();
  const manga = useMangaCatalog();
  return type === 'manga' ? manga : anime;
};

// Make sure these titles are loaded (slugs and/or MAL ids); safe to call with the same lists every render.
export const useEnsureTitles = (type, slugs = [], malIds = []) => {
  const items = useCatalogOf(type);
  const key = `${slugs.join(',')}|${malIds.join(',')}`;
  useEffect(() => {
    const haveSlug = new Set(items.map((entry) => entry.slug));
    const haveMal = new Set(items.map((entry) => entry.malId));
    requestTitles(type, {
      slugs: slugs.filter((slug) => slug && !haveSlug.has(slug)),
      malIds: malIds.filter((id) => id && !haveMal.has(Number(id))),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, key]);
};

// One title from a URL param (slug or MAL id); `loading` stays true until the server answered.
export const useResolvedTitle = (type, idOrSlug) => {
  const items = useCatalogOf(type);
  useTitlesVersion();
  const idMatch = /^(\d+)$/.exec(idOrSlug || '');
  let item = idMatch ? items.find((entry) => String(entry.malId) === idMatch[1]) || null : null;
  if (!item) item = items.find((entry) => entry.slug === idOrSlug) || null;
  useEffect(() => {
    if (item || !idOrSlug) return;
    requestTitles(type, { slugs: [idOrSlug], malIds: idMatch ? [idMatch[1]] : [] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, idOrSlug, Boolean(item)]);
  const answered = titleSettled(type, 'slug', idOrSlug) && (!idMatch || titleSettled(type, 'mal', idMatch[1]));
  return { item, loading: !item && Boolean(idOrSlug) && !answered };
};

// What discovery pages (home, rankings, seasons, schedule, search) show: the catalog without
// sensitive titles unless the visitor switched the filter off, with weighted rank attached.
// Lists that belong to a person (their library, notifications) keep using the full catalog.
const visible = (items, show) => rankCatalog(show ? items : items.filter((item) => !isSensitive(item)));
export const useVisibleCatalog = () => {
  const items = useContext(CatalogContext);
  const show = useShowSensitive();
  return useMemo(() => visible(items, show), [items, show]);
};
export const useVisibleMangaCatalog = () => {
  const items = useContext(MangaCatalogContext);
  const show = useShowSensitive();
  return useMemo(() => visible(items, show), [items, show]);
};

// Manga covers reuse the matching anime cover file (same slug); fall back to the plain PNG path.
export const withMangaImages = (mangaItems, animeCatalog) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const animeImages = new Map(animeCatalog.map((anime) => [anime.slug, anime.image]));
  return mangaItems.map((manga) => ({
    ...manga,
    // A bulk-imported manga carries its own cover filename; else reuse the
    // matching anime cover, then the plain PNG path.
    image: manga.image || animeImages.get(manga.slug) || `${base}/covers/${manga.slug}.png`,
  }));
};
