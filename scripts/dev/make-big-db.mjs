// Synthetic big catalog for load tests:  DB_FILE=/tmp/big.db node scripts/dev/make-big-db.mjs [anime=50000] [manga=100000]
import '../../server/config.js';
import { db } from '../../server/db.js';

const animeN = Number(process.argv[2]) || 50000;
const mangaN = Number(process.argv[3]) || 100000;
const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Ecchi', 'Isekai', 'School', 'Mecha', 'Music'];
const STUDIOS = Array.from({ length: 400 }, (_, i) => `Studio ${i}`);
const WORDS = ['dragon', 'star', 'night', 'love', 'sword', 'academy', 'hero', 'maid', 'king', 'blue', 'summer', 'world', 'demon', 'girl', 'magic', 'last', 'tale', 'beyond', 'princess', 'cat'];
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (list, k) => Array.from({ length: k }, () => list[rnd(list.length)]).filter((v, i, a) => a.indexOf(v) === i);
const title = (i) => `${WORDS[rnd(20)]} ${WORDS[rnd(20)]} ${WORDS[rnd(20)]} ${i}`;
const synopsis = 'Lorem ipsum dolor sit amet synopsis text. '.repeat(18);

const insA = db.prepare(`INSERT OR IGNORE INTO anime (slug, mal_id, title, category, year, format, score, synopsis, genres, alt_synonyms, alt_japanese, alt_romaji, alt_english, information, statistics, available_at, resources, streaming_platforms, cover)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insM = db.prepare(`INSERT OR IGNORE INTO manga (slug, mal_id, title, category, year, format, score, publication_status, chapters, genres, synopsis, cover, members)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
db.exec('BEGIN');
for (let i = 1; i <= animeN; i += 1) {
  const g = pick(GENRES, 3);
  const members = Math.floor(5_000_000 / (1 + i / 20));
  const t = title(i);
  insA.run(`anime-${i}`, 100000 + i, t, g[0], String(1990 + rnd(36)), 'TV', 5 + Math.random() * 4, synopsis, JSON.stringify(g), JSON.stringify([`${t} syn`, `${t} alt`]), '日本語', t, t,
    JSON.stringify([{ label: 'Type', value: 'TV' }, { label: 'Episodes', value: String(1 + rnd(50)) }, { label: 'Status', value: 'Finished Airing' }, { label: 'Studios', value: STUDIOS[rnd(400)] }, { label: 'Producers', value: 'Prod A, Prod B' }, { label: 'Rating', value: 'PG-13' }]),
    JSON.stringify({ score: '7.5', scoredBy: `${members} users`, ranked: `#${i}`, popularity: `#${i}`, members: members.toLocaleString('en-US'), favorites: '10' }),
    JSON.stringify([{ label: 'MyAnimeList', href: `https://myanimelist.net/anime/${i}`, icon: 'M' }]), '[]', '["Crunchyroll"]', `anime-${i}.jpg`);
}
for (let i = 1; i <= mangaN; i += 1) {
  const g = pick(GENRES, 3);
  insM.run(`manga-${i}`, 200000 + i, title(i), g[0], String(1990 + rnd(36)), 'Manga', 5 + Math.random() * 4, 'Finished', 10 + rnd(300), JSON.stringify(g), JSON.stringify(synopsis), `manga-${i}.jpg`, Math.floor(2_000_000 / (1 + i / 20)));
}
db.exec('COMMIT');
console.log(`anime ${db.prepare('SELECT COUNT(*) n FROM anime').get().n}, manga ${db.prepare('SELECT COUNT(*) n FROM manga').get().n}`);
