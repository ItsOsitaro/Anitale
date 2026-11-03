// MyAnimeList files its tags under three kinds: genres, themes and demographics.
// The catalog stores them in one flat `genres` list, so the kind is recovered from
// the name (these sets are fixed on MAL). Anything unknown counts as a genre.
const THEMES = new Set([
  'adult cast', 'anthropomorphic', 'cgdct', 'childcare', 'combat sports', 'crossdressing', 'delinquents', 'detective', 'educational',
  'gag humor', 'gore', 'harem', 'high stakes game', 'historical', 'idols (female)', 'idols (male)', 'isekai', 'iyashikei',
  'love polygon', 'love status quo', 'magical sex shift', 'mahou shoujo', 'martial arts', 'mecha', 'medical', 'memoir', 'military',
  'music', 'mythology', 'organized crime', 'otaku culture', 'parody', 'performing arts', 'pets', 'psychological', 'racing',
  'reincarnation', 'reverse harem', 'romantic subtext', 'samurai', 'school', 'showbiz', 'space', 'strategy game', 'super power',
  'survival', 'team sports', 'time travel', 'urban fantasy', 'vampire', 'video game', 'villainess', 'visual arts', 'workplace',
]);
const DEMOGRAPHICS = new Set(['josei', 'kids', 'seinen', 'shoujo', 'shounen']);

export const KINDS = ['genre', 'theme', 'demographic'];

export const genreKind = (name) => {
  const key = String(name || '').trim().toLowerCase();
  if (DEMOGRAPHICS.has(key)) return 'demographic';
  if (THEMES.has(key)) return 'theme';
  return 'genre';
};

// { genre: [...], theme: [...], demographic: [...] } keeping the original order.
export const splitGenres = (names = []) => {
  const groups = { genre: [], theme: [], demographic: [] };
  for (const name of names) {
    const list = groups[genreKind(name)];
    if (!list.includes(name)) list.push(name);
  }
  return groups;
};

// Replaces the single "Genres" row of a title's information list with separate
// Genres / Themes / Demographic rows (merging an existing "Demographic" row).
export const splitInfoRows = (rows = []) => {
  const genreRow = rows.find((row) => row.label === 'Genres' || row.label === 'ژانرها');
  if (!genreRow || !genreRow.value) return rows;
  const names = String(genreRow.value).split(/\s*[,،]\s*/).filter(Boolean);
  const groups = splitGenres(names);
  const existingDemo = rows.find((row) => row.label === 'Demographic');
  for (const name of String(existingDemo?.value || '').split(/\s*[,،]\s*/).filter(Boolean)) {
    if (!groups.demographic.includes(name)) groups.demographic.push(name);
  }
  const joined = (list) => list.join(', ');
  const out = [];
  for (const row of rows) {
    if (row === existingDemo) continue;
    if (row === genreRow) {
      out.push({ ...row, value: joined(groups.genre) });
      if (groups.theme.length) out.push({ label: 'Themes', value: joined(groups.theme) });
      if (groups.demographic.length) out.push({ label: 'Demographic', value: joined(groups.demographic) });
    } else out.push(row);
  }
  return out;
};
