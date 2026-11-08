import { useEffect, useState } from 'react';

// Chrome/Edge/Android fire `beforeinstallprompt` once; keep the event so any button can trigger it later.
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferred = event; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

export function useInstallPrompt() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  const standalone = isStandalone();
  // iOS Safari has no install event: show the "Share > Add to Home Screen" hint instead.
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;
  return {
    canInstall: Boolean(deferred) && !standalone,
    ios,
    install: async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      notify();
    },
  };
}
