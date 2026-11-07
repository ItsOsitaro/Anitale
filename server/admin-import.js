// Extra endpoints for the "import" admin pages. Add new routes under /api/admin/x/import/... only:
// the permission gate (server/admin-accounts.js) reads the area from that path (GET = view, other = edit).
import { db } from './db.js';
import { requireAdmin } from './auth.js';

const tableOf = (type) => (type === 'manga' ? 'manga' : 'anime');
const bad = (res, message) => res.status(400).json({ error: message });

export const register = (app) => {
  // How much of a MAL id range is already in the catalog + the highest saved id (to suggest "next range").
  app.get('/api/admin/x/import/range-info', requireAdmin, (req, res) => {
    const table = tableOf(req.query.type);
    const from = Math.floor(Number(req.query.from));
    const to = Math.floor(Number(req.query.to));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || to < from) return bad(res, 'Invalid range');
    const existing = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE mal_id BETWEEN ? AND ?`).get(from, to).n;
    const { maxId, count } = db.prepare(`SELECT MAX(mal_id) AS maxId, COUNT(*) AS count FROM ${table}`).get();
    return res.json({ type: table, from, to, total: to - from + 1, existing, maxMalId: maxId || 0, count });
  });

  // Which of the given MAL ids are already saved (id -> slug), at most 100 per call.
  app.get('/api/admin/x/import/known', requireAdmin, (req, res) => {
    const table = tableOf(req.query.type);
    const ids = [...new Set(String(req.query.ids || '').split(',').map((v) => Math.floor(Number(v))))].filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length || ids.length > 100) return bad(res, 'Send 1 to 100 ids');
    const rows = db.prepare(`SELECT mal_id, slug, title FROM ${table} WHERE mal_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    return res.json({ items: Object.fromEntries(rows.map((r) => [r.mal_id, { slug: r.slug, title: r.title }])) });
  });
};
