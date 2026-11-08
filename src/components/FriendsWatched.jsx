import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user';
import { formatNumber } from '@/lib/digits.js';

// "People you follow" who have this title on their list. Hidden for guests and when nobody does.
export default function FriendsWatched({ mediaType, slug }) {
  const { t, lang } = useSiteLang();
  const user = useUser();
  const [items, setItems] = useState([]);
  const signedIn = Boolean(user.me);
  useEffect(() => {
    if (!signedIn) { setItems([]); return undefined; }
    let live = true;
    fetch(`/api/user/friends-on/${mediaType}/${encodeURIComponent(slug)}`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => { if (live) setItems(data.items || []); })
      .catch(() => {});
    return () => { live = false; };
  }, [signedIn, mediaType, slug]);
  if (!items.length) return null;
  return (
    <section className="friends-watched" aria-label={t('friendsOn')}>
      <h3>{t('friendsOn')}</h3>
      <ul>
        {items.map((person) => (
          <li key={person.username}>
            <Link to={`/user/${encodeURIComponent(person.username)}`}>
              <span className="user-avatar sm" style={{ '--bloom': person.bloom }} aria-hidden="true">{person.username[0]?.toUpperCase()}</span>
              <span className="friends-watched__name" dir="ltr">{person.username}</span>
              <small>{t(`status_${person.status}`)}{person.rating != null ? ` · ${formatNumber(person.rating, lang)}/${formatNumber(10, lang)}` : ''}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
