import { db } from './db.js';
import { foldTitle, rowToItem } from './shape.js';
import { listManga } from './repo.js';
import { coverUrlFor } from './images.js';
import { isSensitiveItem } from './sensitive.js';

// Full catalog search: relevance-ranked, typo tolerant, filterable. The catalog is
// small, so the folded index is kept in memory and rebuilt when a table changes.

let cache = { key: '', docs: [] };

const versionKey = () => {
  const a = db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS m FROM anime").get();
  const m = db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS m FROM manga").get();
  return `${a.n}:${a.m}|${m.n}:${m.m}`;
};

const infoValue = (item, label) => String((Array.isArray(item.information) ? item.information : []).find((row) => row.label === label)?.value || '').trim();
const countOf = (text) => Number(String(text ?? '').replace(/[^\d]/g, '')) || 0;

// Searchable facts that are not part of the title text: publication status bucket,
// studios, age rating, popularity numbers, episode/chapter count and first letter.
const factsOf = (item, kind) => {
  const rawStatus = infoValue(item, 'Status').toLowerCase();
  let status = '';
  if (/currently|publishing|ongoing/.test(rawStatus)) status = 'airing';
  else if (/not yet|upcoming|announced/.test(rawStatus)) status = 'upcoming';
  else if (/finished|complete/.test(rawStatus)) status = 'finished';
  else if (rawStatus) status = 'other';
  const first = foldTitle(String(item.title || '')).replace(/[^a-z0-9\u0600-\u06ff]/gi, '').charAt(0).toUpperCase();
  return {
    status,
    studios: infoValue(item, 'Studios').split(',').map((name) => name.trim()).filter(Boolean),
    rating: infoValue(item, 'Rating').split(' - ')[0].trim(),
    members: countOf(item.statistics?.members),
    votes: countOf(item.statistics?.scoredBy),
    episodes: kind === 'manga' ? (Number(item.chapters) || 0) : countOf(infoValue(item, 'Episodes')),
    letter: /^[A-Z]$/.test(first) ? first : '#',
  };
};

const buildDocs = () => {
  const animeBase = new Map();
  const docs = [];
  for (const item of db.prepare('SELECT * FROM anime ORDER BY id ASC').all().map(rowToItem)) {
    animeBase.set(item.slug, item.image || '');
    const alt = item.alternativeTitles || {};
    docs.push({
      kind: 'anime', item, image: item.image || '',
      titles: [item.title, alt.english, alt.romaji, alt.japanese, ...(alt.synonyms || [])].filter(Boolean).map(foldTitle),
      genres: (item.genres || []).map(foldTitle),
      sensitive: isSensitiveItem(item),
      ...factsOf(item, 'anime'),
    });
  }
  for (const item of listManga()) {
    const alt = item.alternativeTitles || {};
    docs.push({
      kind: 'manga', item, image: item.image || animeBase.get(item.slug) || coverUrlFor(item.slug),
      titles: [item.title, item.titleFa, alt.english, alt.romaji, alt.japanese, ...(alt.synonyms || [])].filter(Boolean).map(foldTitle),
      genres: (item.genres || []).map(foldTitle),
      sensitive: isSensitiveItem(item),
      ...factsOf(item, 'manga'),
    });
  }
  return docs;
};

// Weighted (Bayesian) score, same formula as src/lib/catalog-rules.js: a high score from a
// handful of votes must not beat a slightly lower one backed by many.
const MIN_VOTES = 1000;
const count = (text) => Number(String(text ?? '').replace(/[^\d]/g, '')) || 0;
const addWeighted = (docs) => {
  for (const kind of ['anime', 'manga']) {
    const scored = docs.filter((doc) => doc.kind === kind && Number(doc.item.sampleScore) > 0);
    if (!scored.length) continue;
    const mean = scored.reduce((sum, doc) => sum + Number(doc.item.sampleScore), 0) / scored.length;
    for (const doc of scored) {
      const v = count(doc.item.statistics?.scoredBy) || count(doc.item.statistics?.members) || MIN_VOTES;
      doc.weighted = (v / (v + MIN_VOTES)) * Number(doc.item.sampleScore) + (MIN_VOTES / (v + MIN_VOTES)) * mean;
    }
  }
  return docs;
};

const getDocs = () => {
  const key = versionKey();
  if (cache.key !== key) cache = { key, docs: addWeighted(buildDocs()) };
  return cache.docs;
};

// Edit distance, giving up early once it must exceed `max`.
const within = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (row[j] < best) best = row[j];
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
};

const scoreDoc = (doc, q) => {
  let best = 0;
  for (const title of doc.titles) {
    if (title === q) best = Math.max(best, 100);
    else if (title.startsWith(q)) best = Math.max(best, 80);
    else if (title.split(/[\s\-:·,]+/).some((word) => word.startsWith(q))) best = Math.max(best, 60);
    else if (title.includes(q)) best = Math.max(best, 40);
  }
  if (best === 0 && doc.genres.includes(q)) best = 20;
  if (best === 0 && q.length >= 4) {
    const max = q.length >= 8 ? 2 : 1;
    for (const title of doc.titles) {
      if (title.split(/[\s\-:·,]+/).some((word) => word.length >= 3 && within(word.slice(0, q.length + 1), q, max))) { best = 15; break; }
    }
  }
  return best;
};

const SORTS = {
  score: (a, b) => (b.weighted ?? 0) - (a.weighted ?? 0),
  new: (a, b) => (Number(b.item.year) || 0) - (Number(a.item.year) || 0),
  old: (a, b) => (Number(a.item.year) || 0) - (Number(b.item.year) || 0),
  pop: (a, b) => b.members - a.members,
  votes: (a, b) => b.votes - a.votes,
  // Titles with an unknown count sink to the end.
  eps: (a, b) => (b.episodes || -1) - (a.episodes || -1),
  az: (a, b) => String(a.item.title).localeCompare(String(b.item.title), 'en', { sensitivity: 'base' }),
};

const toRow = (doc, relevance) => ({
  kind: doc.kind,
  slug: doc.item.slug,
  malId: doc.item.malId ?? null,
  title: doc.item.title,
  titleFa: doc.item.titleFa || '',
  year: doc.item.year,
  format: doc.item.format,
  score: doc.item.sampleScore ?? null,
  genres: (doc.item.genres || []).slice(0, 3),
  image: doc.image,
  relevance,
});

// genres / excludeGenres are arrays (a title must have every included genre and none of the excluded);
// the old single `genre` and `year` still work. fromYear/toYear bound the year, inclusive.
export const searchCatalog = ({ q = '', type = 'all', genre = '', genres = [], excludeGenres = [], year = '', fromYear = 0, toYear = 0, format = '', status = '', studio = '', rating = '', letter = '', minScore = 0, sort = '', page = 1, limit = 24, sfw = false }) => {
  const needle = foldTitle(String(q).trim());
  const docs = getDocs();

  // Candidates matching the text (every title when the text is empty).
  const matched = [];
  for (const doc of docs) {
    if (type !== 'all' && doc.kind !== type) continue;
    if (sfw && doc.sensitive) continue;
    const relevance = needle ? scoreDoc(doc, needle) : 1;
    if (relevance > 0) matched.push({ ...doc, relevance });
  }

  // Facets describe what the text matched, before the other filters narrow it.
  const count = (values) => [...values.reduce((map, v) => map.set(v, (map.get(v) || 0) + 1), new Map())];
  const facets = {
    genres: count(matched.flatMap((d) => d.item.genres || [])).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, n]) => ({ value, n })),
    years: count(matched.map((d) => String(d.item.year || '')).filter(Boolean)).sort((a, b) => b[0].localeCompare(a[0])).map(([value, n]) => ({ value, n })),
    formats: count(matched.map((d) => d.item.format).filter(Boolean)).sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })),
    statuses: count(matched.map((d) => d.status).filter(Boolean)).sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })),
    studios: count(matched.flatMap((d) => d.studios || [])).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 80).map(([value, n]) => ({ value, n })),
    ratings: count(matched.map((d) => d.rating).filter(Boolean)).sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })),
  };

  const included = [...(genre ? [genre] : []), ...genres].map(foldTitle);
  const excluded = excludeGenres.map(foldTitle);
  const from = Number(fromYear) || (year ? Number(year) : 0);
  const to = Number(toYear) || (year ? Number(year) : 0);
  const filtered = matched.filter((doc) => {
    const docYear = Number(doc.item.year) || 0;
    return (
      included.every((g) => doc.genres.includes(g))
      && !excluded.some((g) => doc.genres.includes(g))
      && (!from || (docYear && docYear >= from))
      && (!to || (docYear && docYear <= to))
      && (!format || doc.item.format === format)
      && (!status || doc.status === status)
      && (!studio || (doc.studios || []).includes(studio))
      && (!rating || doc.rating === rating)
      && (!letter || doc.letter === letter)
      && (!minScore || (doc.item.sampleScore ?? 0) >= minScore)
    );
  });

  const order = SORTS[sort];
  filtered.sort((a, b) => (order && sort ? order(a, b) : (b.relevance - a.relevance) || SORTS.score(a, b)));

  const total = filtered.length;
  const start = (page - 1) * limit;
  return { items: filtered.slice(start, start + limit).map((doc) => toRow(doc, doc.relevance)), total, page, pages: Math.max(1, Math.ceil(total / limit)), facets };
};
