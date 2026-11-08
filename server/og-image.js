import fs from 'node:fs';
import path from 'node:path';
import { db, SERVER_DIR, ROOT_DIR } from './db.js';
import { rowToItem } from './shape.js';
import { mangaRowToItem } from './repo.js';
import { isSensitiveItem } from './sensitive.js';
import { COVERS_DIR } from './images.js';
// Link-preview card for a title: GET /og/<anime|manga>/<slug>.png -> 1200x630 PNG (cover + site logo, no text: the
// server has no fonts installed). Built once with sharp and kept on disk. Sensitive titles and titles without a cover
// get a 404, and the page then falls back to the plain cover or logo (server/seo.js).
const CACHE_DIR = path.join(SERVER_DIR, 'cache', 'og');
const inflight = new Map();

let sharpPromise = null;
const loadSharp = () => {
  sharpPromise ||= import('sharp').then((m) => { m.default.cache(false); m.default.concurrency(1); return m.default; }).catch(() => null);
  return sharpPromise;
};

const LOGO = path.join(ROOT_DIR, 'public', 'logo-512.png');

const draw = async (type, row, coverFile, target) => {
  const sharp = await loadSharp();
  if (!sharp) return false;
  // No text on purpose: the server has no fonts installed (text came out as empty boxes), and the cover usually
  // carries the title anyway. Gradient + cover + the site logo.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b1030"/><stop offset="1" stop-color="#8c1d43"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/>
  </svg>`;
  const cover = await sharp(coverFile).rotate().resize(380, 540, { fit: 'cover' }).png().toBuffer();
  const layers = [{ input: cover, left: 150, top: 45 }];
  if (fs.existsSync(LOGO)) layers.push({ input: await sharp(LOGO).resize(300, 300, { fit: 'inside' }).png().toBuffer(), left: 700, top: 165 });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await sharp(Buffer.from(svg)).composite(layers).png({ compressionLevel: 9 }).toFile(tmp);
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
    const target = path.join(CACHE_DIR, `v2-${type}-${slug}-${Math.floor(fs.statSync(cover).mtimeMs / 1000)}.png`);
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
