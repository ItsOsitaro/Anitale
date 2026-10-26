import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';
import EntrySheet from './EntrySheet';
import EditProfileSheet from './EditProfileSheet';
import { entryTotal, initialOf, progressPercent } from './entry-utils';
import { cn } from 'cn';

const STATUS_ORDER = ['watching', 'completed', 'on_hold', 'dropped', 'planned'];

function ProgressBar({ entry, total }) {
  const { t } = useSiteLang();
  const text = entry.progress != null ? (total ? `${entry.progress}/${total}` : entry.progress) : '—';
  // Without a known episode/chapter total there is nothing to fill a bar against.
  if (!total) {
    return <span className="dash-progress__plain">{t('progressLabel')}: <span dir="ltr">{text}</span></span>;
  }
  return (
    <div className="dash-progress" dir="ltr">
      <div
        className="dash-progress__bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax={total}
        aria-valuenow={entry.progress ?? 0}
        style={{ '--p': `${progressPercent(entry.progress, total)}%` }}
      />
      <span className="dash-progress__text">{text}</span>
    </div>
  );
}

export default function MobileDashboard({ me, entries, animeBySlug, mangaBySlug, user, children }) {
  const { t, lang } = useSiteLang();
  const [main, setMain] = useState('mine'); // mine | friends
  const [tab, setTab] = useState('anime');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null); // { mediaType, slug }
  const [editOpen, setEditOpen] = useState(false);

  const bySlug = (mediaType) => (mediaType === 'manga' ? mangaBySlug : animeBySlug);
  const bloom = me.bloom ?? 12;

  const rated = [...entries.anime, ...entries.manga].filter((e) => e.rating != null);
  const avg = rated.length ? (rated.reduce((s, e) => s + e.rating, 0) / rated.length).toFixed(1) : '—';

  // "Keep going": everything currently being watched or read, newest first.
  const going = useMemo(() => (
    ['anime', 'manga'].flatMap((mediaType) => entries[mediaType]
      .filter((e) => (e.status || 'watching') === 'watching')
      .map((entry) => ({ entry, mediaType, item: (mediaType === 'manga' ? mangaBySlug : animeBySlug).get(entry.slug) })))
  ), [entries, animeBySlug, mangaBySlug]);

  // Favourite genres, counted from the titles on the user's own lists.
  const taste = useMemo(() => {
    const counts = new Map();
    for (const mediaType of ['anime', 'manga']) {
      for (const entry of entries[mediaType]) {
        const item = (mediaType === 'manga' ? mangaBySlug : animeBySlug).get(entry.slug);
        for (const genre of item?.genres || []) counts.set(genre, (counts.get(genre) || 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4);
    const max = top[0]?.[1] || 1;
    return top.map(([genre, count]) => ({ genre, count, share: Math.round((count / max) * 100) }));
  }, [entries, animeBySlug, mangaBySlug]);

  const tabEntries = entries[tab];
  const counts = tabEntries.reduce((acc, e) => {
    const s = e.status || 'watching';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, { all: tabEntries.length });
  const filters = ['all', ...STATUS_ORDER.filter((s) => counts[s])];
  const list = filter === 'all' ? tabEntries : tabEntries.filter((e) => (e.status || 'watching') === filter);
  const statusLabel = (status, mediaType) => (status === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${status}`));

  const selectedEntry = selected ? entries[selected.mediaType].find((e) => e.slug === selected.slug) : null;
  const selectedItem = selected ? bySlug(selected.mediaType).get(selected.slug) : null;
  const empty = entries.anime.length === 0 && entries.manga.length === 0;

  return (
    <main className="mdash" style={{ '--bloom': bloom }}>
      <header className="mdash__head">
        <span className="mdash__avatar" aria-hidden="true">{initialOf(me.username)}</span>
        <div className="mdash__who">
          <h1>{t('dashGreeting', { name: me.username })}</h1>
          <Link to={`/user/${encodeURIComponent(me.username)}`}>{t('dashViewProfile')}</Link>
        </div>
        <button type="button" className="mdash__edit" onClick={() => setEditOpen(true)} aria-label={t('dbEditProfile')}>
          <Pencil width={18} height={18} aria-hidden="true" />
        </button>
      </header>

      <div className="mdash__stats" role="list">
        <div role="listitem"><strong>{entries.anime.length}</strong><span>{t('dashAnimeTab')}</span></div>
        <div role="listitem"><strong>{entries.manga.length}</strong><span>{t('dashMangaTab')}</span></div>
        <div role="listitem"><strong dir="ltr">{avg}</strong><span>{t('dashAvgRating')}</span></div>
      </div>

      {empty ? (
        <section className="mdash__empty">
          <h2>{t('dashEmpty')}</h2>
          <p>{t('dashEmptyHint')}</p>
          <Link className="mdash__cta" to="/anime">{t('dbBrowse')}</Link>
        </section>
      ) : (
        <>
          {going.length > 0 && (
            <section className="mdash__section" aria-labelledby="mdash-going">
              <h2 id="mdash-going" className="mdash__h">{t('dbContinue')}</h2>
              <div className="mdash__rail">
                {going.map(({ entry, mediaType, item }) => {
                  const total = entryTotal(item, mediaType);
                  const done = Boolean(total) && (entry.progress ?? 0) >= total;
                  return (
                    <article key={`${mediaType}-${entry.slug}`} className="going-card">
                      <Link to={item ? mediaHref(item, mediaType) : '#'} className="going-card__cover" aria-label={item ? displayTitle(item, lang) : entry.slug}>
                        {item?.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : <span>{entry.slug.slice(0, 2)}</span>}
                      </Link>
                      <div className="going-card__body">
                        <button type="button" className="going-card__title" onClick={() => setSelected({ mediaType, slug: entry.slug })} dir="auto">
                          {item ? displayTitle(item, lang) : entry.slug}
                        </button>
                        <ProgressBar entry={entry} total={total} />
                        <button
                          type="button"
                          className="going-card__plus" dir="ltr"
                          disabled={done}
                          onClick={() => user.setProgress(mediaType, entry.slug, (entry.progress ?? 0) + 1)}
                          aria-label={mediaType === 'manga' ? t('dbNextCh') : t('dbNextEp')}
                        >
                          <Plus width={16} height={16} aria-hidden="true" />
                          <span dir="ltr">1</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {taste.length > 0 && (
            <section className="mdash__section mdash__taste" aria-labelledby="mdash-taste">
              <h2 id="mdash-taste" className="mdash__h">{t('dbTaste')}</h2>
              <ul>
                {taste.map(({ genre, count, share }) => (
                  <li key={genre}>
                    <span className="mdash__taste-name">{genre}</span>
                    <span className="mdash__taste-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
                    <span className="mdash__taste-count" dir="ltr">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mobile-tabs mdash__main-tabs" role="tablist" aria-label={t('dashTitle')}>
            {['mine', 'friends'].map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={main === id}
                className={cn('mobile-tabs__tab', main === id && 'is-active')}
                onClick={() => setMain(id)}
              >
                {t(id === 'mine' ? 'dbTabMine' : 'dbTabFriends')}
              </button>
            ))}
          </div>

          {main === 'friends' && <div className="mdash__friends">{children}</div>}

          {main === 'mine' && (
          <section className="mdash__section" aria-label={t('dashUserLists')}>
            <div className="mdash__filters mdash__media" role="group" aria-label={t('dashUserLists')}>
              {['anime', 'manga'].map((mediaType) => (
                <button
                  key={mediaType}
                  type="button"
                  aria-pressed={tab === mediaType}
                  className={cn('mobile-chip', tab === mediaType && 'is-active')}
                  onClick={() => { setTab(mediaType); setFilter('all'); }}
                >
                  {t(mediaType === 'anime' ? 'dashAnimeTab' : 'dashMangaTab')}
                  <span className="mdash__tabcount" dir="ltr">{entries[mediaType].length}</span>
                </button>
              ))}
            </div>

            {tabEntries.length > 0 && (
              <div className="mdash__filters" role="group" aria-label={t('dashFilterLabel')}>
                {filters.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filter === key}
                    className={cn('mobile-chip', filter === key && 'is-active')}
                    onClick={() => setFilter(key)}
                  >
                    {key === 'all' ? t('dashFilterAll') : statusLabel(key, tab)}
                    <span className="mdash__chipcount" dir="ltr">{counts[key]}</span>
                  </button>
                ))}
              </div>
            )}

            {list.length === 0 ? (
              <p className="mdash__none">{t('dashEmpty')}</p>
            ) : (
              <ul className="mdash__list">
                {list.map((entry) => {
                  const item = bySlug(tab).get(entry.slug);
                  const total = entryTotal(item, tab);
                  return (
                    <li key={entry.slug}>
                      <button type="button" className="lib-row" onClick={() => setSelected({ mediaType: tab, slug: entry.slug })}>
                        <span className="lib-row__cover">
                          {item?.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : <span>{entry.slug.slice(0, 2)}</span>}
                        </span>
                        <span className="lib-row__copy">
                          <span className="lib-row__title" dir="auto">{item ? displayTitle(item, lang) : entry.slug}</span>
                          <span className="lib-row__meta">
                            <span className={`entry-status status-${entry.status || 'watching'}`}>{statusLabel(entry.status || 'watching', tab)}</span>
                          </span>
                          {entry.progress != null && <ProgressBar entry={entry} total={total} />}
                        </span>
                        <span className="lib-row__score" aria-label={t('ratingAria')}>
                          {entry.rating != null ? <><strong dir="ltr">{entry.rating}</strong><small dir="ltr">/10</small></> : <span aria-hidden="true">—</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          )}
        </>
      )}

      {empty && children}

      <EntrySheet
        open={Boolean(selectedEntry)}
        onClose={() => setSelected(null)}
        entry={selectedEntry}
        item={selectedItem}
        mediaType={selected?.mediaType}
        user={user}
      />
      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} user={user} />
    </main>
  );
}
