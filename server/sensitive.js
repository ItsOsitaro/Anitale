// "Sensitive" titles: ecchi / hentai / erotica genres, or an Rx (hentai) rating.
// The site hides them by default. Keep this in sync with src/lib/catalog-rules.js.
const GENRES = new Set(['hentai', 'ecchi', 'erotica']);

export const isSensitiveItem = (item) => {
  if ((item?.genres || []).some((genre) => GENRES.has(String(genre).trim().toLowerCase()))) return true;
  const rating = (item?.information || []).find((row) => String(row?.label).toLowerCase() === 'rating');
  return Boolean(rating && /^\s*rx\b|hentai/i.test(String(rating.value)));
};
