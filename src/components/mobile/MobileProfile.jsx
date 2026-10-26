import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { displayTitle } from '@/home-data';
import { mediaHref } from '@/catalog';
import { useSiteLang } from '@/i18n';
import { initialOf } from './entry-utils';
import { cn } from 'cn';

const TABS = ['list', 'activity', 'about'];
const TAB_KEYS = { list: 'dbTabList', activity: 'dbTabActivity', about: 'dbTabAbout' };

export default function MobileProfile({ profile, entries, animeBySlug, mangaBySlug, followCounts, isOwner, followButton }) {
  const { t, lang } = useSiteLang();
  const [tab, setTab] = useState('list');
  const [media, setMedia] = useState('anime');
  const bloom = profile.bloom ?? 12;

  const resolve = (mediaType, slug) => (mediaType === 'manga' ? mangaBySlug : animeBySlug).get(slug);
  const all = useMemo(() => ['anime', 'manga'].flatMap((mediaType) => entries[mediaType].map((entry) => ({ entry, mediaType }))), [entries]);

  // The banner is a blurred collage of the user's best-rated covers.
  const collage = useMemo(() => {
    const ranked = [...all].sort((x, y) => (y.entry.rating ?? -1) - (x.entry.rating ?? -1));
    const covers = [];
    for (const { entry, mediaType } of ranked) {
      const image = resolve(mediaType, entry.slug)?.image;
      if (image && !covers.includes(image)) covers.push(image);
      if (covers.length === 4) break;
    }
    return covers;
  }, [all, animeBySlug, mangaBySlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const rated = all.filter(({ entry }) => entry.rating != null);
  const avg = rated.length ? (rated.reduce((s, { entry }) => s + entry.rating, 0) / rated.length).toFixed(1) : '—';
  const activity = useMemo(
    () => [...all].sort((a, b) => String(b.entry.added || '').localeCompare(String(a.entry.added || ''))).slice(0, 30),
    [all],
  );
  const statusLabel = (status, mediaType) => (status === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${status}`));
  const joined = new Date(profile.joinedAt).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB');
  const list = entries[media];

  return (
    <main className="mprofile" style={{ '--bloom': bloom }}>
      <header className="mprofile__hero">
        <div className="mprofile__backdrop" aria-hidden="true">
          {collage.map((src) => <img key={src} src={src} alt="" />)}
        </div>
        <div className="mprofile__idrow">
          <span className="mprofile__avatar" aria-hidden="true">{initialOf(profile.username)}</span>
        </div>
        <h1 className="mprofile__name">{profile.username}</h1>
        <p className="mprofile__follow-counts">
          <span><strong>{followCounts.followers}</strong> {t('followersLabel')}</span>
          <span><strong>{followCounts.following}</strong> {t('followingLabel')}</span>
        </p>
        {isOwner ? (
          <Link className="mprofile__own" to="/dashboard">{t('ownProfile')}</Link>
        ) : followButton}
      </header>

      <div className="mdash__stats" role="list">
        <div role="listitem"><strong>{entries.anime.length}</strong><span>{t('dashAnimeTab')}</span></div>
        <div role="listitem"><strong>{entries.manga.length}</strong><span>{t('dashMangaTab')}</span></div>
        <div role="listitem"><strong dir="ltr">{avg}</strong><span>{t('dashAvgRating')}</span></div>
      </div>

      <div className="mobile-tabs mprofile__tabs" role="tablist" aria-label={profile.username}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn('mobile-tabs__tab', tab === id && 'is-active')}
            onClick={() => setTab(id)}
          >
            {t(TAB_KEYS[id])}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <section className="mprofile__panel">
          <div className="mdash__filters" role="group" aria-label={t('profileLists')}>
            {['anime', 'manga'].map((m) => (
              <button key={m} type="button" aria-pressed={media === m} className={cn('mobile-chip', media === m && 'is-active')} onClick={() => setMedia(m)}>
                {t(m === 'anime' ? 'dashAnimeTab' : 'dashMangaTab')}
                <span className="mdash__chipcount" dir="ltr">{entries[m].length}</span>
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="mdash__none">{t('dbListEmpty')}</p>
          ) : (
            <ul className="wall">
              {list.map((entry) => {
                const item = resolve(media, entry.slug);
                return (
                  <li key={entry.slug}>
                    <Link className="wall__tile" to={item ? mediaHref(item, media) : '#'} aria-label={item ? displayTitle(item, lang) : entry.slug}>
                      {item?.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : <span>{entry.slug.slice(0, 2)}</span>}
                      <span className={`wall__status status-${entry.status || 'watching'}`} aria-hidden="true" />
                      {entry.rating != null && <span className="wall__rating" dir="ltr">{entry.rating}</span>}
                    </Link>
                    <span className="wall__title" dir="auto">{item ? displayTitle(item, lang) : entry.slug}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === 'activity' && (
        <section className="mprofile__panel">
          {activity.length === 0 ? (
            <p className="mdash__none">{t('dbActivityEmpty')}</p>
          ) : (
            <ul className="mdash__list">
              {activity.map(({ entry, mediaType }) => {
                const item = resolve(mediaType, entry.slug);
                return (
                  <li key={`${mediaType}-${entry.slug}`}>
                    <Link className="lib-row" to={item ? mediaHref(item, mediaType) : '#'}>
                      <span className="lib-row__cover">
                        {item?.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : <span>{entry.slug.slice(0, 2)}</span>}
                      </span>
                      <span className="lib-row__copy">
                        <span className="lib-row__title" dir="auto">{item ? displayTitle(item, lang) : entry.slug}</span>
                        <span className="lib-row__meta">
                          <span className={`entry-status status-${entry.status || 'watching'}`}>{statusLabel(entry.status || 'watching', mediaType)}</span>
                        </span>
                      </span>
                      {entry.rating != null && (
                        <span className="lib-row__score"><strong dir="ltr">{entry.rating}</strong><small dir="ltr">/10</small></span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === 'about' && (
        <section className="mprofile__panel mprofile__about">
          <p className="mprofile__bio" dir="auto">{profile.bio || t('dbNoBio')}</p>
          <p className="mprofile__joined"><time dateTime={profile.joinedAt}>{t('dashJoined', { date: joined })}</time></p>
        </section>
      )}
    </main>
  );
}
