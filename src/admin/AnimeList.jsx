import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import { mediaHref } from '../catalog.js';

export default function AnimeList() {
  const { t, lang, toast } = useAdmin();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyRow, setBusyRow] = useState('');
  const [busyAll, setBusyAll] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    // alive-guard: a stale response must not overwrite a newer one.
    let active = true;
    api.list(debounced, page).then((result) => { if (active) { setData(result); setError(''); } }).catch((err) => { if (active) setError(errText(err, t)); });
    return () => { active = false; };
  }, [debounced, page, t]);
  useEffect(load, [load]);

  const remove = async (item) => {
    if (!window.confirm(t('confirmDelete', { title: item.title }))) return;
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

  // Re-fetch one entry from MyAnimeList (Jikan, or AniList when unreachable).
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
    if (!window.confirm(t('confirmRefreshAll', { n: count }))) return;
    setBusyAll(true);
    try {
      const { updated, failed, results } = await api.refreshAll();
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
    }
  };

  const formatDate = (value) => new Date(`${value.replace(' ', 'T')}Z`).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB');

  return (
    <section>
      <div className="adm-toolbar">
        <input className="adm-search" type="search" dir="auto" placeholder={t('searchTitles')} aria-label={t('searchTitles')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {data && <span className="adm-muted">{t('total', { n: data.total })}</span>}
        <button className="adm-btn" type="button" disabled={busyAll || !data?.items.some((item) => item.malId)} title={t('refreshAllHint')} onClick={refreshAllItems}>
          {busyAll ? t('refreshing') : t('refreshAll')}
        </button>
        <Link className="adm-btn adm-primary adm-push" to="/admin/new">+ {t('newAnime')}</Link>
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="adm-card adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>{t('cover')}</th><th>{t('title')}</th><th>{t('type')}</th><th>{t('year')}</th><th>{t('score')}</th><th>{t('updated')}</th><th>{t('actions')}</th></tr>
          </thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.slug}>
                <td>{item.image ? <img className="adm-thumb" src={item.image} alt="" /> : <span className="adm-thumb adm-thumb-empty" />}</td>
                <td><Link to={`/admin/edit/${item.slug}`} dir="auto"><strong>{item.title}</strong></Link><div className="adm-muted" dir="ltr">{item.slug}</div></td>
                <td data-th={t('type')}>{item.format}</td>
                <td data-th={t('year')}>{item.year}</td>
                <td data-th={t('score')}>{item.score ? Number(item.score).toFixed(1) : '—'}</td>
                <td data-th={t('updated')}>{formatDate(item.updatedAt)}</td>
                <td data-th={t('actions')}><div className="adm-actions">
                  <Link className="adm-btn" to={`/admin/edit/${item.slug}`}>{t('edit')}</Link>
                  <Link className="adm-btn" to={mediaHref(item)} target="_blank">{t('view')}</Link>
                  <button
                    className="adm-btn"
                    type="button"
                    disabled={!item.malId || busyRow === item.slug}
                    title={item.malId ? t('refreshBtn') : t('refreshNoId', { title: item.title })}
                    onClick={() => refreshItem(item)}
                  >
                    {busyRow === item.slug ? t('refreshing') : t('refreshBtn')}
                  </button>
                  <button className="adm-btn adm-danger" type="button" onClick={() => remove(item)}>{t('delete')}</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="adm-empty">{t('empty')}</p>}
        {!data && !error && <p className="adm-empty">{t('loading')}</p>}
      </div>
      {data && data.pages > 1 && (
        <div className="adm-pager">
          <button className="adm-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</button>
          <span>{t('pageOf', { page: data.page, pages: data.pages })}</span>
          <button className="adm-btn" type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>{t('next')}</button>
        </div>
      )}
    </section>
  );
}
