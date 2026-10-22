import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const PAGE_SIZE = 20; // client-side pager — the manga endpoint returns every row at once

// Queue 25/27: manga management mirrors the anime list — same toolbar
// (search, count, update-all, add action) and the same table structure.
export default function MangaList() {
  const { t, lang, toast } = useAdmin();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [busyAll, setBusyAll] = useState(false);
  // inline editor state: { slug, draft }
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    // alive-guard: a stale response must not overwrite a newer one.
    let active = true;
    api.mangaList().then((items) => { if (active) { setRows(items || []); setError(''); } }).catch((err) => { if (active) setError(errText(err, t)); });
    return () => { active = false; };
  }, [t]);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    const needle = debounced.toLowerCase();
    return (rows || []).filter((row) => {
      if (!needle) return true;
      return `${row.title} ${row.titleFa || ''} ${row.slug}`.toLowerCase().includes(needle);
    });
  }, [rows, debounced]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Human text for one change ({field, from, to}) — same report as the anime list.
  const changeText = (change) => {
    if (!change) return '';
    const labels = { title: t('mangaFieldTitle'), titleFa: t('mangaFieldFa'), category: t('mangaFieldCategory'), year: t('mangaFieldYear'), score: t('mangaFieldScore'), chapters: t('mangaColChapters') };
    const label = labels[change.field] || change.field;
    return `${label}: ${change.from ?? '—'} → ${change.to ?? '—'}`;
  };

  const remove = async (row) => {
    if (!window.confirm(t('mangaConfirmDelete', { title: row.title }))) return;
    setBusy(row.slug);
    try {
      await api.mangaRemove(row.slug);
      setRows((current) => current.filter((x) => x.slug !== row.slug));
      toast(t('mangaDeleted', { title: row.title }));
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
      setRows((current) => current.map((x) => (x.slug === row.slug ? { ...x, ...item, image: item.image || x.image } : x)));
      toast(t('mangaRefreshed', { title: item.title }));
      if (changes.length > 0) toast(changes.map((c) => `${c.field}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join(' · '));
      if (coverWarning) toast(t('coverWarning', { msg: coverWarning }), 'error');
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusy('');
    }
  };

  // Re-fetch every manga that stores a MyAnimeList id (same flow as the anime list).
  const refreshAllRows = async () => {
    const count = (rows || []).filter((row) => row.malId).length;
    if (count === 0) { toast(t('mangaUpdateNothing'), 'error'); return; }
    if (!window.confirm(t('mangaConfirmUpdateAll', { n: count }))) return;
    setBusyAll(true);
    try {
      const { updated, failed, results } = await api.mangaRefreshAll();
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
    }
  };

  const startEdit = (row) => {
    setEditing({
      slug: row.slug,
      draft: {
        title: row.title || '',
        titleFa: row.titleFa || '',
        category: row.category || '',
        year: String(row.year || ''),
        score: row.sampleScore ?? '',
      },
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { slug, draft } = editing;
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
      setRows((current) => current.map((x) => (x.slug === slug ? { ...x, ...item } : x)));
      setEditing(null);
      toast(t('mangaSaved', { title: item.title }));
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusy('');
    }
  };

  const draftField = (key, event) => setEditing((current) => ({ ...current, draft: { ...current.draft, [key]: event.target.value } }));

  const formatDate = (value) => {
    if (!value) return '—';
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    return new Date(`${normalized}Z`).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB');
  };

  return (
    <section>
      <div className="adm-toolbar">
        <input className="adm-search" type="search" dir="auto" placeholder={t('mangaSearch')} aria-label={t('mangaSearch')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {rows && <span className="adm-muted">{t('mangaTotal', { n: shown.length })}</span>}
        <button className="adm-btn" type="button" disabled={busyAll || !rows?.some((x) => x.malId)} title={t('mangaUpdateAllHint')} onClick={refreshAllRows}>
          {busyAll ? t('refreshing') : t('mangaUpdateAll')}
        </button>
        <Link className="adm-btn adm-primary adm-push" to="/admin/bulk-import?type=manga">+ {t('mangaNew')}</Link>
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}

      <div className="adm-card adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
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
            {pageRows.map((row) => (
              <React.Fragment key={row.slug}>
                <tr>
                  <td>{row.image ? <img className="adm-thumb" src={row.image} alt="" /> : <span className="adm-thumb adm-thumb-empty" />}</td>
                  <td>
                    <Link to={`/manga/${row.slug}`} dir="auto"><strong>{row.title}</strong></Link>
                    <div className="adm-muted" dir="ltr">{row.slug}{row.malId ? ` · MAL ${row.malId}` : ''}</div>
                  </td>
                  <td data-th={t('mangaColFa')} dir="auto">{row.titleFa || '—'}</td>
                  <td data-th={t('mangaColYear')}>{row.year || '—'}</td>
                  <td data-th={t('mangaColScore')}>{row.sampleScore != null ? Number(row.sampleScore).toFixed(1) : '—'}</td>
                  <td data-th={t('mangaColChapters')}>{row.chapters ?? '—'}</td>
                  <td data-th={t('updated')}>{formatDate(row.updatedAt)}</td>
                  <td data-th={t('mangaColActions')}>
                    <div className="adm-actions">
                      <button className="adm-btn" type="button" disabled={busy === row.slug} onClick={() => (editing?.slug === row.slug ? setEditing(null) : startEdit(row))}>{editing?.slug === row.slug ? t('mangaClose') : t('mangaEdit')}</button>
                      <Link className="adm-btn" to={`/manga/${row.slug}`} target="_blank">{t('view')}</Link>
                      <button className="adm-btn" type="button" disabled={busy === row.slug || !row.malId} title={row.malId ? t('mangaRefreshBtn') : t('mangaRefreshNoId', { title: row.title })} onClick={() => refresh(row)}>{busy === row.slug ? t('mangaBusy') : t('mangaRefreshBtn')}</button>
                      <button className="adm-btn adm-danger" type="button" disabled={busy === row.slug} onClick={() => remove(row)}>{t('mangaDelete')}</button>
                    </div>
                  </td>
                </tr>
                {editing?.slug === row.slug && (
                  <tr className="manga-edit-row">
                    <td colSpan={8}>
                      <div className="manga-editor">
                        <label><span>{t('mangaFieldTitle')}</span><input dir="auto" value={editing.draft.title} onChange={(e) => draftField('title', e)} /></label>
                        <label><span>{t('mangaFieldFa')}</span><input dir="auto" value={editing.draft.titleFa} onChange={(e) => draftField('titleFa', e)} /></label>
                        <label><span>{t('mangaFieldCategory')}</span><input dir="auto" value={editing.draft.category} onChange={(e) => draftField('category', e)} /></label>
                        <label><span>{t('mangaFieldYear')}</span><input type="number" min="0" dir="ltr" value={editing.draft.year} onChange={(e) => draftField('year', e)} /></label>
                        <label><span>{t('mangaFieldScore')}</span><input type="number" step="0.1" min="0" max="10" dir="ltr" value={editing.draft.score} onChange={(e) => draftField('score', e)} /></label>
                        <div className="manga-editor-actions">
                          <button className="adm-btn adm-primary" type="button" disabled={busy === row.slug} onClick={saveEdit}>{t('mangaSave')}</button>
                          <button className="adm-btn" type="button" onClick={() => setEditing(null)}>{t('mangaCancel')}</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {rows && shown.length === 0 && <p className="adm-empty">{t('mangaEmpty')}</p>}
        {!rows && !error && <p className="adm-empty">{t('loading')}</p>}
      </div>
      {pages > 1 && (
        <div className="adm-pager">
          <button className="adm-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</button>
          <span>{t('pageOf', { page, pages })}</span>
          <button className="adm-btn" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('next')}</button>
        </div>
      )}
    </section>
  );
}
