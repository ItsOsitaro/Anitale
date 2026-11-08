import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user';
import { mediaHref } from '@/catalog';
import { useCatalog, useEnsureTitles } from '@/catalog-context';

const GROUPS = [['both', 'togetherBoth'], ['theyLoved', 'togetherTheyLoved'], ['youLoved', 'togetherYouLoved']];

// On another member's profile: anime to watch together, from the two lists. Hidden for guests and when there is nothing.
export default function Together({ username }) {
  const { t } = useSiteLang();
  const user = useUser();
  const all = useCatalog();
  const [data, setData] = useState(null);
  const signedIn = Boolean(user.me);
  useEffect(() => {
    if (!signedIn) { setData(null); return undefined; }
    let live = true;
    fetch(`/api/users/${encodeURIComponent(username)}/together`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (live) setData(body); })
      .catch(() => {});
    return () => { live = false; };
  }, [signedIn, username]);
  const slugs = useMemo(() => (data ? [...data.both, ...data.theyLoved, ...data.youLoved] : []), [data]);
  useEnsureTitles('anime', slugs);
  const bySlug = useMemo(() => new Map(all.map((item) => [item.slug, item])), [all]);
  if (!data || data.hidden || !slugs.length) return null;
  return (
    <section className="together" aria-labelledby="togetherTitle">
      <h3 id="togetherTitle">{t('togetherTitle')}</h3>
      {GROUPS.map(([key, label]) => {
        const items = data[key].map((slug) => bySlug.get(slug)).filter(Boolean);
        if (!items.length) return null;
        return (
          <div key={key}>
            <p className="cp-label">{t(label)}</p>
            <ul>{items.map((item) => <li key={item.slug}><Link to={mediaHref(item, 'anime')} dir="auto">{item.title}</Link></li>)}</ul>
          </div>
        );
      })}
    </section>
  );
}
