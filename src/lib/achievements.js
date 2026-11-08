// Light "level" badges on a profile, worked out from numbers the profile already has (no new server data).
// Each series has a few thresholds; the level is how many were passed, and the bar shows the way to the next one.
const SERIES = [
  { id: 'completed', tiers: [1, 10, 50, 100, 250], pick: ({ all }) => all.filter(({ entry }) => entry.status === 'completed').length },
  { id: 'days', tiers: [1, 7, 30, 100], pick: ({ insights }) => Math.floor(insights.daysWatched) },
  { id: 'rated', tiers: [1, 10, 50, 100], pick: ({ all }) => all.filter(({ entry }) => entry.rating != null).length },
  { id: 'genres', tiers: [5, 10, 15, 20], pick: ({ all }) => new Set(all.filter(({ entry }) => entry.status !== 'dropped').flatMap(({ item }) => item?.genres || [])).size },
  { id: 'manga', tiers: [1, 10, 50], pick: ({ all }) => all.filter(({ mediaType, entry }) => mediaType === 'manga' && entry.status === 'completed').length },
  { id: 'reviews', tiers: [1, 5, 20], pick: ({ reviews }) => reviews.length },
];

export const computeAchievements = (insights, reviews = []) => {
  const context = { insights, all: insights.all, reviews };
  return SERIES.map(({ id, tiers, pick }) => {
    const value = pick(context);
    const level = tiers.filter((target) => value >= target).length;
    const next = tiers[level] ?? null;
    const previous = level ? tiers[level - 1] : 0;
    return { id, value, level, levels: tiers.length, next, progress: next == null ? 1 : Math.max(0, Math.min(1, (value - previous) / (next - previous))) };
  });
};
