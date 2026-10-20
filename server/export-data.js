import './config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_DIR } from './db.js';
import { rowToItem } from './shape.js';
import { db } from './db.js';

// Regenerates public/data/*.json from the live database so the offline fallback
// (and the empty-database seed) never drift from admin edits.
export const exportData = () => {
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

  fs.writeFileSync(path.join(dataDir, 'anime.json'), `${JSON.stringify(listJson, null, 2)}\n`);
  fs.writeFileSync(path.join(dataDir, 'anime-details.json'), `${JSON.stringify(detailsJson, null, 2)}\n`);
  return items.length;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`export:data wrote ${exportData()} anime item(s) to public/data.`);
}
