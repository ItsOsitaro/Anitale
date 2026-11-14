import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { userApi } from '@/user.jsx';

// The member's notification switches (all on unless switched off). One shared copy, so the settings card and the
// bell / airing alerts stay in step. Loaded once per signed-in session.
export const PREF_KEYS = ['episode', 'sequel', 'follow', 'friend_review', 'helpful', 'results'];
const listeners = new Set();
let prefs = null; // null until loaded: everything counts as on
let loading = false;

const emit = (next) => { prefs = next; listeners.forEach((listener) => listener()); };
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => prefs;

export function useNotificationPrefs(enabled = true) {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (!enabled) { if (prefs) emit(null); return; }
    if (prefs || loading) return;
    loading = true;
    userApi.notificationPrefs().then((result) => emit(result.prefs)).catch(() => {}).finally(() => { loading = false; });
  }, [enabled]);

  const setPref = useCallback(async (key, on) => {
    const before = prefs || {};
    emit({ ...before, [key]: on });
    try {
      const result = await userApi.setNotificationPref(key, on);
      emit(result.prefs);
      return true;
    } catch {
      emit(before);
      return false;
    }
  }, []);

  return { prefs: current, isOn: (key) => current?.[key] !== false, setPref };
}
