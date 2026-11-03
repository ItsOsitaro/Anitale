import { useCallback, useEffect, useRef, useState } from 'react';
import { userApi } from '@/user.jsx';

const POLL_MS = 120_000;

// Server notifications for the bell. Loads when signed in, refreshes on focus and
// every two minutes. Opening the list marks everything read, but the items keep
// their "new" look until the next refresh so the person can see what was new.
export function useNotifications(enabled) {
  const [state, setState] = useState({ items: [], unread: 0 });
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await userApi.notifications();
      if (alive.current) setState({ items: result.items || [], unread: result.unread || 0 });
    } catch { /* offline or signed out: keep what we have */ }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) { setState({ items: [], unread: 0 }); return undefined; }
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

  return { ...state, markAllRead, reload: load };
}
