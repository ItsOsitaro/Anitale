import './config.js';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { tenraiGetRaw } from './tenrai.js';

// Watch order: starting from one title, follow its relations (prequel, sequel, side story, ...)
// through Tenrai one title at a time (each /full answer carries both the title's facts and its
// relations), then order everything by start date. Built in the background on first request and
// stored, so later visits to any title of the same franchise are instant.

db.exec(`
CREATE TABLE IF NOT EXISTS franchise_cache (
  media_type TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  built_at INTEGER NOT NULL,
  PRIMARY KEY (media_type, mal_id)
);
`);

const VERSION = 1;
const FRESH_MS = 30 * 24 * 3600 * 1000;
const FAIL_MS = 90 * 1000;
const MAX_NODES = 25;
const FOLLOW = new Set(['Prequel', 'Sequel', 'Parent story', 'Full story', 'Side story', 'Spin-off']);
const IMG_PREFIX = process.env.EXTRAS_IMG_PREFIX || 'https://cdn.myanimelist.net/images/'; // override only in tests
const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v, n = 160) => String(v ?? '').slice(0, n);
const img = (images) => images?.webp?.image_url || images?.jpg?.image_url || '';
const proxied = (url) => (String(url || '').startsWith(IMG_PREFIX) ? `/api/ximg?u=${encodeURIComponent(url)}` : '');

const startOf = (d) => {
  const from = d?.aired?.prop?.from || d?.published?.prop?.from || {};
  const year = Number(from.year) || Number(d?.year) || 0;
  return { year, key: year ? year * 10000 + (Number(from.month) || 0) * 100 + (Number(from.day) || 0) : 0 };
};

const shapeNode = (mediaType, d) => {
  const start = startOf(d);
  return {
    id: d.mal_id, type: mediaType, title: text(d.title_english || d.title), kind: text(d.type, 20),
    year: start.year || null, sort: start.key, image: proxied(img(d.images)),
    count: Number(mediaType === 'anime' ? d.episodes : d.chapters) || null,
  };
};

const jobs = new Map(); // key -> { found, done, failed, at }

const build = async (mediaType, rootId) => {
  const key = `${mediaType}:${rootId}`;
  const job = { found: 0, done: false, failed: false, at: Date.now() };
  jobs.set(key, job);
  try {
    const nodes = new Map();
    const queue = [rootId];
    const seen = new Set([rootId]);
    let truncated = false;
    while (queue.length) {
      if (nodes.size >= MAX_NODES) { truncated = true; break; }
      const id = queue.shift();
      let d;
      try { d = (await tenraiGetRaw(`/${mediaType}/${id}/full`))?.data; } catch (error) { if (id === rootId) throw error; continue; }
      if (!d?.mal_id) { if (id === rootId) throw new Error('no data'); continue; }
      nodes.set(d.mal_id, shapeNode(mediaType, d));
      job.found = nodes.size;
      for (const group of arr(d.relations)) {
        if (!FOLLOW.has(group?.relation)) continue;
        for (const entry of arr(group.entry)) {
          if (entry?.type !== mediaType || !entry.mal_id || seen.has(entry.mal_id)) continue;
          seen.add(entry.mal_id); queue.push(entry.mal_id);
        }
      }
    }
    const items = [...nodes.values()].sort((a, b) => (a.sort || 9e9) - (b.sort || 9e9) || a.id - b.id).map(({ sort, ...rest }) => rest);
    const data = { v: VERSION, mediaType, items, truncated };
    const stmt = db.prepare('INSERT OR REPLACE INTO franchise_cache (media_type, mal_id, data, built_at) VALUES (?, ?, ?, ?)');
    const json = JSON.stringify(data);
    for (const node of items) stmt.run(mediaType, node.id, json, Date.now());
    job.done = true;
  } catch {
    job.failed = true;
  } finally {
    job.at = Date.now();
  }
};

export const registerFranchiseRoutes = (app) => {
  const limiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
  app.get('/api/franchise/:type/:id', limiter, (req, res) => {
    const mediaType = req.params.type === 'manga' ? 'manga' : req.params.type === 'anime' ? 'anime' : '';
    const id = Number(req.params.id);
    res.setHeader('Cache-Control', 'no-cache');
    if (!mediaType || !Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Bad request' }); return; }
    const row = db.prepare('SELECT data, built_at FROM franchise_cache WHERE media_type = ? AND mal_id = ?').get(mediaType, id);
    const stored = row ? JSON.parse(row.data) : null;
    if (stored && stored.v === VERSION && Date.now() - row.built_at < FRESH_MS) { res.json({ status: 'ready', ...stored }); return; }
    const key = `${mediaType}:${id}`;
    const job = jobs.get(key);
    if (job && !job.done && !job.failed) { res.json({ status: 'building', found: job.found }); return; }
    if (job?.failed && Date.now() - job.at < FAIL_MS) { res.json(stored ? { status: 'ready', stale: true, ...stored } : { status: 'failed' }); return; }
    build(mediaType, id);
    res.json({ status: 'building', found: 0 });
  });
};
