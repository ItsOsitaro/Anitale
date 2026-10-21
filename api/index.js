// Vercel serverless entry. The full Express app (API + covers + admin) runs
// inside a Node function whose filesystem is read-only, so a writable copy of
// the bundled SQLite database is staged in /tmp BEFORE server/db.js evaluates
// (db.js reads DB_FILE at import time). State written into that copy lives for
// the lifetime of a warm instance — it is the cloud demo trade-off; the
// committed data.db snapshot is the source of truth per deployment.
// Local development keeps using server/index.js and is untouched by this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.resolve(here, '..');

if (process.env.VERCEL) {
  const bundledDb = path.join(taskRoot, 'server', 'data.db');
  const tmpDb = '/tmp/anitale-data.db';
  try {
    fs.copyFileSync(bundledDb, tmpDb);
    process.env.DB_FILE = tmpDb;
  } catch (error) {
    console.error('[api] failed to stage the bundled database:', error.message);
  }
}

const { seedIfEmpty, seedMangaIfEmpty } = await import('../server/seed.js');
const added = seedIfEmpty();
if (added) console.log(`[api seed] imported ${added} titles from public/data/*.json`);
const mangaAdded = seedMangaIfEmpty();
if (mangaAdded) console.log(`[api seed] imported ${mangaAdded} manga entries from public/data/manga.json`);

const { cleanupTemp } = await import('../server/images.js');
// On Vercel the bundled covers folder is read-only; stage writable mirrors of
// the paths images.js writes into (covers dir is filled from the bundle,
// temp covers are short-lived by design).
cleanupTemp();
const { stageBundledCovers } = await import('../server/images.js');
if (process.env.VERCEL) stageBundledCovers();

const { createApp } = await import('../server/app.js');

export default createApp();
