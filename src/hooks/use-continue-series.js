import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/user';
import { useCatalog, useMangaCatalog, useEnsureTitles } from '@/catalog-context';

// Sequels of the anime the member finished (the server reads them from cached relations). Empty for guests.
export function useContinueSeries(type = 'anime') {
  const user = useUser();
  const animeAll = useCatalog();
  const mangaAll = useMangaCatalog();
  const all = type === 'manga' ? mangaAll : animeAll;
  const [slugs, setSlugs] = useState([]);
  const done = user.me ? user.entries[type].filter((entry) => entry.status === 'completed').length : 0;
  useEffect(() => {
    if (!user.me) { setSlugs([]); return undefined; }
    let live = true;
    fetch(`/api/user/continue?type=${type}`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => { if (live) setSlugs((data.items || []).map((item) => item.slug)); })
      .catch(() => {});
    return () => { live = false; };
  }, [user.me, done, type]);
  useEnsureTitles(type, slugs);
  return useMemo(() => {
    const bySlug = new Map(all.map((item) => [item.slug, item]));
    return slugs.map((slug) => bySlug.get(slug)).filter(Boolean);
  }, [slugs, all]);
}
