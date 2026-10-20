import './config.js';
import { fetch, ProxyAgent } from 'undici';

const BASE = 'https://graphql.anilist.co';
const dispatcher = process.env.PROXY_URL ? new ProxyAgent(process.env.PROXY_URL) : undefined;
const MIN_GAP_MS = 700; // AniList allows ~90 requests/minute
const TIMEOUT_MS = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message, status = 502, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// Serialises every AniList call with a minimum gap (mirrors jikan.js queueing).
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
      dispatcher,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Same user-visible message as the Jikan failure path (client i18n matches on it).
    throw fail('Cannot reach Jikan. Check your internet/VPN, or set PROXY_URL in server/.env.', 502, { network: true });
  }
  if ((response.status === 429 || response.status >= 500) && !retried) {
    const retryAfter = Number(response.headers.get('retry-after')) || 1.5;
    await sleep(Math.min(retryAfter, 5) * 1000);
    return gql(query, variables, true);
  }
  if (!response.ok) throw fail(`AniList data provider returned HTTP ${response.status}`);
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

// Fallback search used when Jikan is unreachable (see app.js). Returns the same shape as jikan.searchAnime.
export const anilistSearch = async (query) => {
  const data = await enqueue(() => gql(`query ($s: String) {
    Page(perPage: 10) {
      media(search: $s, type: ANIME, sort: SEARCH_MATCH) {
        idMal title { english romaji } format seasonYear startDate { year } coverImage { large }
      }
    }
  }`, { s: query }));
  return (data?.Page?.media || []).filter((m) => m.idMal).map((m) => ({
    malId: m.idMal,
    title: m.title?.english || m.title?.romaji || '',
    year: m.seasonYear ?? m.startDate?.year ?? null,
    type: FORMAT_LABELS[m.format] || m.format || '',
    imageUrl: m.coverImage?.large || '',
  }));
};

// Queue 26: discovery by facet (AniList Page query — Jikan has no filterable
// search). Returns light preview rows; no MAL id => skipped.
export const anilistFacetSearch = async ({ mediaType = 'MANGA', genre, year, minScore, perPage = 30 }) => {
  if (genre && !/^[a-z0-9 -]{2,40}$/i.test(genre)) throw fail('Invalid genre filter', 400);
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
    type: mediaType === 'MANGA' ? 'MANGA' : 'ANIME',
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

// Fallback import used when Jikan is unreachable. Maps AniList data straight to the
// admin draft shape (same keys as mapJikanToDraft => { coverUrl, ...draft }).
export const anilistImport = async (malId) => {
  const data = await enqueue(() => gql(`query ($idMal: Int) {
    Media(idMal: $idMal, type: ANIME) {
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
    }
  }`, { idMal: Number(malId) }));

  const m = data?.Media;
  if (!m || !m.idMal) throw fail('Not found on MyAnimeList', 404);

  const english = m.title?.english || '';
  const title = english || m.title?.romaji || '';
  const japanese = m.title?.native || '';
  const romaji = m.title?.romaji || '';

  // Weekly broadcast day, same semantics as the Jikan draft:
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

// Fallback manga import (Jikan unreachable). Same draft keys as mapJikanMangaToDraft.
export const anilistMangaDraft = async (malId) => {
  const data = await enqueue(() => gql(`query ($idMal: Int) {
    Media(idMal: $idMal, type: MANGA) {
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
    }
  }`, { idMal: Number(malId) }));

  const m = data?.Media;
  if (!m || !m.idMal) throw fail('Not found on MyAnimeList', 404);

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
