import { db } from './db.js';
import { rowToItem } from './shape.js';
import { mangaRowToItem } from './repo.js';
import { isSensitiveItem } from './sensitive.js';

// "Continue the series": for the anime a member finished, the sequels (from the relations cached in title_extras)
// that are in the catalog and not on the member's list yet. Reads only data already on the server; nothing here
// calls Tenrai. Titles whose relations were never cached simply have no suggestion yet.
const readRelations = (type, malId) => {
  const row = db.prepare('SELECT data FROM title_extras WHERE type = ? AND mal_id = ?').get(type, malId);
  if (!row) return [];
  try {
    return (JSON.parse(row.data).relations || []).filter((g) => g.relation === 'Sequel').flatMap((g) => g.entries.filter((e) => e.type === type).map((e) => e.id));
  } catch { return []; }
};

export const continueFor = (userId, type = 'anime', limit = 12) => {
  if (!['anime', 'manga'].includes(type)) return [];
  const done = db.prepare(`
    SELECT a.mal_id, a.title, a.slug FROM user_entries e JOIN ${type} a ON a.slug = e.slug
    WHERE e.user_id = ? AND e.media_type = '${type}' AND e.status = 'completed' AND a.mal_id IS NOT NULL
    ORDER BY e.updated_at DESC LIMIT 200`).all(userId);
  const have = new Set(db.prepare("SELECT slug FROM user_entries WHERE user_id = ? AND media_type = ?").all(userId, type).map((r) => r.slug));
  const found = new Map(); // sequel mal id -> the finished title that leads to it
  for (const row of done) {
    for (const id of readRelations(type, row.mal_id)) if (!found.has(id)) found.set(id, row);
  }
  if (!found.size) return [];
  const ids = [...found.keys()].slice(0, 100);
  const rows = db.prepare(`SELECT * FROM ${type} WHERE mal_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const out = [];
  for (const row of rows) {
    if (have.has(row.slug) || isSensitiveItem(type === 'manga' ? mangaRowToItem(row) : rowToItem(row))) continue;
    const from = found.get(row.mal_id);
    out.push({ slug: row.slug, airing: type === 'anime' && Boolean(row.airing_day), from: { slug: from.slug, title: from.title } });
  }
  // Airing sequels first: that is the news a returning viewer wants.
  out.sort((a, b) => Number(b.airing) - Number(a.airing));
  return out.slice(0, limit);
};

export const registerContinueRoutes = (app, { requireSiteUser, userIdOf }) => {
  app.get('/api/user/continue', requireSiteUser, (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ items: continueFor(userIdOf(req), req.query.type === 'manga' ? 'manga' : 'anime') });
  });
};
