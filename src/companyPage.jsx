import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSiteLang } from './i18n.js';
import { useVisibleCatalog, useVisibleMangaCatalog } from './catalog-context.jsx';
import { membersOf } from './lib/catalog-rules.js';
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

const SORTS = {
  popular: (a, b) => membersOf(b) - membersOf(a),
  score: (a, b) => (Number(b.sampleScore) || 0) - (Number(a.sampleScore) || 0),
  newest: (a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0),
};

export default function CompanyPage({ kind }) {
  const { name: raw } = useParams();
  const name = useMemo(() => { try { return decodeURIComponent(raw || ''); } catch { return raw || ''; } }, [raw]);
  const { t, lang } = useSiteLang();
  const anime = useVisibleCatalog();
  const manga = useVisibleMangaCatalog();
  const [params, setParams] = useSearchParams();
  const sort = SORTS[params.get('sort')] ? params.get('sort') : 'popular';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const source = kind === 'magazine' ? manga : anime;
  const items = useMemo(() => {
    const needle = name.toLowerCase();
    return source.filter((item) => companyNames(item, kind).some((n) => n.toLowerCase() === needle)).sort(SORTS[sort]);
  }, [source, kind, name, sort]);
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const current = Math.min(page, pages);
  useEffect(() => { document.title = `${name} · ${t('siteName')}`; }, [name, t]);
  const set = (patch) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, v))); setParams(next); };
  const kindLabel = t(kind === 'studio' ? 'companyStudio' : kind === 'producer' ? 'companyProducer' : 'companyMagazine');

  return (
    <main className="company-shell">
      <p className="company-kind">{kindLabel}</p>
      <h1 dir="auto">{name}</h1>
      <div className="company-bar">
        <span>{t('companyCount', { n: formatNumber(items.length, lang) })}</span>
        <label>
          {t('dashSortLabel')}{' '}
          <select value={sort} onChange={(e) => set({ sort: e.target.value === 'popular' ? null : e.target.value, page: null })}>
            <option value="popular">{t('searchSortPop')}</option>
            <option value="score">{t('scoreLabel')}</option>
            <option value="newest">{t('dashSortRecent')}</option>
          </select>
        </label>
      </div>
      {items.length === 0 ? (
        <p className="extras-muted">{t('companyEmpty')} <Link to={kind === 'magazine' ? '/manga' : '/anime'}>{t('browseAll')}</Link></p>
      ) : (
        <AnimeGrid items={items.slice((current - 1) * PER_PAGE, current * PER_PAGE)} />
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
