import './config.js';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { tenraiGetRaw } from './tenrai.js';

// Episodes, videos and pictures for a title's «media» tabs. Fetched from Tenrai on first open, stored in SQLite.
db.exec(`
CREATE TABLE IF NOT EXISTS media_cache (
  type TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (type, mal_id, kind, page)
);
`);

const FRESH_MS = 12 * 3600 * 1000;
const FAIL_MS = 60 * 1000;
const IMG_PREFIX = process.env.EXTRAS_IMG_PREFIX || 'https://cdn.myanimelist.net/images/';
const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v, n = 160) => String(v ?? '').slice(0, n);
const proxied = (url) => (String(url || '').startsWith(IMG_PREFIX) ? `/api/ximg?u=${encodeURIComponent(url)}` : '');
const yt = (id) => (/^[A-Za-z0-9_-]{6,20}$/.test(String(id || '')) ? String(id) : '');

const shapers = {
  episodes: (body) => ({
    items: arr(body?.data).filter((e) => Number.isInteger(e?.mal_id) && e.mal_id > 0).slice(0, 100).map((e) => ({
      number: e.mal_id, title: text(e.title), titleJa: text(e.title_japanese || e.title_romanji), aired: text(e.aired, 10),
      filler: Boolean(e.filler), recap: Boolean(e.recap),
    })),
    hasNext: Boolean(body?.pagination?.has_next_page),
  }),
  videos: (body) => {
    const d = body?.data || {};
    return {
      promo: arr(d.promo).filter((p) => yt(p?.trailer?.youtube_id)).slice(0, 12).map((p) => ({ youtubeId: yt(p.trailer.youtube_id), title: text(p.title) })),
      music: arr(d.music_videos).filter((m) => yt(m?.video?.youtube_id)).slice(0, 12).map((m) => ({ youtubeId: yt(m.video.youtube_id), title: text(m.title || m.meta?.title), by: text(m.meta?.author, 80) })),
    };
  },
  pictures: (body) => ({
    items: arr(body?.data).slice(0, 60).map((p) => ({
      thumb: proxied(p?.webp?.image_url || p?.jpg?.image_url),
      full: proxied(p?.webp?.large_image_url || p?.jpg?.large_image_url || p?.webp?.image_url || p?.jpg?.image_url),
    })).filter((p) => p.thumb),
  }),
};

const inflight = new Map();
const failedAt = new Map();

export const registerMediaRoutes = (app) => {
  const limiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
  app.get('/api/media/:type/:malId/:kind', limiter, async (req, res) => {
    const type = req.params.type === 'manga' ? 'manga' : req.params.type === 'anime' ? 'anime' : '';
    const kind = req.params.kind;
    const id = Number(req.params.malId);
    const allowed = type === 'anime' ? ['episodes', 'videos', 'pictures'] : ['pictures'];
    if (!type || !allowed.includes(kind) || !Number.isInteger(id) || id <= 0) { res.status(400).json({ ok: false }); return; }
    const page = kind === 'episodes' ? Math.min(20, Math.max(1, Math.floor(Number(req.query.page)) || 1)) : 1;
    const key = `${type}:${id}:${kind}:${page}`;
    const row = db.prepare('SELECT data, fetched_at FROM media_cache WHERE type = ? AND mal_id = ? AND kind = ? AND page = ?').get(type, id, kind, page);
    const stored = row ? JSON.parse(row.data) : null;
    res.setHeader('Cache-Control', 'no-cache');
    if (stored && Date.now() - row.fetched_at < FRESH_MS) { res.json({ ...stored, ok: true }); return; }
    try {
      if (failedAt.has(key) && Date.now() - failedAt.get(key) < FAIL_MS) throw new Error('recent failure');
      if (!inflight.has(key)) {
        const path = `/${type}/${id}/${kind}${kind === 'episodes' ? `?page=${page}` : ''}`;
        inflight.set(key, tenraiGetRaw(path).then((body) => {
          const data = shapers[kind](body);
          db.prepare('INSERT OR REPLACE INTO media_cache (type, mal_id, kind, page, data, fetched_at) VALUES (?, ?, ?, ?, ?, ?)').run(type, id, kind, page, JSON.stringify(data), Date.now());
          failedAt.delete(key);
          return data;
        }).catch((error) => { failedAt.set(key, Date.now()); throw error; }).finally(() => inflight.delete(key)));
      }
      res.json({ ...(await inflight.get(key)), ok: true });
    } catch {
      if (stored) { res.json({ ...stored, ok: true, stale: true }); return; }
      res.json({ ok: false });
    }
  });
};
