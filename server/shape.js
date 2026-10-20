// Converts between DB rows and the "merged catalog item" shape the React app already uses.
const parse = (text, fallback) => {
  try { return text == null ? fallback : JSON.parse(text); } catch { return fallback; }
};

const hasValues = (obj) => obj && Object.values(obj).some((value) => String(value ?? '').trim() !== '');

export const rowToItem = (row) => {
  const statistics = parse(row.statistics, null);
  return {
    id: row.id,
    malId: row.mal_id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    year: row.year,
    format: row.format,
    sampleScore: row.score ?? 0,
    ...(row.airing_day ? { airingDay: row.airing_day } : {}),
    genres: parse(row.genres, []),
    synopsis: row.synopsis,
    alternativeTitles: {
      synonyms: parse(row.alt_synonyms, []),
      japanese: row.alt_japanese,
      romaji: row.alt_romaji || '',
      english: row.alt_english,
    },
    information: parse(row.information, []),
    ...(hasValues(statistics) ? { statistics } : {}),
    availableAt: parse(row.available_at, []),
    resources: parse(row.resources, []),
    streamingPlatforms: parse(row.streaming_platforms, []),
    streamingNotice: row.streaming_notice,
    cover: row.cover,
    image: row.cover ? `/covers/${row.cover}` : '',
    updatedAt: row.updated_at,
  };
};

// Flattens a validated input object into DB column values.
export const inputToColumns = (input) => ({
  mal_id: input.malId ?? null,
  title: input.title,
  category: input.category,
  year: input.year,
  format: input.format,
  score: input.score ?? null,
  airing_day: input.airingDay || '',
  synopsis: input.synopsis,
  genres: JSON.stringify(input.genres),
  alt_synonyms: JSON.stringify(input.alternativeTitles.synonyms),
  alt_japanese: input.alternativeTitles.japanese,
  alt_romaji: input.alternativeTitles.romaji,
  alt_english: input.alternativeTitles.english,
  information: JSON.stringify(input.information),
  statistics: hasValues(input.statistics) ? JSON.stringify(input.statistics) : null,
  available_at: JSON.stringify(input.availableAt),
  resources: JSON.stringify(input.resources),
  streaming_platforms: JSON.stringify(input.streamingPlatforms),
  streaming_notice: input.streamingNotice,
});

export const slugify = (text) => String(text || '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

// Forgiving title matching shared by the live search: lowercase, strip Arabic
// diacritics, fold Alef / Yeh / Kaf variants, drop the tatweel and the
// zero-width characters so «فریرن» and «فريرن» compare equal.
export const foldTitle = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036F\u064B-\u0652]/g, '')
  .toLocaleLowerCase()
  .replace(/[\u0622\u0623\u0625]/g, '\u0627')
  .replace(/\u064A/g, '\u06CC')
  .replace(/\u0643/g, '\u06A9')
  .replace(/[\u0640\u200B\u200C\u200D\u200E\u200F]/g, '');
