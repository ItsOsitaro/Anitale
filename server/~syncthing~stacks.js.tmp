import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from './db.js';
import { titleExists } from './reviews.js';

// Interest stacks: a user's named collection of anime/manga, public or private, that others can like.
db.exec(`
CREATE TABLE IF NOT EXISTS stacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stacks_user ON stacks(user_id);
CREATE TABLE IF NOT EXISTS stack_items (
  stack_id INTEGER NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga')),
  slug TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (stack_id, media_type, slug)
);
CREATE TABLE IF NOT EXISTS stack_likes (
  stack_id INTEGER NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (stack_id, user_id)
);
`);

export const MAX_STACKS = 10;
export const MAX_ITEMS = 50;

const createInput = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(60),
  description: z.string().trim().max(300).optional().default(''),
  isPublic: z.boolean().optional().default(true),
});
const updateInput = z.object({
  title: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).optional(),
  isPublic: z.boolean().optional(),
  items: z.array(z.object({ mediaType: z.enum(['anime', 'manga']), slug: z.string().trim().min(1).max(120) })).max(MAX_ITEMS).optional(),
});

const SELECT = `SELECT s.id, s.user_id, s.title, s.description, s.is_public, s.created_at, s.updated_at, u.username,
  (SELECT COUNT(*) FROM stack_items i WHERE i.stack_id = s.id) AS item_count,
  (SELECT COUNT(*) FROM stack_likes l WHERE l.stack_id = s.id) AS likes
  FROM stacks s JOIN users u ON u.id = s.user_id`;

const brief = (row, viewerId) => ({
  id: row.id, title: row.title, description: row.description, isPublic: Boolean(row.is_public), owner: row.username,
  itemCount: row.item_count, likes: row.likes, updatedAt: row.updated_at, mine: viewerId != null && row.user_id === viewerId,
});

const detail = (row, viewerId) => ({
  ...brief(row, viewerId),
  items: db.prepare('SELECT media_type, slug FROM stack_items WHERE stack_id = ? ORDER BY position').all(row.id).map((i) => ({ mediaType: i.media_type, slug: i.slug })),
  liked: viewerId != null && Boolean(db.prepare('SELECT 1 AS hit FROM stack_likes WHERE stack_id = ? AND user_id = ?').get(row.id, viewerId)),
});

const visible = (row, viewerId) => row && (row.is_public || (viewerId != null && row.user_id === viewerId));

export const registerStackRoutes = (app, { requireSiteUser, currentSiteUser, getUserByUsername, viewerId, httpError }) => {
  const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 150, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many changes. Try again later.' } });
  const me = (req) => { const row = getUserByUsername(currentSiteUser(req)); if (!row) throw httpError(401, 'Not logged in'); return row; };
  const idOf = (req) => { const id = Number.parseInt(req.params.id, 10); if (!Number.isInteger(id) || id <= 0) throw httpError(404, 'Not found'); return id; };
  const load = (id) => db.prepare(`${SELECT} WHERE s.id = ?`).get(id);

  // Public stacks, most liked or newest first.
  app.get('/api/stacks', (req, res) => {
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    const order = req.query.sort === 'new' ? 's.id DESC' : 'likes DESC, s.id DESC';
    const rows = db.prepare(`${SELECT} WHERE s.is_public = 1 AND (SELECT COUNT(*) FROM stack_items i WHERE i.stack_id = s.id) > 0 ORDER BY ${order} LIMIT 21 OFFSET ?`).all((page - 1) * 20);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ items: rows.slice(0, 20).map((r) => brief(r, viewerId(req))), hasMore: rows.length > 20 });
  });

  app.get('/api/users/:username/stacks', (req, res) => {
    const owner = getUserByUsername(String(req.params.username || ''));
    if (!owner) throw httpError(404, 'Not found');
    const viewer = viewerId(req);
    const rows = db.prepare(`${SELECT} WHERE s.user_id = ? ${viewer === owner.id ? '' : 'AND s.is_public = 1'} ORDER BY s.id DESC`).all(owner.id);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ items: rows.map((r) => brief(r, viewer)), limit: MAX_STACKS });
  });

  app.get('/api/stacks/:id', (req, res) => {
    const viewer = viewerId(req);
    const row = load(idOf(req));
    if (!visible(row, viewer)) throw httpError(404, 'Not found');
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ ...detail(row, viewer), maxItems: MAX_ITEMS });
  });

  app.post('/api/user/stacks', requireSiteUser, writeLimiter, (req, res) => {
    const input = createInput.parse(req.body);
    const user = me(req);
    if (db.prepare('SELECT COUNT(*) AS n FROM stacks WHERE user_id = ?').get(user.id).n >= MAX_STACKS) throw httpError(409, `You can keep at most ${MAX_STACKS} stacks`);
    const info = db.prepare('INSERT INTO stacks (user_id, title, description, is_public) VALUES (?, ?, ?, ?)').run(user.id, input.title, input.description, input.isPublic ? 1 : 0);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  app.put('/api/user/stacks/:id', requireSiteUser, writeLimiter, (req, res) => {
    const input = updateInput.parse(req.body);
    const user = me(req);
    const row = load(idOf(req));
    if (!row || row.user_id !== user.id) throw httpError(404, 'Not found');
    if (input.items) {
      const seen = new Set();
      const items = input.items.filter((i) => { const k = `${i.mediaType}:${i.slug}`; if (seen.has(k)) return false; seen.add(k); return true; });
      if (items.some((i) => !titleExists(i.mediaType, i.slug))) throw httpError(404, 'Title not found');
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM stack_items WHERE stack_id = ?').run(row.id);
        const ins = db.prepare('INSERT INTO stack_items (stack_id, media_type, slug, position) VALUES (?, ?, ?, ?)');
        items.forEach((i, idx) => ins.run(row.id, i.mediaType, i.slug, idx));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    db.prepare("UPDATE stacks SET title = ?, description = ?, is_public = ?, updated_at = datetime('now') WHERE id = ?").run(
      input.title ?? row.title, input.description ?? row.description, input.isPublic === undefined ? row.is_public : (input.isPublic ? 1 : 0), row.id,
    );
    res.json({ ok: true, ...detail(load(row.id), user.id), maxItems: MAX_ITEMS });
  });

  app.delete('/api/user/stacks/:id', requireSiteUser, writeLimiter, (req, res) => {
    const user = me(req);
    const row = load(idOf(req));
    if (!row || row.user_id !== user.id) throw httpError(404, 'Not found');
    db.prepare('DELETE FROM stacks WHERE id = ?').run(row.id);
    res.json({ ok: true });
  });

  const likeHandler = (on) => (req, res) => {
    const user = me(req);
    const row = load(idOf(req));
    if (!visible(row, user.id)) throw httpError(404, 'Not found');
    if (row.user_id === user.id) throw httpError(400, 'You cannot like your own stack');
    if (on) db.prepare('INSERT OR IGNORE INTO stack_likes (stack_id, user_id) VALUES (?, ?)').run(row.id, user.id);
    else db.prepare('DELETE FROM stack_likes WHERE stack_id = ? AND user_id = ?').run(row.id, user.id);
    const fresh = load(row.id);
    res.json({ ok: true, likes: fresh.likes, liked: on });
  };
  app.put('/api/user/stacks/:id/like', requireSiteUser, writeLimiter, likeHandler(true));
  app.delete('/api/user/stacks/:id/like', requireSiteUser, writeLimiter, likeHandler(false));
};
