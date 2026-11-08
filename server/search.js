import { db } from './db.js';
import { foldTitle, rowToItem } from './shape.js';
import { mangaRowToItem } from './repo.js';
import { coverUrlFor } from './images.js';
import { isSensitiveItem } from './sensitive.js';

// Full catalog search: relevance-ranked, typo tolerant, filterable. The folded index
// lives in memory, but each entry is SLIM (a card + folded text + a few numbers) so
// 150k titles stay well under the memory of a 1 GB server. Full records are read from
// SQLite only for the rows that are actually returned. A changed table rebuilds the
// index in small chunks (never blocking the event loop) and at most every couple of minutes.

let cache = { key: '', docs: [], at: 0, bySlug: { anime: new Map(), manga: new Map() }, byMal: { anime: new Map(), manga: new Map() }, facets: new Map() };
let building = false;
const REBUILD_MIN_MS = 120_000;
const CHUNK = 1500;

const versionKey = () => {
  const a = db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS m FROM anime").get();
  const m = db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS m FROM manga").get();
  return `${a.n}:${a.m}|${m.n}:${m.m}`;
};

const infoValue = (item, label) => String((Array.isArray(item.information) ? item.information : []).find((row) => row.label === label)?.value || '').trim();
const countOf = (text) => Number(String(text ?? '').replace(/[^\d]/g, '')) || 0;

// Identical strings share one instance (genres, studios, formats repeat 100k times).
const NONE = Object.freeze([]);
const pool = new Map();
const intern = (value) => {
  const text = String(value);
  const hit = pool.get(text);
  if (hit !== undefined) return hit;
  pool.set(text, text);
  return text;
};

// Searchable facts that are not part of the title text: publication status bucket,
// studios, age rating, popularity numbers, episode/chapter count and first letter.
const factsOf = (item, kind) => {
  const rawStatus = infoValue(item, 'Status').toLowerCase();
  let status = '';
  if (/currently|publishing|ongoing/.test(rawStatus)) status = 'airing';
  else if (/not yet|upcoming|announced/.test(rawStatus)) status = 'upcoming';
  else if (/finished|complete/.test(rawStatus)) status = 'finished';
  else if (rawStatus) status = 'other';
  const first = foldTitle(String(item.title || '')).replace(/[^a-z0-9؀-ۿ]/gi, '').charAt(0).toUpperCase();
  const list = (label) => {
    const names = infoValue(item, label).split(',').map((name) => name.trim()).filter(Boolean).map(intern);
    return names.length ? names : NONE;
  };
  return {
    status: intern(status),
    studios: list('Studios'),
    producers: list('Producers'),
    magazines: kind === 'manga' && item.serialization?.length ? item.serialization.map(intern) : NONE,
    rating: intern(infoValue(item, 'Rating').split(' - ')[0].trim()),
    premiered: intern(infoValue(item, 'Premiered').toLowerCase()), // "fall 2025"; the season landing pages filter on it
    members: countOf(item.statistics?.members) || Number(item.members) || 0,
    votes: countOf(item.statistics?.scoredBy),
    episodes: kind === 'manga' ? (Number(item.chapters) || 0) : countOf(infoValue(item, 'Episodes')),
    letter: /^[A-Z]$/.test(first) ? first : '#',
  };
};

// Persian speakers type titles by sound ("ناروتو" for Naruto). Persian and Latin text both reduce to the same coarse
// consonant skeleton (vowels dropped, similar consonants merged), so "nrt" finds Naruto from either spelling.
const PH_FA = {
  'ب': 'b', 'پ': 'b', 'ت': 't', 'ط': 't', 'د': 't', 'ث': 's', 'س': 's', 'ص': 's', 'ز': 's', 'ذ': 's', 'ض': 's', 'ظ': 's', 'ژ': 's',
  'ج': 'j', 'چ': 'j', 'ش': 'j', 'ح': 'h', 'ه': 'h', 'خ': 'k', 'ک': 'k', 'ق': 'k', 'گ': 'k', 'غ': 'k', 'ر': 'r', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ف': 'f',
};
const PH_LA = { b: 'b', p: 'b', t: 't', d: 't', s: 's', z: 's', x: 's', j: 'j', c: 'k', g: 'k', k: 'k', q: 'k', h: 'h', r: 'r', l: 'l', m: 'm', n: 'n', f: 'f', v: 'f' };
// Words are kept apart (a space between each word's skeleton) so a match must start at a word, not in the middle of one.
export const skeleton = (text) => {
  const latin = foldTitle(text).replace(/sh|ch/g, 'j').replace(/kh/g, 'k').replace(/ph/g, 'f')
    .replace(/(\p{L})\1/gu, '$1'); // doubled letters ("full") sound like one, as Persian writes them
  const words = [];
  for (const word of latin.split(/[^\p{L}\p{N}]+/u)) {
    let out = '';
    for (const ch of word) {
      const code = PH_FA[ch] || PH_LA[ch];
      if (code) out += code;
      else if (/[0-9]/.test(ch)) out += ch;
    }
    if (out) words.push(out);
  }
  return words.join(' ');
};

// One flat object per title. `item` points back at it, so code that reads doc.item.title
// (search rows, sorts, facets) works without a second "card" object per title.
const makeDoc = (kind, item, image) => {
  const alt = item.alternativeTitles || {};
  const genres = (item.genres || []).map(intern);
  const doc = {
    kind,
    slug: item.slug,
    malId: item.malId ?? null,
    title: item.title,
    titleFa: item.titleFa || '',
    year: item.year,
    format: intern(item.format || ''),
    sampleScore: item.sampleScore ?? null,
    genres,
    airingDay: intern(item.airingDay || ''),
    image,
    t: [item.title, item.titleFa, alt.english, alt.romaji, alt.japanese, ...(alt.synonyms || [])].filter(Boolean).map(foldTitle).join(''),
    g: genres.map((name) => intern(foldTitle(name))),
    sensitive: isSensitiveItem(item),
    ph: skeleton([item.title, alt.english, alt.romaji].filter(Boolean).join(' ')),
    ...factsOf(item, kind),
  };
  doc.item = doc;
  return doc;
};

// Rows are read in pages so 150k titles are never all in memory as JS objects at once.
function* docGen() {
  for (let after = 0; ;) {
    const rows = db.prepare('SELECT * FROM anime WHERE id > ? ORDER BY id ASC LIMIT ?').all(after, CHUNK);
    if (!rows.length) break;
    after = rows[rows.length - 1].id;
    for (const row of rows) {
      const item = rowToItem(row);
      yield makeDoc('anime', item, item.image || '');
    }
  }
  for (let after = 0; ;) {
    const rows = db.prepare('SELECT m.*, s.magazines FROM manga m LEFT JOIN manga_serial s ON s.mal_id = m.mal_id WHERE m.id > ? ORDER BY m.id ASC LIMIT ?').all(after, CHUNK);
    if (!rows.length) break;
    after = rows[rows.length - 1].id;
    for (const row of rows) {
      const item = mangaRowToItem(row);
      yield makeDoc('manga', item, item.image || coverUrlFor(item.slug));
    }
  }
}

// Weighted (Bayesian) score, same formula as src/lib/catalog-rules.js: a high score from a
// handful of votes must not beat a slightly lower one backed by many.
const MIN_VOTES = 1000;
const addWeighted = (docs) => {
  for (const kind of ['anime', 'manga']) {
    let n = 0;
    let sum = 0;
    for (const doc of docs) {
      if (doc.kind === kind && Number(doc.item.sampleScore) > 0) { n += 1; sum += Number(doc.item.sampleScore); }
    }
    if (!n) continue;
    const mean = sum / n;
    for (const doc of docs) {
      if (doc.kind !== kind || !(Number(doc.item.sampleScore) > 0)) continue;
      const v = doc.votes || doc.members || MIN_VOTES;
      doc.weighted = (v / (v + MIN_VOTES)) * Number(doc.item.sampleScore) + (MIN_VOTES / (v + MIN_VOTES)) * mean;
    }
  }
  return docs;
};

const install = (docs, key) => {
  const bySlug = { anime: new Map(), manga: new Map() };
  const byMal = { anime: new Map(), manga: new Map() };
  for (const doc of docs) {
    bySlug[doc.kind].set(doc.slug, doc);
    if (doc.malId != null) byMal[doc.kind].set(doc.malId, doc);
  }
  cache = { key, docs: addWeighted(docs), at: Date.now(), bySlug, byMal, facets: new Map() };
};

const rebuildAsync = async (key) => {
  building = true;
  try {
    const docs = [];
    for (const doc of docGen()) {
      docs.push(doc);
      if (docs.length % 1000 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
    install(docs, key);
  } catch (error) {
    console.error('[search] index rebuild failed:', error.message);
  } finally {
    building = false;
  }
};

// Called at start-up so the first visitor does not pay for the build.
export const warmSearch = () => {
  if (!building && !cache.docs.length) rebuildAsync(versionKey());
};

export const getDocs = () => {
  const key = versionKey();
  if (cache.key === key) return cache.docs;
  if (!cache.docs.length) {
    // Nothing built yet (a request before warm-up finished): build once, synchronously.
    install(Array.from(docGen()), key);
  } else if (!building && Date.now() - cache.at > REBUILD_MIN_MS) {
    rebuildAsync(key);
  }
  return cache.docs;
};

export const findDoc = (kind, key) => {
  getDocs();
  const asMal = /^\d+$/.test(String(key)) ? Number(key) : null;
  return cache.bySlug[kind]?.get(String(key)) || (asMal != null ? cache.byMal[kind]?.get(asMal) : undefined);
};

// Full record for a search hit (the index only holds a card).
export const fullItemOf = (doc) => {
  if (doc.kind === 'anime') {
    const row = db.prepare('SELECT * FROM anime WHERE slug = ?').get(doc.slug);
    return row ? rowToItem(row) : doc.item;
  }
  const row = db.prepare('SELECT m.*, s.magazines FROM manga m LEFT JOIN manga_serial s ON s.mal_id = m.mal_id WHERE m.slug = ?').get(doc.slug);
  if (!row) return doc.item;
  const item = mangaRowToItem(row);
  return { ...item, image: item.image || doc.image };
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

const WORD = /[\s\-:·,]+/;
const scoreDoc = (doc, q, fuzzy = false) => {
  let best = 0;
  // Every text match (exact, prefix, word start, substring) needs the query to occur in the text.
  if (doc.t.includes(q)) {
    for (const title of doc.t.split('\u0001')) {
      if (title === q) best = Math.max(best, 100);
      else if (title.startsWith(q)) best = Math.max(best, 80);
      else if (title.split(WORD).some((word) => word.startsWith(q))) best = Math.max(best, 60);
      else if (title.includes(q)) best = Math.max(best, 40);
    }
  }
  if (best === 0 && doc.g.includes(q)) best = 20;
  // Typo tolerance is the costly part: only popular titles are checked.
  if (best === 0 && fuzzy && q.length >= 4 && doc.members >= 1000) {
    const max = q.length >= 8 ? 2 : 1;
    for (const title of doc.t.split('\u0001')) {
      if (title.split(WORD).some((word) => word.length >= 3 && within(word.slice(0, q.length + 1), q, max))) { best = 15; break; }
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

const countBy = (values) => {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return [...map];
};

const buildFacets = (matched) => ({
  genres: countBy(matched.flatMap((d) => d.item.genres || [])).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, n]) => ({ value, n })),
  years: countBy(matched.map((d) => String(d.item.year || '')).filter(Boolean)).sort((a, b) => b[0].localeCompare(a[0])).map(([value, n]) => ({ value, n })),
  formats: countBy(matched.map((d) => d.item.format).filter(Boolean)).sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })),
  statuses: countBy(matched.map((d) => d.status).filter(Boolean)).sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })),
  studios: countBy(matched.flatMap((d) => d.studios || [])).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 80).map(([value, n]) => ({ value, n })),
  ratings: countBy(matched.map((d) => d.rating).filter(Boolean)).sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })),
});

// genres / excludeGenres are arrays (a title must have every included genre and none of the excluded);
// the old single `genre` and `year` still work. fromYear/toYear bound the year, inclusive.
// producer / magazine narrow by those company names (company pages).
export const searchCatalog = ({ q = '', type = 'all', genre = '', genres = [], excludeGenres = [], year = '', fromYear = 0, toYear = 0, format = '', status = '', studio = '', producer = '', magazine = '', rating = '', premiered = '', minEps = 0, maxEps = 0, letter = '', minScore = 0, sort = '', page = 1, limit = 24, sfw = false, raw = false }) => {
  const needle = foldTitle(String(q).trim());
  const docs = getDocs();

  // Candidates matching the text (every title when the text is empty).
  const matched = [];
  const rel = new Map();
  for (const doc of docs) {
    if (type !== 'all' && doc.kind !== type) continue;
    if (sfw && doc.sensitive) continue;
    const relevance = needle ? scoreDoc(doc, needle) : 1;
    if (relevance > 0) {
      matched.push(doc);
      if (needle) rel.set(doc, relevance);
    }
  }
  // Typo tolerance is the costly part, so it only runs when plain matching finds few titles.
  if (needle.length >= 4 && matched.length < 8) {
    for (const doc of docs) {
      if ((type !== 'all' && doc.kind !== type) || (sfw && doc.sensitive) || rel.has(doc)) continue;
      const relevance = scoreDoc(doc, needle, true);
      if (relevance > 0) { matched.push(doc); rel.set(doc, relevance); }
    }
  }
  const relevanceOf = (doc) => rel.get(doc) ?? 1;

  // Persian letters and few plain matches: try the sound-alike skeleton (needs 3+ consonants to stay specific).
  if (/[\u0600-\u06FF]/.test(needle) && matched.length < 8) {
    const wanted = skeleton(needle);
    if (wanted.replace(/ /g, '').length >= 3) {
      const probe = ` ${wanted}`;
      const flat = wanted.replace(/ /g, ''); // Persian writes "فول متال" with a space where Latin has "Fullmetal"
      for (const doc of docs) {
        if ((type !== 'all' && doc.kind !== type) || (sfw && doc.sensitive) || rel.has(doc)) continue;
        if (!` ${doc.ph}`.includes(probe) && !(flat.length >= 5 && doc.ph.replace(/ /g, '').startsWith(flat))) continue;
        matched.push(doc);
        rel.set(doc, doc.ph.startsWith(wanted) ? 12 : 8);
      }
    }
  }

  // Facets describe what the text matched, before the other filters narrow it.
  // The no-text case (the whole catalog) is cached until the index is rebuilt.
  let facets;
  if (needle) facets = buildFacets(matched);
  else {
    const facetKey = `${type}|${sfw}`;
    facets = cache.facets.get(facetKey);
    if (!facets) { facets = buildFacets(matched); cache.facets.set(facetKey, facets); }
  }

  const included = [...(genre ? [genre] : []), ...genres].map(foldTitle);
  const excluded = excludeGenres.map(foldTitle);
  const from = Number(fromYear) || (year ? Number(year) : 0);
  const to = Number(toYear) || (year ? Number(year) : 0);
  const filtered = matched.filter((doc) => {
    const docYear = Number(doc.item.year) || 0;
    return (
      included.every((g) => doc.g.includes(g))
      && !excluded.some((g) => doc.g.includes(g))
      && (!from || (docYear && docYear >= from))
      && (!to || (docYear && docYear <= to))
      && (!format || doc.item.format === format)
      && (!status || doc.status === status)
      && (!studio || (doc.studios || []).includes(studio))
      && (!producer || (doc.producers || []).includes(producer))
      && (!magazine || (doc.magazines || []).includes(magazine))
      && (!rating || doc.rating === rating)
      && (!premiered || doc.premiered === premiered)
      && (!minEps || doc.episodes >= minEps)
      && (!maxEps || (doc.episodes > 0 && doc.episodes <= maxEps))
      && (!letter || doc.letter === letter)
      && (!minScore || (doc.item.sampleScore ?? 0) >= minScore)
    );
  });

  const order = SORTS[sort];
  filtered.sort((a, b) => (order && sort ? order(a, b) : (relevanceOf(b) - relevanceOf(a)) || SORTS.score(a, b)));

  const total = filtered.length;
  const start = (page - 1) * limit;
  return {
    items: filtered.slice(start, start + limit).map((doc) => (raw ? { ...toRow(doc, relevanceOf(doc)), doc } : toRow(doc, relevanceOf(doc)))),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    facets,
  };
};
