// On-demand cover thumbnails: /covers/<name>?w=240 -> a WebP no wider than 240px.
// Results are cached on disk (server/cache/covers/<width>/<name>.webp) and rebuilt
// when the source file changes. Any failure falls back to the original file, so a
// missing/broken sharp can never break images.
import fs from 'node:fs';
import path from 'node:path';
import { SERVER_DIR } from './db.js';

const WIDTHS = new Set([120, 240, 360, 480, 720]);
const NAME = /^[\w.-]+\.(jpg|png|webp)$/i;
const CACHE_DIR = path.join(SERVER_DIR, 'cache', 'covers');
const inflight = new Map();

let sharpPromise = null;
const loadSharp = () => {
  sharpPromise ||= import('sharp').then((m) => {
    const sharp = m.default;
    // Small VPS: no libvips tile cache, one worker.
    sharp.cache(false);
    sharp.concurrency(1);
    return sharp;
  }).catch(() => null);
  return sharpPromise;
};

const build = async (source, target, width) => {
  const sharp = await loadSharp();
  if (!sharp) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(tmp);
  fs.renameSync(tmp, target);
  return true;
};

export const coverResizeHandler = (coversDir) => async (req, res, next) => {
  const width = Number(req.query.w);
  if (!req.query.w || !WIDTHS.has(width) || !NAME.test(req.params.name)) return next();
  const source = path.join(coversDir, req.params.name);
  try {
    const srcStat = fs.statSync(source, { throwIfNoEntry: false });
    if (!srcStat?.isFile()) return next();
    const target = path.join(CACHE_DIR, String(width), `${req.params.name}.webp`);
    const cached = fs.statSync(target, { throwIfNoEntry: false });
    if (!cached || cached.mtimeMs < srcStat.mtimeMs) {
      let job = inflight.get(target);
      if (!job) {
        job = build(source, target, width).finally(() => inflight.delete(target));
        inflight.set(target, job);
      }
      if (!(await job)) return next();
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('image/webp').sendFile(target);
  } catch (error) {
    console.error(`[covers] resize ${req.params.name}:`, error.message);
    next();
  }
};
