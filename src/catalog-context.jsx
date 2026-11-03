import { createContext, useContext, useMemo } from 'react';
import { isSensitive, rankCatalog, useShowSensitive } from './lib/catalog-rules.js';

// Shared catalog contexts (declared here so user pages can consume them
// without importing App.jsx, which itself imports the pages).

export const CatalogContext = createContext([]);
export const useCatalog = () => useContext(CatalogContext);

export const MangaCatalogContext = createContext([]);
export const useMangaCatalog = () => useContext(MangaCatalogContext);

// What discovery pages (home, rankings, seasons, schedule, search) show: the catalog without
// sensitive titles unless the visitor switched the filter off, with weighted rank attached.
// Lists that belong to a person (their library, notifications) keep using the full catalog.
const visible = (items, show) => rankCatalog(show ? items : items.filter((item) => !isSensitive(item)));
export const useVisibleCatalog = () => {
  const items = useCatalog();
  const show = useShowSensitive();
  return useMemo(() => visible(items, show), [items, show]);
};
export const useVisibleMangaCatalog = () => {
  const items = useMangaCatalog();
  const show = useShowSensitive();
  return useMemo(() => visible(items, show), [items, show]);
};

// Manga covers reuse the matching anime cover file (same slug); fall back to the plain PNG path.
export const withMangaImages = (mangaItems, animeCatalog) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return mangaItems.map((manga) => ({
    ...manga,
    // A bulk-imported manga carries its own cover filename; else reuse the
    // matching anime cover, then the plain PNG path.
    image: manga.image || animeCatalog.find((anime) => anime.slug === manga.slug)?.image || `${base}/covers/${manga.slug}.png`,
  }));
};
