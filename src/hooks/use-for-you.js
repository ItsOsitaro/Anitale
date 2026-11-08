import { useMemo } from 'react';
import { useUser } from '@/user';
import { useCatalog, useEnsureTitles, useVisibleCatalog } from '@/catalog-context';
import { membersOf } from '@/lib/catalog-rules';

const MIN_LIKED = 3; // fewer liked titles say too little about taste
const MIN_SCORE_LIKED = 7;

// A title counts as liked when scored 7+ (or finished without a score). Genre weights come from the score.
export const tasteWeights = (entries, byslug) => {
  const weights = new Map();
  let liked = 0;
  for (const entry of entries) {
    const item = byslug.get(entry.slug);
    if (!item) continue;
    const rating = Number(entry.rating) || 0;
    const likes = rating >= MIN_SCORE_LIKED || (!rating && entry.status === 'completed');
    if (!likes) continue;
    liked += 1;
    const w = rating ? rating - 5 : 3; // 7 -> 2 ... 10 -> 5
    for (const genre of item.genres || []) weights.set(genre, (weights.get(genre) || 0) + w);
  }
  return { weights, liked };
};

// "Attack on Titan Season 3 Part 2" and "Attack on Titan" are one franchise: suggest each franchise once, and none the user already has.
export const franchiseKey = (title) => String(title || '').toLowerCase().replace(/[:–-].*$/, '').replace(/ (season|part|cour)( .*)?$/, '').replace(/ [0-9]+$/, '').trim();

// Titles the user does not have yet, ranked by how well their genres match the taste, nudged by the source rating.
export const pickForYou = (candidates, entries, byslug, limit = 12) => {
  const { weights, liked } = tasteWeights(entries, byslug);
  if (liked < MIN_LIKED) return { items: [], genres: [] };
  const mine = new Set(entries.map((entry) => entry.slug));
  const owned = new Set(entries.map((entry) => franchiseKey(byslug.get(entry.slug)?.title)).filter(Boolean));
  const top = Math.max(1, ...weights.values());
  const scored = [];
  for (const item of candidates) {
    if (mine.has(item.slug) || !item.genres?.length || owned.has(franchiseKey(item.title))) continue;
    const match = item.genres.reduce((sum, genre) => sum + (weights.get(genre) || 0), 0) / top / Math.sqrt(item.genres.length);
    if (match <= 0) continue;
    const quality = (item.weightedScore ?? item.sampleScore ?? 0) / 10;
    const popularity = Math.min(1, Math.log10(1 + membersOf(item)) / 6.5); // well-known titles first, among equal genre matches
    scored.push({ item, score: match * (0.3 + 0.3 * quality + 0.4 * popularity) });
  }
  scored.sort((a, b) => b.score - a.score);
  const genres = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([genre]) => genre);
  const seen = new Set();
  const items = [];
  for (const { item } of scored) {
    const key = franchiseKey(item.title) || item.slug;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= limit) break;
  }
  return { items, genres };
};

// "For you" rail for the home page: empty until the user has at least a few liked titles.
export function useForYou(limit = 12) {
  const user = useUser();
  const all = useCatalog(); // includes titles fetched on demand, so a list outside the popular core still counts
  const visible = useVisibleCatalog();
  const entries = user.me ? user.entries.anime : [];
  const slugs = useMemo(() => entries.slice(0, 60).map((entry) => entry.slug), [entries]);
  useEnsureTitles('anime', slugs);
  return useMemo(() => {
    if (!user.me || entries.length < MIN_LIKED) return { items: [], genres: [] };
    const byslug = new Map(all.map((item) => [item.slug, item]));
    return pickForYou(visible, entries, byslug, limit);
  }, [user.me, entries, all, visible, limit]);
}
