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
createApp().listen(port, '127.0.0.1', () => {
  console.log(`API + site on http://127.0.0.1:${port}   (admin: /admin)`);
});
