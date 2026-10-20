import { createContext, useContext } from 'react';

// Shared catalog contexts (declared here so user pages can consume them
// without importing App.jsx, which itself imports the pages).

export const CatalogContext = createContext([]);
export const useCatalog = () => useContext(CatalogContext);

export const MangaCatalogContext = createContext([]);
export const useMangaCatalog = () => useContext(MangaCatalogContext);

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
