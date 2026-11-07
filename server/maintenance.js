// Housekeeping so caches that grow with every visited title/person cannot fill the disk
// when the catalog has 100k+ titles: old cache rows and old proxied images are dropped.
import fs from 'node:fs';
import path from 'node:path';
import { db, SERVER_DIR } from './db.js';

const DAY = 86_400_000;
const EVERY_MS = 12 * 3600 * 1000;
const IMG_DIR = path.join(SERVER_DIR, 'xcache');
const IMG_KEEP = 15000;
const IMG_TRIGGER = 20000;

export const runMaintenance = () => {
  const now = Date.now();
  const drop = (sql, cutoff) => { try { db.prepare(sql).run(cutoff); } catch (error) { console.error('[maintenance]', error.message); } };
  drop('DELETE FROM title_extras WHERE fetched_at < ?', now - 45 * DAY);
  drop('DELETE FROM media_cache WHERE fetched_at < ?', now - 30 * DAY);
  drop('DELETE FROM franchise_cache WHERE built_at < ?', now - 60 * DAY);
  drop('DELETE FROM people_cache WHERE fetched_at < ?', now - 90 * DAY);
  try {
    const names = fs.readdirSync(IMG_DIR);
    if (names.length > IMG_TRIGGER) {
      const files = names.map((name) => ({ name, at: fs.statSync(path.join(IMG_DIR, name)).mtimeMs })).sort((a, b) => a.at - b.at);
      for (const file of files.slice(0, files.length - IMG_KEEP)) fs.rmSync(path.join(IMG_DIR, file.name), { force: true });
    }
  } catch (error) { console.error('[maintenance] image cache:', error.message); }
};

export const startMaintenance = () => {
  setTimeout(runMaintenance, 5 * 60_000).unref();
  setInterval(runMaintenance, EVERY_MS).unref();
};
