import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteLang } from './i18n.js';
import { mediaHref } from './catalog.js';
import { displayTitle } from './home-data.js';
import { coverUrl } from '@/lib/cover';
import { useShowSensitive } from './lib/catalog-rules.js';
import SensitiveToggle from './components/SensitiveToggle.jsx';

const PARAMS = ['q', 'type', 'genre', 'xgenre', 'year', 'from', 'to', 'format', 'status', 'studio', 'rating', 'letter', 'min', 'sort', 'page'];
const FILTER_KEYS = ['genre', 'xgenre', 'year', 'from', 'to', 'format', 'status', 'studio', 'rating', 'letter', 'min'];
const CLEARED = Object.fromEntries(FILTER_KEYS.map((key) => [key, '']));
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const csv = (value) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
const MIN_SCORES = [6, 7, 8, 9];

export default function SearchPage() {
  const { t, lang } = useSiteLang();
  const [params, setParams] = useSearchParams();
  const get = (name) => params.get(name) || '';
  const q = get('q');
  const type = get('type') || 'all';
  const page = Math.max(1, Number.parseInt(get('page'), 10) || 1);

  const [draft, setDraft] = useState(q);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const topRef = useRef(null);

  useEffect(() => { document.title = `${q ? `${q} · ` : ''}${t('searchPageTitle')} · ${t('siteName')}`; }, [q, t]);
  // Back/forward or a header search changes ?q= from outside: follow it.
  useEffect(() => { setDraft(q); }, [q]);

  const update = (changes, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null || (key === 'type' && value === 'all')) next.delete(key); else next.set(key, String(value));
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // Typing updates the URL after a short pause.
  useEffect(() => {
    if (draft.trim() === q.trim()) return undefined;
    const timer = window.setTimeout(() => update({ q: draft.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const showSensitive = useShowSensitive();
  const queryString = [...PARAMS.map((name) => [name, get(name)]).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`), ...(showSensitive ? [] : ['sfw=1'])].join('&');
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch(`/api/search/full?${queryString}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((result) => setData(result))
      .catch((error) => { if (error?.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [queryString]);

  const goPage = (next) => { update({ page: next }, { keepPage: true }); topRef.current?.scrollIntoView({ block: 'start' }); };
  const filtersActive = FILTER_KEYS.some((name) => get(name));
  const facets = data?.facets || { genres: [], years: [], formats: [], statuses: [], studios: [], ratings: [] };
  const included = csv(get('genre'));
  const excluded = csv(get('xgenre'));
  // Genre chips cycle: off → included → excluded → off.
  const cycleGenre = (name) => {
    const isIn = included.includes(name);
    const isOut = excluded.includes(name);
    const nextIn = isIn ? included.filter((g) => g !== name) : (isOut ? included : [...included, name]);
    const nextOut = isIn ? [...excluded, name] : (isOut ? excluded.filter((g) => g !== name) : excluded);
    update({ genre: nextIn.join(','), xgenre: nextOut.join(',') });
  };
  const pickedGenres = included.length + excluded.length;
  const showStudioRating = type !== 'manga';

  const select = (name, label, options, render = (o) => o.value, current = get(name)) => (
    <label className="search-filter">
      <span>{label}</span>
      <select value={current} onChange={(event) => update({ [name]: event.target.value, ...(name === 'from' || name === 'to' ? { year: '' } : {}) })}>
        <option value="">{t('searchAny')}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{render(option)}</option>)}
      </select>
    </label>
  );

  return (
    <main className="search-page" ref={topRef}>
      <h1>{t('searchPageTitle')}</h1>
      <form className="search-page__form" role="search" onSubmit={(event) => { event.preventDefault(); update({ q: draft.trim() }); }}>
        <input
          type="search"
          dir="auto"
          autoFocus={!q}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('searchPagePlaceholder')}
          aria-label={t('searchPagePlaceholder')}
          enterKeyHint="search"
        />
      </form>

      <div className="search-page__types" role="group" aria-label={t('searchTypeAria')}>
        {['all', 'anime', 'manga'].map((value) => (
          <button key={value} type="button" aria-pressed={type === value} className={type === value ? 'is-active' : ''} onClick={() => update({ type: value })}>
            {t(value === 'all' ? 'searchAllTypes' : value === 'anime' ? 'dashAnimeTab' : 'dashMangaTab')}
          </button>
        ))}
      </div>

      <div className="search-page__filters">
        {select('from', t('searchFrom'), facets.years, (o) => o.value, get('from') || get('year'))}
        {select('to', t('searchTo'), facets.years, (o) => o.value, get('to') || get('year'))}
        {select('format', t('searchFormat'), facets.formats, (o) => `${o.value} (${o.n})`)}
        {select('status', t('searchStatus'), facets.statuses, (o) => `${t(`st_${o.value}`)} (${o.n})`)}
        {showStudioRating && facets.studios.length > 0 && select('studio', t('searchStudio'), facets.studios, (o) => `${o.value} (${o.n})`)}
        {showStudioRating && facets.ratings.length > 0 && select('rating', t('searchRating'), facets.ratings, (o) => `${o.value} (${o.n})`)}
        {select('min', t('searchMinScore'), MIN_SCORES.map((value) => ({ value })), (o) => `${o.value}+`)}
        <label className="search-filter">
          <span>{t('searchSort')}</span>
          <select value={get('sort')} onChange={(event) => update({ sort: event.target.value })}>
            <option value="">{t(q ? 'searchSortRelevance' : 'searchSortScore')}</option>
            {q && <option value="score">{t('searchSortScore')}</option>}
            <option value="new">{t('searchSortNew')}</option>
            <option value="old">{t('searchSortOld')}</option>
            <option value="pop">{t('searchSortPop')}</option>
            <option value="votes">{t('searchSortVotes')}</option>
            <option value="eps">{t('searchSortEps')}</option>
            <option value="az">{t('searchSortAz')}</option>
          </select>
        </label>
        <SensitiveToggle />
        {filtersActive && <Button type="button" variant="ghost" size="sm" onClick={() => update(CLEARED)}>{t('searchClearFilters')}</Button>}
      </div>

      {facets.genres.length > 0 && (
        <details className="search-genres" open={pickedGenres > 0 || undefined}>
          <summary>{t('genreLabel')}{pickedGenres > 0 ? ` · ${t('searchGenresPicked', { n: pickedGenres })}` : ''}</summary>
          <p className="search-genres__hint">{t('searchGenreHint')}</p>
          <div className="search-genres__chips">
            {facets.genres.map((genre) => {
              const state = included.includes(genre.value) ? 'in' : (excluded.includes(genre.value) ? 'out' : 'off');
              return (
                <button
                  key={genre.value}
                  type="button"
                  className={`search-genre is-${state}`}
                  aria-pressed={state !== 'off'}
                  aria-label={`${genre.value}${state === 'in' ? ` — ${t('searchGenreInclude')}` : state === 'out' ? ` — ${t('searchGenreExclude')}` : ''}`}
                  onClick={() => cycleGenre(genre.value)}
                >
                  {state === 'out' ? '−' : state === 'in' ? '+' : ''}<span dir="auto">{genre.value}</span><small>{genre.n}</small>
                </button>
              );
            })}
          </div>
        </details>
      )}

      {get('sort') === 'az' && (
        <div className="search-letters" role="group" aria-label={t('searchLetter')} dir="ltr">
          <button type="button" aria-pressed={!get('letter')} className={!get('letter') ? 'is-active' : ''} onClick={() => update({ letter: '' })}>{t('searchLetterAll')}</button>
          {LETTERS.map((letter) => (
            <button key={letter} type="button" aria-pressed={get('letter') === letter} className={get('letter') === letter ? 'is-active' : ''} onClick={() => update({ letter: get('letter') === letter ? '' : letter })}>{letter}</button>
          ))}
        </div>
      )}

      {failed && <p className="media-note" role="alert">{t('authGenericError')}</p>}
      {!data && !failed && <p className="media-note" role="status">{t('communityLoading')}</p>}

      {data && (
        <>
          {data.users?.length > 0 && (
            <section className="search-page__users" aria-label={t('searchUsers')}>
              <h2>{t('searchUsers')}</h2>
              <ul>
                {data.users.map((person) => (
                  <li key={person.username}>
                    <Link to={`/user/${encodeURIComponent(person.username)}`}>
                      <span className="user-avatar sm" style={{ '--bloom': person.bloom ?? 12 }} aria-hidden="true">{person.username[0]?.toUpperCase()}</span>
                      <span dir="ltr">{person.username}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="search-page__count" role="status" aria-live="polite">{t('searchResults', { n: data.total })}</p>

          {data.items.length === 0 ? (
            <div className="search-page__empty">
              <p>{t('searchNone')}</p>
              {(filtersActive || type !== 'all') && (
                <Button type="button" variant="outline" size="sm" onClick={() => update({ ...CLEARED, type: 'all' })}>{t('searchClearFilters')}</Button>
              )}
            </div>
          ) : (
            <ul className="search-grid">
              {data.items.map((item) => (
                <li key={`${item.kind}-${item.slug}`}>
                  <Link to={mediaHref(item, item.kind)} className="search-card">
                    <span className="search-card__cover">
                      {item.image ? <img src={coverUrl(item.image, 240)} alt="" loading="lazy" decoding="async" /> : null}
                      {item.score ? <span className="search-card__score" dir="ltr">{Number(item.score).toFixed(1)}</span> : null}
                    </span>
                    <span className="search-card__title" dir="auto">{displayTitle(item, lang)}</span>
                    <span className="search-card__meta">
                      {t(item.kind === 'manga' ? 'dashMangaTab' : 'dashAnimeTab')}
                      {item.year ? <><span aria-hidden="true"> · </span><span dir="ltr">{item.year}</span></> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {data.pages > 1 && (
            <div className="search-page__pager">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>{t('searchPrev')}</Button>
              <span>{t('searchPageOf', { page: data.page, pages: data.pages })}</span>
              <Button type="button" variant="outline" size="sm" disabled={page >= data.pages} onClick={() => goPage(page + 1)}>{t('searchNext')}</Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
