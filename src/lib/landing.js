// Shared by the SPA (src/landingPages.jsx) and the server (server/seo.js) so both agree on which landing pages exist.
import { GENRE_KEYS, genreLabel } from './genre-kinds.js';

const BLOCKED = new Set(['ecchi', 'erotica', 'hentai']); // sensitive genres never get a landing page

export const slugOfGenre = (key) => String(key).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const landingGenres = () => GENRE_KEYS.filter((key) => !BLOCKED.has(key));
export const genreFromSlug = (slug) => landingGenres().find((key) => slugOfGenre(key) === String(slug).toLowerCase()) || null;

export const SEASONS = ['winter', 'spring', 'summer', 'fall'];
export const SEASON_FA = { winter: 'زمستان', spring: 'بهار', summer: 'تابستان', fall: 'پاییز' };
export const SEASON_EN = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };
const FIRST_YEAR = 1990;

export const validSeason = (year, season, now = new Date()) => {
  const y = Number(year);
  return SEASONS.includes(season) && Number.isInteger(y) && y >= FIRST_YEAR && y <= now.getFullYear() + 1;
};
// The value stored in the catalog's "Premiered" row, lower-cased ("fall 2025").
export const premieredKey = (year, season) => `${season} ${Number(year)}`;

// Seasons worth linking: the current one and the previous years, newest first.
export const recentSeasons = (years = 8, now = new Date()) => {
  const out = [];
  for (let y = now.getFullYear() + 1; y > now.getFullYear() + 1 - years; y -= 1) for (const season of [...SEASONS].reverse()) out.push({ year: y, season });
  return out;
};

export const genreTitleFa = (key) => `بهترین انیمه‌های ${genreLabel(key, 'fa')}`;
export const seasonTitleFa = (year, season) => `انیمه‌های ${SEASON_FA[season]} ${year}`;

// Where a genre chip should lead: its landing page when it has one (sensitive genres stay on plain search).
export const genreHref = (name) => {
  const key = String(name || '').trim().toLowerCase();
  return landingGenres().includes(key) ? `/genre/${slugOfGenre(key)}` : `/search?genre=${encodeURIComponent(name)}`;
};
