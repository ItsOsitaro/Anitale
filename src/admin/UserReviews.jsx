import React, { useEffect, useRef, useState } from 'react';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import {
  BulkBar, Chip, Clamp, ErrorBar, Pager, Skeleton, call, fmtDate, num, qs, useDebounced, useRemoteList, useSearchHotkey, useSelection,
} from './pages/communityKit.jsx';
import { placeMenu } from './pages/review5Kit.js';

const SORTS = ['new', 'old', 'helpful', 'high', 'low', 'long'];
const API = '/api/admin/x/community/reviews';
const snippet = (text) => (text.length > 120 ? `${text.slice(0, 120).trimEnd()}…` : text).replace(/\s+/g, ' ');

// Moderation list for public reviews. Users cannot edit or delete theirs,
// so removing an inappropriate one happens here.
export default function UserReviews() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('reviews', 'edit');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [voted, setVoted] = useState(false);
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(null);
  const q = useDebounced(query.trim(), 250);
  const filters = { q, type, spoiler: spoiler ? 1 : '', voted: voted ? 1 : '', sort };

  // Any filter change goes back to page 1.
  useEffect(() => { setPage(1); }, [q, type, spoiler, voted, sort]);

  const { data, error, loading, reload } = useRemoteList(API, { ...filters, page, limit: 15 }, (e) => errText(e, t));
  const sel = useSelection(data?.items);
  const onSearchKey = useSearchHotkey(searchRef, () => setQuery(''));
  const filtered = Boolean(q || type || spoiler || voted);
  const clearFilters = () => { setQuery(''); setType(''); setSpoiler(false); setVoted(false); };

  const afterDelete = (removed) => {
    sel.clear();
    if (data && removed >= data.items.length && page > 1) setPage(page - 1);
    else reload();
  };

  const remove = async (review) => {
    if (!await confirm(t('rvDeleteConfirmText', { name: review.username, text: snippet(review.body) }))) return;
    setBusy(true);
    try {
      await call('POST', `${API}/bulk-delete`, { ids: [review.id] });
      toast(t('rvDeleted'));
      afterDelete(1);
    } catch (err) { toast(errText(err, t), 'error'); } finally { setBusy(false); }
  };

  const removeSelected = async () => {
    if (!await confirm(t('cmBulkConfirm', { n: num(sel.count, lang) }))) return;
    setBusy(true);
    try {
      const { deleted } = await call('POST', `${API}/bulk-delete`, { ids: [...sel.ids] });
      toast(t('cmBulkDone', { n: num(deleted, lang) }));
      afterDelete(sel.count);
    } catch (err) { toast(errText(err, t), 'error'); } finally { setBusy(false); }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast(t('cmCopied')); } catch { toast(t('cmCopyFail'), 'error'); }
  };
  const closeMenu = (e) => { const d = e.currentTarget.closest('details'); if (d) d.open = false; };
  const counts = data?.counts;
  const scoreClass = (r) => (r >= 8 ? 'is-ok' : r <= 4 ? 'is-bad' : 'is-mid');

  return (
    <section>
      <div className="adm-toolbar">
        <input ref={searchRef} className="adm-search" type="search" dir="auto" placeholder={t('rvSearch')} aria-label={t('rvSearch')} title={t('cmRowsHint')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} />
        <label className="adm-sort">
          <span className="adm-muted">{t('cmSort')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`rvSort_${s}`)}</option>)}
          </select>
        </label>
        {data && <span className="adm-muted" aria-live="polite">{t('rvTotal', { n: num(data.total, lang) })}</span>}
        <a className="adm-btn adm-push rv-csv" href={`${API}/export.csv?${qs(filters)}`} download aria-disabled={!data?.total}>{data ? t('cmExportN', { n: num(Math.min(data.total, 5000), lang) }) : t('cmExport')}</a>
      </div>

      <div className="adm-filters" role="group" aria-label={t('cmFilters')}>
        <Chip on={!filtered || (!type && !spoiler && !voted)} count={counts ? num(counts.all, lang) : null} onClick={() => { setType(''); setSpoiler(false); setVoted(false); }}>{t('cmAll')}</Chip>
        <Chip on={type === 'anime'} count={counts ? num(counts.anime, lang) : null} onClick={() => setType(type === 'anime' ? '' : 'anime')}>{t('uAnime')}</Chip>
        <Chip on={type === 'manga'} count={counts ? num(counts.manga, lang) : null} onClick={() => setType(type === 'manga' ? '' : 'manga')}>{t('uManga')}</Chip>
        <Chip on={spoiler} count={counts ? num(counts.spoiler, lang) : null} onClick={() => setSpoiler((v) => !v)}>{t('rvSpoiler')}</Chip>
        <Chip on={voted} count={counts?.voted != null ? num(counts.voted, lang) : null} onClick={() => setVoted((v) => !v)}>{t('rvHelpfulOnly')}</Chip>
      </div>

      <ErrorBar error={error} onRetry={reload} t={t} />
      {!canEdit && <p className="adm-muted cm-readonly">{t('cmReadOnly')}</p>}
      {canEdit && <BulkBar count={sel.count} t={t} lang={lang} onClear={sel.clear}>
        <button className="adm-btn adm-danger" type="button" disabled={busy} onClick={removeSelected}>{busy ? t('cmDeleting') : t('cmDeleteSelected')}</button>
      </BulkBar>}

      <div className={`adm-card adm-table-wrap rv-table-wrap${loading && data ? ' cm-stale' : ''}`} aria-busy={loading}>
        {!data && !error ? <Skeleton /> : (
          <table className="adm-table rv-table">
            <thead>
              <tr>
                {canEdit && <th className="cm-check"><input className="rv-check" type="checkbox" aria-label={t('cmSelectAll')} checked={sel.all} onChange={sel.toggleAll} disabled={!data?.items.length} /></th>}
                <th>{t('uName')}</th><th>{t('rvTitle')}</th><th className="rv-num">{t('rvScore')}</th><th>{t('rvText')}</th><th className="rv-num">{t('rvHelpful')}</th><th>{t('rvDate')}</th>{canEdit && <th>{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((review) => (
                <tr key={review.id} className={sel.has(review.id) ? 'is-selected' : undefined}>
                  {canEdit && <td className="cm-check"><input className="rv-check" type="checkbox" aria-label={t('cmSelectRow', { name: review.username })} checked={sel.has(review.id)} onChange={() => sel.toggle(review.id)} /></td>}
                  <td data-th={t('uName')}><strong dir="ltr" className="rv-user" title={review.username}>{review.username}</strong></td>
                  <td data-th={t('rvTitle')}>
                    <div className="rv-title">
                      <a href={`/${review.mediaType}/${encodeURIComponent(review.slug)}`} target="_blank" rel="noreferrer" dir="auto">{review.title || <span className="rv-gone">{t('rvGone')}</span>}</a>
                      <span className="rv-slug" dir="ltr">{review.slug}</span>
                      <span className="rv-chips">
                        <span className="adm-chip">{review.mediaType === 'manga' ? t('uManga') : t('uAnime')}</span>
                        {review.spoiler && <span className="adm-chip is-bad">{t('rvSpoiler')}</span>}
                      </span>
                    </div>
                  </td>
                  <td data-th={t('rvScore')} className="rv-num">
                    {review.rating != null ? <span className={`adm-chip rv-score ${scoreClass(review.rating)}`}>{num(review.rating, lang)}/{num(10, lang)}</span> : <span className="adm-muted">—</span>}
                  </td>
                  <td data-th={t('rvText')} className="adm-review-body rv-text">
                    <Clamp text={review.body} t={t} />
                    {review.body.length > 600 && <span className="rv-len">{t('rvLong', { n: num(review.body.length, lang) })}</span>}
                  </td>
                  <td data-th={t('rvHelpful')} className="rv-num">{review.helpful > 0 ? <span className="adm-chip is-ok">{num(review.helpful, lang)}</span> : <span className="adm-muted">{num(0, lang)}</span>}</td>
                  <td data-th={t('rvDate')} className="rv-date" title={fmtDate(review.createdAt, lang, true)}>{fmtDate(review.createdAt, lang)}</td>
                  {canEdit && <td data-th={t('actions')}>
                    <div className="adm-actions">
                      <button className="adm-btn adm-danger" type="button" disabled={busy} onClick={() => remove(review)}>{t('delete')}</button>
                      <details className="adm-more" onToggle={placeMenu}>
                        <summary className="adm-btn" aria-label={t('cmMoreActions')}>⋯</summary>
                        <div className="adm-more-menu">
                          <a href={`/${review.mediaType}/${encodeURIComponent(review.slug)}`} target="_blank" rel="noreferrer" onClick={closeMenu}>{t('cmViewTitle')}</a>
                          <a href={`/user/${encodeURIComponent(review.username)}`} target="_blank" rel="noreferrer" onClick={closeMenu}>{t('cmProfile')}</a>
                          <button type="button" onClick={(e) => { closeMenu(e); copy(review.body); }}>{t('cmCopyText')}</button>
                          <button type="button" onClick={(e) => { closeMenu(e); setQuery(review.username); }}>{t('cmByUser')}</button>
                        </div>
                      </details>
                    </div>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.items.length === 0 && (
          <div className="adm-empty">
            <p>{filtered ? t('cmNoMatch') : t('rvEmpty')}</p>
            {filtered && <button className="adm-btn" type="button" onClick={clearFilters}>{t('cmClearFilters')}</button>}
          </div>
        )}
      </div>
      <Pager data={data} page={page} setPage={setPage} t={t} lang={lang} />
    </section>
  );
}
