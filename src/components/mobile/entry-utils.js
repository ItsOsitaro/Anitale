// Episode / chapter total used by the progress bars on the account pages.
// Anime reports its episode count in the information rows; manga has a column.
export function entryTotal(item, mediaType) {
  if (!item) return null;
  if (mediaType === 'manga') return item.chapters ?? null;
  const info = Array.isArray(item.information) ? item.information : [];
  const raw = (info.find((row) => row.label === 'Episodes')?.value || '').replace(/[^\d]/g, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function progressPercent(progress, total) {
  if (progress == null) return 0;
  if (!total) return 100;
  return Math.min(100, Math.round((progress / total) * 100));
}

export const initialOf = (name) => String(name || '؟').trim().charAt(0).toUpperCase();
