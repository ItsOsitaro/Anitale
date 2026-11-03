import { useSyncExternalStore } from 'react';

// ---------- Sensitive-content filter ----------
// Ecchi / hentai / erotica genres, or an Rx rating. Hidden by default; a visitor
// can switch the filter off (kept per device). Keep in sync with server/sensitive.js.
const GENRES = new Set(['hentai', 'ecchi', 'erotica']);
const verdicts = new WeakMap();

export const isSensitive = (item) => {
  if (!item || typeof item !== 'object') return false;
  if (verdicts.has(item)) return verdicts.get(item);
  const byGenre = (item.genres || []).some((genre) => GENRES.has(String(genre).trim().toLowerCase()));
  const rating = (item.information || []).find((row) => String(row?.label).toLowerCase() === 'rating');
  const verdict = byGenre || Boolean(rating && /^\s*rx\b|hentai/i.test(String(rating.value)));
  verdicts.set(item, verdict);
  return verdict;
};

const KEY = 'anitale.showSensitive';
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

export const getShowSensitive = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};
export const setShowSensitive = (value) => {
  try { if (value) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* private mode: the choice lasts until reload */ }
  notify();
};
const subscribe = (listener) => {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => { listeners.delete(listener); window.removeEventListener('storage', listener); };
};
export const useShowSensitive = () => useSyncExternalStore(subscribe, getShowSensitive, () => false);

// ---------- Bayesian ranking ----------
// WR = v/(v+m) * S + m/(v+m) * C
//   S = the title's source score, v = how many people scored it,
//   m = votes needed before the title's own score counts as much as the average,
//   C = the average score of the whole list.
// A 9.5 from a handful of votes can't beat a 8.9 backed by hundreds of thousands.
export const MIN_VOTES = 1000;

const count = (text) => Number(String(text ?? '').replace(/[^\d]/g, '')) || 0;
const votesOf = (item) => count(item.statistics?.scoredBy) || count(item.statistics?.members);

// Returns the items (same order) with weightedScore and rank added. Unscored titles get no rank.
export const rankCatalog = (items) => {
  const scored = items.filter((item) => Number(item.sampleScore) > 0);
  if (!scored.length) return items;
  const mean = scored.reduce((sum, item) => sum + Number(item.sampleScore), 0) / scored.length;
  const weighted = new Map(scored.map((item) => {
    // No vote count on record (hand-added titles): count as m votes, i.e. half weight.
    const v = votesOf(item) || MIN_VOTES;
    const s = Number(item.sampleScore);
    return [item, (v / (v + MIN_VOTES)) * s + (MIN_VOTES / (v + MIN_VOTES)) * mean];
  }));
  const order = [...scored].sort((a, b) => weighted.get(b) - weighted.get(a) || b.sampleScore - a.sampleScore);
  const rankOf = new Map(order.map((item, index) => [item, index + 1]));
  return items.map((item) => (weighted.has(item)
    ? { ...item, weightedScore: Math.round(weighted.get(item) * 100) / 100, rank: rankOf.get(item) }
    : item));
};

// Sort key used by every "top" list: weighted score first, plain score as a fallback.
export const rankKey = (item) => -(item.weightedScore ?? item.sampleScore ?? 0);

// MAL member count (how many people keep the title on a list) — the "most popular" key.
export const membersOf = (item) => Number(String(item?.statistics?.members ?? '').replace(/[^\d]/g, '')) || 0;
