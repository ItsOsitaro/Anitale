import './config.js';
import { fetch, ProxyAgent } from 'undici';

const BASE = (process.env.JIKAN_BASE_URL || 'https://api.jikan.moe/v4').replace(/\/$/, '');
const dispatcher = process.env.PROXY_URL ? new ProxyAgent(process.env.PROXY_URL) : undefined;
const MIN_GAP_MS = 400; // Jikan allows 3 requests/second and 60/minute
const TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message, status = 502, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// Serialises every Jikan call and keeps a minimum gap between them.
let chain = Promise.resolve();
let lastCall = 0;
const enqueue = (task) => {
  const run = chain.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return task();
  });
  chain = run.catch(() => {});
  return run;
};

const request = async (url, retried = false) => {
  let response;
  try {
    response = await fetch(url, { dispatcher, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
  } catch {
    throw fail('Cannot reach Jikan. Check your internet/VPN, or set PROXY_URL in server/.env.', 502, { network: true });
  }
  if ((response.status === 429 || response.status >= 500) && !retried) {
    const retryAfter = Number(response.headers.get('retry-after')) || 1.5;
    await sleep(Math.min(retryAfter, 5) * 1000);
    lastCall = Date.now();
    return request(url, true);
  }
  if (response.status === 404) throw fail('Not found on MyAnimeList', 404);
  if (response.status === 429) throw fail('Jikan rate limit reached, try again in a moment', 429);
  if (!response.ok) throw fail(`Jikan returned HTTP ${response.status}`);
  return response.json();
};

const jikanGet = (path) => enqueue(() => request(`${BASE}${path}`));

export const searchAnime = async (query) => {
  const body = await jikanGet(`/anime?q=${encodeURIComponent(query)}&limit=10`);
  return (body.data || []).map((item) => ({
    malId: item.mal_id,
    title: item.title_english || item.title,
    year: item.year || item.aired?.prop?.from?.year || null,
    type: item.type || '',
    imageUrl: item.images?.jpg?.image_url || '',
  }));
};

export const fetchAnimeFull = async (malId) => (await jikanGet(`/anime/${Number(malId)}/full`)).data;
export const fetchMangaFull = async (malId) => (await jikanGet(`/manga/${Number(malId)}/full`)).data;

export const downloadImage = async (url) => {
  let response;
  try {
    response = await fetch(url, { dispatcher, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error('Could not download the cover image (network/VPN?)');
  }
  if (!response.ok) throw new Error(`Cover download failed (HTTP ${response.status})`);
  if (!(response.headers.get('content-type') || '').startsWith('image/')) throw new Error('Cover URL did not return an image');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Cover image is too large');
  return buffer;
};

const names = (list) => (Array.isArray(list) ? list.map((entry) => entry.name).filter(Boolean) : []);
const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
const number = (value) => (value == null ? '' : Number(value).toLocaleString('en-US'));
const unique = (list) => [...new Set(list.filter(Boolean))];

// Maps a Jikan "anime full" payload to our form/API shape. Returns a draft (nothing is saved).
export const mapJikanToDraft = (data) => {
  const english = data.title_english || '';
  const title = english || data.title || '';
  const japanese = data.title_japanese || '';
  // Jikan's main `title` field is the romaji title.
  const romaji = data.title_romaji || data.title || '';

  // Weekly broadcast day (JST). Semantics for the refresh flow:
  // - currently airing with known day -> 'Mon'...'Sun'
  // - unknown while airing -> undefined (keep the stored day)
  // - not airing -> null (the stored day is cleared)
  const BROADCAST_DAYS = { mondays: 'Mon', tuesdays: 'Tue', wednesdays: 'Wed', thursdays: 'Thu', fridays: 'Fri', saturdays: 'Sat', sundays: 'Sun' };
  let airingDay;
  if (data.status === 'Currently Airing') {
    airingDay = BROADCAST_DAYS[String(data.broadcast?.day || '').toLowerCase()] ?? undefined;
  } else if (data.status) {
    airingDay = null;
  }
  const genres = unique([...names(data.genres), ...names(data.themes)]);
  const year = data.year || data.aired?.prop?.from?.year || '';
  const premiered = data.season && year ? `${cap(data.season)} ${year}` : '';

  const synonyms = unique([...(data.title_synonyms || []), data.title])
    .filter((value) => value !== title && value !== english && value !== japanese && value !== romaji);

  const row = (label, value) => ({ label, value: Array.isArray(value) ? value.join(', ') : String(value ?? '') });
  const information = [
    row('Type', data.type),
    row('Episodes', data.episodes ?? 'Unknown'),
    row('Status', data.status),
    row('Aired', data.aired?.string),
    row('Premiered', premiered),
    row('Broadcast', data.broadcast?.string),
    row('Producers', names(data.producers)),
    row('Licensors', names(data.licensors)),
    row('Studios', names(data.studios)),
    row('Source', data.source),
    row('Genres', genres),
    row('Duration', data.duration),
    row('Rating', data.rating),
  ].filter((entry) => entry.value.trim() !== '');

  const streaming = Array.isArray(data.streaming) ? data.streaming : [];
  const external = Array.isArray(data.external) ? data.external : [];
  const httpOnly = (url) => (/^https?:\/\//i.test(url || '') ? url : '');

  return {
    malId: data.mal_id,
    title,
    slug: '',
    airingDay,
    category: genres[0] || data.type || '',
    year: String(year || ''),
    format: data.type || '',
    score: data.score ?? null,
    synopsis: (data.synopsis || '').replace(/\n*\[Written by MAL Rewrite\]\s*$/i, '').trim(),
    genres,
    alternativeTitles: { synonyms, japanese, romaji, english },
    information,
    statistics: {
      score: data.score != null ? Number(data.score).toFixed(2) : '',
      scoredBy: data.scored_by ? `${number(data.scored_by)} users` : '',
      ranked: data.rank ? `#${data.rank}` : '',
      popularity: data.popularity ? `#${data.popularity}` : '',
      members: number(data.members),
      favorites: number(data.favorites),
    },
    availableAt: [
      ...(httpOnly(data.url) ? [{ label: 'MyAnimeList', href: data.url, icon: 'M' }] : []),
      ...external.filter((entry) => httpOnly(entry.url)).map((entry) => ({ label: entry.name, href: entry.url, icon: '↗' })),
    ],
    resources: [],
    streamingPlatforms: unique(streaming.map((entry) => entry.name)),
    streamingNotice: '',
    coverUrl: data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || data.images?.webp?.large_image_url || '',
  };
};

// Maps a Jikan "manga full" payload to the bulk-import draft (manga-table shape).
export const mapJikanMangaToDraft = (data) => {
  const english = data.title_english || '';
  const title = english || data.title || '';
  const genres = unique([...names(data.genres), ...names(data.themes)]);
  const year = data.published?.prop?.from?.year || '';
  const authors = names(data.authors);
  const row = (label, value) => ({ label, value: Array.isArray(value) ? value.join(', ') : String(value ?? '') });
  const information = [
    row('Type', data.type),
    row('Volumes', data.volumes ?? 'Unknown'),
    row('Chapters', data.chapters ?? 'Unknown'),
    row('Status', data.status),
    row('Published', data.published?.string),
    row('Authors', authors),
    row('Serialization', names(data.serializations)),
    row('Genres', genres),
    row('Demographic', names(data.demographics)),
  ].filter((entry) => entry.value.trim() !== '');

  return {
    malId: data.mal_id,
    title,
    category: genres[0] || data.type || '',
    year: String(year || ''),
    format: 'Manga',
    score: data.score ?? null,
    publicationStatus: data.status || '',
    chapters: data.chapters ?? null,
    genres,
    synopsis: data.synopsis || '',
    information,
    availableAt: data.url ? [{ label: 'MyAnimeList', href: data.url, icon: 'M' }] : [],
    coverUrl: data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || '',
  };
};
