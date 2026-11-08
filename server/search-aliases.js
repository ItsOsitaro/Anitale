import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { foldTitle } from './shape.js';

// Searches that found nothing are counted, and the owner can answer a miss with an alias ("ایمپورت" style Persian
// spellings, nicknames, abbreviations) that points to a title. searchCatalog() puts alias targets first.
db.exec(`
CREATE TABLE IF NOT EXISTS search_misses (
  q TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 1,
  last_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS search_aliases (
  alias TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const MAX_MISSES = 2000;
// At most 20 new rows a minute per visitor, so a script typing random words cannot churn the table.
const missRate = new Map();
export const logMiss = (text, ip = '') => {
  const now = Date.now();
  const recent = (missRate.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) return;
  recent.push(now);
  missRate.set(ip, recent);
  if (missRate.size > 5000) missRate.clear();
  const q = foldTitle(String(text || '').trim()).slice(0, 60);
  if (q.length < 2) return;
  db.prepare("INSERT INTO search_misses (q) VALUES (?) ON CONFLICT(q) DO UPDATE SET n = n + 1, last_at = datetime('now')").run(q);
  // A bounded table: when it grows past the cap, the least asked half goes.
  if (Math.random() < 0.02 && db.prepare('SELECT COUNT(*) AS n FROM search_misses').get().n > MAX_MISSES) {
    db.prepare('DELETE FROM search_misses WHERE q IN (SELECT q FROM search_misses ORDER BY n ASC, last_at ASC LIMIT ?)').run(MAX_MISSES / 2);
  }
};

let aliasCache = null;
const aliases = () => {
  if (!aliasCache) aliasCache = new Map(db.prepare('SELECT alias, kind, slug FROM search_aliases').all().map((r) => [r.alias, r]));
  return aliasCache;
};
// Target (kind + slug) of an alias for an already-folded query, or undefined.
export const aliasFor = (needle) => aliases().get(needle);

const bad = (res, message, status = 400) => res.status(status).json({ error: message });

export const registerAliasRoutes = (app) => {
  // Everything under /api/admin/x/community/... is gated by the "community" area (GET = view, other = edit).
  app.get('/api/admin/x/community/search-misses', requireAdmin, (_req, res) => {
    res.json({
      misses: db.prepare('SELECT q, n, last_at AS lastAt FROM search_misses ORDER BY n DESC, last_at DESC LIMIT 100').all(),
      aliases: db.prepare('SELECT alias, kind, slug, created_at AS createdAt FROM search_aliases ORDER BY created_at DESC LIMIT 500').all(),
    });
  });
  app.post('/api/admin/x/community/search-aliases', requireAdmin, (req, res) => {
    const alias = foldTitle(String(req.body?.alias || '').trim()).slice(0, 60);
    const kind = req.body?.kind === 'manga' ? 'manga' : 'anime';
    const slug = String(req.body?.slug || '').trim().slice(0, 200);
    if (alias.length < 2 || !slug) return bad(res, 'Alias and title are required');
    if (!db.prepare(`SELECT 1 FROM ${kind} WHERE slug = ?`).get(slug)) return bad(res, 'No such title', 404);
    db.prepare('INSERT OR REPLACE INTO search_aliases (alias, kind, slug) VALUES (?, ?, ?)').run(alias, kind, slug);
    db.prepare('DELETE FROM search_misses WHERE q = ?').run(alias);
    aliasCache = null;
    res.json({ ok: true });
  });
  app.delete('/api/admin/x/community/search-aliases', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM search_aliases WHERE alias = ?').run(foldTitle(String(req.body?.alias || '')));
    aliasCache = null;
    res.json({ ok: true });
  });
  app.delete('/api/admin/x/community/search-misses', requireAdmin, (req, res) => {
    if (req.body?.q) db.prepare('DELETE FROM search_misses WHERE q = ?').run(foldTitle(String(req.body.q)));
    else if (req.body?.all === true) db.prepare('DELETE FROM search_misses').run();
    else return bad(res, 'Nothing to delete');
    res.json({ ok: true });
  });
};
