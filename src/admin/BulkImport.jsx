import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import { apiGet, faDigits, fmtDur, fmtNum, friendly, store } from './pages/import-util.js';

const CHUNK = 50; // ids per request — the server resolves a whole chunk in ONE batched provider query
const TOTAL_MAX = 400; // runaway guard: the whole run, not one chunk
const CONFIRM_ABOVE = 100; // a real save of more titles than this asks first
const LOG_CAP = 300; // rows drawn in the log (the full log stays in memory for retry/copy)
const RANGE_KEY = 'adm.bulk.range';
const YEAR_MAX = new Date().getFullYear() + 2;

export default function BulkImport() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('import', 'edit');
  // Tab switch: the anime and manga halves are the same UI, one type at a time.
  // ?type=manga (from the manga list's "+ new manga" button) preselects the tab.
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') === 'manga' ? 'manga' : 'anime';
  const [mediaType, setMediaType] = useState(initialType);
  const saved = useMemo(() => store.get(RANGE_KEY, {}), []);
  const [from, setFrom] = useState(String(saved.from || ''));
  const [to, setTo] = useState(String(saved.to || ''));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, startedAt }
  const [now, setNow] = useState(Date.now());
  const [log, setLog] = useState([]);
  const [logFilter, setLogFilter] = useState('');
  const [summary, setSummary] = useState(null); // { imported, exists, ok, missing, failed }
  // Two locks: the id-range preview and the facet-selection preview unlock their
  // own save buttons independently — one preview never blocks the other half.
  const [rangePreviewDone, setRangePreviewDone] = useState(false); // queue 24
  const [facetPreviewDone, setFacetPreviewDone] = useState(false); // queue 27
  const [error, setError] = useState('');
  // Queue 26: facet discovery (genre / year / score) + selected ids.
  const [facet, setFacet] = useState({ genre: '', year: '', minScore: '' });
  const [discovering, setDiscovering] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [known, setKnown] = useState({}); // malId -> true for candidates already in the catalog
  const [selected, setSelected] = useState([]);
  const [rangeInfo, setRangeInfo] = useState(null); // { existing, total, maxMalId }
  // Persian backfill loop (local engine): fills stored rows lacking Persian
  // synopsis — bounded batches until the server reports nothing left.
  const [backfill, setBackfill] = useState(null); // { running, filled, failed, remaining }
  const cancelRef = useRef(false);
  const backfillStop = useRef(false);
  const lastRun = useRef({ preview: false, kind: 'range' }); // how the latest run was started, for "retry failed"

  const total = useMemo(() => {
    if (!/^\d+$/.test(from) || !/^\d+$/.test(to)) return null;
    const a = Number(from);
    const b = Number(to);
    if (!a || a <= 0 || !b || b <= 0 || b < a) return null;
    return b - a + 1;
  }, [from, to]);
  const num = (n) => fmtNum(n, lang);
  const rangeProblem = (from && to && !total) ? t('bulkBadRange') : (total > TOTAL_MAX ? t('bulkTooWide', { max: TOTAL_MAX }) : '');

  // Leaving the tab mid-run would silently drop the rest of the chunks.
  useEffect(() => {
    if (!running) return undefined;
    const guard = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { window.removeEventListener('beforeunload', guard); clearInterval(tick); };
  }, [running]);

  // Remember the last range, and show how much of it is already in the catalog.
  useEffect(() => {
    if (from || to) store.set(RANGE_KEY, { from, to });
    if (!total || total > 100000) { setRangeInfo(null); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      apiGet(`/api/admin/x/import/range-info?type=${mediaType}&from=${from}&to=${to}`).then((info) => { if (live) setRangeInfo(info); }).catch(() => { if (live) setRangeInfo(null); });
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [from, to, total, mediaType]);

  // One chunk with a single retry after a short pause (a transient provider hiccup should not end the run).
  const sendChunk = async (slice, previewMode) => {
    try {
      return await api.bulkImport({ ids: slice, mediaType, preview: previewMode });
    } catch (err) {
      if (err?.status === 401 || err?.status === 403 || err?.status === 400) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return api.bulkImport({ ids: slice, mediaType, preview: previewMode });
    }
  };

  // Shared chunked run over an explicit id list. `previewKind` says which save
  // button a preview run unlocks ('range' | 'facet').
  const bulkLoop = async (ids, previewMode, previewKind = 'range') => {
    cancelRef.current = false;
    lastRun.current = { preview: previewMode, kind: previewKind };
    setRunning(true);
    setError('');
    setLog([]);
    setLogFilter('');
    setSummary(null);
    setRangePreviewDone(false);
    setFacetPreviewDone(false);
    const startedAt = Date.now();
    setNow(startedAt);
    setProgress({ done: 0, total: ids.length, startedAt });

    const tally = { imported: 0, exists: 0, ok: 0, missing: 0, failed: 0 };
    let cancelled = false;
    for (let start = 0; start < ids.length; start += CHUNK) {
      if (cancelRef.current) { cancelled = true; break; }
      const slice = ids.slice(start, start + CHUNK);
      try {
        const { results } = await sendChunk(slice, previewMode);
        setLog((current) => [...current, ...results]);
        for (const row of results) tally[row.status] = (tally[row.status] ?? 0) + 1;
        setSummary({ ...tally });
      } catch (err) {
        const rows = slice.map((malId) => ({ malId, status: 'failed', error: friendly(errText(err, t), t) }));
        setLog((current) => [...current, ...rows]);
        tally.failed += rows.length;
        setSummary({ ...tally });
        setError(friendly(errText(err, t), t));
        break; // provider down mid-run: stop instead of hammering the fallback
      }
      setProgress((current) => ({ ...current, done: Math.min(start + CHUNK, ids.length) }));
    }
    setRunning(false);
    if (cancelled) { toast(t('bulkCancelled')); return; }
    setProgress((current) => ({ ...current, done: current ? current.total : 0 }));
    // "Missing" ids (gaps in the MAL range) never block saving; provider failures do.
    const unlocked = tally.failed === 0;
    if (previewMode) {
      if (previewKind === 'facet') setFacetPreviewDone(unlocked);
      else setRangePreviewDone(unlocked);
    }
    if (unlocked) toast(previewMode ? t('bulkPreviewDone', { n: tally.ok }) : t('bulkDone', tally));
    // Freshly imported rows (local engine) arrive English-only — let the
    // backfill job ride behind the import without blocking its toasts.
    if (!previewMode && tally.imported > 0) { void runBackfillLoop(); }
  };

  const runBackfillLoop = async () => {
    if (backfill?.running) return;
    backfillStop.current = false;
    let totalFilled = 0;
    let totalFailed = 0;
    let remaining = 0;
    setBackfill({ running: true, filled: 0, failed: 0, remaining: null });
    try {
      for (;;) {
        const result = await api.backfill();
        totalFilled += result.translated || 0;
        totalFailed += result.failed || 0;
        remaining = result.remaining || 0;
        setBackfill({ running: true, filled: totalFilled, failed: totalFailed, remaining });
        // Stop when the catalog is clean, or one round filled nothing
        // (engine wedged — report and quit instead of a hot loop).
        if (remaining === 0 || !(result.translated > 0) || backfillStop.current) break;
      }
      toast(t('bulkBackfillDone', { filled: totalFilled, failed: totalFailed, remaining }));
    } catch (err) {
      setError(friendly(errText(err, t), t));
    } finally {
      setBackfill((current) => ({ ...(current || {}), running: false, remaining: current?.remaining ?? 0 }));
    }
  };

  const runRange = async (event, previewMode = false) => {
    event?.preventDefault();
    if (!total || !canEdit) return;
    const a = Number(from);
    const b = Number(to);
    if (total > TOTAL_MAX) { setError(t('bulkTooWide', { max: TOTAL_MAX })); return; }
    if (!previewMode && total > CONFIRM_ABOVE && !await confirm(t('bulkSaveConfirm', { n: total }))) return;
    await bulkLoop(Array.from({ length: b - a + 1 }, (_, index) => a + index), previewMode, 'range');
  };

  // Queue 27: the facet flow mirrors the range flow — preview first, then save.
  const runSelectedIds = async (previewMode) => {
    if (selected.length === 0 || !canEdit) return;
    if (!previewMode && selected.length > CONFIRM_ABOVE && !await confirm(t('bulkSaveConfirm', { n: selected.length }))) return;
    await bulkLoop(selected, previewMode, 'facet');
  };

  const retryFailed = async () => {
    const ids = log.filter((row) => row.status === 'failed').map((row) => row.malId);
    if (ids.length) await bulkLoop(ids, lastRun.current.preview, lastRun.current.kind);
  };

  const copyFailed = async () => {
    const ids = log.filter((row) => row.status === 'failed').map((row) => row.malId).join(', ');
    try { await navigator.clipboard.writeText(ids); toast(t('bulkCopied')); } catch { toast(ids, 'error'); }
  };

  useEffect(() => {
    // A changed range or tab invalidates the previous preview (queue 24).
    setRangePreviewDone(false);
  }, [from, to, mediaType]);

  useEffect(() => {
    // Any selection/filter change invalidates the facet preview.
    setFacetPreviewDone(false);
  }, [selected, facet, mediaType]);

  // Queue 26: facet discovery — AniList search by genre / year / min score.
  const yearBad = facet.year !== '' && !(Number(facet.year) >= 1900 && Number(facet.year) <= YEAR_MAX);
  const discover = async (event) => {
    event?.preventDefault();
    if (yearBad || discovering || running) return;
    setDiscovering(true);
    setCandidates(null);
    setKnown({});
    setSelected([]);
    try {
      const { items } = await api.bulkImport({ discover: true, mediaType, genre: facet.genre.trim(), year: facet.year, minScore: facet.minScore });
      const rows = items || [];
      setCandidates(rows);
      if (rows.length) {
        // Mark what the catalog already has, so it is not selected for nothing.
        try {
          const res = await apiGet(`/api/admin/x/import/known?type=${mediaType}&ids=${rows.slice(0, 100).map((r) => r.malId).join(',')}`);
          setKnown(Object.fromEntries(Object.keys(res.items || {}).map((id) => [id, true])));
        } catch { /* marking is a nicety */ }
      }
    } catch (err) {
      setError(friendly(errText(err, t), t));
    } finally {
      setDiscovering(false);
    }
  };

  const fresh = (candidates || []).filter((row) => !known[row.malId]);
  const toggleCandidate = (malId) => setSelected((current) => (current.includes(malId) ? current.filter((id) => id !== malId) : [...current, malId]));
  const toggleAllCandidates = (allChecked) => setSelected(allChecked ? fresh.map((row) => row.malId) : []);
  const allSelected = fresh.length > 0 && selected.length === fresh.length;

  const statusClass = (status) => (
    status === 'imported' || status === 'ok' ? 'ok'
      : status === 'exists' || status === 'preview' || status === 'missing' ? 'warn'
        : 'fail'
  );
  const statusLabel = (row) => (
    row.status === 'imported' ? t('bulkImported')
      : row.status === 'exists' ? t('bulkExists')
        : row.status === 'missing' ? t('bulkMissing')
          : row.status === 'ok' ? t('bulkPreviewFound')
            : t('bulkFailed')
  );

  const isManga = mediaType === 'manga';
  const logCounts = useMemo(() => {
    const counts = {};
    for (const row of log) counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, [log]);
  const shownLog = (logFilter ? log.filter((row) => row.status === logFilter) : log).slice(-LOG_CAP);
  const elapsed = progress ? Math.round((now - progress.startedAt) / 1000) : 0;
  const eta = progress && progress.done > 0 && progress.done < progress.total ? Math.round((elapsed / progress.done) * (progress.total - progress.done)) : null;
  const nextStart = (rangeInfo?.maxMalId || 0) + 1;

  return (
    <div className="adm-card adm-bulk imp-bulk">
      <h2>{t('bulkTitle')}</h2>
      <p className="adm-muted">{t('bulkHint')}</p>
      {!canEdit && <p className="imp-readonly">{t('impReadOnly')}</p>}

      {/* Type tabs — both halves get the exact same import UI */}
      <div className="bulk-tabs" role="tablist" aria-label={t('bulkType')}>
        <button type="button" role="tab" aria-selected={!isManga} disabled={running} onClick={() => setMediaType('anime')}>
          {t('bulkAnime')}
        </button>
        <button type="button" role="tab" aria-selected={isManga} disabled={running} onClick={() => setMediaType('manga')}>
          {t('bulkManga')}
        </button>
      </div>

      {/* ---- Id-range import (queue 24) ---- */}
      <section className="bulk-range">
        <h3>{t('bulkRangeTitle')}</h3>
        <form className="adm-inline" onSubmit={(event) => runRange(event, false)}>
          <label>
            <span>{t('bulkFrom')}</span>
            <input type="number" min="1" value={from} onChange={(event) => setFrom(event.target.value)} disabled={running || !canEdit} placeholder="1" inputMode="numeric" />
          </label>
          <label>
            <span>{t('bulkTo')}</span>
            <input type="number" min="1" value={to} onChange={(event) => setTo(event.target.value)} disabled={running || !canEdit} placeholder="100" inputMode="numeric" />
          </label>
          <button className="adm-btn" type="button" disabled={running || !total || !canEdit || total > TOTAL_MAX} onClick={(event) => runRange(event, true)}>
            {running ? t('bulkRunning') : t('bulkPreview')}
          </button>
          <button className="adm-btn adm-primary" type="submit" disabled={running || !total || !rangePreviewDone || !canEdit}>
            {running ? t('bulkRunning') : t('bulkSaveNow')}
          </button>
          {running && <button className="adm-btn adm-danger" type="button" onClick={() => { cancelRef.current = true; }}>{t('impCancel')}</button>}
        </form>
        {rangeProblem && <p className="adm-error" role="alert">{rangeProblem}</p>}
        {total > 0 && !running && !rangeProblem && (
          <p className="adm-muted imp-facts">
            <span>{t('bulkRangeInfo', { count: num(total) })}</span>
            {rangeInfo && <span>{t('bulkRangeKnown', { existing: num(rangeInfo.existing) })}</span>}
            <span className={rangePreviewDone ? 'is-ok' : ''}>{t(rangePreviewDone ? 'bulkPreviewReady' : 'bulkPreviewHint')}</span>
          </p>
        )}
        {rangeInfo && rangeInfo.maxMalId > 0 && canEdit && !running && (
          <p className="imp-note">
            {t('bulkLastSaved', { id: num(rangeInfo.maxMalId) })}{' '}
            <button type="button" className="adm-btn" onClick={() => { setFrom(String(nextStart)); setTo(String(nextStart + 99)); }}>{t('bulkNextRange', { range: `⁦${num(nextStart)}–${num(nextStart + 99)}⁩` })}</button>
          </p>
        )}
      </section>

      {/* ---- Facet import (queue 26/27): same preview → save flow ---- */}
      <section className="bulk-facet">
        <h3>{t('bulkFacetTitle')}</h3>
        <p className="adm-muted">{t('bulkFacetHint')}</p>
        <form className="adm-inline" onSubmit={discover}>
          <label>
            <span>{t('bulkFacetGenre')}</span>
            <input list="bulk-genre-list" dir="ltr" value={facet.genre} onChange={(event) => setFacet((current) => ({ ...current, genre: event.target.value }))} disabled={running || discovering || !canEdit} />
            <datalist id="bulk-genre-list">
              {['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Psychological'].map((g) => <option value={g} key={g} />)}
            </datalist>
          </label>
          <label>
            <span>{t('bulkFacetYear')}</span>
            <input type="number" min="1900" max={YEAR_MAX} dir="ltr" value={facet.year} onChange={(event) => setFacet((current) => ({ ...current, year: event.target.value }))} disabled={running || discovering || !canEdit} placeholder="1970" aria-invalid={yearBad} />
          </label>
          <label>
            <span>{t('bulkFacetMinScore')}</span>
            <select value={facet.minScore} onChange={(event) => setFacet((current) => ({ ...current, minScore: event.target.value }))} disabled={running || discovering || !canEdit}>
              <option value="">—</option>
              <option value="6">6+</option>
              <option value="7">7+</option>
              <option value="8">8+</option>
              <option value="9">9+</option>
            </select>
          </label>
          <button className="adm-btn" type="submit" disabled={running || discovering || yearBad || !canEdit}>
            {discovering ? t('bulkDiscovering') : t('bulkDiscover')}
          </button>
        </form>
        {yearBad && <p className="adm-error" role="alert">{t('bulkBadYear', { max: YEAR_MAX })}</p>}
        {discovering && <div className="imp-skel" aria-busy="true"><i /><i /></div>}
        {candidates && (
          <div className="bulk-candidates">
            {candidates.length === 0 ? (
              <p className="adm-muted">{t('bulkFacetEmpty')}</p>
            ) : (
              <>
                <p className="imp-count" aria-live="polite">{t('bulkCandidates', { n: num(candidates.length), known: num(candidates.length - fresh.length), selected: num(selected.length) })}</p>
                <label className="bulk-select-all">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleAllCandidates(event.target.checked)}
                    disabled={running || fresh.length === 0 || !canEdit}
                  />
                  <span>{t('bulkSelectAll')}</span>
                </label>
                <ul className="bulk-candidate-list">
                  {candidates.map((row) => (
                    <li key={row.malId} className={known[row.malId] ? 'imp-cand-off' : selected.includes(row.malId) ? 'is-picked' : ''}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected.includes(row.malId)}
                          onChange={() => toggleCandidate(row.malId)}
                          disabled={running || Boolean(known[row.malId]) || !canEdit}
                        />
                        <span dir="auto">{row.title}</span>
                        {known[row.malId] && <span className="adm-chip is-ok">{t('alreadyAdded')}</span>}
                        <span dir="ltr" className="bulk-candidate-meta">
                          {row.year || '—'} · {row.category || '—'}{row.score != null ? ` · ${row.score}` : ''} · #{row.malId}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="adm-inline">
                  <button className="adm-btn" type="button" disabled={running || selected.length === 0 || !canEdit} onClick={() => runSelectedIds(true)}>
                    {running ? t('bulkRunning') : t('bulkPreview')}
                  </button>
                  <button className="adm-btn adm-primary" type="button" disabled={running || selected.length === 0 || !facetPreviewDone || !canEdit} onClick={() => runSelectedIds(false)}>
                    {running ? t('bulkRunning') : t('bulkSaveNow')}
                  </button>
                  {running && <button className="adm-btn adm-danger" type="button" onClick={() => { cancelRef.current = true; }}>{t('impCancel')}</button>}
                </div>
                <p className="adm-muted">{t(facetPreviewDone ? 'bulkPreviewReady' : 'bulkLockHint')}</p>
              </>
            )}
          </div>
        )}
      </section>

      {/* ---- Run output sits right under the forms that start a run ---- */}
      <section className="bulk-output">
        {progress && <h3>{t('bulkLog')}</h3>}
        {error &&<p className="adm-error" role="alert" dir="auto">{error}</p>}

        {progress && (
          <>
            <div className="bulk-progress" role="progressbar" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={t('bulkProgressLabel')}>
              <div className="bulk-progress-bar" style={{ '--done': `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }} />
              <span dir="ltr">{num(progress.done)}/{num(progress.total)} · {num(Math.round((progress.done / Math.max(progress.total, 1)) * 100))}%</span>
            </div>
            {running && <p className="imp-note" dir="auto" aria-live="off">{t('bulkTimes', { elapsed: faDigits(fmtDur(elapsed) || '0:00', lang), eta: eta != null ? faDigits(fmtDur(eta), lang) : '—' })}</p>}
          </>
        )}
        {summary && (
          <p className="bulk-summary">
            <span className="ok">{t('bulkImported')}: {num(summary.imported)}</span>
            <span className="warn">{t('bulkExists')}: {num(summary.exists)}</span>
            {summary.ok > 0 && <span className="ok">{t('bulkPreviewFound')}: {num(summary.ok)}</span>}
            {summary.missing > 0 && <span className="warn">{t('bulkMissing')}: {num(summary.missing)}</span>}
            <span className="fail">{t('bulkFailed')}: {num(summary.failed)}</span>
          </p>
        )}
        {summary?.imported > 0 && !running && !lastRun.current.preview && <p className="imp-note">{t('bulkDoneNote')} <Link to={isManga ? '/admin/manga' : '/admin/anime'}>{t('bulkOpenList')}</Link></p>}

        {log.length > 0 && (
          <>
            <div className="imp-tools">
              {['', 'imported', 'ok', 'exists', 'missing', 'failed'].filter((key) => key === '' || logCounts[key]).map((key) => (
                <button key={key || 'all'} type="button" className={`adm-fchip${logFilter === key ? ' is-on' : ''}`} aria-pressed={logFilter === key} onClick={() => setLogFilter(key)}>
                  {key ? statusLabel({ status: key }) : t('filterAll')} <b>{num(key ? logCounts[key] : log.length)}</b>
                </button>
              ))}
              {logCounts.failed > 0 && !running && canEdit && <button type="button" className="adm-btn" onClick={retryFailed}>{t('bulkRetryFailed', { n: num(logCounts.failed) })}</button>}
              {logCounts.failed > 0 && <button type="button" className="adm-btn" onClick={copyFailed}>{t('bulkCopyFailed')}</button>}
            </div>
            {log.length > LOG_CAP && <p className="imp-note">{t('bulkLogCapped', { n: num(LOG_CAP), total: num(log.length) })}</p>}
            <ul className="bulk-log" aria-label={t('bulkLog')}>
              {shownLog.map((row, index) => (
                <li key={`${row.malId}-${index}`} className={`is-${statusClass(row.status)}`}>
                  <span className="bulk-log-id" dir="ltr">#{row.malId}</span>
                  <span className="bulk-log-title" dir="auto" title={row.title || row.error || ''}>
                    {row.title || friendly(row.error, t) || ''}
                    {row.status === 'ok' && (row.year || row.category) ? (row.year ? ` — ${row.year}` : '') + (row.category ? ` · ${row.category}` : '') : ''}
                  </span>
                  <span className="bulk-log-status">{row.status === 'ok' && row.score != null ? `${statusLabel(row)} (${row.score})` : statusLabel(row)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ---- Persian backfill (local engine): fills stored rows lacking fa ---- */}
      <section className="bulk-backfill">
        <h3>{t('bulkBackfillTitle')}</h3>
        <p className="adm-muted">{t('bulkBackfillHint')}</p>
        <p className="imp-note">{t('bulkBackfillNote')}</p>
        <div className="adm-inline">
          <button className="adm-btn" type="button" disabled={running || backfill?.running || !canEdit} onClick={runBackfillLoop}>
            {backfill?.running ? t('bulkBackfillRunning') : t('bulkBackfillRun')}
          </button>
          {backfill?.running && <button className="adm-btn" type="button" onClick={() => { backfillStop.current = true; }}>{t('impCancel')}</button>}
          {backfill?.running && backfill.remaining != null && (
            <span className="adm-muted" aria-live="polite">{t('bulkBackfillStatus', { filled: num(backfill.filled), remaining: num(backfill.remaining) })}</span>
          )}
        </div>
      </section>

    </div>
  );
}
