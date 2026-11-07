import './config.js';
import { fetch } from 'undici';
import { getDispatcher, viaProxy } from './proxy.js';

// Tenrai (https://tenrai.org) — free, read-only REST API for MyAnimeList data that
// uses the classic MyAnimeList v4 field names. It is the primary data source; AniList is the fallback.
//
// Rules taken from the Tenrai docs (api.tenrai.org/llms.txt):
//  - base URL https://api.tenrai.org/v1, no sign-up. Success body is { data, pagination? }.
//  - public limit: 4 requests/second and 120/minute per IP -> every call goes through one
//    queue with a gap well under that; on 429 wait for the Retry-After value.
//  - a persistent 403 means the IP tripped anti-abuse; 401 means a bad X-Server-Key.
//  - a search without matches is 200 with an empty `data` array (not 404).
//  - only send the parameters the endpoint lists (here: q, limit, sfw).
//  - fields marked null/optional may be null; lists may be empty.
const BASE = (process.env.TENRAI_BASE_URL || 'https://api.tenrai.org/v1').replace(/\/$/, '');
const MIN_GAP_MS = 600; // ~100 requests/minute, below the 120/minute and 4/second public limits
const timeoutMs = () => Number(process.env.TENRAI_TIMEOUT_MS) || (viaProxy() ? 25_000 : 7_000);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RETRY_WAIT_S = 10;

// Circuit breaker: when Tenrai is unreachable or refusing us (blocked, VPN off, 403/5xx), every
// import would otherwise pay the full timeout before the AniList fallback runs. After a failure
// we skip Tenrai instantly and probe again with exponential backoff (60s -> 10min).
const DOWN_TTL_INITIAL_MS = 60_000;
const DOWN_TTL_MAX_MS = 10 * 60_000;
let downUntil = 0;
let downTtl = DOWN_TTL_INITIAL_MS;
const OPEN_MESSAGE = 'Tenrai is unreachable right now (recently failed). Skipping straight to the AniList fallback.';

const isTenraiDown = () => Date.now() < downUntil || String(process.env.TENRAI_DISABLED) === '1';
const noteTenraiDown = () => {
  downUntil = Date.now() + downTtl;
  downTtl = Math.min(downTtl * 2, DOWN_TTL_MAX_MS);
};
const noteTenraiUp = () => {
  downUntil = 0;
  downTtl = DOWN_TTL_INITIAL_MS;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message, status = 502, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// Serialises every Tenrai call and keeps a minimum gap between them.
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

const headers = () => ({
  accept: 'application/json',
  ...(process.env.TENRAI_SERVER_KEY ? { 'x-server-key': process.env.TENRAI_SERVER_KEY } : {}),
});

// Tenrai error bodies: { status, type, message, error, path } — surface the message when present.
const errorDetail = async (response) => {
  try { const body = await response.json(); return String(body?.message || body?.error || '').slice(0, 160); } catch { return ''; }
};

const request = async (url, retried = false) => {
  let response;
  try {
    response = await fetch(url, { dispatcher: getDispatcher(), signal: AbortSignal.timeout(timeoutMs()), headers: headers() });
  } catch {
    noteTenraiDown();
    throw fail('Cannot reach Tenrai. Check your internet/VPN, or set PROXY_URL in server/.env.', 502, { network: true });
  }
  // Rate limit or a transient server error: one retry, honoring Retry-After (seconds).
  if ((response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504 || response.status === 500) && !retried) {
    const retryAfter = Number(response.headers.get('retry-after')) || 1.5;
    await sleep(Math.min(retryAfter, MAX_RETRY_WAIT_S) * 1000);
    lastCall = Date.now();
    return request(url, true);
  }
  if (response.status === 404) { noteTenraiUp(); throw fail('Not found on MyAnimeList', 404); }
  if (response.status === 429) { noteTenraiUp(); throw fail('Tenrai rate limit reached, try again in a moment', 429); }
  if (response.status === 400) { noteTenraiUp(); throw fail(`Tenrai rejected the request: ${await errorDetail(response) || 'bad parameters'}`, 400); }
  // 401 (bad key), 403 (temporarily blocked) and 5xx mean Tenrai is not usable for us right now:
  // flag it as a network failure so callers fall back to AniList.
  if (response.status === 401 || response.status === 403 || response.status >= 500) {
    noteTenraiDown();
    const detail = await errorDetail(response);
    throw fail(`Tenrai is not available (HTTP ${response.status}${detail ? `: ${detail}` : ''}).`, 502, { network: true });
  }
  if (!response.ok) { noteTenraiUp(); throw fail(`Tenrai returned HTTP ${response.status}`); }
  let body;
  try { body = await response.json(); } catch {
    noteTenraiDown();
    throw fail('Tenrai returned an unreadable answer.', 502, { network: true });
  }
  noteTenraiUp();
  return body;
};

const tenraiGet = (path) => {
  // Fail fast while the breaker is open — no fetch, no timeout, no queue gap.
  if (isTenraiDown()) return Promise.reject(fail(OPEN_MESSAGE, 502, { network: true }));
  return enqueue(() => request(`${BASE}${path}`));
};

// Detail endpoints answer { data: {...} }; a missing/odd body is treated as "not usable".
const detail = (body) => {
  if (!body?.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw fail('Tenrai returned no data for this title.', 502, { network: true });
  return body.data;
};
const list = (body) => (Array.isArray(body?.data) ? body.data : []);

export const searchAnime = async (query) => {
  const body = await tenraiGet(`/anime?q=${encodeURIComponent(String(query).slice(0, 300))}&limit=10&sfw=true`);
  return list(body).filter((item) => item?.mal_id).map((item) => ({
    malId: item.mal_id,
    title: item.title_english || item.title || '',
    year: item.year || item.aired?.prop?.from?.year || null,
    type: item.type || '',
    imageUrl: item.images?.jpg?.image_url || '',
  }));
};

export const searchManga = async (query) => {
  const body = await tenraiGet(`/manga?q=${encodeURIComponent(String(query).slice(0, 300))}&limit=10&sfw=true`);
  return list(body).filter((item) => item?.mal_id).map((item) => ({
    malId: item.mal_id,
    title: item.title_english || item.title || '',
    year: item.published?.prop?.from?.year || null,
    type: item.type || '',
    imageUrl: item.images?.jpg?.image_url || '',
  }));
};

// MAL ids of the anime airing this season (used by the daily auto-import). Hentai/Erotica are skipped.
export const seasonalAnimeIds = async () => {
  const body = await tenraiGet('/seasons/now?limit=25');
  return list(body)
    .filter((item) => item?.mal_id && ['TV', 'Movie', 'ONA', 'OVA'].includes(item.type)
      && !names(item.genres).some((name) => ['hentai', 'erotica'].includes(String(name).toLowerCase())))
    .map((item) => item.mal_id);
};

// Generic read used by the public title-extras cache (characters, relations, recommendations, videos, themes).
export const tenraiGetRaw = tenraiGet;
export const fetchAnimeFull = async (malId) => detail(await tenraiGet(`/anime/${Number(malId)}/full`));
export const fetchMangaFull = async (malId) => detail(await tenraiGet(`/manga/${Number(malId)}/full`));
// Exposed for the bulk-import fast path: when the breaker is open (or disabled via TENRAI_DISABLED),
// batched AniList fetching is used instead of per-item Tenrai probes.
export const tenraiCircuitOpen = isTenraiDown;

export const downloadImage = async (url) => {
  let response;
  try {
    response = await fetch(url, { dispatcher: getDispatcher(), signal: AbortSignal.timeout(timeoutMs()) });
  } catch {
    throw new Error('Could not download the cover image (network/VPN?)');
  }
  if (!response.ok) throw new Error(`Cover download failed (HTTP ${response.status})`);
  if (!(response.headers.get('content-type') || '').startsWith('image/')) throw new Error('Cover URL did not return an image');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Cover image is too large');
  return buffer;
};

const names = (list) => (Array.isArray(list) ? list.map((entry) => entry?.name).filter(Boolean) : []);
// Tenrai puts Ecchi / Erotica / Hentai inside `genres` (older MAL APIs kept them in `explicit_genres`).
// They are kept on purpose: the sensitive-content filter (server/sensitive.js and
// src/lib/catalog-rules.js) recognises a title by exactly these genres.
const publicNames = (list) => names(list);
const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
const number = (value) => (value == null ? '' : Number(value).toLocaleString('en-US'));
const unique = (list) => [...new Set(list.filter(Boolean))];

// Maps a Tenrai "anime full" payload to our form/API shape. Returns a draft (nothing is saved).
export const mapTenraiToDraft = (data) => {
  const english = data.title_english || '';
  const title = english || data.title || '';
  const japanese = data.title_japanese || '';
  // The main `title` field is the romaji title (MAL default).
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
  const genres = unique([...publicNames(data.genres), ...publicNames(data.themes)]);
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
    row('Demographic', names(data.demographics)),
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

// Maps a Tenrai "manga full" payload to the bulk-import draft (manga-table shape).
export const mapTenraiMangaToDraft = (data) => {
  const english = data.title_english || '';
  const title = english || data.title || '';
  const genres = unique([...publicNames(data.genres), ...publicNames(data.themes)]);
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
    members: Number(data.members) || 0,
    genres,
    synopsis: data.synopsis || '',
    information,
    availableAt: data.url ? [{ label: 'MyAnimeList', href: data.url, icon: 'M' }] : [],
    coverUrl: data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || '',
  };
};
