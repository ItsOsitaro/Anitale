import './config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_DIR, db } from './db.js';
import { rowToItem } from './shape.js';
import { listManga } from './repo.js';

// Atomic write: land the bytes on <target>.tmp first, then a same-volume
// rename — a crash mid-write can never leave a truncated JSON behind.
const writeJsonAtomic = (target, value) => {
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, target);
};

// Regenerates public/data/*.json from the live database so the offline fallback
// (and the empty-database seed) never drift from admin edits. A write failure
// is logged but not rethrown: export runs inside already-committed mutation
// handlers and must not turn a saved change into a 500.
// On Vercel (serverless) the bundle is read-only and static /data/*.json is
// served from the deployment snapshot, so the regenerating write is skipped.
export const exportData = () => {
  if (process.env.VERCEL) return null;
  try {
    const dataDir = path.join(ROOT_DIR, 'public', 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    const rows = db.prepare('SELECT * FROM anime ORDER BY id ASC').all();
    const items = rows.map(rowToItem);
    const listJson = items.map(({ alternativeTitles, information, statistics, availableAt, resources, streamingPlatforms, streamingNotice, image, cover, id, malId, ...entry }) => entry);
    const detailsJson = items.map((item) => ({
      slug: item.slug,
      alternativeTitles: item.alternativeTitles,
      information: item.information,
      ...(item.statistics ? { statistics: item.statistics } : {}),
      availableAt: item.availableAt,
      resources: item.resources,
      streamingPlatforms: item.streamingPlatforms,
      ...(item.streamingNotice ? { streamingNotice: item.streamingNotice } : {}),
    }));
    // Manga mirrors GET /api/manga exactly (listManga already returns the API shape).
    const mangaJson = listManga();

    writeJsonAtomic(path.join(dataDir, 'anime.json'), listJson);
    writeJsonAtomic(path.join(dataDir, 'anime-details.json'), detailsJson);
    writeJsonAtomic(path.join(dataDir, 'manga.json'), mangaJson);
    return items.length;
  } catch (error) {
    console.error('[export] Exporting public/data failed:', error);
    return null;
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`export:data wrote ${exportData()} anime item(s) to public/data.`);
}
