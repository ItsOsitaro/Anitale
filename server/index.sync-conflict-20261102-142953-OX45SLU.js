import './config.js';
import { createApp } from './app.js';
import { seedIfEmpty, seedMangaIfEmpty } from './seed.js';
import { cleanupTemp } from './images.js';

const added = seedIfEmpty();
if (added) console.log(`[seed] Imported ${added} titles from public/data/*.json`);
const mangaAdded = seedMangaIfEmpty();
if (mangaAdded) console.log(`[seed] Imported ${mangaAdded} manga entries from public/data/manga.json`);
cleanupTemp();

const port = Number(process.env.PORT) || 3000;
// HOST=0.0.0.0 opens the site to the local network (phone/other PCs); the
// default keeps the dev loop bound to loopback only.
const host = process.env.HOST || '127.0.0.1';
createApp().listen(port, host, () => {
  console.log(`API + site on http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}   (admin: /admin)`);
});
