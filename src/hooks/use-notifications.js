import { useCallback, useEffect, useRef, useState } from 'react';
import { userApi } from '@/user.jsx';

const POLL_MS = 120_000;

// Server notifications for the bell and the /notifications page. Loads when signed in, refreshes on focus and
// every two minutes. Opening the list marks everything read, but the items keep their "new" look until the next
// refresh so the person can see what was new. `tab` ('titles' | 'social' | 'results' | '') filters on the server.
export function useNotifications(enabled, { tab = '', limit = 30 } = {}) {
  const [state, setState] = useState({ items: [], unread: 0, loaded: false });
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await userApi.notifications(tab, limit);
      if (alive.current) setState({ items: result.items || [], unread: result.unread || 0, loaded: true });
    } catch { /* offline or signed out: keep what we have */ }
  }, [tab, limit]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) { setState({ items: [], unread: 0, loaded: false }); return undefined; }
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { alive.current = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [enabled, load]);

  const markAllRead = useCallback(async () => {
    setState((current) => (current.unread ? { ...current, unread: 0 } : current));
    try { await userApi.readNotifications(); } catch { /* the next refresh corrects it */ }
  }, []);

  // Remove what was already read (or everything), then reload.
  const clear = useCallback(async (all = false) => {
    try { await userApi.clearNotifications(all); } catch { /* the reload shows the truth */ }
    await load();
  }, [load]);

  return { ...state, markAllRead, clear, reload: load };
}
