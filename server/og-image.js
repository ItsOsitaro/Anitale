import fs from 'node:fs';
import path from 'node:path';
import { db, SERVER_DIR } from './db.js';
import { rowToItem } from './shape.js';
import { mangaRowToItem } from './repo.js';
import { isSensitiveItem } from './sensitive.js';
import { COVERS_DIR } from './images.js';

// Link-preview card for a title: GET /og/<anime|manga>/<slug>.png -> 1200x630 PNG (cover, title, year, score).
// Telegram/Bale/WhatsApp show it when the page is shared. Built once with sharp, kept on disk, and only drawn with
// Latin text (the server may have no Persian font). Sensitive titles and missing covers get a 404, and the page
// then falls back to the site logo (server/seo.js).
const CACHE_DIR = path.join(SERVER_DIR, 'cache', 'og');
const inflight = new Map();
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let sharpPromise = null;
const loadSharp = () => {
  sharpPromise ||= import('sharp').then((m) => { m.default.cache(false); m.default.concurrency(1); return m.default; }).catch(() => null);
  return sharpPromise;
};

// Two lines of at most ~26 characters, the second cut with an ellipsis.
const wrap = (title) => {
  const words = String(title).split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const last = lines.length - 1;
    if ((`${lines[last]} ${word}`).trim().length <= 26 || !lines[last]) lines[last] = `${lines[last]} ${word}`.trim();
    else if (lines.length < 2) lines.push(word);
    else { lines[1] = `${lines[1]} ${word}`; }
  }
  if (lines[1] && lines[1].length > 26) lines[1] = `${lines[1].slice(0, 25)}…`;
  return lines;
};

const draw = async (type, row, coverFile, target) => {
  const sharp = await loadSharp();
  if (!sharp) return false;
  const lines = wrap(row.title);
  const meta = [type === 'manga' ? 'Manga' : 'Anime', row.year, row.score ? `★ ${Number(row.score).toFixed(1)}` : ''].filter(Boolean).join('  ·  ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b1030"/><stop offset="1" stop-color="#8c1d43"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <text x="470" y="${lines[1] ? 250 : 290}" font-family="sans-serif" font-size="58" font-weight="700" fill="#fff6f9">${esc(lines[0])}</text>
    ${lines[1] ? `<text x="470" y="322" font-family="sans-serif" font-size="58" font-weight="700" fill="#fff6f9">${esc(lines[1])}</text>` : ''}
    <text x="470" y="${lines[1] ? 400 : 370}" font-family="sans-serif" font-size="34" fill="#f6c3d2">${esc(meta)}</text>
    <text x="470" y="560" font-family="sans-serif" font-size="40" font-weight="700" fill="#e8577a">Anitale</text>
  </svg>`;
  const cover = await sharp(coverFile).rotate().resize(330, 470, { fit: 'cover' }).png().toBuffer();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await sharp(Buffer.from(svg)).composite([{ input: cover, left: 90, top: 80 }]).png({ compressionLevel: 9 }).toFile(tmp);
  fs.renameSync(tmp, target);
  return true;
};

// Cover file of a row on disk, or ''.
const coverOf = (slug) => ['jpg', 'png', 'webp'].map((ext) => path.join(COVERS_DIR, `${slug}.${ext}`)).find((file) => fs.existsSync(file)) || '';

export const registerOgRoutes = (app) => {
  app.get('/og/:type/:slug.png', async (req, res) => {
    const { type, slug } = req.params;
    if (!['anime', 'manga'].includes(type) || !/^[\w-]{1,120}$/.test(slug)) { res.status(404).end(); return; }
    const row = db.prepare(`SELECT * FROM ${type} WHERE slug = ?`).get(slug);
    const item = row && (type === 'manga' ? mangaRowToItem(row) : rowToItem(row));
    const cover = row ? coverOf(slug) : '';
    if (!row || !cover || isSensitiveItem(item)) { res.status(404).end(); return; }
    const target = path.join(CACHE_DIR, `${type}-${slug}-${Math.round((row.score || 0) * 10)}-${Math.floor(fs.statSync(cover).mtimeMs / 1000)}.png`);
    try {
      if (!fs.existsSync(target)) {
        if (!inflight.has(target)) inflight.set(target, draw(type, row, cover, target).finally(() => inflight.delete(target)));
        if (!(await inflight.get(target))) { res.status(404).end(); return; }
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(target);
    } catch (error) {
      console.warn(`[og] ${slug}: ${error.message}`);
      res.status(404).end();
    }
  });
};

// Used by seo.js: the card URL when the title can have one, else the plain cover.
export const ogImageFor = (type, item, origin) => {
  if (!item?.image || isSensitiveItem(item)) return item?.image ? `${origin}${item.image}` : '';
  return `${origin}/og/${type}/${item.slug}.png`;
};
