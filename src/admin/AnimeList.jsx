import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, runBulkJob } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import { mediaHref } from '../catalog.js';

export default function AnimeList() {
  const { t, lang, toast, confirm, overview, can } = useAdmin();
  const canEdit = can('catalog', 'edit');
  const num = (n) => Number(n || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
  // Search, sort, filter and page live in the URL so Back, reload and shared links keep the view.
  const [params, setParams] = useSearchParams();
  const FILTERS = ['noCover', 'noPersian', 'noScore', 'noMal'];
  const SORTS = ['updated', 'title', 'score', 'year', 'members'];
  const [query, setQuery] = useState(params.get('q') || '');
  const [debounced, setDebounced] = useState(params.get('q') || '');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'updated';
  const filter = FILTERS.includes(params.get('filter')) ? params.get('filter') : ''; // dashboard links arrive with ?filter=
  const patchParams = (patch) => setParams((current) => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(patch)) { if (value && value !== 'updated' && !(key === 'page' && value === 1)) next.set(key, value); else next.delete(key); }
    return next;
  }, { replace: true });
  const setPage = (n) => { patchParams({ page: n }); window.scrollTo?.({ top: 0 }); };
  const setSort = (value) => patchParams({ sort: value, page: 1 });
  const setFilter = (value) => patchParams({ filter: value, page: 1 });
  const searchBox = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyRow, setBusyRow] = useState('');
  const [busyAll, setBusyAll] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const clean = query.trim();
      setDebounced((old) => { if (old !== clean) patchParams({ q: clean, page: 1 }); return clean; });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // "/" jumps to the search box (like most admin tools).
  useEffect(() => {
    const onKey = (event) => {
      const tag = document.activeElement?.tagName;
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) { event.preventDefault(); searchBox.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const load = useCallback(() => {
    // alive-guard: a stale response must not overwrite a newer one.
    let active = true;
    setLoading(true);
    api.list(debounced, page, sort, filter).then((result) => { if (active) { setData(result); setError(''); } }).catch((err) => { if (active) setError(errText(err, t)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debounced, page, sort, filter, t]);
  useEffect(load, [load]);

  const remove = async (item) => {
    if (!await confirm(t('confirmDelete', { title: item.title }))) return;
    try {
      await api.remove(item.slug);
      toast(t('deleted'));
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    }
  };

  // Human text for one change ({field, from, to}).
  const changeText = (change) => {
    if (!change) return '';
    const labels = { title: t('chTitle'), format: t('chFormat'), score: t('chScore'), airingDay: t('chAiringDay'), synopsis: t('chSynopsis') };
    const label = labels[change.field] || change.field;
    return change.field === 'synopsis' ? label : `${label}: ${change.from || '—'} → ${change.to || '—'}`;
  };

  // Re-fetch one entry from MyAnimeList (Tenrai, or AniList when unreachable).
  const refreshItem = async (item) => {
    if (!item.malId) { toast(t('refreshNoId', { title: item.title }), 'error'); return; }
    setBusyRow(item.slug);
    try {
      const { item: saved, coverWarning, changes = [] } = await api.refresh(item.slug);
      toast(t('refreshed', { title: saved.title }));
      const report = changes.map(changeText).filter(Boolean);
      if (report.length > 0) toast(report.join(' · '));
      if (coverWarning) toast(t('coverWarning', { msg: coverWarning }), 'error');
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusyRow('');
    }
  };

  // Re-fetch every entry that has a stored MyAnimeList id.
  const refreshAllItems = async () => {
    const count = data?.withMalId ?? 0;
    if (count === 0) { toast(t('refreshNothing'), 'error'); return; }
    if (!await confirm(t('confirmRefreshAll', { n: count }))) return;
    setBusyAll(true);
    try {
      const { updated, failed, results } = await runBulkJob(api.refreshAll, api.refreshAllStatus, setBulkProgress);
      for (const result of results.filter((entry) => !entry.ok)) toast(t('refreshOneFailed', { title: result.title, msg: result.error }), 'error');
      for (const result of results.filter((entry) => entry.ok && (entry.changes || []).length > 0)) {
        const report = result.changes.map(changeText).filter(Boolean);
        if (report.length > 0) toast(t('refreshChanged', { title: result.title, changes: report.join(' · ') }));
      }
      if (updated > 0) toast(t('refreshedMany', { n: updated }));
      if (updated === 0 && failed === 0) toast(t('refreshNothing'), 'error');
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusyAll(false);
      setBulkProgress(null);
    }
  };

  const formatDate = (value) => {
    const date = value ? new Date(`${String(value).replace(' ', 'T')}Z`) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB') : '—';
  };
  const scoreText = (score) => (score ? Number(score).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');
  const yearText = (year) => (year ? String(year).replace(/\d/g, (d) => (lang === 'fa' ? '۰۱۲۳۴۵۶۷۸۹'[d] : d)) : '—');
  const clearAll = () => { setQuery(''); setDebounced(''); setParams({}, { replace: true }); searchBox.current?.focus(); };
  const filtered = Boolean(debounced || filter);
  const from = data ? (data.page - 1) * 15 + 1 : 0;

  return (
    <section>
      <div className="adm-toolbar">
        <input ref={searchBox} className="adm-search" type="search" dir="auto" placeholder={t('searchTitles')} aria-label={t('searchTitles')} aria-keyshortcuts="/" title={t('alSearchKey')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }} />
        <label className="adm-sort">
          <span className="adm-muted">{t('sortLabel')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((key) => <option key={key} value={key}>{t(`sort${key[0].toUpperCase()}${key.slice(1)}`)}</option>)}
          </select>
        </label>
        {data && <span className="adm-muted al-total" aria-live="polite">{t('total', { n: num(data.total) })}</span>}
        {canEdit && <button className="adm-btn" type="button" disabled={busyAll || !(data?.withMalId > 0)} title={t('refreshAllHint')} onClick={refreshAllItems}>
          {busyAll ? `${t('refreshing')}${bulkProgress ? ` ${num(bulkProgress.done)}/${num(bulkProgress.total)}` : ''}` : t('refreshAll')}
        </button>}
        {canEdit && <Link className="adm-btn adm-primary adm-push" to="/admin/new">+ {t('newAnime')}</Link>}
      </div>
      <div className="adm-filters" role="group" aria-label={t('attTitle')}>
        <button type="button" className={`adm-fchip${filter === '' ? ' is-on' : ''}`} aria-pressed={filter === ''} onClick={() => setFilter('')}>{t('filterAll')}</button>
        {[['noCover', 'attNoCover'], ['noPersian', 'attNoPersian'], ['noScore', 'attNoScore'], ['noMal', 'attNoMal']].map(([key, label]) => (
          <button key={key} type="button" className={`adm-fchip${filter === key ? ' is-on' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(filter === key ? '' : key)}>
            {t(label)}{overview?.attention ? <b>{num(overview.attention[key])}</b> : null}
          </button>
        ))}
      </div>
      {error && <p className="adm-error" role="alert">{error} <button className="adm-btn" type="button" onClick={load}>{t('mangaRetry')}</button></p>}
      <div className={`adm-card adm-table-wrap al-wrap${loading && data ? ' is-loading' : ''}`} aria-busy={loading}>
        <table className="adm-table al-table">
          <thead>
            <tr><th>{t('cover')}</th><th>{t('title')}</th><th>{t('type')}</th><th>{t('year')}</th><th>{t('score')}</th><th>{t('updated')}</th><th>{t('actions')}</th></tr>
          </thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.slug}>
                <td className="al-cover">{item.image ? <img className="adm-thumb" src={item.image} alt="" width="42" height="58" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="adm-thumb adm-thumb-empty" title={t('noCover')} />}</td>
                <td className="al-title"><Link to={`/admin/edit/${item.slug}`} dir="auto"><strong>{item.title}</strong></Link><div className="adm-muted al-slug" dir="ltr">{item.slug}</div>
                  <div className="al-meta" aria-hidden="true">{[item.format, item.year && yearText(item.year), item.score && `★ ${scoreText(item.score)}`].filter(Boolean).join(' · ')}</div>
                  {!item.malId && <span className="adm-chip al-nomal">{t('attNoMal')}</span>}
                </td>
                <td className="al-col" data-th={t('type')}>{item.format || '—'}</td>
                <td className="al-col" data-th={t('year')}>{yearText(item.year)}</td>
                <td className="al-col" data-th={t('score')}>{scoreText(item.score)}</td>
                <td className="al-col al-date" data-th={t('updated')}>{formatDate(item.updatedAt)}</td>
                <td className="al-actions" data-th={t('actions')}><div className="adm-actions">
                  {canEdit ? <Link className="adm-btn adm-primary" to={`/admin/edit/${item.slug}`}>{t('edit')}</Link> : <Link className="adm-btn" to={`/admin/edit/${item.slug}`}>{t('alOpen')}</Link>}
                  <details className="adm-more">
                    <summary className="adm-btn" aria-label={t('moreActions')} title={t('moreActions')}>⋯</summary>
                    <div className="adm-more-menu">
                      <Link to={mediaHref(item)} target="_blank">{t('view')}</Link>
                      {canEdit && <button type="button" disabled={!item.malId || busyRow === item.slug} title={item.malId ? t('refreshBtn') : t('refreshNoId', { title: item.title })} onClick={(e) => { e.currentTarget.closest('details').open = false; refreshItem(item); }}>
                        {busyRow === item.slug ? t('refreshing') : t('refreshBtn')}
                      </button>}
                      {canEdit && <button type="button" className="is-danger" onClick={(e) => { e.currentTarget.closest('details').open = false; remove(item); }}>{t('delete')}</button>}
                    </div>
                  </details>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="adm-empty">{filtered ? t('alEmptyFiltered') : t('empty')}{filtered && <button className="adm-btn" type="button" onClick={clearAll}>{t('mangaClearFilters')}</button>}</p>}
        {!data && !error && <div className="adm-skeleton" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</div>}
      </div>
      {data && data.pages > 1 && (
        <div className="adm-pager">
          <button className="adm-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</button>
          <span>{t('pageOf', { page: num(data.page), pages: num(data.pages) })} · {t('alRange', { from: num(from), to: num(from + data.items.length - 1), total: num(data.total) })}</span>
          <button className="adm-btn" type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>{t('next')}</button>
        </div>
      )}
    </section>
  );
}
