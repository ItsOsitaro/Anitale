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

// Name search over characters and people. Tenrai answers; results are kept in memory for an hour.
// If Tenrai is unreachable we fall back to the characters/people already stored in people_cache.
const searchCache = new Map();
const SEARCH_TTL = 3600 * 1000;
const fold = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const brief = (kind, d) => ({
  kind, id: d.mal_id, name: text(d.name, 100), sub: text(kind === 'character' ? (d.name_kanji || '') : (d.given_name || d.family_name ? `${d.given_name || ''} ${d.family_name || ''}`.trim() : ''), 100),
  image: proxied(img(d.images)), favorites: Number(d.favorites) || 0,
});
const searchPeople = async (q) => {
  const key = fold(q);
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL) return hit.data;
  const enc = encodeURIComponent(q.slice(0, 80));
  const [chars, people] = await Promise.all([
    tenraiGetRaw(`/characters?q=${enc}&limit=8&order_by=favorites&sort=desc`),
    tenraiGetRaw(`/people?q=${enc}&limit=6&order_by=favorites&sort=desc`),
  ]);
  const data = {
    characters: arr(chars?.data).filter((d) => d?.mal_id).map((d) => brief('character', d)).slice(0, 8),
    people: arr(people?.data).filter((d) => d?.mal_id).map((d) => brief('person', d)).slice(0, 6),
  };
  if (searchCache.size >= 200) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { at: Date.now(), data });
  return data;
};
const searchStored = (q) => {
  const needle = fold(q);
  const out = { characters: [], people: [] };
  for (const row of db.prepare('SELECT kind, data FROM people_cache').all()) {
    let d; try { d = JSON.parse(row.data); } catch { continue; }
    const names = [d.name, d.nameKanji, d.givenName, d.familyName, ...(d.nicknames || []), ...(d.alternateNames || [])].map(fold);
    if (!names.some((n) => n && n.includes(needle))) continue;
    const entry = { kind: row.kind, id: d.id, name: d.name, sub: d.nameKanji || '', image: d.image || '', favorites: d.favorites || 0 };
    (row.kind === 'character' ? out.characters : out.people).push(entry);
  }
  const top = (list, n) => list.sort((a, b) => b.favorites - a.favorites).slice(0, n);
  return { characters: top(out.characters, 8), people: top(out.people, 6) };
};

export const registerPeopleRoutes = (app) => {
  const searchLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many searches' } });
  app.get('/api/search/people', searchLimiter, async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    res.setHeader('Cache-Control', 'no-cache');
    if (fold(q).length < 2) { res.json({ characters: [], people: [] }); return; }
    try { res.json(await searchPeople(q)); } catch { res.json({ ...searchStored(q), local: true }); }
  });

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
