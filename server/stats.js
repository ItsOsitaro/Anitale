import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { foldTitle } from './shape.js';

// Privacy-friendly usage counters, no tracker and nothing about people: how many times a title page / main page was
// opened per day, and how often each search text was used per day. No IP, cookie or user id is stored.
//   POST /api/hit {path}  (sent by the browser on each page change)   -> page_hits
//   countSearch(text)     (called by the search API)                  -> search_terms
//   GET /api/admin/x/system/stats                                      -> top titles, pages and searches
db.exec(`
CREATE TABLE IF NOT EXISTS page_hits (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, ref)
);
CREATE TABLE IF NOT EXISTS search_terms (
  day TEXT NOT NULL,
  q TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, q)
);
`);

const PAGES = new Set(['schedule', 'seasonal', 'search', 'genres', 'pick', 'stacks', 'top', 'discover', 'developers', 'dashboard']);
const today = () => new Date().toISOString().slice(0, 10);

// Which counter a path belongs to, or null (admin, unknown, odd paths are not counted).
export const classify = (path) => {
  const p = String(path || '').split(/[?#]/)[0].slice(0, 200);
  if (p === '/' || p === '') return { kind: 'page', ref: 'home' };
  const title = /^\/(anime|manga)\/([^/]+)/.exec(p);
  if (title) return { kind: title[1], ref: decodeURIComponent(title[2]).slice(0, 120) };
  const page = /^\/([a-z-]+)(\/|$)/.exec(p);
  return page && PAGES.has(page[1]) ? { kind: 'page', ref: page[1] } : null;
};

const bump = db.prepare('INSERT INTO page_hits (day, kind, ref, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, ref) DO UPDATE SET n = n + 1');
const bumpSearch = db.prepare('INSERT INTO search_terms (day, q, n) VALUES (?, ?, 1) ON CONFLICT(day, q) DO UPDATE SET n = n + 1');

export const countSearch = (text) => {
  const q = foldTitle(String(text || '').trim()).slice(0, 40);
  if (q.length < 3) return;
  try { bumpSearch.run(today(), q); } catch { /* counters are best effort */ }
};

export const registerStatsRoutes = (app) => {
  const limiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many' } });
  app.post('/api/hit', limiter, (req, res) => {
    res.status(204).end();
    const hit = classify(req.body?.path);
    if (!hit) return;
    try {
      bump.run(today(), hit.kind, hit.ref);
      if (Math.random() < 0.02) db.exec("DELETE FROM page_hits WHERE day < date('now', '-120 days'); DELETE FROM search_terms WHERE day < date('now', '-120 days')");
    } catch { /* counters are best effort */ }
  });

  app.get('/api/admin/x/system/stats', requireAdmin, (req, res) => {
    const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 7));
    const since = `-${days - 1} days`;
    const titles = (kind) => db.prepare("SELECT ref, SUM(n) AS n FROM page_hits WHERE kind = ? AND day >= date('now', ?) GROUP BY ref ORDER BY n DESC LIMIT 10").all(kind, since)
      .map((r) => ({ ...r, title: db.prepare(`SELECT title FROM ${kind} WHERE slug = ? OR CAST(mal_id AS TEXT) = ?`).get(r.ref, r.ref)?.title || r.ref }));
    res.json({
      days,
      anime: titles('anime'),
      manga: titles('manga'),
      pages: db.prepare("SELECT ref, SUM(n) AS n FROM page_hits WHERE kind = 'page' AND day >= date('now', ?) GROUP BY ref ORDER BY n DESC LIMIT 12").all(since),
      searches: db.prepare("SELECT q, SUM(n) AS n FROM search_terms WHERE day >= date('now', ?) GROUP BY q ORDER BY n DESC LIMIT 15").all(since),
      perDay: db.prepare("SELECT day AS d, SUM(n) AS n FROM page_hits WHERE day >= date('now', ?) GROUP BY day ORDER BY day").all(since),
    });
  });
};
