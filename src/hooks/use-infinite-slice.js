import { useEffect, useRef, useState } from 'react';

// Progressive rendering for long lists: returns how many items to show plus a
// sentinel ref. Reaching the sentinel (or calling loadMore) reveals another page.
// `resetKey` restarts from the first page whenever the underlying list changes.
export function useInfiniteSlice(total, resetKey, pageSize = 24) {
  const [visible, setVisible] = useState(pageSize);
  const sentinelRef = useRef(null);
  const hasMore = visible < total;

  useEffect(() => {
    setVisible(pageSize);
  }, [resetKey, pageSize]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible((n) => n + pageSize);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, visible, pageSize]);

  return { visible, hasMore, sentinelRef, loadMore: () => setVisible((n) => n + pageSize) };
}
