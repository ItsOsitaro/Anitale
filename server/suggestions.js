import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from './db.js';
import { titleExists } from './reviews.js';

// Member edit suggestions: Persian synopsis, Persian title, genre changes, or a free-text error report.
// They wait in a queue; an admin approves (the change is applied automatically) or rejects with a reason.
db.exec(`
CREATE TABLE IF NOT EXISTS edit_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga')),
  slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('synopsis', 'title', 'genres', 'report')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON edit_suggestions(status, id);
CREATE INDEX IF NOT EXISTS idx_suggestions_user ON edit_suggestions(user_id, created_at);
`);
// Persian display title for anime (manga already has one).
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('anime') WHERE name = 'title_fa'").get().n) {
  db.exec("ALTER TABLE anime ADD COLUMN title_fa TEXT NOT NULL DEFAULT ''");
}

export const DAILY_LIMIT = 5;
const genre = z.string().trim().min(2).max(40);
const input = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('synopsis'), mediaType: z.enum(['anime', 'manga']), slug: z.string().trim().min(1).max(120), text: z.string().trim().min(20, 'Too short').max(5000) }),
  z.object({ kind: z.literal('title'), mediaType: z.enum(['anime', 'manga']), slug: z.string().trim().min(1).max(120), text: z.string().trim().min(2).max(200) }),
  z.object({ kind: z.literal('genres'), mediaType: z.enum(['anime', 'manga']), slug: z.string().trim().min(1).max(120), add: z.array(genre).max(6).default([]), remove: z.array(genre).max(6).default([]) }),
  z.object({ kind: z.literal('report'), mediaType: z.enum(['anime', 'manga']), slug: z.string().trim().min(1).max(120), text: z.string().trim().min(10, 'Too short').max(1000) }),
]);
const rejectInput = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

const table = (mediaType) => (mediaType === 'manga' ? 'manga' : 'anime');
const parseJson = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const synopsisParts = (raw) => {
  const v = parseJson(raw || '', null);
  if (v && typeof v === 'object' && !Array.isArray(v)) return { fa: String(v.fa || ''), en: String(v.en || '') };
  return { fa: '', en: typeof raw === 'string' ? raw : '' };
};

// What the title looks like right now, for the admin's old-vs-new view.
const currentFor = (row) => {
  const t = db.prepare(`SELECT synopsis, title, title_fa, genres FROM ${table(row.media_type)} WHERE slug = ?`).get(row.slug);
  if (!t) return null;
  return { title: t.title, synopsisFa: synopsisParts(t.synopsis).fa, titleFa: t.title_fa || '', genres: parseJson(t.genres, []) };
};

const shape = (row, extra = {}) => ({
  id: row.id, mediaType: row.media_type, slug: row.slug, kind: row.kind, payload: parseJson(row.payload, {}),
  status: row.status, reason: row.reason, createdAt: row.created_at, reviewedAt: row.reviewed_at, ...extra,
});

const apply = (row) => {
  const payload = parseJson(row.payload, {});
  const tbl = table(row.media_type);
  const cur = db.prepare(`SELECT synopsis, genres FROM ${tbl} WHERE slug = ?`).get(row.slug);
  if (!cur) return false;
  if (row.kind === 'synopsis') {
    const base = synopsisParts(cur.synopsis);
    db.prepare(`UPDATE ${tbl} SET synopsis = ?, updated_at = datetime('now') WHERE slug = ?`).run(JSON.stringify({ fa: payload.text, en: base.en }), row.slug);
  } else if (row.kind === 'title') {
    db.prepare(`UPDATE ${tbl} SET title_fa = ?, updated_at = datetime('now') WHERE slug = ?`).run(payload.text, row.slug);
  } else if (row.kind === 'genres') {
    const remove = new Set((payload.remove || []).map((g) => g.toLowerCase()));
    const list = parseJson(cur.genres, []).filter((g) => !remove.has(String(g).toLowerCase()));
    for (const g of payload.add || []) if (!list.some((x) => String(x).toLowerCase() === g.toLowerCase())) list.push(g);
    db.prepare(`UPDATE ${tbl} SET genres = ?, updated_at = datetime('now') WHERE slug = ?`).run(JSON.stringify(list), row.slug);
  }
  return true;
};

export const registerSuggestionRoutes = (app, { requireSiteUser, requireAdmin, currentSiteUser, getUserByUsername, httpError }) => {
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Try again later.' } });
  const me = (req) => { const u = getUserByUsername(currentSiteUser(req)); if (!u) throw httpError(401, 'Not logged in'); return u; };

  app.post('/api/user/suggestions', requireSiteUser, limiter, (req, res) => {
    const { mediaType, slug, kind, ...rest } = input.parse(req.body);
    const user = me(req);
    if (!titleExists(mediaType, slug)) throw httpError(404, 'Title not found');
    if (kind === 'genres' && !rest.add.length && !rest.remove.length) throw httpError(400, 'Nothing to change');
    const today = db.prepare("SELECT COUNT(*) AS n FROM edit_suggestions WHERE user_id = ? AND created_at >= datetime('now', '-1 day')").get(user.id).n;
    if (today >= DAILY_LIMIT) throw httpError(429, `You can send ${DAILY_LIMIT} suggestions per day`);
    if (kind !== 'report' && db.prepare("SELECT 1 AS hit FROM edit_suggestions WHERE user_id = ? AND media_type = ? AND slug = ? AND kind = ? AND status = 'pending'").get(user.id, mediaType, slug, kind)) {
      throw httpError(409, 'You already have a pending suggestion of this kind for this title');
    }
    const info = db.prepare('INSERT INTO edit_suggestions (user_id, media_type, slug, kind, payload) VALUES (?, ?, ?, ?, ?)').run(user.id, mediaType, slug, kind, JSON.stringify(rest));
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), left: DAILY_LIMIT - today - 1 });
  });

  app.get('/api/user/suggestions', requireSiteUser, (req, res) => {
    const user = me(req);
    const rows = db.prepare('SELECT * FROM edit_suggestions WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(user.id);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ items: rows.map((r) => shape(r)), limit: DAILY_LIMIT });
  });

  app.get('/api/admin/suggestions', requireAdmin, (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = db.prepare(`SELECT s.*, u.username FROM edit_suggestions s JOIN users u ON u.id = s.user_id WHERE s.status = ? ORDER BY s.id ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 100`).all(status);
    res.json({ items: rows.map((r) => shape(r, { username: r.username, current: currentFor(r) })) });
  });

  const load = (req) => {
    const id = Number.parseInt(req.params.id, 10);
    const row = Number.isInteger(id) ? db.prepare('SELECT * FROM edit_suggestions WHERE id = ?').get(id) : null;
    if (!row) throw httpError(404, 'Not found');
    if (row.status !== 'pending') throw httpError(409, 'Already reviewed');
    return row;
  };
  app.post('/api/admin/suggestions/:id/approve', requireAdmin, (req, res) => {
    const row = load(req);
    if (!apply(row)) throw httpError(404, 'The title no longer exists');
    db.prepare("UPDATE edit_suggestions SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });
  app.post('/api/admin/suggestions/:id/reject', requireAdmin, (req, res) => {
    const row = load(req);
    const { reason } = rejectInput.parse(req.body);
    db.prepare("UPDATE edit_suggestions SET status = 'rejected', reason = ?, reviewed_at = datetime('now') WHERE id = ?").run(reason, row.id);
    res.json({ ok: true });
  });
};
