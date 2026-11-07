import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import { fmtDate, num, useSearchHotkey } from './pages/communityKit.jsx';

const STEP = 20; // titles per request (the server accepts up to 50)
const PAGE = 50; // rows shown before "show more"
const keyOf = (item) => `${item.type}:${item.malId}`;
const SORTS = {
  requests: (a, b) => b.requests - a.requests || a.malId - b.malId,
  title: (a, b) => (a.title || '').localeCompare(b.title || '') || a.malId - b.malId,
  id: (a, b) => a.malId - b.malId,
  new: (a, b) => String(b.firstAt || '').localeCompare(String(a.firstAt || '')) || b.malId - a.malId,
};

// Titles members asked for through the MyAnimeList list import, ready to add in one go.
export default function MissingTitles() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('community', 'edit') && can('import', 'edit'); // adding = import area, dismissing = community area
  const canDismiss = can('community', 'edit');
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [failures, setFailures] = useState([]); // [{ key, title, why }]
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState(''); // '' | anime | manga
  const [sort, setSort] = useState('requests');
  const [shown, setShown] = useState(PAGE);
  const cancel = useRef(false);
  const lastPick = useRef(null);
  const searchRef = useRef(null);
  const onSearchKey = useSearchHotkey(searchRef, () => setFilter(''));

  const load = useCallback(async () => {
    try {
      const data = await api.missingTitles();
      setItems(data.items);
      setTotal(data.total ?? data.items.length);
      setError('');
      setPicked((current) => new Set([...current].filter((key) => data.items.some((item) => keyOf(item) === key))));
    } catch (err) { setError(errText(err, t)); setItems((current) => current ?? []); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    '': items?.length || 0,
    anime: (items || []).filter((i) => i.type === 'anime').length,
    manga: (items || []).filter((i) => i.type === 'manga').length,
  }), [items]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (items || [])
      .filter((item) => (!kind || item.type === kind) && (!needle || (item.title || '').toLowerCase().includes(needle) || String(item.malId).includes(needle)))
      .sort(SORTS[sort]);
  }, [items, filter, kind, sort]);
  useEffect(() => { setShown(PAGE); }, [filter, kind, sort]);

  const chosen = (items || []).filter((item) => picked.has(keyOf(item)));
  const allVisiblePicked = visible.length > 0 && visible.every((item) => picked.has(keyOf(item)));

  const toggle = (item, event) => setPicked((current) => {
    const next = new Set(current);
    const index = visible.findIndex((row) => keyOf(row) === keyOf(item));
    const on = !next.has(keyOf(item));
    // Shift-click selects the whole stretch since the last click.
    if (event?.shiftKey && lastPick.current != null && index >= 0) {
      const [lo, hi] = [Math.min(lastPick.current, index), Math.max(lastPick.current, index)];
      for (const row of visible.slice(lo, hi + 1)) { if (on) next.add(keyOf(row)); else next.delete(keyOf(row)); }
    } else if (on) next.add(keyOf(item)); else next.delete(keyOf(item));
    lastPick.current = index;
    return next;
  });
  const toggleAll = () => setPicked((current) => {
    const next = new Set(current);
    for (const item of visible) { if (allVisiblePicked) next.delete(keyOf(item)); else next.add(keyOf(item)); }
    return next;
  });

  const addItems = async (chosen) => {
    if (!chosen.length || busy) return;
    setError('');
    setFailures([]);
    cancel.current = false;
    setBusy(true);
    let ok = 0;
    let done = 0;
    const bad = [];
    const okKeys = new Set();
    setProgress({ done: 0, total: chosen.length });
    for (const mediaType of ['anime', 'manga']) {
      const ofType = chosen.filter((item) => item.type === mediaType);
      for (let i = 0; i < ofType.length && !cancel.current; i += STEP) {
        const part = ofType.slice(i, i + STEP);
        try {
          const res = await api.bulkImport({ ids: part.map((item) => item.malId), mediaType });
          const byId = new Map((res.results || []).map((row) => [row.malId, row]));
          for (const item of part) {
            const row = byId.get(item.malId);
            if (row?.status === 'imported' || row?.status === 'exists') { ok += 1; okKeys.add(keyOf(item)); }
            else bad.push({ key: keyOf(item), title: item.title || `MAL #${item.malId}`, why: row?.status === 'missing' ? t('bulkMissing') : (row?.error || row?.status || '?') });
          }
        } catch (err) {
          for (const item of part) bad.push({ key: keyOf(item), title: item.title || `MAL #${item.malId}`, why: errText(err, t) });
          if (err?.status === 401 || err?.status === 403 || err?.message === 'NETWORK') { cancel.current = true; setError(errText(err, t)); }
        }
        done += part.length;
        setProgress({ done, total: chosen.length });
      }
    }
    setBusy(false);
    setProgress(null);
    setFailures(bad);
    // Only the ones that failed stay selected, so "add selected" is a one-click retry.
    setPicked((current) => new Set([...current].filter((key) => !okKeys.has(key))));
    toast(t('missDone', { ok: num(ok, lang), bad: num(bad.length, lang) }), bad.length && !ok ? 'error' : 'ok');
    await load();
  };
  const addSelected = () => addItems(chosen);

  const dismiss = async (list = chosen) => {
    const message = list.length === 1 && list !== chosen ? t('missDismissOneConfirm', { title: list[0].title || `MAL #${list[0].malId}` }) : t('missDismissConfirm', { n: num(list.length, lang) });
    if (!list.length || busy || !await confirm(message)) return;
    setBusy(true);
    try {
      await api.missingDismiss(list.map(({ type, malId }) => ({ type, malId })));
      setPicked(new Set());
      await load();
    } catch (err) { setError(errText(err, t)); }
    setBusy(false);
  };

  const failedBy = new Map(failures.map((f) => [f.key, f.why]));
  const exportCsv = () => {
    // Quote every cell; a leading = + - @ or tab gets a single quote so spreadsheets never run it as a formula.
    const cell = (v) => `"${String(v ?? '').replace(/^[=+\-@\t]/, (m) => `'${m}`).replace(/"/g, '""')}"`;
    const head = ['type', 'mal_id', 'title', 'requests', 'first_seen', 'requested_by'];
    const lines = [head.map(cell).join(','), ...visible.map((i) => [i.type, i.malId, i.title, i.requests, i.firstAt, i.requesters || ''].map(cell).join(','))];
    const url = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'missing-titles.csv' });
    link.click();
    URL.revokeObjectURL(url);
  };
  const rows = visible.slice(0, shown);
  return (
    <div className="adm-card adm-import">
      <div className="imp-head">
        <h2>{t('missTitle')}</h2>
        <div className="mt-acts">
          {items?.length > 0 && <button type="button" className="adm-btn" onClick={exportCsv}>{t('missExport')}</button>}
          <button type="button" className="adm-btn" disabled={busy} onClick={load}>{t('impRefresh')}</button>
        </div>
      </div>
      <p className="adm-muted">{t('missHint')}</p>
      {!canEdit && <p className="imp-readonly">{t(canDismiss ? 'missReadOnlyAdd' : 'impReadOnly')}</p>}
      {error && <p className="adm-error" role="alert">{error} <button type="button" className="adm-btn" onClick={load}>{t('impRetry')}</button></p>}
      {!items && !error && <div className="imp-skel" aria-busy="true">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>}
      {items && items.length === 0 && !error && <p className="adm-empty">{t('missEmpty')}</p>}
      {items && items.length > 0 && (
        <>
          <div className="imp-tools">
            <div className="imp-search">
              <input ref={searchRef} type="search" dir="auto" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={onSearchKey} placeholder={t('missFilter')} aria-label={t('missFilter')} title={t('cmRowsHint')} />
              {filter && <button type="button" className="imp-clear" aria-label={t('impClear')} onClick={() => setFilter('')}>×</button>}
            </div>
            {[['', 'filterAll'], ['anime', 'quickAnime'], ['manga', 'quickManga']].map(([key, label]) => (
              <button key={key || 'all'} type="button" className={`adm-fchip${kind === key ? ' is-on' : ''}`} aria-pressed={kind === key} onClick={() => setKind(key)}>
                {t(label)} <b>{num(counts[key], lang)}</b>
              </button>
            ))}
            <label className="adm-sort">
              <span className="adm-muted">{t('impSort')}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="requests">{t('missSortRequests')}</option>
                <option value="new">{t('missSortNew')}</option>
                <option value="title">{t('missSortTitle')}</option>
                <option value="id">{t('missSortId')}</option>
              </select>
            </label>
          </div>
          <div className="cm-bulk mt-bulk">
            <label className="rv-selall"><input className="rv-check" type="checkbox" checked={allVisiblePicked} onChange={toggleAll} disabled={busy || visible.length === 0} /> {t('missSelectAll')}</label>
            {chosen.length > 0 && <strong aria-live="polite">{t('missSelectedOf', { n: num(chosen.length, lang), total: num(items.length, lang) })}</strong>}
            <div className="adm-actions">
              <button className="adm-btn adm-primary" type="button" disabled={!canEdit || !chosen.length || busy} onClick={addSelected}>{t('missImport')}</button>
              {busy && progress && <button className="adm-btn" type="button" onClick={() => { cancel.current = true; }}>{t('missCancel')}</button>}
              <button className="adm-btn adm-danger" type="button" disabled={!canDismiss || !chosen.length || busy} onClick={() => dismiss(chosen)}>{t('missDismiss')}</button>
            </div>
          </div>
          {progress && (
            <div className="imp-meter" role="progressbar" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <div className="imp-meter-bar" style={{ '--done': `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }} />
              <span dir="ltr">{t('missWorking', { done: num(progress.done, lang), total: num(progress.total, lang) })}</span>
            </div>
          )}
          {failures.length > 0 && (
            <div className="imp-fail" role="alert">
              <strong>{t('missFailedTitle', { n: num(failures.length, lang) })}</strong>
              <ul>{failures.slice(0, 50).map((f) => <li key={f.key}><span dir="auto">{f.title}</span> — {f.why}</li>)}</ul>
            </div>
          )}
          <p className="imp-count">{t('missShowing', { shown: num(Math.min(shown, visible.length), lang), n: num(visible.length, lang) })}{total > items.length ? ` · ${t('missCapped', { n: num(items.length, lang), total: num(total, lang) })}` : ''}</p>
          {visible.length === 0 ? <p className="adm-empty">{t('noResults')}</p> : (
            <ul className="mt-list">
              {rows.map((item) => {
                const key = keyOf(item);
                const names = item.requesters ? item.requesters.split(',') : [];
                const more = Math.max(0, item.requests - names.length);
                const joined = names.join(lang === 'fa' ? '، ' : ', ');
                return (
                  <li key={key} className={`mt-row${picked.has(key) ? ' is-picked' : ''}${failedBy.has(key) ? ' is-failed' : ''}`}>
                    <input className="rv-check" type="checkbox" checked={picked.has(key)} onChange={() => {}} onClick={(e) => toggle(item, e)} disabled={busy} aria-label={item.title || String(item.malId)} />
                    <span className="mt-main">
                      <strong dir="auto">{item.title || `${t('missNoTitle')} (MAL #${item.malId})`}</strong>
                      <span className="mt-meta">
                        <span className="adm-chip">{t(item.type === 'manga' ? 'quickManga' : 'quickAnime')}</span>
                        <span dir="ltr">MAL #{item.malId}</span>
                        <span className={`adm-chip${item.requests > 1 ? ' is-ok' : ''}`}>{item.requests === 1 ? t('missRequestsOne') : t('missRequests', { n: num(item.requests, lang) })}</span>
                        {item.firstAt && <span title={fmtDate(item.firstAt, lang, true)}>{t('missFirstSeen', { date: fmtDate(item.firstAt, lang) })}</span>}
                      </span>
                      {names.length > 0 && <span className="mt-meta"><span dir="auto">{more > 0 ? t('missByMore', { names: joined, n: num(more, lang) }) : t('missBy', { names: joined })}</span></span>}
                      {failedBy.has(key) && <span className="mt-fail">{t('missFailRow', { why: failedBy.get(key) })}</span>}
                    </span>
                    <span className="mt-acts">
                      <a className="imp-link" href={`https://myanimelist.net/${item.type}/${item.malId}`} target="_blank" rel="noopener noreferrer">{t('missOpenMal')} ↗</a>
                      <button type="button" className="adm-btn adm-primary" disabled={!canEdit || busy} onClick={() => addItems([item])}>{t('missAddOne')}</button>
                      <button type="button" className="adm-btn" disabled={!canDismiss || busy} onClick={() => dismiss([item])}>{t('missDismissOne')}</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {visible.length > shown && <button type="button" className="adm-btn" style={{ marginBlockStart: 12 }} onClick={() => setShown((n) => n + PAGE)}>{t('reviewLoadMore')}</button>}
        </>
      )}
    </div>
  );
}
