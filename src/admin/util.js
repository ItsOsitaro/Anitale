export const errText = (error, t) => {
  if (error?.message === 'NETWORK') return t('network');
  if (/Cannot reach Jikan/i.test(error?.message || '')) return t('jikanNetwork');
  if (error?.status === 429 && /Too many login/i.test(error.message)) return t('tooMany');
  return error?.message || String(error);
};

export const INFO_FIELDS = ['Type', 'Episodes', 'Status', 'Aired', 'Premiered', 'Broadcast', 'Producers', 'Licensors', 'Studios', 'Source', 'Duration', 'Rating'];
export const STAT_FIELDS = [['score', 'sScore'], ['scoredBy', 'sScoredBy'], ['ranked', 'sRanked'], ['popularity', 'sPopularity'], ['members', 'sMembers'], ['favorites', 'sFavorites']];

export const emptyForm = () => ({
  title: '', slug: '', malId: null, format: 'TV', category: '', year: '', score: '', airingDay: '', synopsis: '', genres: [],
  synonyms: [], japanese: '', romaji: '', english: '',
  info: Object.fromEntries(INFO_FIELDS.map((name) => [name, ''])), extraRows: [],
  stats: { score: '', scoredBy: '', ranked: '', popularity: '', members: '', favorites: '' },
  platforms: [], streamingNotice: '', links: [], resources: [], resourceIcons: {},
  tempCover: '', image: '',
});

// API item / Jikan draft -> form state
export const toForm = (item) => {
  const form = emptyForm();
  const rows = Array.isArray(item.information) ? item.information : [];
  const extraRows = [];
  for (const row of rows) {
    if (INFO_FIELDS.includes(row.label)) form.info[row.label] = row.value;
    else if (row.label !== 'Genres') extraRows.push(row);
  }
  return {
    ...form,
    title: item.title || '', slug: item.slug || '', malId: item.malId ?? null, format: item.format || '', category: item.category || '',
    year: item.year || '', score: item.sampleScore ?? item.score ?? '', airingDay: item.airingDay || '', synopsis: item.synopsis || '', genres: item.genres || [],
    synonyms: item.alternativeTitles?.synonyms || [], japanese: item.alternativeTitles?.japanese || '', romaji: item.alternativeTitles?.romaji || '', english: item.alternativeTitles?.english || '',
    extraRows,
    stats: { ...form.stats, ...(item.statistics || {}) },
    platforms: item.streamingPlatforms || [], streamingNotice: item.streamingNotice || '',
    links: (item.availableAt || []).map((entry) => ({ label: entry.label, href: entry.href || '', icon: entry.icon || '' })),
    resources: (item.resources || []).map((entry) => entry.label),
    resourceIcons: Object.fromEntries((item.resources || []).map((entry) => [entry.label, entry.icon || ''])),
    image: item.image || '',
  };
};

// form state -> API payload
export const toPayload = (form, { omitTempCover = false } = {}) => {
  const info = { ...form.info, Type: form.info.Type || form.format };
  const row = (label, value) => ({ label, value: String(value ?? '').trim() });
  const information = [
    ...INFO_FIELDS.slice(0, 10).map((label) => row(label, info[label])),
    row('Genres', form.genres.join(', ')),
    ...INFO_FIELDS.slice(10).map((label) => row(label, info[label])),
    ...form.extraRows,
  ].filter((entry) => entry.value !== '');
  const hasStats = Object.values(form.stats).some((value) => String(value ?? '').trim() !== '');
  return {
    title: form.title,
    slug: form.slug.trim(),
    malId: form.malId || null,
    category: form.category,
    year: String(form.year ?? ''),
    format: form.format,
    score: form.score === '' || form.score == null ? null : Number(form.score),
    airingDay: form.airingDay || '',
    synopsis: form.synopsis,
    genres: form.genres,
    alternativeTitles: { synonyms: form.synonyms, japanese: form.japanese, romaji: form.romaji, english: form.english },
    information,
    statistics: hasStats ? form.stats : null,
    availableAt: form.links.filter((entry) => entry.label.trim()).map((entry) => ({ label: entry.label, href: entry.href.trim(), icon: entry.icon || '' })),
    resources: form.resources.map((label) => ({ label, icon: form.resourceIcons[label] || '' })),
    streamingPlatforms: form.platforms,
    streamingNotice: form.streamingNotice,
    ...(form.tempCover && !omitTempCover ? { tempCover: form.tempCover } : {}),
  };
};
