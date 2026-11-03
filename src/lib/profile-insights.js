// Everything the profile pages show beyond the raw lists, derived from a user's entries
// and the catalog (genres, titles). Pure, so desktop and mobile share it.
import { entryTotal } from '@/components/mobile/entry-utils';

export const STATUS_ORDER = ['completed', 'watching', 'on_hold', 'planned', 'dropped'];

// Minutes per episode from the catalog "Duration" row: "24 min per ep", "1 hr. 55 min." …
export function episodeMinutes(item) {
  const info = Array.isArray(item?.information) ? item.information : [];
  const text = String(info.find((row) => row.label === 'Duration')?.value || '');
  const hours = Number(/(\d+)\s*hr/i.exec(text)?.[1] || 0);
  const minutes = Number(/(\d+)\s*min/i.exec(text)?.[1] || 0);
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}

// Time spent watching anime, in minutes. Counts the episodes watched (or every
// episode of a title marked completed without a progress count) plus rewatches.
// Titles without a known duration are skipped and reported in `skipped`.
export function watchedMinutes(entry, item) {
  const perEpisode = episodeMinutes(item);
  const total = entryTotal(item, 'anime');
  const watched = entry.progress ? entry.progress : (entry.status === 'completed' ? (total || 0) : 0);
  const rewatched = (entry.rewatch || 0) * (total || watched);
  const episodes = watched + rewatched;
  if (!episodes) return { minutes: 0, skipped: false };
  if (!perEpisode) return { minutes: 0, skipped: true };
  return { minutes: episodes * perEpisode, skipped: false };
}

export function profileInsights(entries, animeBySlug, mangaBySlug) {
  const all = ['anime', 'manga'].flatMap((mediaType) => (entries[mediaType] || []).map((entry) => ({
    entry,
    mediaType,
    item: (mediaType === 'manga' ? mangaBySlug : animeBySlug).get(entry.slug) || null,
  })));

  const statusCounts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
  let episodes = 0;
  let chapters = 0;
  let minutes = 0;
  let skippedTitles = 0;
  const genreCount = new Map();
  for (const { entry, mediaType, item } of all) {
    const status = entry.status in statusCounts ? entry.status : 'watching';
    statusCounts[status] += 1;
    if (entry.progress) {
      if (mediaType === 'manga') chapters += entry.progress; else episodes += entry.progress;
    }
    if (mediaType === 'anime') {
      const spent = watchedMinutes(entry, item);
      minutes += spent.minutes;
      if (spent.skipped) skippedTitles += 1;
    }
    // Only titles the user did not drop say something about their taste.
    if (status !== 'dropped') for (const genre of item?.genres || []) genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
  }

  const topGenres = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([genre, count]) => ({ genre, count }));

  const rated = all.filter(({ entry }) => entry.rating != null);
  const average = rated.length ? rated.reduce((sum, { entry }) => sum + entry.rating, 0) / rated.length : null;
  const topRated = [...rated]
    .filter(({ entry }) => entry.rating >= 8)
    .sort((a, b) => b.entry.rating - a.entry.rating || String(b.entry.updated || '').localeCompare(String(a.entry.updated || '')))
    .slice(0, 5);

  const recent = [...all]
    .sort((a, b) => String(b.entry.updated || b.entry.added || '').localeCompare(String(a.entry.updated || a.entry.added || '')))
    .slice(0, 6);

  return { all, total: all.length, statusCounts, episodes, chapters, daysWatched: minutes / 1440, daysApprox: skippedTitles > 0, topGenres, average, topRated, recent };
}
