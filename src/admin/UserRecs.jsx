import React, { useEffect, useRef, useState } from 'react';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import {
  BulkBar, Chip, Clamp, ErrorBar, Pager, Skeleton, call, fmtDate, num, qs, useDebounced, useRemoteList, useSearchHotkey, useSelection,
} from './pages/communityKit.jsx';
import { placeMenu } from './pages/review5Kit.js';

const SORTS = ['new', 'old', 'helpful', 'long'];
const API = '/api/admin/x/community/recs';
const snippet = (text) => (text.length > 120 ? `${text.slice(0, 120).trimEnd()}…` : text).replace(/\s+/g, ' ');

const TitleLink = ({ type, slug, title, t }) => (
  <span className="rv-pair-item">
    <a href={`/${type}/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer" dir="auto">{title || <span className="rv-gone">{t('rcGone')}</span>}</a>
    <span className="rv-slug" dir="ltr">{slug}</span>
  </span>
);

// Moderation list for "if you liked this" recommendations (B2). They are write-once
// for members, so removing an inappropriate one happens here.
export default function UserRecs() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('community', 'edit');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [voted, setVoted] = useState(false);
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(null);
  const q = useDebounced(query.trim(), 250);
  const filters = { q, type, voted: voted ? 1 : '', sort };

  useEffect(() => { setPage(1); }, [q, type, voted, sort]);

  const { data, error, loading, reload } = useRemoteList(API, { ...filters, page, limit: 15 }, (e) => errText(e, t));
  const sel = useSelection(data?.items);
  const onSearchKey = useSearchHotkey(searchRef, () => setQuery(''));
  const filtered = Boolean(q || type || voted);
  const counts = data?.counts;

  const afterDelete = (removed) => {
    sel.clear();
    if (data && removed >= data.items.length && page > 1) setPage(page - 1);
    else reload();
  };

  const remove = async (rec) => {
    if (!await confirm(t('rcDeleteConfirmText', { name: rec.username, text: snippet(rec.body) }))) return;
    setBusy(true);
    try {
      await call('POST', `${API}/bulk-delete`, { ids: [rec.id] });
      toast(t('rcDeleted'));
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

  return (
    <section>
      <div className="adm-toolbar">
        <input ref={searchRef} className="adm-search" type="search" dir="auto" placeholder={t('rcSearch')} aria-label={t('rcSearch')} title={t('cmRowsHint')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} />
        <label className="adm-sort">
          <span className="adm-muted">{t('cmSort')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`rcSort_${s}`)}</option>)}
          </select>
        </label>
        {data && <span className="adm-muted" aria-live="polite">{t('rcTotal', { n: num(data.total, lang) })}</span>}
        <a className="adm-btn adm-push rv-csv" href={`${API}/export.csv?${qs(filters)}`} download aria-disabled={!data?.total}>{data ? t('cmExportN', { n: num(Math.min(data.total, 5000), lang) }) : t('cmExport')}</a>
      </div>

      <div className="adm-filters" role="group" aria-label={t('cmFilters')}>
        <Chip on={!type && !voted} count={counts ? num(counts.all, lang) : null} onClick={() => { setType(''); setVoted(false); }}>{t('cmAll')}</Chip>
        <Chip on={type === 'anime'} count={counts ? num(counts.anime, lang) : null} onClick={() => setType(type === 'anime' ? '' : 'anime')}>{t('uAnime')}</Chip>
        <Chip on={type === 'manga'} count={counts ? num(counts.manga, lang) : null} onClick={() => setType(type === 'manga' ? '' : 'manga')}>{t('uManga')}</Chip>
        <Chip on={voted} count={counts ? num(counts.voted, lang) : null} onClick={() => setVoted((v) => !v)}>{t('rcVoted')}</Chip>
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
                <th>{t('uName')}</th><th>{t('rcPair')}</th><th>{t('rcText')}</th><th className="rv-num">{t('rcHelpful')}</th><th>{t('rvDate')}</th>{canEdit && <th>{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((rec) => (
                <tr key={rec.id} className={sel.has(rec.id) ? 'is-selected' : undefined}>
                  {canEdit && <td className="cm-check"><input className="rv-check" type="checkbox" aria-label={t('cmSelectRow', { name: rec.username })} checked={sel.has(rec.id)} onChange={() => sel.toggle(rec.id)} /></td>}
                  <td data-th={t('uName')}><strong dir="ltr" className="rv-user" title={rec.username}>{rec.username}</strong></td>
                  <td data-th={t('rcPair')}>
                    {/* One wrapper so the mobile card (flex cell) keeps the pair as a single item. */}
                    <div className="rv-pair">
                      <TitleLink type={rec.mediaType} slug={rec.slugA} title={rec.titleA} t={t} />
                      <span className="rv-pair-arrow" aria-hidden="true">↕</span>
                      <TitleLink type={rec.mediaType} slug={rec.slugB} title={rec.titleB} t={t} />
                      <span className="rv-chips"><span className="adm-chip">{rec.mediaType === 'manga' ? t('uManga') : t('uAnime')}</span></span>
                    </div>
                  </td>
                  <td data-th={t('rcText')} className="adm-review-body rv-text"><Clamp text={rec.body} t={t} /></td>
                  <td data-th={t('rcHelpful')} className="rv-num">{rec.helpful > 0 ? <span className="adm-chip is-ok">{num(rec.helpful, lang)}</span> : <span className="adm-muted">{num(0, lang)}</span>}</td>
                  <td data-th={t('rvDate')} className="rv-date" title={fmtDate(rec.createdAt, lang, true)}>{fmtDate(rec.createdAt, lang)}</td>
                  {canEdit && <td data-th={t('actions')}>
                    <div className="adm-actions">
                      <button className="adm-btn adm-danger" type="button" disabled={busy} onClick={() => remove(rec)}>{t('delete')}</button>
                      <details className="adm-more" onToggle={placeMenu}>
                        <summary className="adm-btn" aria-label={t('cmMoreActions')}>⋯</summary>
                        <div className="adm-more-menu">
                          <a href={`/${rec.mediaType}/${encodeURIComponent(rec.slugA)}`} target="_blank" rel="noreferrer" onClick={closeMenu}>{t('cmViewTitle')} (1)</a>
                          <a href={`/${rec.mediaType}/${encodeURIComponent(rec.slugB)}`} target="_blank" rel="noreferrer" onClick={closeMenu}>{t('cmViewTitle')} (2)</a>
                          <a href={`/user/${encodeURIComponent(rec.username)}`} target="_blank" rel="noreferrer" onClick={closeMenu}>{t('cmProfile')}</a>
                          <button type="button" onClick={(e) => { closeMenu(e); copy(rec.body); }}>{t('cmCopyText')}</button>
                          <button type="button" onClick={(e) => { closeMenu(e); setQuery(rec.username); }}>{t('cmByUser')}</button>
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
            <p>{filtered ? t('cmNoMatch') : t('rcEmpty')}</p>
            {filtered && <button className="adm-btn" type="button" onClick={() => { setQuery(''); setType(''); setVoted(false); }}>{t('cmClearFilters')}</button>}
          </div>
        )}
      </div>
      <Pager data={data} page={page} setPage={setPage} t={t} lang={lang} />
    </section>
  );
}
