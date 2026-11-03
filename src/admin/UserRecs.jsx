import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const fmtDate = (iso, lang) => new Date(iso).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB');

const TitleLink = ({ type, slug }) => (
  <a href={`/${type}/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer" dir="ltr">{slug}</a>
);

// Moderation list for "if you liked this" recommendations (B2). They are write-once
// for members, so removing an inappropriate one happens here.
export default function UserRecs() {
  const { t, lang, toast } = useAdmin();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    api.recsList(debounced, page)
      .then((result) => { if (active) { setData(result); setError(''); } })
      .catch((err) => { if (active) setError(errText(err, t)); });
    return () => { active = false; };
  }, [debounced, page, reloadKey, t]);

  const remove = async (rec) => {
    if (!window.confirm(t('rcDeleteConfirm', { name: rec.username }))) return;
    setBusyId(rec.id);
    try {
      await api.recsRemove(rec.id);
      toast(t('rcDeleted'));
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else setReloadKey((n) => n + 1);
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="adm-toolbar">
        <input className="adm-search" type="search" dir="auto" placeholder={t('rcSearch')} aria-label={t('rcSearch')} value={query} onChange={(event) => setQuery(event.target.value)} />
        {data && <span className="adm-muted">{t('rcTotal', { n: data.total })}</span>}
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="adm-card adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>{t('uName')}</th><th>{t('rcPair')}</th><th>{t('rcText')}</th><th>{t('rcHelpful')}</th><th>{t('rvDate')}</th><th>{t('actions')}</th></tr>
          </thead>
          <tbody>
            {data?.items.map((rec) => (
              <tr key={rec.id}>
                <td data-th={t('uName')}><strong dir="ltr">{rec.username}</strong></td>
                <td data-th={t('rcPair')}>
                  {/* One wrapper so the mobile card (flex cell) keeps the pair as a single item. */}
                  <span dir="ltr">
                    <TitleLink type={rec.mediaType} slug={rec.slugA} />
                    <span aria-hidden="true"> ↔ </span>
                    <TitleLink type={rec.mediaType} slug={rec.slugB} />
                  </span>
                  <span className="adm-chip">{rec.mediaType === 'manga' ? t('uManga') : t('uAnime')}</span>
                </td>
                <td data-th={t('rcText')} dir="auto" className="adm-review-body">{rec.body}</td>
                <td data-th={t('rcHelpful')}>{rec.helpful}</td>
                <td data-th={t('rvDate')}>{fmtDate(rec.createdAt, lang)}</td>
                <td data-th={t('actions')}>
                  <button className="adm-btn adm-danger" type="button" disabled={busyId === rec.id} onClick={() => remove(rec)}>{t('delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="adm-empty">{t('rcEmpty')}</p>}
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
