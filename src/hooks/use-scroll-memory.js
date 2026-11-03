import { useEffect, useLayoutEffect, useRef } from 'react';

// Per-page scroll memory. Each pathname remembers where you were; coming back
// restores it (also for the browser's Back button), while a page opened for
// the first time starts at the top. Pages whose content loads late (the
// catalog is fetched) are restored as soon as the document is tall enough.
const positions = new Map();
const RESTORE_MS = 2500;

export function useScrollMemory(pathname, { skip = false } = {}) {
  const current = useRef(pathname);
  const restoring = useRef(false);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Record the live position of the page being viewed.
  useEffect(() => {
    if (skip) return undefined;
    const onScroll = () => {
      // Ignore events while the URL has already changed but the old page is still
      // mounted (layout shifts there must not overwrite the page we are leaving).
      if (restoring.current || window.location.pathname !== current.current) return;
      positions.set(current.current, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [skip]);

  useLayoutEffect(() => {
    current.current = pathname;
    if (skip) return undefined;
    const target = positions.get(pathname) || 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!target) { restoring.current = false; return undefined; }

    restoring.current = true;
    const started = performance.now();
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      restoring.current = false;
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
    const step = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= target - 1) {
        window.scrollTo({ top: target, behavior: 'instant' });
        // Images/rails may still be growing the page; keep nudging briefly.
        if (Math.abs(window.scrollY - target) < 2 && performance.now() - started > 300) return stop();
      }
      if (performance.now() - started > RESTORE_MS) return stop();
      frame = requestAnimationFrame(step);
      return undefined;
    };
    // A deliberate user scroll wins over the restore.
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    window.addEventListener('keydown', stop, { once: true });
    frame = requestAnimationFrame(step);
    return stop;
  }, [pathname, skip]);
}
