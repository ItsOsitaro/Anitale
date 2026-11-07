import { db } from './db.js';
import { inputToColumns } from './shape.js';

db.exec('CREATE TABLE IF NOT EXISTS manga_serial (mal_id INTEGER PRIMARY KEY, magazines TEXT NOT NULL, fetched_at INTEGER NOT NULL)');

const COLS = [
  'mal_id', 'title', 'category', 'year', 'format', 'score', 'airing_day', 'synopsis', 'genres', 'alt_synonyms', 'alt_japanese',
  'alt_romaji', 'alt_english', 'information', 'statistics', 'available_at', 'resources', 'streaming_platforms', 'streaming_notice',
];

const insertStmt = db.prepare(
  `INSERT INTO anime (slug, cover, title_fa, ${COLS.join(', ')}) VALUES (@slug, @cover, COALESCE(@title_fa, ''), ${COLS.map((c) => `@${c}`).join(', ')})`,
);
const updateStmt = db.prepare(
  `UPDATE anime SET slug=@slug, cover=@cover, title_fa=COALESCE(@title_fa, title_fa), ${COLS.map((c) => `${c}=@${c}`).join(', ')}, updated_at=datetime('now') WHERE id=@id`,
);

export const getBySlug = (slug) => db.prepare('SELECT * FROM anime WHERE slug = ?').get(slug);
export const getByMalId = (malId) => (malId ? db.prepare('SELECT * FROM anime WHERE mal_id = ?').get(malId) : undefined);
export const countAnime = () => db.prepare('SELECT COUNT(*) AS n FROM anime').get().n;

export const insertAnime = (slug, input, cover = '') => {
  const info = insertStmt.run({ slug, cover, ...inputToColumns(input) });
  return db.prepare('SELECT * FROM anime WHERE id = ?').get(info.lastInsertRowid);
};

export const updateAnime = (id, slug, input, cover) => {
  updateStmt.run({ id, slug, cover, ...inputToColumns(input) });
  return db.prepare('SELECT * FROM anime WHERE id = ?').get(id);
};

export const deleteAnime = (id) => db.prepare('DELETE FROM anime WHERE id = ?').run(id);

// ---------- Manga catalog ----------
const parseJson = (text, fallback) => {
  try { return text == null ? fallback : JSON.parse(text); } catch { return fallback; }
};

export const mangaRowToItem = (row) => ({
  slug: row.slug,
  malId: row.mal_id ?? null,
  title: row.title,
  titleFa: row.title_fa || '',
  category: row.category,
  year: row.year,
  format: row.format || 'Manga',
  sampleScore: row.score ?? null,
  publicationStatus: row.publication_status || '',
  chapters: row.chapters ?? null,
  serialization: parseJson(row.magazines, []),
  genres: parseJson(row.genres, []),
  synopsis: parseJson(row.synopsis, ''), // { fa, en } (plain strings are accepted too)
  cover: row.cover || '',
  ...(row.cover ? { image: `/covers/${row.cover}` } : {}),
  updatedAt: row.updated_at || '',
});

export const listManga = () => db.prepare('SELECT m.*, s.magazines FROM manga m LEFT JOIN manga_serial s ON s.mal_id = m.mal_id ORDER BY m.id ASC').all().map(mangaRowToItem);

// "Core" catalog: what the browser loads in one go. Most popular titles, plus anything
// hand-made (no MAL id) and, for anime, anything on the weekly schedule.
export const CORE_SIZE = Number(process.env.CORE_CATALOG_SIZE) || 3000;
export const coreAnimeRows = () => db.prepare(
  "SELECT * FROM anime WHERE mal_id IS NULL OR airing_day != '' OR id IN (SELECT id FROM anime ORDER BY members DESC, id ASC LIMIT ?) ORDER BY id ASC",
).all(CORE_SIZE);
export const listMangaCore = () => db.prepare(
  'SELECT m.*, s.magazines FROM manga m LEFT JOIN manga_serial s ON s.mal_id = m.mal_id WHERE m.mal_id IS NULL OR m.id IN (SELECT id FROM manga ORDER BY members DESC, score DESC, id ASC LIMIT ?) ORDER BY m.id ASC',
).all(CORE_SIZE).map(mangaRowToItem);

// Batch lookup for lists/relations: titles by slug or MAL id (max 100 per call).
export const animeRowsBy = ({ slugs = [], malIds = [] }) => {
  const out = [];
  if (slugs.length) out.push(...db.prepare(`SELECT * FROM anime WHERE slug IN (${slugs.map(() => '?').join(',')})`).all(...slugs));
  if (malIds.length) out.push(...db.prepare(`SELECT * FROM anime WHERE mal_id IN (${malIds.map(() => '?').join(',')})`).all(...malIds));
  return out;
};
export const mangaItemsBy = ({ slugs = [], malIds = [] }) => {
  const out = [];
  const base = 'SELECT m.*, s.magazines FROM manga m LEFT JOIN manga_serial s ON s.mal_id = m.mal_id';
  if (slugs.length) out.push(...db.prepare(`${base} WHERE m.slug IN (${slugs.map(() => '?').join(',')})`).all(...slugs));
  if (malIds.length) out.push(...db.prepare(`${base} WHERE m.mal_id IN (${malIds.map(() => '?').join(',')})`).all(...malIds));
  return out.map(mangaRowToItem);
};
export const getMangaBySlug = (slug) => db.prepare('SELECT * FROM manga WHERE slug = ?').get(slug);
export const getMangaByMalId = (malId) => (malId ? db.prepare('SELECT * FROM manga WHERE mal_id = ?').get(malId) : undefined);
export const countManga = () => db.prepare('SELECT COUNT(*) AS n FROM manga').get().n;

// Refresh overwrite for bulk-imported manga (rows that carry mal_id). Seeded
// bilingual rows must go through queue-19 editing instead: their synopsis is
// { fa, en } and a source refresh would wipe the fa translation.
const mangaCols = [
  'title', 'category', 'year', 'format', 'score', 'publication_status', 'chapters', 'genres', 'synopsis',
];
const updateMangaStmt = db.prepare(
  `UPDATE manga SET ${mangaCols.map((c) => `${c}=@${c}`).join(', ')}, mal_id=@malId, cover=@cover, members=COALESCE(@members, members), updated_at=datetime('now') WHERE id=@id`,
);
export const updateManga = (id, item, { malId, score = null, cover }) => {
  updateMangaStmt.run({
    id,
    title: item.title, category: item.category || '', year: item.year || '', format: item.format || 'Manga',
    score, publication_status: item.publicationStatus || '', chapters: item.chapters ?? null,
    genres: JSON.stringify(item.genres || []), synopsis: JSON.stringify(item.synopsis ?? ''),
    malId, cover, members: item.members ? Number(item.members) : null,
  });
  return db.prepare('SELECT * FROM manga WHERE id = ?').get(id);
};

// Seeded rows pass plain seed data; bulk-imported rows additionally carry
// malId / score / cover. INSERT OR IGNORE keeps seed re-runs idempotent;
// the bulk path checks mal_id + slug uniqueness before calling this.
export const insertManga = (item, { malId = null, score = null, cover = '', titleFa = '', publicationStatus = '', chapters = null, members = 0 } = {}) => {
  db.prepare(
    'INSERT INTO manga (slug, title, title_fa, category, year, format, genres, synopsis, mal_id, score, cover, publication_status, chapters, members) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    item.slug, item.title, item.titleFa || titleFa || '', item.category || '', item.year || '', item.format || 'Manga',
    JSON.stringify(item.genres || []), JSON.stringify(item.synopsis ?? ''),
    malId, score, cover, publicationStatus, chapters, Number(members) || 0,
  );
  return db.prepare('SELECT * FROM manga WHERE slug = ?').get(item.slug);
};

// Queue 25: full admin edit. Fields come pre-validated; synopsis is the JSON
// envelope { fa, en } when provided (plain source text is stored inside en).
export const adminUpdateManga = (id, patch, { score } = {}) => {
  const row = db.prepare('SELECT * FROM manga WHERE id = ?').get(id);
  if (!row) return undefined;
  db.prepare(`
    UPDATE manga SET
      title = @title, title_fa = @titleFa, category = @category, year = @year,
      score = @score, updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    title: patch.title ?? row.title,
    titleFa: patch.titleFa ?? row.title_fa,
    category: patch.category ?? row.category,
    year: patch.year ?? row.year,
    score: score === undefined ? row.score : (score === '' || score == null ? null : score),
  });
  if (patch.synopsis !== undefined) {
    db.prepare("UPDATE manga SET synopsis = ?, updated_at = datetime('now') WHERE id = ?").run(patch.synopsis, id);
  }
  return db.prepare('SELECT * FROM manga WHERE id = ?').get(id);
};

export const deleteManga = (id) => db.prepare('DELETE FROM manga WHERE id = ?').run(id);
