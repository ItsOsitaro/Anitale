import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSiteLang } from './i18n.js';
import { normalizeAnime } from './catalog.js';
import { useShowSensitive } from './lib/catalog-rules.js';
import { AnimeGrid } from './App.jsx';
import { formatNumber } from './lib/digits.js';

const PER_PAGE = 24;
const ROW = { studio: 'Studios', producer: 'Producers' };

// Names listed on a detail page for one kind of company, as an array.
export const companyNames = (item, kind) => {
  if (kind === 'magazine') return Array.isArray(item.serialization) ? item.serialization : [];
  const row = (item.information || []).find((r) => String(r?.label).toLowerCase() === ROW[kind].toLowerCase());
  return row ? String(row.value).split(',').map((n) => n.trim()).filter(Boolean) : [];
};
export const companyHref = (kind, name) => `/${kind}/${encodeURIComponent(name)}`;

// Company pages ask the server (it indexes every title); the browser only holds the popular core.
const SORT_PARAM = { popular: 'pop', score: 'score', newest: 'new' };
const SORTS = SORT_PARAM;

export default function CompanyPage({ kind }) {
  const { name: raw } = useParams();
  const name = useMemo(() => { try { return decodeURIComponent(raw || ''); } catch { return raw || ''; } }, [raw]);
  const { t, lang } = useSiteLang();
  const showSensitive = useShowSensitive();
  const [params, setParams] = useSearchParams();
  const sort = SORTS[params.get('sort')] ? params.get('sort') : 'popular';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [state, setState] = useState({ items: [], total: 0, pages: 1, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const query = new URLSearchParams({ type: kind === 'magazine' ? 'manga' : 'anime', [kind]: name, sort: SORT_PARAM[sort], page: String(page), limit: String(PER_PAGE) });
    if (!showSensitive) query.set('sfw', '1');
    fetch(`/api/search/full?${query}`).then((r) => r.json()).then((data) => {
      if (!alive) return;
      const placeholder = normalizeAnime({}).image;
      const items = (data.items || []).map((row) => {
        const card = { slug: row.slug, malId: row.malId, title: row.title, year: row.year, format: row.format, sampleScore: row.score, genres: row.genres || [], image: row.image };
        return kind === 'magazine' ? { ...card, image: row.image || placeholder } : normalizeAnime(card);
      });
      setState({ items, total: data.total || 0, pages: data.pages || 1, loading: false });
    }).catch(() => { if (alive) setState({ items: [], total: 0, pages: 1, loading: false }); });
    return () => { alive = false; };
  }, [kind, name, sort, page, showSensitive]);
  const items = state.items;
  const pages = state.pages;
  const current = Math.min(page, pages);
  useEffect(() => { document.title = `${name} · ${t('siteName')}`; }, [name, t]);
  const set = (patch) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, v))); setParams(next); };
  const kindLabel = t(kind === 'studio' ? 'companyStudio' : kind === 'producer' ? 'companyProducer' : 'companyMagazine');

  return (
    <main className="company-shell">
      <p className="company-kind">{kindLabel}</p>
      <h1 dir="auto">{name}</h1>
      <div className="company-bar">
        <span>{t('companyCount', { n: formatNumber(state.total, lang) })}</span>
        <label>
          {t('dashSortLabel')}{' '}
          <select value={sort} onChange={(e) => set({ sort: e.target.value === 'popular' ? null : e.target.value, page: null })}>
            <option value="popular">{t('searchSortPop')}</option>
            <option value="score">{t('scoreLabel')}</option>
            <option value="newest">{t('dashSortRecent')}</option>
          </select>
        </label>
      </div>
      {state.loading && items.length === 0 ? (
        <p className="extras-muted" role="status">{t('extrasLoading')}</p>
      ) : items.length === 0 ? (
        <p className="extras-muted">{t('companyEmpty')} <Link to={kind === 'magazine' ? '/manga' : '/anime'}>{t('browseAll')}</Link></p>
      ) : (
        <AnimeGrid items={items} />
      )}
      {pages > 1 && (
        <div className="topchars-pager">
          <button type="button" disabled={current <= 1} onClick={() => { set({ page: current - 1 > 1 ? String(current - 1) : null }); window.scrollTo({ top: 0 }); }}>{t('topCharsPrev')}</button>
          <span>{formatNumber(current, lang)} / {formatNumber(pages, lang)}</span>
          <button type="button" disabled={current >= pages} onClick={() => { set({ page: String(current + 1) }); window.scrollTo({ top: 0 }); }}>{t('topCharsNext')}</button>
        </div>
      )}
    </main>
  );
}
