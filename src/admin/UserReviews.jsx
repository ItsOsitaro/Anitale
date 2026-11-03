import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const fmtDate = (iso, lang) => new Date(iso).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB');

// Moderation list for public reviews. Users cannot edit or delete theirs,
// so removing an inappropriate one happens here.
export default function UserReviews() {
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
    api.reviewsList(debounced, page)
      .then((result) => { if (active) { setData(result); setError(''); } })
      .catch((err) => { if (active) setError(errText(err, t)); });
    return () => { active = false; };
  }, [debounced, page, reloadKey, t]);

  const remove = async (review) => {
    if (!window.confirm(t('rvDeleteConfirm', { name: review.username }))) return;
    setBusyId(review.id);
    try {
      await api.reviewsRemove(review.id);
      toast(t('rvDeleted'));
      // The last review on a page was removed: step back so the page is not empty.
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
        <input className="adm-search" type="search" dir="auto" placeholder={t('rvSearch')} aria-label={t('rvSearch')} value={query} onChange={(event) => setQuery(event.target.value)} />
        {data && <span className="adm-muted">{t('rvTotal', { n: data.total })}</span>}
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="adm-card adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>{t('uName')}</th><th>{t('rvTitle')}</th><th>{t('rvText')}</th><th>{t('rvDate')}</th><th>{t('actions')}</th></tr>
          </thead>
          <tbody>
            {data?.items.map((review) => (
              <tr key={review.id}>
                <td data-th={t('uName')}><strong dir="ltr">{review.username}</strong></td>
                <td data-th={t('rvTitle')}>
                  <a href={`/${review.mediaType}/${encodeURIComponent(review.slug)}`} target="_blank" rel="noreferrer" dir="ltr">{review.slug}</a>
                  <span className="adm-chip">{review.mediaType === 'manga' ? t('uManga') : t('uAnime')}</span>
                  {review.rating != null && <span className="adm-chip">{review.rating}/10</span>}
                  {review.spoiler && <span className="adm-chip">{t('rvSpoiler')}</span>}
                </td>
                <td data-th={t('rvText')} dir="auto" className="adm-review-body">{review.body}</td>
                <td data-th={t('rvDate')}>{fmtDate(review.createdAt, lang)}</td>
                <td data-th={t('actions')}>
                  <button className="adm-btn adm-danger" type="button" disabled={busyId === review.id} onClick={() => remove(review)}>{t('delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="adm-empty">{t('rvEmpty')}</p>}
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
