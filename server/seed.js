import './config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVERS_DIR, ROOT_DIR } from './db.js';
import { animeInput } from './schemas.js';
import { countAnime, countManga, getMangaBySlug, getBySlug, insertAnime, insertManga } from './repo.js';

const DATA_DIR = path.join(ROOT_DIR, 'public', 'data');
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch { return []; }
};

// Imports the original static JSON catalog. Safe to run repeatedly: existing slugs are skipped.
export const seedFromJson = () => {
  const anime = readJson('anime.json');
  const details = new Map(readJson('anime-details.json').map((entry) => [entry.slug, entry]));  let added = 0;
  for (const item of anime) {
    if (getBySlug(item.slug)) continue;
    const extra = details.get(item.slug) || {};
    const input = animeInput.parse({
      title: item.title,
      category: item.category,
      year: item.year,
      format: item.format,
      score: item.sampleScore ?? null,
      airingDay: item.airingDay || '',
      synopsis: item.synopsis,
      genres: item.genres || [],
      alternativeTitles: { synonyms: [], japanese: '', english: '', ...(extra.alternativeTitles || item.alternativeTitles) },
      information: extra.information || item.information || [],
      statistics: extra.statistics || item.statistics || null,
      availableAt: (extra.availableAt || item.availableAt || []).map((entry) => ({ icon: '', ...entry })),
      resources: (extra.resources || item.resources || []).map((entry) => ({ icon: '', ...entry })),
      streamingPlatforms: extra.streamingPlatforms || item.streamingPlatforms || [],
      streamingNotice: extra.streamingNotice || item.streamingNotice || '',
    });
    const cover = ['png', 'jpg', 'webp'].map((ext) => `${item.slug}.${ext}`).find((name) => fs.existsSync(path.join(COVERS_DIR, name))) || '';
    insertAnime(item.slug, input, cover);
    added += 1;
  }
  return added;
};

export const seedIfEmpty = () => (countAnime() === 0 ? seedFromJson() : 0);

export const seedMangaIfEmpty = () => {
  if (countManga() > 0) return 0;
  const manga = readJson('manga.json');
  let added = 0;
  for (const item of manga) {
    if (getMangaBySlug(item.slug)) continue;
    insertManga(item);
    added += 1;
  }  return added;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Seed finished: ${seedFromJson()} new title(s) added, ${countAnime()} total.`);
}
