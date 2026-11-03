import './config.js';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { tenraiGetRaw } from './tenrai.js';

// «برترین شخصیت‌ها»: MAL's most-favorited characters via Tenrai. Top 50, two pages of 25, cached for a day.
db.exec(`
CREATE TABLE IF NOT EXISTS top_cache (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
`);

const FRESH_MS = 24 * 3600 * 1000;
const FAIL_MS = 60 * 1000;
const PER_PAGE = 25;
const PAGES = 2;
const IMG_PREFIX = process.env.EXTRAS_IMG_PREFIX || 'https://cdn.myanimelist.net/images/';
const text = (v, n = 120) => String(v ?? '').slice(0, n);
const img = (images) => images?.webp?.image_url || images?.jpg?.image_url || '';
const proxied = (url) => (String(url || '').startsWith(IMG_PREFIX) ? `/api/ximg?u=${encodeURIComponent(url)}` : '');

const inflight = new Map();
let failedAt = 0;

const load = (page) => {
  if (inflight.has(page)) return inflight.get(page);
  const job = tenraiGetRaw(`/top/characters?page=${page}&limit=${PER_PAGE}`)
    .then((body) => {
      const rows = Array.isArray(body?.data) ? body.data : [];
      const items = rows.filter((d) => Number.isInteger(d?.mal_id)).slice(0, PER_PAGE).map((d, i) => ({
        rank: (page - 1) * PER_PAGE + i + 1, id: d.mal_id, name: text(d.name), nameKanji: text(d.name_kanji),
        image: proxied(img(d.images)), favorites: Number(d.favorites) || 0,
      }));
      if (!items.length) throw new Error('empty');
      const data = { page, pages: PAGES, perPage: PER_PAGE, items };
      db.prepare('INSERT OR REPLACE INTO top_cache (key, data, fetched_at) VALUES (?, ?, ?)').run(`characters:${page}`, JSON.stringify(data), Date.now());
      failedAt = 0;
      return data;
    })
    .catch((error) => { failedAt = Date.now(); throw error; })
    .finally(() => inflight.delete(page));
  inflight.set(page, job);
  return job;
};

export const registerTopCharactersRoutes = (app) => {
  const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
  app.get('/api/top/characters', limiter, async (req, res) => {
    const page = Math.min(PAGES, Math.max(1, Math.floor(Number(req.query.page)) || 1));
    const row = db.prepare('SELECT data, fetched_at FROM top_cache WHERE key = ?').get(`characters:${page}`);
    const stored = row ? JSON.parse(row.data) : null;
    if (stored && Date.now() - row.fetched_at < FRESH_MS) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      res.json({ ...stored, ok: true });
      return;
    }
    try {
      if (Date.now() - failedAt < FAIL_MS) throw new Error('recent failure');
      const data = await load(page);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      res.json({ ...data, ok: true });
    } catch {
      res.setHeader('Cache-Control', 'no-cache');
      if (stored) { res.json({ ...stored, ok: true, stale: true }); return; }
      res.json({ ok: false });
    }
  });
};
