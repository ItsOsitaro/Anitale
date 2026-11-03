import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ---------- Site-account API ----------
const request = async (method, url, body) => {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const error = new Error('NETWORK');
    error.status = 0;
    throw error;
  }
  let data = null;
  try { data = await response.json(); } catch { /* no body */ }
  if (!response.ok) {
    const error = new Error(data?.error || response.statusText);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
};

export const userApi = {
  me: () => request('GET', '/api/user/me'),
  register: (payload) => request('POST', '/api/user/register', payload),
  login: (username, password) => request('POST', '/api/user/login', { username, password }),
  logout: () => request('POST', '/api/user/logout'),
  updateBio: (bio) => request('PUT', '/api/user/me', { bio }),
  updateAvatar: (bloom) => request('PUT', '/api/user/me', { avatarColor: bloom }),
  addEntry: (mediaType, slug, status = 'watching', note, rating, progress) => request('PUT', '/api/user/entries', { mediaType, slug, status, ...(note !== undefined ? { note } : {}), ...(rating !== undefined ? { rating } : {}), ...(progress !== undefined ? { progress } : {}) }),
  removeEntry: (mediaType, slug) => request('DELETE', `/api/user/entries/${mediaType}/${encodeURIComponent(slug)}`),
  publicProfile: (username) => request('GET', `/api/users/${encodeURIComponent(username)}`),
  follow: (username) => request('POST', `/api/users/${encodeURIComponent(username)}/follow`),
  unfollow: (username) => request('DELETE', `/api/users/${encodeURIComponent(username)}/follow`),
  feed: () => request('GET', '/api/feed'),
  // Queue 23: shared titles between the viewer and the users they follow.
  commonLists: () => request('GET', '/api/user/common-lists'),
};

const LIST_KEYS = { anime: 'malAnimeList', manga: 'malMangaList' };
const GUEST_DEFAULT = 'watching';

// Guest localStorage format: [{ slug, status, added }]. Lists saved by older
// versions were bare slug strings — those come back as «watching» entries.
export const readGuestEntries = (mediaType) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIST_KEYS[mediaType]) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (typeof entry === 'string') return { slug: entry, status: GUEST_DEFAULT, added: null, note: '', rating: null, progress: null };
        return { slug: String(entry?.slug || ''), status: entry?.status || GUEST_DEFAULT, added: entry?.added || null, note: entry?.note || '', rating: entry?.rating ?? null, progress: entry?.progress ?? null };
      })
      .filter((entry) => entry.slug);
  } catch {
    return [];
  }
};

export const readGuestSlugs = (mediaType) => readGuestEntries(mediaType).map((entry) => entry.slug);

const writeGuestEntries = (mediaType, list) => {
  try { localStorage.setItem(LIST_KEYS[mediaType], JSON.stringify(list)); } catch { /* ignore */ }
};

// Logged-in lists are mirrored back to localStorage (with their statuses) so
// the guest state after logout picks up exactly where the account left off.
const mirrorToLocalStorage = (entries) => {
  for (const mediaType of ['anime', 'manga']) {
    writeGuestEntries(mediaType, entries[mediaType].map((entry) => ({ slug: entry.slug, status: entry.status, note: entry.note || '', rating: entry.rating ?? null, progress: entry.progress ?? null, added: entry.added || null })));
  }
};

const normalize = (raw) => ({
  anime: (raw?.anime || []).map((entry) => ({
    slug: typeof entry === 'string' ? entry : entry.slug,
    status: typeof entry === 'string' ? 'watching' : (entry.status || 'watching'),
    note: typeof entry === 'string' ? '' : (entry.note || ''),
    rating: typeof entry === 'string' ? null : (entry.rating ?? null),
    progress: typeof entry === 'string' ? null : (entry.progress ?? null),
    added: typeof entry === 'string' ? null : (entry.added || null),
  })),
  manga: (raw?.manga || []).map((entry) => ({
    slug: typeof entry === 'string' ? entry : entry.slug,
    status: typeof entry === 'string' ? 'watching' : (entry.status || 'watching'),
    note: typeof entry === 'string' ? '' : (entry.note || ''),
    rating: typeof entry === 'string' ? null : (entry.rating ?? null),
    progress: typeof entry === 'string' ? null : (entry.progress ?? null),
    added: typeof entry === 'string' ? null : (entry.added || null),
  })),
});

export const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

// Converts a guest's localStorage lists into real server entries after login/register,
// keeping the status the guest had chosen locally.
const migrateGuestLists = async () => {
  for (const mediaType of ['anime', 'manga']) {
    for (const entry of readGuestEntries(mediaType)) {
      try { await userApi.addEntry(mediaType, entry.slug, entry.status); } catch { /* keep going */ }
    }
  }
};

export function UserProvider({ children }) {
  const [me, setMe] = useState(null);
  const [checked, setChecked] = useState(false);
  // Guests read straight from localStorage so the UI is usable on first paint;
  // refresh() replaces this with server data once the session is known.
  const [entries, setEntries] = useState(() => ({
    anime: readGuestEntries('anime'),
    manga: readGuestEntries('manga'),
  }));

  const refresh = useCallback(async (migrate = false) => {
    if (migrate) await migrateGuestLists();
    try {
      const { user, entries: serverEntries } = await userApi.me();
      setMe(user || null);
      const normalized = normalize(serverEntries);
      setEntries(normalized);
      if (user) mirrorToLocalStorage(normalized);
      return user;
    } catch (error) {
      // Only a 401 means we are signed out; a network hiccup should keep the
      // current state instead of wiping the signed-in user.
      if (error?.status === 401) {
        setMe(null);
        // Not logged in — fall back to the guest's localStorage lists (statuses kept).
        setEntries({ anime: readGuestEntries('anime'), manga: readGuestEntries('manga') });
      }
      return null;
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Toggle one item on/off the given list; guests stay on localStorage.
  const toggle = useCallback(async (mediaType, slug) => {
    if (!me) {
      const saved = readGuestEntries(mediaType);
      const existing = saved.find((entry) => entry.slug === slug);
      const next = existing
        ? saved.filter((entry) => entry.slug !== slug)
        : [...saved, { slug, status: GUEST_DEFAULT, added: null }];
      writeGuestEntries(mediaType, next);
      setEntries((current) => ({
        ...current,
        [mediaType]: next.map((entry) => current[mediaType].find((e) => e.slug === entry.slug) || entry),
      }));
      return { saved: !existing };
    }
    const has = entries[mediaType].some((entry) => entry.slug === slug);
    setEntries((current) => ({
      ...current,
      [mediaType]: has
        ? current[mediaType].filter((entry) => entry.slug !== slug)
        : [{ slug, status: 'watching', note: '', rating: null, progress: null, added: null }, ...current[mediaType]],
    }));
    mirrorToLocalStorage({
      ...entries,
      [mediaType]: has
        ? entries[mediaType].filter((entry) => entry.slug !== slug)
        : [{ slug, status: 'watching', note: '', rating: null, progress: null, added: null }, ...entries[mediaType]],
    });
    try {
      const updated = has ? await userApi.removeEntry(mediaType, slug) : await userApi.addEntry(mediaType, slug);
      const normalized = normalize(updated);
      setEntries(normalized);
      return { saved: !has };
    } catch {
      await refresh(); // resync on failure
      return { saved: !has };
    }
  }, [me, entries, refresh]);

  // Set (or change) the status of an already-saved entry — same PUT endpoint,
  // the server upserts the status without adding a duplicate row. Guests keep
  // their status in localStorage only.
  const setStatus = useCallback(async (mediaType, slug, status) => {
    setEntries((current) => ({
      ...current,
      [mediaType]: current[mediaType].map((entry) => (entry.slug === slug ? { ...entry, status } : entry)),
    }));
    if (!me) {
      writeGuestEntries(mediaType, readGuestEntries(mediaType).map((entry) => (entry.slug === slug ? { ...entry, status } : entry)));
      return { saved: true };
    }
    try {
      const updated = await userApi.addEntry(mediaType, slug, status);
      const normalized = normalize(updated);
      setEntries(normalized);
      return { saved: true };
    } catch {
      await refresh(); // resync on failure
      return { saved: false };
    }
  }, [me, refresh]);

  // Shared partial save for note / rating / progress: optimistic update for
  // guests, server round-trip (preserving the stored status) for members.
  const patchEntry = useCallback(async (mediaType, slug, patch) => {
    const currentEntry = (entries[mediaType] || []).find((entry) => entry.slug === slug) || {};
    const currentStatus = currentEntry.status || 'watching';
    setEntries((current) => ({
      ...current,
      [mediaType]: current[mediaType].map((entry) => (entry.slug === slug ? { ...entry, ...patch } : entry)),
    }));
    if (!me) {
      writeGuestEntries(mediaType, readGuestEntries(mediaType).map((entry) => (entry.slug === slug ? { ...entry, ...patch } : entry)));
      return { saved: true };
    }
    try {
      const updated = await userApi.addEntry(
        mediaType, slug, currentStatus,
        ...(patch.note !== undefined ? [patch.note] : [currentEntry.note ?? '']),
        ...(patch.rating !== undefined ? [patch.rating] : [currentEntry.rating ?? null]),
        ...(patch.progress !== undefined ? [patch.progress] : [currentEntry.progress ?? null]),
      );
      const normalized = normalize(updated);
      setEntries(normalized);
      return { saved: true };
    } catch {
      await refresh();
      return { saved: false };
    }
  }, [me, entries, refresh]);

  // Save (or clear) a personal note on an already-saved entry.
  const setNote = useCallback((mediaType, slug, note) => patchEntry(mediaType, slug, { note }), [patchEntry]);

  // Save (or clear) a personal rating (1–10) on an already-saved entry.
  const setRating = useCallback((mediaType, slug, rating) => patchEntry(mediaType, slug, { rating }), [patchEntry]);

  // Queue 21: save (or clear) the episode/chapter progress on an entry.
  const setProgress = useCallback((mediaType, slug, progress) => patchEntry(mediaType, slug, { progress }), [patchEntry]);

  const logout = useCallback(async () => {
    try { await userApi.logout(); } catch { /* ignore */ }
    // keep the guest localStorage lists (they are the merged mirror, statuses included)
    setMe(null);
    setEntries({ anime: readGuestEntries('anime'), manga: readGuestEntries('manga') });
  }, []);

  return (
    <UserContext.Provider value={{
      me,
      meLoaded: checked,
      entries,
      refresh,
      toggle,
      setStatus,
      setNote,
      setRating,
      setProgress,
      logout,
      saveBio: userApi.updateBio,
      saveAvatar: userApi.updateAvatar,
      setMe,
      myUsername: me?.username || null,
    }}
    >
      {children}
    </UserContext.Provider>
  );
}
