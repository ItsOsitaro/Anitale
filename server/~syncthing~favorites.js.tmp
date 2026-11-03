import { db } from './db.js';
import { titleExists } from './reviews.js';

// Profile favorites: up to 10 per kind. Anime and manga are stored by slug;
// characters and people (voice actors, staff) by MAL id with a name/image snapshot
// taken from people_cache, so the profile never needs to call Tenrai.

db.exec(`
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('anime', 'manga', 'character', 'person')),
  ref TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_favorites_ref ON favorites(kind, ref);
`);

export const FAVORITE_KINDS = ['anime', 'manga', 'character', 'person'];
export const FAVORITE_LIMIT = 10;

const isPeople = (kind) => kind === 'character' || kind === 'person';

// 'ok' | 'limit' | 'missing'
export const addFavorite = (userId, kind, ref) => {
  let name = '';
  let image = '';
  if (isPeople(kind)) {
    const id = Number(ref);
    if (!Number.isInteger(id) || id <= 0) return 'missing';
    const row = db.prepare('SELECT data FROM people_cache WHERE kind = ? AND mal_id = ?').get(kind, id);
    if (!row) return 'missing';
    try { const d = JSON.parse(row.data); name = String(d.name || '').slice(0, 100); image = String(d.image || '').slice(0, 300); } catch { return 'missing'; }
  } else if (!titleExists(kind, ref)) return 'missing';
  const exists = db.prepare('SELECT 1 AS hit FROM favorites WHERE user_id = ? AND kind = ? AND ref = ?').get(userId, kind, ref);
  if (exists) return 'ok';
  const have = db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ? AND kind = ?').get(userId, kind).n;
  if (have >= FAVORITE_LIMIT) return 'limit';
  db.prepare('INSERT INTO favorites (user_id, kind, ref, name, image) VALUES (?, ?, ?, ?, ?)').run(userId, kind, ref, name, image);
  return 'ok';
};

export const removeFavorite = (userId, kind, ref) => db.prepare('DELETE FROM favorites WHERE user_id = ? AND kind = ? AND ref = ?').run(userId, kind, ref).changes > 0;

export const listFavorites = (userId) => {
  const out = { anime: [], manga: [], character: [], person: [] };
  for (const row of db.prepare('SELECT kind, ref, name, image FROM favorites WHERE user_id = ? ORDER BY created_at ASC, rowid ASC').all(userId)) {
    out[row.kind].push(isPeople(row.kind) ? { id: Number(row.ref), name: row.name, image: row.image } : { slug: row.ref });
  }
  return out;
};

export const favoriteInfo = (kind, ref, viewerId = null) => ({
  count: db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE kind = ? AND ref = ?').get(kind, ref).n,
  mine: viewerId != null && Boolean(db.prepare('SELECT 1 AS hit FROM favorites WHERE user_id = ? AND kind = ? AND ref = ?').get(viewerId, kind, ref)),
});
