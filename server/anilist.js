import './config.js';
import { fetch } from 'undici';
import { getDispatcher, viaProxy } from './proxy.js';

const BASE = process.env.ANILIST_URL || 'https://graphql.anilist.co'; // the override is for tests
const MIN_GAP_MS = 700; // AniList allows ~90 requests/minute
const timeoutMs = () => (viaProxy() ? 25_000 : 10_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message, status = 502, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// Serialises every AniList call with a minimum gap (mirrors tenrai.js queueing).
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

const gql = async (query, variables, retried = false) => {
  let response;
  try {
    response = await fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      dispatcher: getDispatcher(),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch {
    // Mirror the Tenrai failure path's tone (network flag, 502 — client i18n keys off `network`).
    throw fail('Cannot reach data provider (AniList). Check your internet/VPN, or set PROXY_URL in server/.env.', 502, { network: true });
  }
  if ((response.status === 429 || response.status >= 500) && !retried) {
    const retryAfter = Number(response.headers.get('retry-after')) || 1.5;
    await sleep(Math.min(retryAfter, 5) * 1000);
    return gql(query, variables, true);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // AniList takes the whole API down during severe incidents and answers 403
    // with an explanatory body — surface it as a known outage, not as a mystery.
    if (/temporarily disabled/i.test(text)) {
      throw fail('AniList has temporarily disabled its API (their current outage). Try again later, or add the title manually.', 503);
    }
    if (response.status === 404) throw fail('Not found', 404); // AniList answers an unknown user/title with a real 404
    throw fail(`AniList data provider returned HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.errors?.length) {
    const [err] = body.errors;
    if (err.status === 404 || /not found/i.test(err.message || '')) throw fail('Not found on MyAnimeList', 404);
    throw fail(err.message || 'AniList data provider error');
  }
  return body.data;
};

const FORMAT_LABELS = {
  TV: 'TV', TV_SHORT: 'TV', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music',
};
const STATUS_LABELS = {
  FINISHED: 'Finished Airing', RELEASING: 'Currently Airing', NOT_YET_RELEASED: 'Not yet aired',
  CANCELLED: 'Cancelled', HIATUS: 'On Hiatus',
};
const SOURCE_LABELS = {
  ORIGINAL: 'Original', MANGA: 'Manga', LIGHT_NOVEL: 'Light novel', WEB_NOVEL: 'Web novel',
  NOVEL: 'Novel', VISUAL_NOVEL: 'Visual novel', VIDEO_GAME: 'Video game', DOUJINSHI: 'Doujinshi',
  ONE_SHOT: 'One shot', OTHER: 'Other', ANIME: 'Anime',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Fallback search used when Tenrai is unreachable (see app.js). Returns the same shape as tenrai.searchAnime.
export const anilistSearch = async (query, mediaType = 'anime') => {
  const type = String(mediaType).toLowerCase() === 'manga' ? 'MANGA' : 'ANIME';
  const data = await enqueue(() => gql(`query ($s: String, $type: MediaType) {
    Page(perPage: 10) {
      media(search: $s, type: $type, sort: SEARCH_MATCH, isAdult: false) {
        idMal title { english romaji } format seasonYear startDate { year } coverImage { large }
      }
    }
  }`, { s: query, type }));
  return (data?.Page?.media || []).filter((m) => m.idMal).map((m) => ({
    malId: m.idMal,
    title: m.title?.english || m.title?.romaji || '',
    year: m.seasonYear ?? m.startDate?.year ?? null,
    type: FORMAT_LABELS[m.format] || m.format || '',
    imageUrl: m.coverImage?.large || '',
  }));
};

// Titles of the current season (anime) or recently started series (manga),
// used by the daily auto-import. Only rows with a MAL id come back.
export const anilistSeasonal = async ({ mediaType = 'anime', perPage = 40 } = {}) => {
  const now = new Date();
  const season = ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor(now.getUTCMonth() / 3)];
  if (String(mediaType).toLowerCase() === 'manga') {
    const since = new Date(now.getTime() - 45 * 86400000);
    const fuzzy = since.getUTCFullYear() * 10000 + (since.getUTCMonth() + 1) * 100 + since.getUTCDate();
    const data = await enqueue(() => gql(`query ($since: FuzzyDateInt, $perPage: Int) {
      Page(perPage: $perPage) { media(type: MANGA, startDate_greater: $since, sort: POPULARITY_DESC, isAdult: false, countryOfOrigin: JP) { idMal } }
    }`, { since: fuzzy, perPage }));
    return (data?.Page?.media || []).map((m) => m.idMal).filter(Boolean);
  }
  const data = await enqueue(() => gql(`query ($season: MediaSeason, $year: Int, $perPage: Int) {
    Page(perPage: $perPage) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false, format_in: [TV, MOVIE, ONA, OVA]) { idMal } }
  }`, { season, year: now.getUTCFullYear(), perPage }));
  return (data?.Page?.media || []).map((m) => m.idMal).filter(Boolean);
};

// Queue 26: discovery by facet (AniList Page query — the MAL-based API has no filterable
// search). Returns light preview rows; no MAL id => skipped.
export const anilistFacetSearch = async ({ mediaType = 'MANGA', genre, year, minScore, perPage = 30 }) => {
  if (genre && !/^[a-z0-9 -]{2,40}$/i.test(genre)) throw fail('Invalid genre filter', 400);
  // Caller may pass lowercase 'manga'/'anime' — normalize here so facet
  // discovery actually queries the requested media type.
  const type = String(mediaType).toUpperCase() === 'MANGA' ? 'MANGA' : 'ANIME';
  const data = await enqueue(() => gql(`query ($type: MediaType, $genre: String, $year: FuzzyDateInt, $score: Int, $perPage: Int) {
    Page(perPage: $perPage) {
      media(type: $type, genre: $genre, startDate_greater: $year, averageScore_greater: $score, sort: SCORE_DESC, isAdult: false) {
        idMal
        title { english romaji }
        format seasonYear startDate { year }
        genres averageScore
      }
    }
  }`, {
    type,
    genre: genre || undefined,
    // FuzzyDateInt expects the YYYYMMDD form (DD/00 treated like Jan 1 that year).
    year: Number(year) > 1900 ? Math.floor(Number(year)) * 10000 + 1 : undefined,
    score: Math.round(Number(minScore) * 10) > 0 ? Math.round(Number(minScore) * 10) : undefined,
    perPage,
  }));
  return (data?.Page?.media || [])
    .filter((m) => m.idMal)
    .map((m) => ({
      malId: m.idMal,
      title: m.title?.english || m.title?.romaji || `#${m.idMal}`,
      year: m.seasonYear ?? m.startDate?.year ?? '',
      category: Array.isArray(m.genres) && m.genres[0] ? m.genres[0] : '',
      score: m.averageScore != null ? Math.round(m.averageScore) / 10 : null,
    }));
};

// Fallback import used when Tenrai is unreachable. Maps AniList data straight to the
// admin draft shape (same keys as mapTenraiToDraft => { coverUrl, ...draft }).
const ANIME_FIELDS = `
  idMal
  title { english romaji native }
  synonyms genres
  format status source
  episodes duration season seasonYear
  startDate { year month day } endDate { year month day }
  averageScore popularity favourites
  rankings { rank type allTime context }
  nextAiringEpisode { airingAt }
  studios { nodes { name isAnimationStudio } }
  externalLinks { site type url }
  coverImage { extraLarge large }
  description
`;

// Shared mapper: one AniList "anime" Media object -> admin draft (with coverUrl).
// One batched query for up to ~50 ids — the same payloads anilistImport would
// One batched query for up to ~50 ids — the same payloads anilistImport would
// return per id, resolved in a single AniList round trip. Missing ids come
// back in `missing` (status 'Not found on MyAnimeList', like the single path).
export const anilistImportMany = async (malIds) => {
  const ids = [...new Set(malIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { found: new Map(), missing: [] };
  const data = await enqueue(() => gql(`query ($ids: [Int]) {
    Page(perPage: ${ids.length}) {
      media(idMal_in: $ids, type: ANIME, isAdult: false) { ${ANIME_FIELDS} }
    }
  }`, { ids }));
  const found = new Map((data?.Page?.media || []).filter((m) => m.idMal).map((m) => [m.idMal, mapAniListAnime(m)]));
  return { found, missing: ids.filter((id) => !found.has(id)) };
};

export const anilistImport = async (malId) => {
  const { found } = await anilistImportMany([malId]);
  const draft = found.get(Number(malId));
  if (!draft) throw fail('Not found on MyAnimeList', 404);
  return draft;
};

const mapAniListAnime = (m) => {
  const english = m.title?.english || '';
  const title = english || m.title?.romaji || '';
  const japanese = m.title?.native || '';
  const romaji = m.title?.romaji || '';

  // Weekly broadcast day, same semantics as the Tenrai draft:
  // airing (with a schedule) -> 'Mon'...'Sun' (JST), airing but unknown ->
  // undefined (keep stored day), anything else -> null (clear stored day).
  let airingDay;
  if (m.status === 'RELEASING') {
    airingDay = m.nextAiringEpisode?.airingAt
      ? new Date(m.nextAiringEpisode.airingAt * 1000).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Tokyo' })
      : undefined;
  } else if (m.status) {
    airingDay = null;
  }
  const genres = Array.isArray(m.genres) ? m.genres.filter(Boolean) : [];
  const year = m.seasonYear || m.startDate?.year || '';
  const premiered = m.season && year
    ? `${m.season[0]}${m.season.slice(1).toLowerCase()} ${year}` : '';

  const synonyms = [...(m.synonyms || []), m.title?.romaji || '']
    .filter(Boolean)
    .filter((v) => v !== title && v !== english && v !== japanese && v !== romaji);

  const synopsis = (m.description || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#?\w+;/g, (e) => ({ '&quot;': '"', '&#039;': "'", '&amp;': '&', '&mdash;': '—', '&ndash;': '–' }[e] || e))
    .trim();

  const row = (label, value) => ({ label, value: Array.isArray(value) ? value.join(', ') : String(value ?? '') });
  const date = (d) => (d && d.year ? `${MONTHS[(d.month || 1) - 1]} ${d.day || ''}, ${d.year}`.replace(/ ,/, ',') : '');
  const aired = m.startDate?.year
    ? (m.endDate?.year ? `${date(m.startDate)} to ${date(m.endDate)}` : date(m.startDate))
    : '';
  const studios = (m.studios?.nodes || []).filter((s) => s.isAnimationStudio).map((s) => s.name);
  const producers = (m.studios?.nodes || []).filter((s) => !s.isAnimationStudio).map((s) => s.name);
  const allTime = (type) => (m.rankings || []).find((r) => r.type === type && r.allTime && r.context === 'ALL');
  const httpOnly = (url) => (/^https?:\/\//i.test(url || '') ? url : '');

  const information = [
    row('Type', FORMAT_LABELS[m.format] || m.format),
    row('Episodes', m.episodes ?? 'Unknown'),
    row('Status', STATUS_LABELS[m.status] || m.status),
    row('Aired', aired),
    row('Premiered', premiered),
    row('Producers', producers),
    row('Studios', studios),
    row('Source', SOURCE_LABELS[m.source] || (m.source ? m.source[0] + m.source.slice(1).toLowerCase() : '')),
    row('Genres', genres),
    row('Duration', m.duration ? `${m.duration} min. per ep.` : ''),
    row('Rating', m.averageScore != null ? `${m.averageScore}%` : ''),
  ].filter((entry) => entry.value.trim() !== '');

  return {
    malId: m.idMal,
    title,
    slug: '',
    airingDay,
    category: genres[0] || FORMAT_LABELS[m.format] || m.format || '',
    year: String(year || ''),
    format: FORMAT_LABELS[m.format] || m.format || '',
    score: m.averageScore != null ? Math.round(m.averageScore) / 10 : null,
    synopsis,
    genres,
    alternativeTitles: { synonyms, japanese, romaji, english },
    information,
    statistics: {
      score: m.averageScore != null ? (Math.round(m.averageScore) / 10).toFixed(2) : '',
      scoredBy: '',
      ranked: allTime('RATED') ? `#${allTime('RATED').rank}` : '',
      popularity: m.popularity ? `#${m.popularity}` : '',
      members: m.popularity ? Number(m.popularity).toLocaleString('en-US') : '',
      favorites: m.favourites ? Number(m.favourites).toLocaleString('en-US') : '',
    },
    availableAt: [
      ...(m.idMal ? [{ label: 'MyAnimeList', href: `https://myanimelist.net/anime/${m.idMal}`, icon: 'M' }] : []),
      ...(m.externalLinks || []).filter((l) => httpOnly(l.url)).map((l) => ({ label: l.site, href: l.url, icon: '↗' })),
    ],
    resources: [],
    streamingPlatforms: [...new Set((m.externalLinks || []).filter((l) => l.type === 'STREAMING').map((l) => l.site))],
    streamingNotice: '',
    coverUrl: m.coverImage?.extraLarge || m.coverImage?.large || '',
  };
};

// Fallback manga import (Tenrai unreachable). Same draft keys as mapTenraiMangaToDraft.
const MANGA_FIELDS = `
  idMal
  title { english romaji native }
  synonyms genres format
  volumes chapters status
  averageScore favourites popularity
  startDate { year } endDate { year }
  externalLinks { site url }
  staff { edges { role node { name { full } } } }
  coverImage { extraLarge large }
  description
`;

// One AniList "manga" Media object -> bulk draft (with coverUrl).
const mapAniListManga = (m) => {
  const english = m.title?.english || '';
  const title = english || m.title?.romaji || '';
  const genres = Array.isArray(m.genres) ? m.genres.filter(Boolean) : [];
  const authors = (m.staff?.edges || []).filter((edge) => /original creator|author|story|art/i.test(edge.role || '')).map((edge) => edge.node?.name?.full).filter(Boolean);

  const synopsis = (m.description || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#?\w+;/g, (e) => ({ '&quot;': '"', '&#039;': "'", '&amp;': '&', '&mdash;': '-', '&ndash;': '-' }[e] || e))
    .trim();

  const row = (label, value) => ({ label, value: Array.isArray(value) ? value.join(', ') : String(value ?? '') });
  const information = [
    row('Type', m.format === 'NOVEL' ? 'Light novel' : (m.format || 'Manga')),
    row('Volumes', m.volumes ?? 'Unknown'),
    row('Chapters', m.chapters ?? 'Unknown'),
    row('Status', m.status ? (m.status === 'RELEASING' ? 'Publishing' : (m.status === 'FINISHED' ? 'Finished' : m.status)) : 'Publishing'),
    row('Published', m.startDate?.year ? (m.endDate?.year ? `From ${m.startDate.year} to ${m.endDate.year}` : `From ${m.startDate.year}`) : ''),
    row('Authors', authors),
    row('Genres', genres),
  ].filter((entry) => entry.value.trim() !== '');
  const httpOnly = (url) => (/^https?:\/\//i.test(url || '') ? url : '');

  return {
    malId: m.idMal,
    title,
    category: genres[0] || 'Manga',
    year: m.startDate?.year ? String(m.startDate.year) : '',
    format: 'Manga',
    score: m.averageScore != null ? Math.round(m.averageScore) / 10 : null,
    publicationStatus: m.status === 'RELEASING' ? 'Publishing' : m.status === 'FINISHED' ? 'Finished' : (m.status || ''),
    chapters: m.chapters ?? null,
    genres,
    synopsis,
    information,
    availableAt: [
      ...(m.idMal ? [{ label: 'MyAnimeList', href: `https://myanimelist.net/manga/${m.idMal}`, icon: 'M' }] : []),
      ...(m.externalLinks || []).filter((l) => httpOnly(l.url)).map((l) => ({ label: l.site, href: httpOnly(l.url), icon: '↗' })),
    ],
    coverUrl: m.coverImage?.extraLarge || m.coverImage?.large || '',
  };
};

// Same key set as anilistMangaDraft, but resolved for many ids in ONE query.
export const anilistMangaDraftMany = async (malIds) => {
  const ids = [...new Set(malIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { found: new Map(), missing: [] };
  const data = await enqueue(() => gql(`query ($ids: [Int]) {
    Page(perPage: ${ids.length}) {
      media(idMal_in: $ids, type: MANGA) { ${MANGA_FIELDS} }
    }
  }`, { ids }));
  const found = new Map((data?.Page?.media || []).filter((m) => m.idMal).map((m) => [m.idMal, mapAniListManga(m)]));
  return { found, missing: ids.filter((id) => !found.has(id)) };
};

export const anilistMangaDraft = async (malId) => {
  const { found } = await anilistMangaDraftMany([malId]);
  const draft = found.get(Number(malId));
  if (!draft) throw fail('Not found on MyAnimeList', 404);
  return draft;
};

// ---- A member's public AniList list (for the "import my list" page) ---------------------------------
const LIST_QUERY = `query ($name: String, $type: MediaType) {
  MediaListCollection(userName: $name, type: $type) {
    user { mediaListOptions { scoreFormat } }
    lists { entries { status score progress repeat startedAt { year month day } completedAt { year month day } media { idMal title { romaji english } } } }
  }
}`;
const STATUS = { CURRENT: 'watching', REPEATING: 'watching', COMPLETED: 'completed', PAUSED: 'on_hold', DROPPED: 'dropped', PLANNING: 'planned' };
// AniList lets each member pick a score scale; everything is brought to our 1-10 whole numbers (0 = not scored).
const toTen = (score, format) => {
  const n = Number(score) || 0;
  if (n <= 0) return 0;
  if (format === 'POINT_100') return Math.max(1, Math.min(10, Math.round(n / 10)));
  if (format === 'POINT_5') return Math.min(10, Math.round(n * 2));
  if (format === 'POINT_3') return [0, 3, 6, 9][Math.min(3, Math.round(n))];
  return Math.max(1, Math.min(10, Math.round(n))); // POINT_10 and POINT_10_DECIMAL
};
const pad2 = (n) => String(n).padStart(2, '0');
const dateOf = (d) => (d?.year && d?.month && d?.day ? `${d.year}-${pad2(d.month)}-${pad2(d.day)}` : null);

export const anilistUserList = async (name) => {
  const items = [];
  let withoutMalId = 0;
  for (const [type, mediaType] of [['anime', 'ANIME'], ['manga', 'MANGA']]) {
    const data = await enqueue(() => gql(LIST_QUERY, { name, type: mediaType }));
    const collection = data?.MediaListCollection;
    const format = collection?.user?.mediaListOptions?.scoreFormat;
    const seen = new Set();
    for (const list of collection?.lists || []) {
      for (const entry of list.entries || []) {
        const malId = entry.media?.idMal;
        if (!malId) { withoutMalId += 1; continue; }
        if (seen.has(malId)) continue; // a title can sit in a custom list as well as its status list
        seen.add(malId);
        const score = toTen(entry.score, format);
        items.push({
          type, malId, status: STATUS[entry.status] || 'planned',
          ...(score ? { score } : {}),
          progress: Math.min(5000, Number(entry.progress) || 0),
          startDate: dateOf(entry.startedAt), finishDate: dateOf(entry.completedAt),
          rewatch: Math.min(99, Number(entry.repeat) || 0),
          title: String(entry.media?.title?.english || entry.media?.title?.romaji || '').slice(0, 200),
        });
      }
    }
  }
  return { items, withoutMalId };
};
