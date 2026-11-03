import rateLimit from 'express-rate-limit';
import { getDocs, searchCatalog } from './search.js';

// Public read-only API: /api/v1. No key, rate limited per IP, sensitive titles never included,
// `fields` picks the properties, ETag (Express) + Cache-Control let clients revalidate cheaply.
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MAX_LIMIT = 50;

const infoValue = (item, label) => String((Array.isArray(item.information) ? item.information : []).find((r) => r.label === label)?.value || '').trim();
const list = (text) => String(text || '').split(',').map((n) => n.trim()).filter(Boolean);
const num = (text) => { const n = Number(String(text ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

const FIELDS = {
  anime: ['slug', 'malId', 'type', 'title', 'titleFa', 'titleEn', 'titleJa', 'format', 'year', 'season', 'score', 'members', 'scoredBy', 'episodes', 'status', 'airingDay', 'genres', 'studios', 'producers', 'synopsis', 'image', 'url'],
  manga: ['slug', 'malId', 'type', 'title', 'titleFa', 'titleEn', 'titleJa', 'format', 'year', 'score', 'members', 'scoredBy', 'chapters', 'status', 'genres', 'magazines', 'synopsis', 'image', 'url'],
};
const DEFAULT_LIST = ['slug', 'malId', 'type', 'title', 'titleFa', 'format', 'year', 'score', 'genres', 'image', 'url'];

const synopsisOf = (item) => {
  const v = item.synopsis;
  if (v && typeof v === 'object') return { fa: String(v.fa || ''), en: String(v.en || '') };
  return { fa: '', en: String(v || '') };
};

const full = (doc, origin) => {
  const it = doc.item;
  const alt = it.alternativeTitles || {};
  const abs = (p) => (p ? `${origin}${p.startsWith('/') ? '' : '/'}${p}` : '');
  const base = {
    slug: it.slug, malId: it.malId ?? null, type: doc.kind, title: it.title, titleFa: it.titleFa || '', titleEn: alt.english || '', titleJa: alt.japanese || '',
    format: it.format || '', year: Number(it.year) || null, score: it.sampleScore || null, members: doc.members || null, scoredBy: doc.votes || null,
    status: doc.status || '', genres: it.genres || [], synopsis: synopsisOf(it), image: abs(doc.image), url: `${origin}/${doc.kind}/${encodeURIComponent(it.slug)}`,
  };
  if (doc.kind === 'anime') {
    return { ...base, season: infoValue(it, 'Premiered'), episodes: doc.episodes || null, airingDay: it.airingDay || '', studios: doc.studios || [], producers: list(infoValue(it, 'Producers')) };
  }
  return { ...base, chapters: doc.episodes || null, magazines: it.serialization || [] };
};

const pickFields = (obj, fields) => Object.fromEntries(fields.filter((f) => f in obj).map((f) => [f, obj[f]]));

export const registerApiV1 = (app) => {
  const limiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Rate limit: 60 requests per minute' } });
  const originOf = (req) => (String(process.env.SITE_URL || '').trim().replace(/\/+$/, '') || `${req.protocol}://${req.headers.host}`);
  const fieldsOf = (req, kind, fallback) => {
    const raw = String(req.query.fields || '').trim();
    if (!raw) return fallback;
    const wanted = raw.split(',').map((f) => f.trim()).filter(Boolean);
    const ok = wanted.filter((f) => FIELDS[kind].includes(f));
    return ok.length ? ok : null;
  };
  const bad = (res, message) => res.status(400).json({ error: message });
  const done = (res, body, maxAge = 300) => {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    res.json(body);
  };

  app.use('/api/v1', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).json({ error: 'Read-only API' }); return; }
    next();
  }, limiter);

  app.get('/api/v1', (req, res) => {
    const o = originOf(req);
    done(res, {
      name: 'Anitale public API', version: 1, rateLimit: '60 requests/minute per IP', sensitiveContent: 'never included',
      endpoints: {
        'GET /api/v1/anime': 'q, genre, xgenre, year, from, to, format, status(airing|finished|upcoming), studio, min, sort(score|new|old|az|pop|votes|eps), page, limit(<=50), fields',
        'GET /api/v1/manga': 'same filters as anime',
        'GET /api/v1/anime/{slug|malId}': 'one title, all fields (or fields=)',
        'GET /api/v1/manga/{slug|malId}': 'one title',
        'GET /api/v1/search': 'q (required), limit(<=20): anime and manga together',
        'GET /api/v1/top/anime': 'top by weighted score; page, limit, fields',
        'GET /api/v1/top/manga': 'top by weighted score',
        'GET /api/v1/schedule': 'weekly airing schedule grouped by day; fields',
      },
      fields: FIELDS, defaultListFields: DEFAULT_LIST, example: `${o}/api/v1/anime?genre=Action&sort=pop&limit=5&fields=slug,title,score`,
    }, 3600);
  });

  const listHandler = (kind, forceSort) => (req, res) => {
    const fields = fieldsOf(req, kind, DEFAULT_LIST);
    if (!fields) { bad(res, `Unknown fields. Allowed: ${FIELDS[kind].join(', ')}`); return; }
    const split = (v) => String(v || '').split(',').map((n) => n.trim().slice(0, 40)).filter(Boolean).slice(0, 10);
    const yearOf = (v) => { const n = Number.parseInt(v, 10); return n >= 1900 && n <= 2100 ? n : 0; };
    const sortOk = ['score', 'new', 'old', 'az', 'pop', 'votes', 'eps'];
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const result = searchCatalog({
      q: String(req.query.q || '').slice(0, 80), type: kind, genres: split(req.query.genre), excludeGenres: split(req.query.xgenre),
      year: String(req.query.year || '').slice(0, 4), fromYear: yearOf(req.query.from), toYear: yearOf(req.query.to),
      format: String(req.query.format || '').slice(0, 30), studio: String(req.query.studio || '').slice(0, 80),
      status: ['airing', 'finished', 'upcoming'].includes(req.query.status) ? req.query.status : '',
      minScore: Math.min(10, Math.max(0, Number(req.query.min) || 0)),
      sort: forceSort || (sortOk.includes(req.query.sort) ? req.query.sort : ''), page, limit, sfw: true, raw: true,
    });
    const origin = originOf(req);
    done(res, { items: result.items.map((r) => pickFields(full(r.doc, origin), fields)), total: result.total, page: result.page, pages: result.pages, limit });
  };
  app.get('/api/v1/anime', listHandler('anime'));
  app.get('/api/v1/manga', listHandler('manga'));
  app.get('/api/v1/top/anime', listHandler('anime', 'score'));
  app.get('/api/v1/top/manga', listHandler('manga', 'score'));

  const oneHandler = (kind) => (req, res) => {
    const fields = fieldsOf(req, kind, FIELDS[kind]);
    if (!fields) { bad(res, `Unknown fields. Allowed: ${FIELDS[kind].join(', ')}`); return; }
    const key = String(req.params.id || '');
    const asMal = /^\d+$/.test(key) ? Number(key) : null;
    const doc = getDocs().find((d) => d.kind === kind && !d.sensitive && (d.item.slug === key || (asMal != null && d.item.malId === asMal)));
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    done(res, pickFields(full(doc, originOf(req)), fields));
  };
  app.get('/api/v1/anime/:id', oneHandler('anime'));
  app.get('/api/v1/manga/:id', oneHandler('manga'));

  app.get('/api/v1/search', (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q.length < 2) { bad(res, 'q must be at least 2 characters'); return; }
    const limit = Math.min(20, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const origin = originOf(req);
    const result = searchCatalog({ q, type: 'all', limit, sfw: true, raw: true });
    done(res, { items: result.items.map((r) => pickFields(full(r.doc, origin), DEFAULT_LIST)), total: result.total });
  });

  app.get('/api/v1/schedule', (req, res) => {
    const fields = fieldsOf(req, 'anime', ['slug', 'malId', 'title', 'titleFa', 'airingDay', 'image', 'url']);
    if (!fields) { bad(res, `Unknown fields. Allowed: ${FIELDS.anime.join(', ')}`); return; }
    const origin = originOf(req);
    const days = Object.fromEntries(DAYS.map((d) => [d, []]));
    for (const doc of getDocs()) {
      if (doc.kind !== 'anime' || doc.sensitive) continue;
      const day = String(doc.item.airingDay || '').toLowerCase();
      if (days[day]) days[day].push(pickFields(full(doc, origin), fields));
    }
    done(res, { days }, 600);
  });

  app.use('/api/v1', (req, res) => res.status(404).json({ error: 'Unknown endpoint. See /api/v1' }));
};
