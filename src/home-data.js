// Home page data selection — extracted from App.jsx so both the desktop
// HomePage and the mobile home page share one source of truth without
// duplicating data-fetching or data-selection code.
import { L } from '@/i18n.js';
import { sortBy } from 'lodash/sortBy.js';
import { buildSchedule } from './catalog.js';
import { withMangaImages } from './catalog-context.jsx';

// Synopsis value: the catalog stores a legacy plain string OR bilingual JSON
// { fa, en }. L() resolves the object to the current language with a
// fa→en fallback; plain strings pass through untouched.
export const synopsisText = (item, lang) => (typeof item?.synopsis === 'string' ? item.synopsis : L(item?.synopsis, lang));

// Display title: manga rows can carry a Persian display title (titleFa).
export const displayTitle = (item, lang) => (
  typeof item.title === 'string' ? (lang === 'fa' && item.titleFa ? item.titleFa : item.title) : L(item.title, lang)
);

export const selectHomePicks = ({ animeCatalog, mangaCatalog }) => {
  const topAnime = sortBy(animeCatalog, (anime) => -anime.sampleScore).slice(0, 5);
  const trendingAnime = animeCatalog.slice(5, 10);
  const currentSeason = sortBy(animeCatalog, (anime) => -Number(anime.year)).slice(0, 5);
  const airingAnime = buildSchedule(animeCatalog)
    .map((entry) => animeCatalog.find((anime) => anime.slug === entry.slug))
    .filter(Boolean);
  const mangaItems = withMangaImages(mangaCatalog, animeCatalog);
  // Queue 20: currently-publishing manga, most chapters first (hidden when none).
  const freshManga = sortBy(
    mangaItems.filter((manga) => manga.publicationStatus === 'Publishing'),
    (manga) => (manga.chapters ?? 0),
  ).reverse().slice(0, 5);
  return { topAnime, trendingAnime, currentSeason, airingAnime, mangaItems, freshManga };
};
