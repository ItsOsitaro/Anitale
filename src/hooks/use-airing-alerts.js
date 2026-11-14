import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCatalog } from '@/catalog-context.jsx';
import { currentWeekday } from '@/catalog.js';
import { entryTotal } from '@/components/mobile/entry-utils';
import { useUser } from '@/user.jsx';
import { useNotificationPrefs } from '@/hooks/use-notification-prefs';

// «Airing today» alerts: anime on the viewer's «watching» list whose weekly
// airing day is today. "Seen" marks live in localStorage per calendar day, so
// the badge clears when you act on a title and comes back tomorrow.
const KEY = 'anitaleAiringSeen';
const listeners = new Set();
let cache = null;

const todayStamp = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, viewer's clock

const read = () => {
  const stamp = todayStamp();
  if (cache && cache.date === stamp) return cache;
  let marks = {};
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.date === stamp && saved.marks && typeof saved.marks === 'object') marks = saved.marks;
  } catch { /* storage unavailable */ }
  cache = { date: stamp, marks };
  return cache;
};

// kind: 'watched' (you logged the episode) or 'later' (dismissed for today).
const writeSeen = (slug, kind) => {
  const state = read();
  if (state.marks[slug] === kind) return;
  cache = { date: state.date, marks: { ...state.marks, [slug]: kind } };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

export function useAiringAlerts() {
  const user = useUser();
  const catalog = useCatalog();
  const seen = useSyncExternalStore(subscribe, read, read);
  const today = currentWeekday();

  const { isOn } = useNotificationPrefs(Boolean(user?.me));
  const episodeOn = isOn('episode');

  const items = useMemo(() => {
    if (!episodeOn) return []; // the member switched episode alerts off in the account page
    const bySlug = new Map((catalog || []).map((item) => [item.slug, item]));
    const list = [];
    for (const entry of user?.entries?.anime || []) {
      if (entry.status !== 'watching') continue;
      const item = bySlug.get(entry.slug);
      if (!item || item.airingDay !== today) continue;
      const total = entryTotal(item, 'anime');
      const progress = entry.progress ?? 0;
      if (total && progress >= total) continue; // nothing left to watch
      list.push({ entry, item, nextEpisode: progress + 1, total, progress, mark: seen.marks[entry.slug] || null, seen: Boolean(seen.marks[entry.slug]) });
    }
    return list;
  }, [catalog, user?.entries?.anime, today, seen, episodeOn]);

  const unread = items.filter((row) => !row.seen).length;
  const markSeen = useCallback((slug) => writeSeen(slug, 'later'), []);
  const markWatched = useCallback(async (row) => {
    writeSeen(row.entry.slug, 'watched');
    await user.setProgress('anime', row.entry.slug, row.nextEpisode);
  }, [user]);

  return { items, unread, markSeen, markWatched };
}
