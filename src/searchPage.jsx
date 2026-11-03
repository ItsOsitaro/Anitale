import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteLang } from './i18n.js';
import { mediaHref } from './catalog.js';
import { displayTitle } from './home-data.js';
import { coverUrl } from '@/lib/cover';
import { useShowSensitive } from './lib/catalog-rules.js';
import SensitiveToggle from './components/SensitiveToggle.jsx';

const PARAMS = ['q', 'type', 'genre', 'year', 'format', 'min', 'sort', 'page'];
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
  const filtersActive = ['genre', 'year', 'format', 'min'].some((name) => get(name));
  const facets = data?.facets || { genres: [], years: [], formats: [] };

  const select = (name, label, options, render = (o) => o.value) => (
    <label className="search-filter">
      <span>{label}</span>
      <select value={get(name)} onChange={(event) => update({ [name]: event.target.value })}>
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
        {select('genre', t('genreLabel'), facets.genres, (o) => `${o.value} (${o.n})`)}
        {select('year', t('searchYear'), facets.years, (o) => `${o.value} (${o.n})`)}
        {select('format', t('searchFormat'), facets.formats, (o) => `${o.value} (${o.n})`)}
        {select('min', t('searchMinScore'), MIN_SCORES.map((value) => ({ value })), (o) => `${o.value}+`)}
        <label className="search-filter">
          <span>{t('searchSort')}</span>
          <select value={get('sort')} onChange={(event) => update({ sort: event.target.value })}>
            <option value="">{t(q ? 'searchSortRelevance' : 'searchSortScore')}</option>
            {q && <option value="score">{t('searchSortScore')}</option>}
            <option value="new">{t('searchSortNew')}</option>
            <option value="old">{t('searchSortOld')}</option>
            <option value="az">{t('searchSortAz')}</option>
          </select>
        </label>
        <SensitiveToggle />
        {filtersActive && <Button type="button" variant="ghost" size="sm" onClick={() => update({ genre: '', year: '', format: '', min: '' })}>{t('searchClearFilters')}</Button>}
      </div>

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
                <Button type="button" variant="outline" size="sm" onClick={() => update({ genre: '', year: '', format: '', min: '', type: 'all' })}>{t('searchClearFilters')}</Button>
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
