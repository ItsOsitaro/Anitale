import './config.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetch } from 'undici';
import rateLimit from 'express-rate-limit';
import { db, SERVER_DIR } from './db.js';
import { tenraiGetRaw } from './tenrai.js';
import { getDispatcher } from './proxy.js';

// Extra detail for a title (characters + voice actors, relations, recommendations, trailer, themes).
// Fetched from Tenrai on first view, stored in SQLite and served from there afterwards, so visitors
// never reach Tenrai directly and the public limit (4/s, 120/min) is not an issue.
db.exec(`
CREATE TABLE IF NOT EXISTS title_extras (
  type TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (type, mal_id)
);
`);

// Bump when the stored shape gains fields: older rows are refreshed on their next view.
const EXTRAS_VERSION = 3;
const FRESH_MS = 7 * 24 * 3600 * 1000; // data is re-fetched after a week
const FAIL_MS = 90 * 1000; // after a failed fetch, do not retry the same title for 90 s
const MAX_CHARACTERS = 14;
const MAX_RELATIONS = 12;
const MAX_RECS = 10;
const MAX_STAFF = 10;
// Credits worth showing, most important first.
const KEY_POSITIONS = ['Director', 'Series Composition', 'Original Creator', 'Character Design', 'Music', 'Script', 'Art Director', 'Sound Director', 'Chief Animation Director'];

const inflight = new Map();
const failedAt = new Map();

const arr = (body) => (Array.isArray(body?.data) ? body.data : []);
const img = (images) => images?.webp?.image_url || images?.jpg?.image_url || '';
const IMG_PREFIX = process.env.EXTRAS_IMG_PREFIX || 'https://cdn.myanimelist.net/images/'; // override only in tests
const IMG_HOST = { test: (url) => String(url || '').startsWith(IMG_PREFIX) };
const proxied = (url) => (IMG_HOST.test(url || '') ? `/api/ximg?u=${encodeURIComponent(url)}` : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const text = (v, n = 120) => String(v ?? '').slice(0, n);

// Ignore sections that fail one by one: a missing trailer must not hide the characters.
const safe = async (task, fallback) => { try { return await task(); } catch (error) { if (error?.network) throw error; return fallback; } };

const buildExtras = async (type, id) => {
  const base = `/${type}/${id}`;
  const characters = await safe(() => tenraiGetRaw(`${base}/characters`), null);
  const relations = await safe(() => tenraiGetRaw(`${base}/relations`), null);
  const recs = await safe(() => tenraiGetRaw(`${base}/recommendations`), null);
  const videos = type === 'anime' ? await safe(() => tenraiGetRaw(`${base}/videos`), null) : null;
  const themes = type === 'anime' ? await safe(() => tenraiGetRaw(`${base}/themes`), null) : null;
  const staffBody = type === 'anime' ? await safe(() => tenraiGetRaw(`${base}/staff`), null) : null;
  if (!characters && !relations && !recs && !videos && !themes && !staffBody) {
    const error = new Error('Tenrai gave no extras for this title');
    error.status = 502;
    throw error;
  }

  const chars = arr(characters)
    .filter((entry) => entry?.character?.mal_id)
    .sort((a, b) => (a.role === 'Main' ? 0 : 1) - (b.role === 'Main' ? 0 : 1) || num(b.favorites) - num(a.favorites))
    .slice(0, MAX_CHARACTERS)
    .map((entry) => {
      const vas = Array.isArray(entry.voice_actors) ? entry.voice_actors : [];
      const va = vas.find((v) => v?.language === 'Japanese') || vas[0];
      return {
        id: entry.character.mal_id,
        name: text(entry.character.name),
        role: entry.role === 'Main' ? 'main' : 'supporting',
        image: proxied(img(entry.character.images)),
        voice: va?.person?.name && va.person.mal_id ? { id: va.person.mal_id, name: text(va.person.name), language: text(va.language, 30), image: proxied(img(va.person.images)) } : null,
      };
    });

  const rels = arr(relations)
    .map((group) => ({
      relation: text(group?.relation, 40),
      entries: (Array.isArray(group?.entry) ? group.entry : [])
        .filter((e) => e?.mal_id && (e.type === 'anime' || e.type === 'manga'))
        .map((e) => ({ type: e.type, id: e.mal_id, name: text(e.name) })),
    }))
    .filter((group) => group.relation && group.entries.length)
    .slice(0, MAX_RELATIONS);

  const recommendations = arr(recs)
    .filter((entry) => entry?.entry?.mal_id)
    .sort((a, b) => num(b.votes) - num(a.votes))
    .slice(0, MAX_RECS)
    .map((entry) => ({ id: entry.entry.mal_id, title: text(entry.entry.title), image: proxied(img(entry.entry.images)), votes: num(entry.votes) }));

  let trailer = null;
  const promo = Array.isArray(videos?.data?.promo) ? videos.data.promo : [];
  const pick = promo.find((p) => p?.trailer?.youtube_id && p.trailer.embeddable !== false) || promo.find((p) => p?.trailer?.youtube_id);
  if (pick) {
    const ytid = String(pick.trailer.youtube_id);
    if (/^[A-Za-z0-9_-]{6,20}$/.test(ytid)) trailer = { youtubeId: ytid, title: text(pick.title) };
  }

  // Staff: keep the key credits only (a full credit list has hundreds of people).
  const rank = (position) => { const i = KEY_POSITIONS.findIndex((key) => String(position).toLowerCase().startsWith(key.toLowerCase())); return i === -1 ? 99 : i; };
  const staff = arr(staffBody)
    .filter((entry) => entry?.person?.mal_id && Array.isArray(entry.positions))
    .map((entry) => {
      const positions = entry.positions.filter((position) => rank(position) < 99).sort((a, b) => rank(a) - rank(b));
      return { id: entry.person.mal_id, name: text(entry.person.name), positions: positions.slice(0, 2).map((position) => text(position, 40)), best: positions.length ? rank(positions[0]) : 99 };
    })
    .filter((person) => person.positions.length)
    .sort((a, b) => a.best - b.best)
    .slice(0, MAX_STAFF)
    .map(({ best, ...person }) => person);

  const themeData = themes?.data || {};
  const list = (v) => (Array.isArray(v) ? v.map((s) => text(s, 160)).filter(Boolean).slice(0, 8) : []);

  return { v: EXTRAS_VERSION, staff, characters: chars, relations: rels, recommendations, trailer, openings: list(themeData.openings), endings: list(themeData.endings) };
};

const readRow = (type, id) => db.prepare('SELECT data, fetched_at FROM title_extras WHERE type = ? AND mal_id = ?').get(type, id);

const refresh = (type, id) => {
  const key = `${type}:${id}`;
  if (inflight.has(key)) return inflight.get(key);
  const job = buildExtras(type, id)
    .then((data) => {
      db.prepare('INSERT OR REPLACE INTO title_extras (type, mal_id, data, fetched_at) VALUES (?, ?, ?, ?)').run(type, id, JSON.stringify(data), Date.now());
      failedAt.delete(key);
      return data;
    })
    .catch((error) => { failedAt.set(key, Date.now()); throw error; })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
};

// ---- image proxy (disk cache) ---------------------------------------------------------
const IMG_DIR = path.join(SERVER_DIR, 'xcache');
fs.mkdirSync(IMG_DIR, { recursive: true });
const MAX_IMG = 1024 * 1024;
const MIME = ['image/jpeg', 'image/webp', 'image/png'];

export const registerExtrasRoutes = (app) => {
  const limiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
  const imgLimiter = rateLimit({ windowMs: 60_000, limit: 400, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });

  app.get('/api/extras/:type/:malId', limiter, async (req, res) => {
    const type = req.params.type === 'manga' ? 'manga' : req.params.type === 'anime' ? 'anime' : '';
    const id = Number(req.params.malId);
    if (!type || !Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Bad request' }); return; }
    const key = `${type}:${id}`;
    const row = readRow(type, id);
    const stored = row ? JSON.parse(row.data) : null;
    const fresh = row && Date.now() - row.fetched_at < FRESH_MS && stored.v === EXTRAS_VERSION;
    if (fresh) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
      res.json({ ...stored, ok: true });
      return;
    }
    const recentlyFailed = failedAt.has(key) && Date.now() - failedAt.get(key) < FAIL_MS;
    try {
      if (recentlyFailed) throw new Error('recent failure');
      const data = await refresh(type, id);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
      res.json({ ...data, ok: true });
    } catch {
      // Tenrai unreachable: serve the stale copy if there is one, otherwise an empty answer the page hides.
      res.setHeader('Cache-Control', 'no-cache');
      if (row) res.json({ ...stored, ok: true, stale: true });
      else res.json({ ok: false });
    }
  });

  app.get('/api/ximg', imgLimiter, async (req, res) => {
    const url = String(req.query.u || '');
    if (!IMG_HOST.test(url) || url.length > 300) { res.status(400).end(); return; }
    const file = path.join(IMG_DIR, `${crypto.createHash('sha1').update(url).digest('hex')}.img`);
    const send = (buffer, type) => {
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      res.send(buffer);
    };
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file);
        send(raw.subarray(1), MIME[raw[0]] || 'image/jpeg');
        return;
      }
      const upstream = await fetch(url, { dispatcher: getDispatcher(), signal: AbortSignal.timeout(15_000) });
      const ctype = upstream.headers.get('content-type') || '';
      if (!upstream.ok || !MIME.includes(ctype)) { res.status(404).end(); return; }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.length > MAX_IMG) { res.status(413).end(); return; }
      fs.writeFileSync(file, Buffer.concat([Buffer.from([MIME.indexOf(ctype)]), buffer]));
      send(buffer, ctype);
    } catch {
      res.status(502).end();
    }
  });
};
