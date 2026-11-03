// Link previews + search-engine metadata for the single-page app.
//
// The SPA ships one static index.html, so Telegram / Instagram / WhatsApp / Google
// see the same title for every title page. This module answers GET
// /anime/:id and /manga/:id with that same index.html plus per-title <title>,
// description, Open Graph / Twitter tags and JSON-LD, and serves /sitemap.xml.
//
import fs from 'node:fs';
import path from 'node:path';
import { db, ROOT_DIR } from './db.js';
import { getBySlug, getByMalId, getMangaBySlug, getMangaByMalId, mangaRowToItem } from './repo.js';
import { rowToItem } from './shape.js';
import { isSensitiveItem } from './sensitive.js';
import { canSeeList, getUserByUsername, listEntries } from './users.js';

const SITE_NAME = 'انی‌تیل';
const EDGE_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
// Pages that must never be indexed (private or thin): header here, Disallow in robots.txt.
const PRIVATE_PATHS = ['/admin', '/search', '/account', '/dashboard', '/login', '/register', '/forgot', '/reset-password', '/verify-email'];

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clip = (text, max) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

// Public origin used inside the generated tags. SITE_URL wins; otherwise the
// request's own host (only ever written into escaped meta values, never fetched).
const originOf = (req) => {
  const configured = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const proto = (req.protocol || 'http');
  return `${proto}://${req.headers.host || 'localhost'}`;
};

const synopsisOf = (item) => {
  const value = item.synopsis;
  if (value && typeof value === 'object') return value.fa || value.en || '';
  return typeof value === 'string' ? value : '';
};

const findItem = (type, idOrSlug) => {
  const byMal = /^\d+$/.test(idOrSlug);
  if (type === 'manga') {
    const row = (byMal ? getMangaByMalId(Number(idOrSlug)) : null) || getMangaBySlug(idOrSlug);
    return row ? mangaRowToItem(row) : null;
  }
  const row = (byMal ? getByMalId(Number(idOrSlug)) : null) || getBySlug(idOrSlug);
  return row ? rowToItem(row) : null;
};

// The page shell: the built index.html when it is on disk (local build, or
// bundled into the function via includeFiles), else the deployment's own copy.
let cachedShell = null;
const loadShell = async () => {
  if (cachedShell) return cachedShell;
  const file = path.join(ROOT_DIR, 'dist', 'index.html');
  try {
    cachedShell = fs.readFileSync(file, 'utf8');
    return cachedShell;
  } catch { /* not bundled — try the deployment itself */ }
  const host = process.env.SITE_URL || '';
  if (host) {
    try {
      const response = await fetch(`${host.replace(/\/+$/, '')}/index.html`, { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        cachedShell = await response.text();
        return cachedShell;
      }
    } catch { /* fall through */ }
  }
  return null;
};

// Crawler-readable copy of the page content, placed inside #root. React's
// createRoot replaces it on load; it is parked off-screen so nobody sees a flash.
const staticBody = ({ heading, lines = [], text = '' }) => {
  const parts = [`<h1>${escapeHtml(heading)}</h1>`, ...lines.filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`)];
  if (text) parts.push(`<p>${escapeHtml(clip(text, 3000))}</p>`);
  return `<style>#root>.seo-static{position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden}</style><div class="seo-static">${parts.join('')}</div>`;
};

const injectMeta = (html, { title, description, url, image, jsonLd, body = '' }) => {
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    '<meta property="og:locale" content="fa_IR" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    ...(image ? [`<meta property="og:image" content="${escapeHtml(image)}" />`] : []),
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    ...(image ? [`<meta name="twitter:image" content="${escapeHtml(image)}" />`] : []),
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>\s*/i, '')
    .replace(/<meta\s+(?:property="og:|name="twitter:)[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, '')
    .replace('</head>', `    ${tags}\n  </head>`)
    .replace(/<div id="root">\s*<\/div>/i, `<div id="root">${body}</div>`);
};

const FALLBACK_SHELL = '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8" /><title></title></head><body><div id="root"></div></body></html>';

export const registerSeoRoutes = (app) => {
  app.use((req, res, next) => {
    if (PRIVATE_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`))) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain; charset=utf-8').setHeader('Cache-Control', 'public, max-age=3600');
    res.send(`User-agent: *\nAllow: /\n${PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${originOf(req)}/sitemap.xml\n`);
  });

  // Home: site-wide title/description, Open Graph preview and a WebSite search box for Google.
  app.get('/', async (req, res, next) => {
    try {
      const shell = (await loadShell()) || FALLBACK_SHELL;
      const origin = originOf(req);
      const title = `${SITE_NAME} — انیمه و مانگا`;
      const description = 'مرور انیمه و مانگا به فارسی: کاور، ژانر، خلاصهٔ داستان، رتبه‌بندی، نظر و امتیاز کاربران و لیست شخصی.';
      const jsonLd = {
        '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${origin}/`, inLanguage: 'fa',
        potentialAction: { '@type': 'SearchAction', target: `${origin}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
      };
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', EDGE_CACHE);
      res.send(injectMeta(shell, { title, description, url: `${origin}/`, image: `${origin}/logo-512.png`, jsonLd, body: staticBody({ heading: title, lines: [description] }) }));
    } catch (error) {
      next(error);
    }
  });

  // Discovery pages (rendered by the SPA's SectionPage): page-specific title/description for crawlers.
  const DISCOVERY = {
    '/anime': ['کاتالوگ انیمه', 'همهٔ انیمه‌های انی‌تیل را با جستجو و فیلتر بر اساس ژانر، قالب و سال پیدا کنید.'],
    '/manga': ['کاتالوگ مانگا', 'همهٔ مانگاهای انی‌تیل را با جستجو و فیلتر بر اساس ژانر، قالب و سال پیدا کنید.'],
    '/top/anime': ['برترین انیمه‌ها', 'انیمه‌های انی‌تیل به ترتیب امتیاز، از بالاترین به پایین‌ترین.'],
    '/top/manga': ['برترین مانگا', 'مانگاهای انی‌تیل به ترتیب امتیاز، از بالاترین به پایین‌ترین.'],
    '/top/characters': ['برترین شخصیت‌ها', 'محبوب‌ترین شخصیت‌های انیمه و مانگا بر اساس تعداد علاقه‌مندان در MyAnimeList.'],
    '/seasonal': ['انیمه‌های فصل', 'انیمه‌هایی که در فصل جاری پخش می‌شوند و کدام‌ها امروز قسمت تازه دارند.'],
    '/schedule': ['جدول پخش هفتگی', 'هر انیمه در کدام روز هفته قسمت تازه دارد.'],
  };
  app.get(Object.keys(DISCOVERY), async (req, res, next) => {
    try {
      const [name, description] = DISCOVERY[req.path];
      const shell = (await loadShell()) || FALLBACK_SHELL;
      const origin = originOf(req);
      const title = `${name} | ${SITE_NAME}`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', EDGE_CACHE);
      res.send(injectMeta(shell, {
        title, description, url: `${origin}${req.path}`, image: `${origin}/logo-512.png`,
        jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name, description, url: `${origin}${req.path}`, inLanguage: 'fa' },
        body: staticBody({ heading: name, lines: [description] }),
      }));
    } catch (error) {
      next(error);
    }
  });

  const itemPage = (type) => async (req, res, next) => {
    try {
      const item = findItem(type, String(req.params.idOrSlug || ''));
      const shell = (await loadShell()) || FALLBACK_SHELL;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!item) {
        // Unknown title: real 404 so search engines drop the URL (the SPA still shows its own page).
        res.status(404).setHeader('Cache-Control', 'no-cache');
        res.send(shell);
        return;
      }
      const origin = originOf(req);
      const name = type === 'manga' && item.titleFa ? item.titleFa : item.title;
      const title = `${name} | ${SITE_NAME}`;
      const description = clip(synopsisOf(item), 200)
        || `${name} — ${type === 'manga' ? 'مانگا' : 'انیمه'}${item.year ? ` ${item.year}` : ''} در ${SITE_NAME}`;
      const url = `${origin}/${type}/${item.malId ?? item.slug}`;
      const image = item.image ? `${origin}${item.image}` : '';
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': type === 'manga' ? 'Book' : 'TVSeries',
        name,
        ...(item.title !== name ? { alternateName: item.title } : {}),
        description,
        url,
        ...(image ? { image } : {}),
        ...(item.genres?.length ? { genre: item.genres } : {}),
        ...(item.sampleScore ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(item.sampleScore), bestRating: 10, ratingCount: 1 } } : {}),
      };
      // Sensitive titles stay reachable by link but are kept out of search engines.
      if (isSensitiveItem(item)) res.setHeader('X-Robots-Tag', 'noindex');
      // The CDN may serve this for a minute and refresh in the background; browsers always revalidate.
      res.setHeader('Cache-Control', EDGE_CACHE);
      const body = staticBody({
        heading: name,
        lines: [
          item.title !== name ? item.title : '',
          [type === 'manga' ? 'مانگا' : 'انیمه', item.year, item.format, ...(item.genres || [])].filter(Boolean).join(' · '),
        ],
        text: synopsisOf(item),
      });
      res.send(injectMeta(shell, { title, description, url, image, jsonLd, body }));
    } catch (error) {
      next(error);
    }
  };

  // Profile link previews. Only what the public profile already shows: name, bio,
  // list sizes, average rating and one cover from the user's best-rated titles.
  app.get('/user/:username', async (req, res, next) => {
    try {
      const row = getUserByUsername(req.params.username);
      const shell = (await loadShell()) || FALLBACK_SHELL;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      if (!row) { res.send(shell); return; }
      const origin = originOf(req);
      // Search-engine view = a guest: only public lists count.
      const full = listEntries(row.id);
      const entries = { anime: canSeeList(row, 'anime', null) ? full.anime : [], manga: canSeeList(row, 'manga', null) ? full.manga : [] };
      const all = [...entries.anime.map((e) => ({ ...e, type: 'anime' })), ...entries.manga.map((e) => ({ ...e, type: 'manga' }))];
      const rated = all.filter((e) => e.rating != null);
      const average = rated.length ? (rated.reduce((sum, e) => sum + e.rating, 0) / rated.length).toFixed(1) : null;
      const facts = [`${entries.anime.length} انیمه`, `${entries.manga.length} مانگا`, ...(average ? [`میانگین امتیاز ${average}`] : [])].join(' · ');
      const bio = clip(row.bio, 140);
      const title = `پروفایل ${row.username} | ${SITE_NAME}`;
      const description = bio ? `${bio} — ${facts}` : `${row.username} در ${SITE_NAME}: ${facts}`;
      const url = `${origin}/user/${encodeURIComponent(row.username)}`;
      let image = '';
      for (const entry of [...rated].sort((a, b) => b.rating - a.rating)) {
        const item = findItem(entry.type, entry.slug);
        if (item?.image) { image = `${origin}${item.image}`; break; }
      }
      const jsonLd = { '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: row.username, ...(bio ? { description: bio } : {}), url } };
      res.send(injectMeta(shell, { title, description, url, image, jsonLd }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/anime/:idOrSlug{/:title}', itemPage('anime'));
  app.get('/manga/:idOrSlug{/:title}', itemPage('manga'));

  app.get('/sitemap.xml', (req, res) => {
    const origin = originOf(req);
    const rows = [
      ...db.prepare('SELECT * FROM anime ORDER BY id ASC').all().map(rowToItem).map((item) => ({ type: 'anime', slug: item.slug, mal_id: item.malId, updated_at: item.updatedAt, item })),
      ...db.prepare('SELECT * FROM manga ORDER BY id ASC').all().map(mangaRowToItem).map((item) => ({ type: 'manga', slug: item.slug, mal_id: item.malId, updated_at: item.updatedAt, item })),
    ].filter((row) => !isSensitiveItem(row.item));
    const lastmod = (value) => {
      const date = new Date(String(value || '').replace(' ', 'T') + (String(value || '').includes('Z') ? '' : 'Z'));
      return Number.isNaN(date.getTime()) ? '' : `<lastmod>${date.toISOString().slice(0, 10)}</lastmod>`;
    };
    const fixed = ['/', ...Object.keys(DISCOVERY)].map((p) => `<url><loc>${escapeHtml(origin + p)}</loc></url>`);
    const items = rows.map((row) => `<url><loc>${escapeHtml(`${origin}/${row.type}/${row.mal_id ?? row.slug}`)}</loc>${lastmod(row.updated_at)}</url>`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...fixed, ...items].join('\n')}\n</urlset>\n`);
  });
};
