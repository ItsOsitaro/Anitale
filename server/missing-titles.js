import { z } from 'zod';
import { db } from './db.js';

// Titles that members' MyAnimeList lists contain but the catalog does not have yet.
// One row per title, one request row per member, so a member re-importing does not inflate the count.
db.exec(`
CREATE TABLE IF NOT EXISTS missing_titles (
  type TEXT NOT NULL CHECK (type IN ('anime', 'manga')),
  mal_id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  first_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (type, mal_id)
);
CREATE TABLE IF NOT EXISTS missing_requests (
  type TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (type, mal_id, user_id)
);
`);

const MAX_ROWS = 20000;

export const recordMissing = (userId, entries) => {
  if (!entries.length) return;
  let total = db.prepare('SELECT COUNT(*) AS n FROM missing_titles').get().n;
  const addTitle = db.prepare('INSERT OR IGNORE INTO missing_titles (type, mal_id, title) VALUES (?, ?, ?)');
  const addRequest = db.prepare('INSERT OR IGNORE INTO missing_requests (type, mal_id, user_id) VALUES (?, ?, ?)');
  for (const entry of entries) {
    if (total >= MAX_ROWS) break;
    total += addTitle.run(entry.type, entry.malId, String(entry.title || '').slice(0, 200)).changes;
    addRequest.run(entry.type, entry.malId, userId);
  }
};

// Drops rows whose title has since been added to the catalog (or requests left with no title row).
const cleanup = () => {
  db.exec(`
    DELETE FROM missing_titles WHERE type = 'anime' AND mal_id IN (SELECT mal_id FROM anime WHERE mal_id IS NOT NULL);
    DELETE FROM missing_titles WHERE type = 'manga' AND mal_id IN (SELECT mal_id FROM manga WHERE mal_id IS NOT NULL);
    DELETE FROM missing_requests WHERE NOT EXISTS (SELECT 1 FROM missing_titles m WHERE m.type = missing_requests.type AND m.mal_id = missing_requests.mal_id);
  `);
};

const dismissInput = z.object({
  items: z.array(z.object({ type: z.enum(['anime', 'manga']), malId: z.number().int().positive() })).min(1).max(500),
});

export const registerMissingRoutes = (app, { requireAdmin, writeLimiter }) => {
  app.get('/api/admin/missing-titles', requireAdmin, (_req, res) => {
    cleanup();
    const rows = db.prepare(`
      SELECT m.type, m.mal_id AS malId, m.title,
        (SELECT COUNT(*) FROM missing_requests r WHERE r.type = m.type AND r.mal_id = m.mal_id) AS requests
      FROM missing_titles m
      ORDER BY requests DESC, m.first_at ASC
      LIMIT 500
    `).all();
    res.json({ items: rows, total: db.prepare('SELECT COUNT(*) AS n FROM missing_titles').get().n });
  });

  app.post('/api/admin/missing-titles/dismiss', requireAdmin, writeLimiter, (req, res) => {
    const input = dismissInput.parse(req.body);
    for (const item of input.items) {
      db.prepare('DELETE FROM missing_titles WHERE type = ? AND mal_id = ?').run(item.type, item.malId);
    }
    cleanup();
    res.json({ ok: true });
  });
};
