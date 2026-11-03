import './config.js';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { tenraiGetRaw } from './tenrai.js';

// Character and person pages: fetched from Tenrai on first view, stored, then served from SQLite.
db.exec(`
CREATE TABLE IF NOT EXISTS people_cache (
  kind TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (kind, mal_id)
);
`);

const VERSION = 1;
const FRESH_MS = 14 * 24 * 3600 * 1000;
const FAIL_MS = 90 * 1000;
const IMG_PREFIX = process.env.EXTRAS_IMG_PREFIX || 'https://cdn.myanimelist.net/images/'; // override only in tests
const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v, n = 160) => String(v ?? '').slice(0, n);
const img = (images) => images?.webp?.image_url || images?.jpg?.image_url || '';
const proxied = (url) => (String(url || '').startsWith(IMG_PREFIX) ? `/api/ximg?u=${encodeURIComponent(url)}` : '');
const media = (type, entry) => ({ id: entry?.mal_id, title: text(entry?.title), image: proxied(img(entry?.images)), type });
const valid = (m) => Number.isInteger(m.id) && m.id > 0;

const shapeCharacter = (d) => ({
  v: VERSION, kind: 'character', id: d.mal_id, name: text(d.name), nameKanji: text(d.name_kanji), nicknames: arr(d.nicknames).slice(0, 8).map((n) => text(n, 60)),
  about: text(d.about, 4000), image: proxied(img(d.images)), favorites: Number(d.favorites) || 0,
  anime: arr(d.anime).map((e) => ({ ...media('anime', e.anime), role: text(e.role, 30) })).filter(valid).slice(0, 24),
  manga: arr(d.manga).map((e) => ({ ...media('manga', e.manga), role: text(e.role, 30) })).filter(valid).slice(0, 12),
  voices: arr(d.voices).filter((e) => e?.person?.mal_id).map((e) => ({ id: e.person.mal_id, name: text(e.person.name), language: text(e.language, 30), image: proxied(img(e.person.images)) })).slice(0, 14),
});

const shapePerson = (d) => ({
  v: VERSION, kind: 'person', id: d.mal_id, name: text(d.name), givenName: text(d.given_name, 60), familyName: text(d.family_name, 60),
  alternateNames: arr(d.alternate_names).slice(0, 8).map((n) => text(n, 60)), birthday: text(d.birthday, 10),
  about: text(d.about, 4000), image: proxied(img(d.images)), favorites: Number(d.favorites) || 0,
  voices: arr(d.voices).filter((e) => e?.anime?.mal_id).map((e) => ({
    role: text(e.role, 30), anime: media('anime', e.anime),
    character: e.character?.mal_id ? { id: e.character.mal_id, name: text(e.character.name), image: proxied(img(e.character.images)) } : null,
  })).slice(0, 30),
  anime: arr(d.anime).map((e) => ({ ...media('anime', e.anime), position: text(e.position, 60) })).filter(valid).slice(0, 30),
  manga: arr(d.manga).map((e) => ({ ...media('manga', e.manga), position: text(e.position, 60) })).filter(valid).slice(0, 12),
});

const inflight = new Map();
const failedAt = new Map();

const load = (kind, id) => {
  const key = `${kind}:${id}`;
  if (inflight.has(key)) return inflight.get(key);
  const path = kind === 'character' ? `/characters/${id}/full` : `/people/${id}/full`;
  const job = tenraiGetRaw(path)
    .then((body) => {
      const d = body?.data;
      if (!d || typeof d !== 'object' || !d.mal_id) throw Object.assign(new Error('no data'), { status: 502 });
      const data = kind === 'character' ? shapeCharacter(d) : shapePerson(d);
      db.prepare('INSERT OR REPLACE INTO people_cache (kind, mal_id, data, fetched_at) VALUES (?, ?, ?, ?)').run(kind, id, JSON.stringify(data), Date.now());
      failedAt.delete(key);
      return data;
    })
    .catch((error) => { failedAt.set(key, { at: Date.now(), status: error?.status }); throw error; })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
};

export const registerPeopleRoutes = (app) => {
  const limiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
  app.get('/api/people/:kind/:id', limiter, async (req, res) => {
    const kind = req.params.kind === 'character' ? 'character' : req.params.kind === 'person' ? 'person' : '';
    const id = Number(req.params.id);
    if (!kind || !Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Bad request' }); return; }
    const key = `${kind}:${id}`;
    const row = db.prepare('SELECT data, fetched_at FROM people_cache WHERE kind = ? AND mal_id = ?').get(kind, id);
    const stored = row ? JSON.parse(row.data) : null;
    const cacheHeader = 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600';
    if (stored && stored.v === VERSION && Date.now() - row.fetched_at < FRESH_MS) { res.setHeader('Cache-Control', cacheHeader); res.json({ ...stored, ok: true }); return; }
    try {
      const failed = failedAt.get(key);
      if (failed && Date.now() - failed.at < FAIL_MS) throw Object.assign(new Error('recent failure'), { status: failed.status });
      const data = await load(kind, id);
      res.setHeader('Cache-Control', cacheHeader);
      res.json({ ...data, ok: true });
    } catch (error) {
      res.setHeader('Cache-Control', 'no-cache');
      if (stored) { res.json({ ...stored, ok: true, stale: true }); return; }
      res.json({ ok: false, notFound: error?.status === 404 });
    }
  });
};
