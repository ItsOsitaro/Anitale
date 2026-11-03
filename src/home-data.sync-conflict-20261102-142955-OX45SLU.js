// Home page data selection — extracted from App.jsx so both the desktop
// HomePage and the mobile home page share one source of truth without
// duplicating data-fetching or data-selection code.
import { L } from '@/i18n.js';
import sortBy from 'lodash/sortBy.js';
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

const getCurrentSeasonInfo = () => {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  let season;
  if (month >= 1 && month <= 3) season = 'winter';
  else if (month >= 4 && month <= 6) season = 'spring';
  else if (month >= 7 && month <= 9) season = 'summer';
  else season = 'fall';
  return { season, year };
};

const seasonNameMap = {
  winter: ['winter'],
  spring: ['spring'],
  summer: ['summer'],
  fall: ['fall', 'autumn'],
};

const getItemSeasonInfo = (item) => {
  // Look for premiered/season info in information array
  if (Array.isArray(item.information)) {
    for (const info of item.information) {
      if (!info) continue;
      const label = String(info.label || '').toLowerCase();
      if (label.includes('premier') || label.includes('season')) {
        const value = String(info.value || '');
        const valueLower = value.toLowerCase();
        // Try to extract season and year
        for (const [seasonKey, names] of Object.entries(seasonNameMap)) {
          for (const name of names) {
            if (valueLower.includes(name)) {
              const yearMatch = value.match(/(\d{4})/);
              const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
              return { season: seasonKey, year };
            }
          }
        }
        // Sometimes just year might be present with season info elsewhere
      }
    }
  }
  // Check other common fields
  if (item.premiered) {
    const value = String(item.premiered).toLowerCase();
    for (const [seasonKey, names] of Object.entries(seasonNameMap)) {
      for (const name of names) {
        if (value.includes(name)) {
          const yearMatch = String(item.premiered).match(/(\d{4})/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : (item.year ? parseInt(item.year, 10) : null);
          return { season: seasonKey, year };
        }
      }
    }
  }
  if (item.season && item.seasonYear) {
    return { season: String(item.season).toLowerCase(), year: parseInt(item.seasonYear, 10) };
  }
  if (item.season) {
    const value = String(item.season).toLowerCase();
    for (const [seasonKey, names] of Object.entries(seasonNameMap)) {
      for (const name of names) {
        if (value.includes(name)) {
          const year = item.year ? parseInt(item.year, 10) : null;
          return { season: seasonKey, year };
        }
      }
    }
  }
  // Fall back to year only if no season info
  if (item.year) {
    return { season: null, year: parseInt(item.year, 10) };
  }
  return { season: null, year: null };
};

export const selectCurrentSeasonPicks = ({ animeCatalog }) => {
  const { season: currentSeason, year: currentYear } = getCurrentSeasonInfo();
  // Find entries matching current season and year
  let matches = animeCatalog.filter((item) => {
    const info = getItemSeasonInfo(item);
    if (info.season && info.year) {
      return info.season === currentSeason && info.year === currentYear;
    }
    // If we have season info but year might be in item.year
    if (info.season && !info.year && item.year) {
      const itemYear = parseInt(item.year, 10);
      if (!isNaN(itemYear)) {
        return info.season === currentSeason && itemYear === currentYear;
      }
    }
    return false;
  });

  // Sort by score descending; titles without score go after those with score
  matches = matches.sort((a, b) => {
    const scoreA = a.sampleScore != null ? Number(a.sampleScore) : -Infinity;
    const scoreB = b.sampleScore != null ? Number(b.sampleScore) : -Infinity;
    if (scoreA !== scoreB) return scoreB - scoreA; // higher score first
    // break ties by popularity/members/votes if exists
    const popA = a.statistics?.popularity ? parseInt(String(a.statistics.popularity).replace(/[^0-9]/g, '')) : (a.members ? parseInt(String(a.members).replace(/[^0-9]/g, '')) : 0);
    const popB = b.statistics?.popularity ? parseInt(String(b.statistics.popularity).replace(/[^0-9]/g, '')) : (b.members ? parseInt(String(b.members).replace(/[^0-9]/g, '')) : 0);
    if (popA && popB && popA !== popB) return popA - popB; // lower number is usually more popular
    if (popA && !popB) return -1;
    if (!popA && popB) return 1;
    return 0;
  });

  let result = matches.slice(0, 5);

  // If fewer than 3 entries match, fill the rest with titles that are currently airing in the same season
  if (result.length < 3) {
    const airingInSeason = animeCatalog.filter((item) => {
      // Check if airing now / has airing day and matches season somehow
      if (item.airingDay) {
        // Also ensure it's in current season if possible
        const info = getItemSeasonInfo(item);
        if (info.season) return info.season === currentSeason && info.year === currentYear;
        // If no season info but has airing day and year matches current year maybe
        if (item.year && parseInt(item.year, 10) === currentYear) return true;
      }
      return false;
    }).filter((item) => !result.find((r) => r.slug === item.slug));

    airingInSeason.sort((a, b) => {
      const scoreA = a.sampleScore != null ? Number(a.sampleScore) : -Infinity;
      const scoreB = b.sampleScore != null ? Number(b.sampleScore) : -Infinity;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return 0;
    });

    for (let i = 0; i < airingInSeason.length && result.length < 5; i++) {
      result.push(airingInSeason[i]);
    }
  }

  // If nothing matches at all, hide the hero section - return empty array
  if (result.length === 0) {
    return [];
  }

  return result;
};

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

