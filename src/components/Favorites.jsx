import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useUser, userApi } from '@/user.jsx';
import { mediaHref } from '@/catalog.js';

// Heart on a title / character / person page. Shows the member count; signed-in users can toggle.
export function FavoriteButton({ kind, refId, className = '', compact = false }) {
  const { t } = useSiteLang();
  const user = useUser();
  const ref = String(refId);
  const me = user.me?.username || null;
  const [state, setState] = useState({ count: 0, mine: false, busy: false, note: '' });

  useEffect(() => {
    let alive = true;
    userApi.favInfo(kind, ref).then((info) => { if (alive) setState((cur) => ({ ...cur, count: info.count, mine: info.mine, note: '' })); }).catch(() => {});
    return () => { alive = false; };
  }, [kind, ref, me]);

  const toggle = async () => {
    if (!user.me) return;
    setState((cur) => ({ ...cur, busy: true, note: '' }));
    try {
      const info = await userApi.setFavorite(kind, ref, !state.mine);
      setState({ count: info.count, mine: info.mine, busy: false, note: '' });
    } catch (err) {
      setState((cur) => ({ ...cur, busy: false, note: err?.status === 409 ? t('favLimit') : t('authGenericError') }));
    }
  };

  const label = state.mine ? t('favRemove') : t('favAdd');
  const body = (
    <>
      <Heart width={compact ? 20 : 18} height={compact ? 20 : 18} aria-hidden="true" fill={state.mine ? 'currentColor' : 'none'} />
      {!compact && <span>{state.mine ? t('favIn') : t('favAdd')}</span>}
      <strong dir="ltr">{state.count}</strong>
    </>
  );
  return (
    <div className={`fav-wrap ${className}`}>
      {user.me ? (
        <button type="button" className={`fav-button${state.mine ? ' is-active' : ''}`} aria-pressed={state.mine} aria-label={label} disabled={state.busy} onClick={toggle}>{body}</button>
      ) : (
        <Link className="fav-button" to="/login" aria-label={t('favLogin')} title={t('favLogin')}>{body}</Link>
      )}
      {state.note && <small className="fav-note" role="alert">{state.note}</small>}
    </div>
  );
}

// Profile section: the user's favorites in four short rows.
export function ProfileFavorites({ favorites, animeBySlug, mangaBySlug }) {
  const { t } = useSiteLang();
  const rows = [
    ['anime', 'favAnime', (favorites?.anime || []).map((f) => animeBySlug.get(f.slug)).filter(Boolean).map((item) => ({ key: item.slug, to: mediaHref(item, 'anime'), name: item.title, image: item.image }))],
    ['manga', 'favManga', (favorites?.manga || []).map((f) => mangaBySlug.get(f.slug)).filter(Boolean).map((item) => ({ key: item.slug, to: mediaHref(item, 'manga'), name: item.title, image: item.image }))],
    ['character', 'favCharacters', (favorites?.character || []).map((f) => ({ key: f.id, to: `/character/${f.id}`, name: f.name, image: f.image }))],
    ['person', 'favPeople', (favorites?.person || []).map((f) => ({ key: f.id, to: `/person/${f.id}`, name: f.name, image: f.image }))],
  ].filter(([, , list]) => list.length > 0);
  if (!rows.length) return null;
  return (
    <section className="fav-profile panel" aria-label={t('favTitle')}>
      <h2>{t('favTitle')}</h2>
      {rows.map(([kind, label, list]) => (
        <div key={kind} className="fav-profile__row">
          <h3>{t(label)}</h3>
          <ul>
            {list.map((entry) => (
              <li key={entry.key}>
                <Link to={entry.to} title={entry.name}>
                  {entry.image ? <img src={entry.image} alt="" loading="lazy" decoding="async" /> : <span className="fav-profile__noimg" aria-hidden="true" />}
                  <span dir="auto">{entry.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
