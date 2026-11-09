import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, runBulkJob } from './api.js';
import { BulkBar, SavedViews } from './ToolsPages.jsx';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import { formatNumber, formatScore } from '../lib/digits.js';

// Server-side pager: the table can hold 100k+ rows, so only one page is fetched at a time.
// Search / sort / filter / page live in the URL, so reload and the back button keep the view.
const SORTS = ['updated', 'title', 'score', 'year', 'chapters'];
const FILTERS = [['noCover', 'attNoCover'], ['noFa', 'mangaAttNoFa'], ['noScore', 'attNoScore'], ['noYear', 'mangaAttNoYear'], ['noMal', 'attNoMal']];

// Own fetch (api.mangaPage has no sort/filter). Same-origin cookie session, JSON in/out.
const fetchPage = async ({ q, page, sort, filter }) => {
  const qs = new URLSearchParams({ q, page: String(page), limit: '20', sort });
  if (filter) qs.set('filter', filter);
  let response;
  try { response = await fetch(`/api/admin/manga?${qs}`, { credentials: 'same-origin' }); } catch { throw new Error('NETWORK'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('admin-unauthorized'));
    const err = new Error(data?.error || response.statusText);
    err.status = response.status;
    throw err;
  }
  return data;
};

export default function MangaList() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('catalog', 'edit');
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') || '';
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'updated';
  const filter = FILTERS.some(([key]) => key === params.get('filter')) ? params.get('filter') : '';
  const page = Math.max(parseInt(params.get('page'), 10) || 1, 1);

  const [query, setQuery] = useState(urlQ);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [busyAll, setBusyAll] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  // inline editor state: { slug, draft, original }
  const [editing, setEditing] = useState(null);
  const [fieldErr, setFieldErr] = useState({});
  const searchRef = useRef(null);

  // One helper to change URL state; any change except the page itself resets to page 1.
  const update = useCallback((patch) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      const merged = { page: 1, ...patch };
      for (const [key, value] of Object.entries(merged)) {
        if (value === '' || value == null || (key === 'page' && Number(value) <= 1) || (key === 'sort' && value === 'updated')) next.delete(key);
        else next.set(key, String(value));
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    const timer = setTimeout(() => { if (query.trim() !== urlQ) update({ q: query.trim(), sort, filter }); }, 300);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Press "/" anywhere (outside a field) to jump to the search box.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Row menus are <details>: close any open one on outside click or Esc.
  useEffect(() => {
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      document.querySelectorAll('details.adm-more[open]').forEach((d) => { if (event.type === 'keydown' || !d.contains(event.target)) d.open = false; });
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close); };
  }, []);

  const num = (value) => formatNumber(value, lang);

  const load = useCallback(() => {
    // alive-guard: a stale response must not overwrite a newer one.
    let active = true;
    setLoading(true);
    fetchPage({ q: urlQ, page, sort, filter })
      .then((res) => {
        if (!active) return;
        // Deleting the last row of the last page leaves an empty page: step back.
        if (res.items.length === 0 && page > res.pages) { update({ page: res.pages, q: urlQ, sort, filter }); return; }
        setData(res);
        setError('');
      })
      .catch((err) => { if (active) setError(errText(err, t)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t, urlQ, page, sort, filter, update]);
  useEffect(load, [load]);

  const rows = data?.items || [];
  const att = data?.attention;
  const [picked, setPicked] = useState(() => new Set());
  const togglePick = (slug) => setPicked((current) => { const next = new Set(current); if (next.has(slug)) next.delete(slug); else next.add(slug); return next; });

  // Human text for one change ({field, from, to}) — same report as the anime list.
  const changeText = (change) => {
    if (!change) return '';
    const labels = { title: t('mangaFieldTitle'), titleFa: t('mangaFieldFa'), category: t('mangaFieldCategory'), year: t('mangaFieldYear'), score: t('mangaFieldScore'), chapters: t('mangaColChapters') };
    return `${labels[change.field] || change.field}: ${change.from ?? '—'} → ${change.to ?? '—'}`;
  };

  const closeMenu = (event) => { const d = event.currentTarget.closest('details'); if (d) d.open = false; };

  const remove = async (row) => {
    if (!await confirm(t('mangaConfirmDelete', { title: row.title }))) return;
    setBusy(row.slug);
    try {
      await api.mangaRemove(row.slug);
      toast(t('mangaDeleted', { title: row.title }));
      if (editing?.slug === row.slug) setEditing(null);
      load(); // counts and page numbers change too
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusy('');
    }
  };

  const refresh = async (row) => {
    if (!row.malId) { toast(t('mangaRefreshNoId', { title: row.title }), 'error'); return; }
    setBusy(row.slug);
    try {
      const { item, coverWarning, changes = [] } = await api.mangaRefresh(row.slug);
      setData((current) => ({ ...current, items: current.items.map((x) => (x.slug === row.slug ? { ...x, ...item, image: item.image || x.image } : x)) }));
      toast(t('mangaRefreshed', { title: item.title }));
      if (changes.length > 0) toast(changes.map(changeText).join(' · '));
      if (coverWarning) toast(t('coverWarning', { msg: coverWarning }), 'error');
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusy('');
    }
  };

  // Re-fetch every manga that stores a MyAnimeList id (same flow as the anime list).
  const refreshAllRows = async () => {
    const count = data?.withMalId || 0;
    if (count === 0) { toast(t('mangaUpdateNothing'), 'error'); return; }
    if (!await confirm(t('mangaConfirmUpdateAll', { n: count }))) return;
    setBusyAll(true);
    try {
      const { updated, failed, results } = await runBulkJob(api.mangaRefreshAll, api.mangaRefreshAllStatus, setBulkProgress);
      for (const result of results.filter((entry) => !entry.ok)) toast(t('refreshOneFailed', { title: result.title, msg: result.error }), 'error');
      for (const result of results.filter((entry) => entry.ok && (entry.changes || []).length > 0)) {
        const report = result.changes.map(changeText).filter(Boolean);
        if (report.length > 0) toast(t('refreshChanged', { title: result.title, changes: report.join(' · ') }));
      }
      if (failed === 0 && updated > 0) toast(t('mangaUpdatedMany', { n: updated }));
      if (updated === 0 && failed === 0) toast(t('mangaUpdateNothing'), 'error');
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusyAll(false);
      setBulkProgress(null);
    }
  };

  const startEdit = (row) => {
    const draft = { title: row.title || '', titleFa: row.titleFa || '', category: row.category || '', year: String(row.year || ''), score: row.sampleScore ?? '' };
    setFieldErr({});
    setEditing({ slug: row.slug, draft, original: draft });
  };

  const draftField = (key, event) => {
    const value = event.target.value;
    setEditing((current) => ({ ...current, draft: { ...current.draft, [key]: value } }));
    setFieldErr((current) => (current[key] ? { ...current, [key]: '' } : current));
  };

  // Client-side validation mirrors the server schema so errors show next to the field.
  const validate = (draft) => {
    const errs = {};
    if (!draft.title.trim()) errs.title = t('required');
    if (draft.year.trim() && !/^\d{1,4}$/.test(draft.year.trim())) errs.year = t('mangaErrYear');
    if (draft.score !== '' && draft.score != null && !(Number(draft.score) >= 0 && Number(draft.score) <= 10)) errs.score = t('mangaErrScore');
    return errs;
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { slug, draft, original } = editing;
    if (JSON.stringify(draft) === JSON.stringify(original)) { setEditing(null); return; } // nothing changed
    const errs = validate(draft);
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setBusy(slug);
    try {
      const patch = {
        title: draft.title.trim(),
        titleFa: draft.titleFa.trim(),
        category: draft.category.trim(),
        year: String(draft.year).trim(),
        score: draft.score === '' || draft.score == null ? null : Number(draft.score),
      };
      const { item } = await api.mangaUpdate(slug, patch);
      setData((current) => ({ ...current, items: current.items.map((x) => (x.slug === slug ? { ...x, ...item } : x)) }));
      setEditing(null);
      toast(t('mangaSaved', { title: item.title }));
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusy('');
    }
  };

  // Enter saves, Esc closes the inline editor.
  const editorKeys = (event) => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') { event.preventDefault(); saveEdit(); }
    else if (event.key === 'Escape') setEditing(null);
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const d = new Date(`${normalized}Z`);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB');
  };

  const filtered = Boolean(urlQ || filter);

  return (
    <section>
      <div className="adm-toolbar">
        <input ref={searchRef} className="adm-search" type="search" dir="auto" placeholder={t('mangaSearch')} aria-label={t('mangaSearch')} title={t('shortcutSearch')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="adm-sort">
          <span className="adm-muted">{t('sortLabel')}</span>
          <select value={sort} onChange={(e) => update({ q: urlQ, filter, sort: e.target.value })}>
            {SORTS.map((key) => <option key={key} value={key}>{t(`mangaSort_${key}`)}</option>)}
          </select>
        </label>
        {data && <span className="adm-muted manga-total" aria-live="polite">{t('mangaTotal', { n: num(data.total) })}</span>}
        {canEdit && (
          <>
            <button className="adm-btn" type="button" disabled={busyAll || !data?.withMalId} title={t('mangaUpdateAllHint')} onClick={refreshAllRows}>
              {busyAll ? `${t('refreshing')}${bulkProgress ? ` ${bulkProgress.done}/${bulkProgress.total}` : ''}` : t('mangaUpdateAll')}
            </button>
            <Link className="adm-btn adm-primary adm-push" to="/admin/bulk-import?type=manga">+ {t('mangaNew')}</Link>
          </>
        )}
      </div>
      <div className="adm-filters" role="group" aria-label={t('attTitle')}>
        <button type="button" className={`adm-fchip${filter === '' ? ' is-on' : ''}`} aria-pressed={filter === ''} onClick={() => update({ q: urlQ, sort, filter: '' })}>{t('filterAll')}</button>
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" className={`adm-fchip${filter === key ? ' is-on' : ''}`} aria-pressed={filter === key} onClick={() => update({ q: urlQ, sort, filter: filter === key ? '' : key })}>
            {t(label)}{att ? <b>{num(att[key])}</b> : null}
          </button>
        ))}
      </div>
      {error && (
        <p className="adm-error" role="alert">
          {error} <button className="adm-btn" type="button" onClick={load}>{t('mangaRetry')}</button>
        </p>
      )}

      <div className={`adm-card adm-table-wrap${loading && data ? ' manga-is-loading' : ''}`} aria-busy={loading}>
        <SavedViews scope="manga" value={params.toString()} onApply={(search) => setParams(new URLSearchParams(search), { replace: true })} />
        {canEdit && <BulkBar kind="manga" items={rows} picked={picked} clear={() => setPicked(new Set())} reload={load} />}
        <table className="adm-table">
          <thead>
            <tr>
              {canEdit && <th><input type="checkbox" aria-label={t('bulkAll')} checked={rows.length > 0 && rows.every((row) => picked.has(row.slug))} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((row) => row.slug)) : new Set())} /></th>}
              <th>{t('mangaColCover')}</th>
              <th>{t('mangaColTitle')}</th>
              <th>{t('mangaColFa')}</th>
              <th>{t('mangaColYear')}</th>
              <th>{t('mangaColScore')}</th>
              <th>{t('mangaColChapters')}</th>
              <th>{t('updated')}</th>
              <th>{t('mangaColActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isEditing = editing?.slug === row.slug;
              const rowBusy = busy === row.slug;
              return (
                <React.Fragment key={row.slug}>
                  <tr>
                    {canEdit && <td><input type="checkbox" aria-label={row.title} checked={picked.has(row.slug)} onChange={() => togglePick(row.slug)} /></td>}
                    <td className="manga-cover-cell">{row.image ? <img className="adm-thumb" src={row.image} alt="" loading="lazy" onError={(e) => e.currentTarget.classList.add("is-broken")} /> : <span className="adm-thumb adm-thumb-empty" />}</td>
                    <td className="manga-title-cell">
                      <Link to={`/manga/${row.slug}`} dir="auto"><strong>{row.title}</strong></Link>
                      <div className="manga-slug-line">
                        <span className="adm-muted manga-slug" dir="ltr" title={row.slug}>{row.slug}</span>
                        <span className={`adm-chip ${row.malId ? 'is-ok' : 'is-bad'}`} dir="ltr">{row.malId ? `MAL ${row.malId}` : t('attNoMal')}</span>
                      </div>
                    </td>
                    <td data-th={t('mangaColFa')} dir="auto" className={row.titleFa ? '' : 'manga-missing'}>{row.titleFa || '—'}</td>
                    <td data-th={t('mangaColYear')} className={row.year ? '' : 'manga-missing'}>{row.year ? formatNumber(row.year, lang, { useGrouping: false }) : '—'}</td>
                    <td data-th={t('mangaColScore')} className={row.sampleScore != null ? '' : 'manga-missing'}>{row.sampleScore != null ? formatScore(row.sampleScore, lang) : '—'}</td>
                    <td data-th={t('mangaColChapters')}>{row.chapters != null ? num(row.chapters) : '—'}</td>
                    <td data-th={t('updated')}>{formatDate(row.updatedAt)}</td>
                    <td data-th={t('mangaColActions')}>
                      <div className="adm-actions manga-actions">
                        {canEdit && <button className="adm-btn adm-primary" type="button" disabled={rowBusy} aria-expanded={isEditing} onClick={() => (isEditing ? setEditing(null) : startEdit(row))}>{isEditing ? t('mangaClose') : t('mangaEdit')}</button>}
                        <details className="adm-more">
                          <summary className="adm-btn" aria-label={t('moreActions')} title={t('moreActions')}>⋯</summary>
                          <div className="adm-more-menu">
                            <Link to={`/manga/${row.slug}`} target="_blank">{t('view')}</Link>
                            {canEdit && (
                              <>
                                <button type="button" disabled={rowBusy || !row.malId} title={row.malId ? t('mangaRefreshBtn') : t('mangaRefreshNoId', { title: row.title })} onClick={(e) => { closeMenu(e); refresh(row); }}>{rowBusy ? t('mangaBusy') : t('mangaRefreshBtn')}</button>
                                <button type="button" className="is-danger" disabled={rowBusy} onClick={(e) => { closeMenu(e); remove(row); }}>{t('mangaDelete')}</button>
                              </>
                            )}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr className="manga-edit-row">
                      <td colSpan={8}>
                        <div className="manga-editor" onKeyDown={editorKeys}>
                          <label><span>{t('mangaFieldTitle')} *</span><input autoFocus dir="auto" aria-invalid={Boolean(fieldErr.title)} value={editing.draft.title} onChange={(e) => draftField('title', e)} />{fieldErr.title && <small className="manga-field-err" role="alert">{fieldErr.title}</small>}</label>
                          <label><span>{t('mangaFieldFa')}</span><input dir="rtl" value={editing.draft.titleFa} onChange={(e) => draftField('titleFa', e)} /></label>
                          <label><span>{t('mangaFieldCategory')}</span><input dir="auto" value={editing.draft.category} onChange={(e) => draftField('category', e)} /></label>
                          <label><span>{t('mangaFieldYear')}</span><input inputMode="numeric" maxLength={4} dir="ltr" aria-invalid={Boolean(fieldErr.year)} value={editing.draft.year} onChange={(e) => draftField('year', e)} />{fieldErr.year && <small className="manga-field-err" role="alert">{fieldErr.year}</small>}</label>
                          <label><span>{t('mangaFieldScore')}</span><input type="number" step="0.1" min="0" max="10" dir="ltr" aria-invalid={Boolean(fieldErr.score)} value={editing.draft.score} onChange={(e) => draftField('score', e)} />{fieldErr.score && <small className="manga-field-err" role="alert">{fieldErr.score}</small>}</label>
                          <div className="manga-editor-actions">
                            {JSON.stringify(editing.draft) !== JSON.stringify(editing.original) && <span className="adm-chip manga-dirty">{t('afDirty')}</span>}
                            <button className="adm-btn adm-primary" type="button" disabled={rowBusy} onClick={saveEdit}>{rowBusy ? t('saving') : t('mangaSave')}</button>
                            <button className="adm-btn" type="button" onClick={() => setEditing(null)}>{t('mangaCancel')}</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {!data && !error && <div className="adm-skeleton" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</div>}
        {data && rows.length === 0 && (
          <p className="adm-empty">
            {filtered ? t('mangaEmptyFiltered') : t('mangaEmpty')}{' '}
            {filtered && <button className="adm-btn" type="button" onClick={() => { setQuery(''); update({ sort }); }}>{t('mangaClearFilters')}</button>}
          </p>
        )}
      </div>
      {data && data.pages > 1 && (
        <div className="adm-pager">
          <button className="adm-btn" type="button" disabled={page <= 1} onClick={() => update({ q: urlQ, sort, filter, page: page - 1 })}>{t('prev')}</button>
          <span>{t('pageOf', { page: num(data.page), pages: num(data.pages) })}</span>
          <span className="adm-muted">{t('mangaRange', { from: num((data.page - 1) * 20 + 1), to: num((data.page - 1) * 20 + rows.length), total: num(data.total) })}</span>
          <button className="adm-btn" type="button" disabled={page >= data.pages} onClick={() => update({ q: urlQ, sort, filter, page: page + 1 })}>{t('next')}</button>
        </div>
      )}
    </section>
  );
}
