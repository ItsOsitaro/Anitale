// Titles outside the "core" catalog (the most popular few thousand that load up front) are
// fetched on demand — lists, relations, stacks and deep links — and kept here for the session.
// Requests made in the same tick are batched into one /api/titles call.
import { normalizeAnime } from '../catalog.js';

const store = { anime: [], manga: [] };
const seen = { anime: new Set(), manga: new Set() };
const asked = new Set();
const settled = new Set();
let version = 0;
const listeners = new Set();
let queue = { anime: { slugs: new Set(), malIds: new Set() }, manga: { slugs: new Set(), malIds: new Set() } };
let timer = null;

const notify = () => { version += 1; listeners.forEach((fn) => fn()); };
export const subscribeTitles = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const titlesVersion = () => version;
export const extraTitles = (type) => store[type];
export const titleSettled = (type, kind, key) => settled.has(`${type}|${kind}|${key}`);

const BATCH = 100;
const run = async (type, kind, keys) => {
  for (let i = 0; i < keys.length; i += BATCH) {
    const part = keys.slice(i, i + BATCH);
    try {
      const res = await fetch(`/api/titles?type=${type}&${kind === 'slug' ? 'slugs' : 'malIds'}=${encodeURIComponent(part.join(','))}`);
      const items = res.ok ? await res.json() : [];
      for (const raw of items) {
        if (seen[type].has(raw.slug)) continue;
        seen[type].add(raw.slug);
        store[type].push(type === 'anime' ? normalizeAnime(raw) : raw);
      }
    } catch { /* offline: the keys stay unresolved */ }
    part.forEach((key) => settled.add(`${type}|${kind}|${key}`));
    notify();
  }
};

const flush = () => {
  timer = null;
  const current = queue;
  queue = { anime: { slugs: new Set(), malIds: new Set() }, manga: { slugs: new Set(), malIds: new Set() } };
  for (const type of ['anime', 'manga']) {
    if (current[type].slugs.size) run(type, 'slug', [...current[type].slugs]);
    if (current[type].malIds.size) run(type, 'mal', [...current[type].malIds]);
  }
};

// Ask for titles by slug or MAL id; keys already requested are skipped.
export const requestTitles = (type, { slugs = [], malIds = [] }) => {
  let any = false;
  for (const slug of slugs) {
    const key = `${type}|slug|${slug}`;
    if (slug && !asked.has(key)) { asked.add(key); queue[type].slugs.add(slug); any = true; }
  }
  for (const id of malIds) {
    const key = `${type}|mal|${id}`;
    if (id && !asked.has(key)) { asked.add(key); queue[type].malIds.add(String(id)); any = true; }
  }
  if (any && !timer) timer = setTimeout(flush, 30);
};
