import React, { useEffect, useRef, useState } from 'react';
import { CannedEditor } from './ToolsPages.jsx';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import {
  BulkBar, Chip, Clamp, ErrorBar, Pager, Skeleton, fmtDate, num, useDebounced, useRemoteList, useSearchHotkey, useSelection,
} from './pages/communityKit.jsx';

const KINDS = ['synopsis', 'title', 'genres', 'report'];
const PRESETS = ['sgPreset1', 'sgPreset2', 'sgPreset3', 'sgPreset4'];
const OLD_DAYS = 3; // pending longer than this gets a warning stripe

const daysSince = (value) => {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000);
};

function Diff({ s, t }) {
  const cur = s.current;
  if (!cur) return <p className="adm-muted">{t('sgGone')}</p>;
  if (s.kind === 'report') return <p dir="auto" className="sg-report"><Clamp text={s.payload.text || ''} t={t} limit={400} /></p>;
  if (s.kind === 'genres') {
    return (
      <div className="cm-genres">
        <p className="sg-genres-line"><strong>{t('sgCurrent')}:</strong> {cur.genres.length ? cur.genres.map((g) => <span key={g} className="adm-chip" dir="ltr">{g}</span>) : '—'}</p>
        {s.payload.add?.length > 0 && <p className="sg-genres-line">{s.payload.add.map((g) => <span key={g} className="adm-chip is-ok" dir="ltr">+ {g}</span>)}</p>}
        {s.payload.remove?.length > 0 && <p className="sg-genres-line">{s.payload.remove.map((g) => <span key={g} className="adm-chip is-bad" dir="ltr">− {g}</span>)}</p>}
      </div>
    );
  }
  const old = s.kind === 'synopsis' ? cur.synopsisFa : cur.titleFa;
  return (
    <div className="sg-diff">
      <div className="sg-old"><strong>{t('sgCurrent')}</strong><p dir="auto">{old || <span className="sg-empty-val">{t('sgNoCurrent')}</span>}</p></div>
      <div className="cm-new"><strong>{t('sgSuggested')}</strong><p dir="auto">{s.payload.text}</p></div>
    </div>
  );
}

// Queue of member edit suggestions: approve applies the change, reject needs a reason shown to the member.
export default function Suggestions() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('reviews', 'edit');
  const [status, setStatus] = useState('pending');
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null); // suggestion id | 'bulk'
  const [reason, setReason] = useState('');
  const [canned, setCanned] = useState([]);
  useEffect(() => { api.canned().then((d) => setCanned(d.items)).catch(() => {}); }, []);
  const searchRef = useRef(null);
  const q = useDebounced(query.trim(), 300);

  useEffect(() => { setPage(1); }, [status, kind, q, sort]);

  const { data, error, loading, reload } = useRemoteList('/api/admin/suggestions', { status, kind, q, sort, page, limit: 20 }, (e) => errText(e, t));
  const pending = status === 'pending';
  const sel = useSelection(pending ? data?.items : []);
  const onSearchKey = useSearchHotkey(searchRef, () => setQuery(''));
  const counts = data?.counts;
  const kindCounts = data?.kindCounts || {};
  const kindTotal = Object.values(kindCounts).reduce((a, b) => a + b, 0);
  const filtered = Boolean(q || kind);

  // Leaving the pending tab (or reloading) drops any selection / open reject form.
  useEffect(() => { sel.clear(); setRejecting(null); setReason(''); }, [status, kind, q, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (message) => { toast(message); setRejecting(null); setReason(''); sel.clear(); reload(); };
  // "Already reviewed" means another admin got there first: refresh instead of showing a scary error.
  const fail = (err) => { if (err?.status === 409) { toast(t('sgAlready'), 'error'); reload(); } else toast(errText(err, t), 'error'); };

  const approve = async (s) => {
    setBusyId(s.id);
    try { await api.suggestionApprove(s.id); done(t('sgApproved')); } catch (err) { fail(err); } finally { setBusyId(null); }
  };
  const reject = async (s) => {
    setBusyId(s.id);
    try { await api.suggestionReject(s.id, reason.trim()); done(t('sgRejected')); } catch (err) { fail(err); } finally { setBusyId(null); }
  };

  // Bulk actions run one by one through the normal endpoints, so every change is still logged and validated.
  const bulk = async (mode) => {
    const ids = [...sel.ids];
    if (mode === 'approve' && !await confirm(t('sgBulkApproveConfirm', { n: num(ids.length, lang) }))) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of ids) {
      try {
        if (mode === 'approve') await api.suggestionApprove(id); else await api.suggestionReject(id, reason.trim());
        ok += 1;
      } catch { /* counted below */ }
    }
    setBulkBusy(false);
    done(ok === ids.length ? t('sgBulkDone', { n: num(ok, lang) }) : t('sgBulkPartial', { ok: num(ok, lang), n: num(ids.length, lang) }));
  };

  const cancelReject = () => { setRejecting(null); setReason(''); };
  // Plain render function (not a component) so the input keeps focus while typing.
  const reasonForm = (onSubmit, disabled) => (
    <div className="sg-reject">
      <div className="cm-presets">
        {PRESETS.map((key) => <button key={key} type="button" className="adm-fchip" onClick={() => setReason(t(key))}>{t(key)}</button>)}
        {canned.map((text) => <button key={text} type="button" className="adm-fchip" onClick={() => setReason(text)}>{text}</button>)}
      </div>
      <input className="adm-search" dir="auto" placeholder={t('sgReasonPh')} aria-label={t('sgReasonPh')} title={t('sgReasonMin')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim().length >= 3 && !disabled) onSubmit(); if (e.key === 'Escape') cancelReject(); }} />
      <button className="adm-btn adm-danger" type="button" disabled={disabled || reason.trim().length < 3} onClick={onSubmit}>{disabled ? t('sgWorking') : t('sgReject')}</button>
      <button className="adm-btn" type="button" onClick={cancelReject}>{t('cancel')}</button>
    </div>
  );

  return (
    <section>
      <div className="adm-filters" role="tablist" aria-label={t('sgNav')}>
        {['pending', 'approved', 'rejected'].map((st) => (
          <button key={st} type="button" role="tab" aria-selected={status === st} className={`adm-fchip${status === st ? ' is-on' : ''}`} onClick={() => { setStatus(st); setKind(''); }}>
            {t(`sgTab_${st}`)}{counts && <b>{num(counts[st], lang)}</b>}
          </button>
        ))}
      </div>

      <div className="sg-toolbar">
        <input ref={searchRef} className="adm-search" type="search" dir="auto" placeholder={t('sgSearch')} aria-label={t('sgSearch')} title={t('cmRowsHint')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} />
        <label className="adm-sort">
          <span className="adm-muted">{t('cmSort')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">{t(pending ? 'sgSort_old' : 'sgSort_new')}</option>
            <option value={pending ? 'new' : 'old'}>{t(pending ? 'sgSort_new' : 'sgSort_old')}</option>
          </select>
        </label>
        {data && <span className="adm-muted" aria-live="polite">{t('sgTotal', { n: num(data.total, lang) })}</span>}
        {pending && canEdit && data?.items.length > 0 && (
          <label className="adm-push rv-selall"><input className="rv-check" type="checkbox" checked={sel.all} onChange={sel.toggleAll} /> {t('cmSelectAll')}</label>
        )}
      </div>
      <div className="adm-filters" role="group" aria-label={t('cmFilters')}>
        <Chip on={!kind} count={data ? num(kindTotal, lang) : null} onClick={() => setKind('')}>{t('cmAll')}</Chip>
        {KINDS.map((k) => <Chip key={k} on={kind === k} count={data ? num(kindCounts[k] || 0, lang) : null} onClick={() => setKind(kind === k ? '' : k)}>{t(`sgKind_${k}`)}</Chip>)}
      </div>

      <ErrorBar error={error} onRetry={reload} t={t} />
      {!canEdit && pending && <p className="adm-muted cm-readonly">{t('cmReadOnly')}</p>}
      {canEdit && pending && (
        <BulkBar count={sel.count} t={t} lang={lang} onClear={sel.clear}>
          {rejecting === 'bulk' ? reasonForm(() => bulk('reject'), bulkBusy) : (
            <>
              <button className="adm-btn adm-primary" type="button" disabled={bulkBusy} onClick={() => bulk('approve')}>{bulkBusy ? t('sgWorking') : t('sgApprove')}</button>
              <button className="adm-btn adm-danger" type="button" disabled={bulkBusy} onClick={() => setRejecting('bulk')}>{t('sgBulkReject')}</button>
            </>
          )}
        </BulkBar>
      )}

      {!data && !error && <div className="adm-card"><Skeleton rows={3} /></div>}
      {data?.items.length === 0 && (
        <div className="adm-card adm-empty">
          <p>{filtered ? t('cmNoMatch') : t(pending ? 'sgEmptyPending' : 'sgEmpty')}</p>
          {filtered && <button className="adm-btn" type="button" onClick={() => { setQuery(''); setKind(''); }}>{t('cmClearFilters')}</button>}
        </div>
      )}
      <div className={loading && data ? 'cm-stale' : undefined} aria-busy={loading}>
        {data?.items.map((s) => {
          const waited = pending ? daysSince(s.createdAt) : 0;
          return (
            <article className={`adm-card sg-card${sel.has(s.id) ? ' is-selected' : ''}${waited >= OLD_DAYS ? ' is-old' : ''}`} key={s.id}>
              <header className="sg-head">
                {pending && canEdit && <input className="rv-check" type="checkbox" aria-label={t('cmSelectRow', { name: s.username })} checked={sel.has(s.id)} onChange={() => sel.toggle(s.id)} />}
                <strong dir="ltr">{s.username}</strong>
                <span aria-hidden="true">→</span>
                <a className="sg-title" href={`/${s.mediaType}/${encodeURIComponent(s.slug)}`} target="_blank" rel="noreferrer" dir="auto">{s.current?.title || s.slug}</a>
                <span className="adm-chip">{t(`sgKind_${s.kind}`)}</span>
                <span className="adm-chip">{s.mediaType === 'manga' ? t('uManga') : t('uAnime')}</span>
                {s.status !== 'pending' && <span className={`adm-chip ${s.status === 'approved' ? 'is-ok' : 'is-bad'}`}>{t(`sgTab_${s.status}`)}</span>}
                {waited >= OLD_DAYS && <span className="adm-chip sg-wait">{t('sgWaiting', { n: num(waited, lang) })}</span>}
                <span className="adm-muted sg-date">
                  <time dateTime={s.createdAt} title={fmtDate(s.createdAt, lang, true)}>{t('sgSent')}: {fmtDate(s.createdAt, lang)}</time>
                  {s.reviewedAt && <time dateTime={s.reviewedAt} title={fmtDate(s.reviewedAt, lang, true)}>{t('sgReviewed')}: {fmtDate(s.reviewedAt, lang)}</time>}
                </span>
              </header>
              <Diff s={s} t={t} />
              {s.status === 'rejected' && s.reason && <p className="sg-reasonline"><strong>{t('sgReasonLabel')}:</strong> <span dir="auto">{s.reason}</span></p>}
              {pending && canEdit && (
                rejecting === s.id ? reasonForm(() => reject(s), busyId === s.id) : (
                  <div className="sg-actions">
                    <button className="adm-btn adm-primary" type="button" disabled={busyId === s.id || (!s.current && s.kind !== 'report')} onClick={() => approve(s)}>{busyId === s.id ? t('sgWorking') : s.kind === 'report' ? t('sgAck') : t('sgApprove')}</button>
                    <button className="adm-btn adm-danger" type="button" disabled={busyId === s.id} onClick={() => { setRejecting(s.id); setReason(''); }}>{t('sgReject')}</button>
                  </div>
                )
              )}
            </article>
          );
        })}
      </div>
      <Pager data={data} page={page} setPage={setPage} t={t} lang={lang} />
      <CannedEditor items={canned} onSaved={setCanned} />
    </section>
  );
}
