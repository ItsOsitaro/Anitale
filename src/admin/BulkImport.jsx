import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const CHUNK = 50; // ids per request — the server resolves a whole chunk in ONE batched provider query
const TOTAL_MAX = 400; // runaway guard: the whole run, not one chunk

export default function BulkImport() {
  const { t, toast } = useAdmin();
  // Tab switch: the anime and manga halves are the same UI, one type at a time.
  const [mediaType, setMediaType] = useState('anime');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [running, setRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshReport, setRefreshReport] = useState(null);
  const [progress, setProgress] = useState(null); // { done, total }
  const [log, setLog] = useState([]);
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
  const [selected, setSelected] = useState([]);

  const total = useMemo(() => {
    if (!/^\d+$/.test(from) || !/^\d+$/.test(to)) return null;
    const a = Number(from);
    const b = Number(to);
    if (!a || a <= 0 || !b || b <= 0 || b < a) return null;
    return b - a + 1;
  }, [from, to]);

  // Shared chunked run over an explicit id list. `previewKind` says which save
  // button a preview run unlocks ('range' | 'facet').
  const bulkLoop = async (ids, previewMode, previewKind = 'range') => {
    setRunning(true);
    setError('');
    setLog([]);
    setSummary(null);
    setRangePreviewDone(false);
    setFacetPreviewDone(false);
    setProgress({ done: 0, total: ids.length });

    const tally = { imported: 0, exists: 0, ok: 0, missing: 0, failed: 0 };
    for (let start = 0; start < ids.length; start += CHUNK) {
      const slice = ids.slice(start, start + CHUNK);
      try {
        const { results } = await api.bulkImport({ ids: slice, mediaType, preview: previewMode });
        setLog((current) => [...current, ...results]);
        for (const row of results) tally[row.status] = (tally[row.status] ?? 0) + 1;
        setSummary({ ...tally });
      } catch (err) {
        const rows = slice.map((malId) => ({ malId, status: 'failed', error: errText(err, t) }));
        setLog((current) => [...current, ...rows]);
        tally.failed += rows.length;
        setSummary({ ...tally });
        setError(errText(err, t));
        break; // provider down mid-run: stop instead of hammering the fallback
      }
      setProgress((current) => ({ ...current, done: Math.min(start + CHUNK, ids.length) }));
    }
    setProgress((current) => ({ ...current, done: current ? current.total : 0 }));
    setRunning(false);
    // "Missing" ids (gaps in the MAL range) never block saving; provider failures do.
    const unlocked = tally.failed === 0;
    if (previewMode) {
      if (previewKind === 'facet') setFacetPreviewDone(unlocked);
      else setRangePreviewDone(unlocked);
    }
    if (unlocked) toast(previewMode ? t('bulkPreviewDone', { n: tally.ok }) : t('bulkDone', tally));
  };

  const runRange = async (event, previewMode = false) => {
    event.preventDefault();
    if (!total) return;
    const a = Number(from);
    const b = Number(to);
    if (total > TOTAL_MAX) { setError(t('bulkTooWide', { max: TOTAL_MAX })); return; }
    await bulkLoop(Array.from({ length: b - a + 1 }, (_, index) => a + index), previewMode, 'range');
  };

  // Queue 27: the facet flow mirrors the range flow — preview first, then save.
  const runSelectedIds = async (previewMode) => {
    if (selected.length === 0) return;
    await bulkLoop(selected, previewMode, 'facet');
  };

  useEffect(() => {
    // A changed range or tab invalidates the previous preview (queue 24).
    setRangePreviewDone(false);
  }, [from, to, mediaType]);

  useEffect(() => {
    // Any selection/filter change invalidates the facet preview.
    setFacetPreviewDone(false);
  }, [selected, facet, mediaType]);

  const runMangaRefresh = async () => {
    setRefreshing(true);
    setRefreshReport(null);
    try {
      const report = await api.mangaRefreshAll();
      setRefreshReport(report);
      toast(t('bulkRefreshDone', { updated: report.updated, failed: report.failed }));
    } catch (err) {
      setError(errText(err, t));
    } finally {
      setRefreshing(false);
    }
  };

  // Queue 26: facet discovery — AniList search by genre / year / min score.
  const discover = async () => {
    setDiscovering(true);
    setCandidates(null);
    setSelected([]);
    try {
      const { items } = await api.bulkImport({ discover: true, mediaType, genre: facet.genre.trim(), year: facet.year, minScore: facet.minScore });
      setCandidates(items || []);
    } catch (err) {
      setError(errText(err, t));
    } finally {
      setDiscovering(false);
    }
  };

  const toggleCandidate = (malId) => setSelected((current) => (current.includes(malId) ? current.filter((id) => id !== malId) : [...current, malId]));
  const toggleAllCandidates = (allChecked) => setSelected(allChecked ? (candidates || []).map((row) => row.malId) : []);
  const allSelected = candidates && candidates.length > 0 && selected.length === candidates.length;

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

  return (
    <div className="adm-bulk">
      <h2>{t('bulkTitle')}</h2>
      <p className="adm-muted">{t('bulkHint')}</p>

      {/* Type tabs — both halves get the exact same import UI */}
      <div className="bulk-tabs" role="tablist" aria-label={t('bulkType')}>
        <button type="button" role="tab" aria-selected={!isManga} disabled={running || refreshing} onClick={() => setMediaType('anime')}>
          {t('bulkAnime')}
        </button>
        <button type="button" role="tab" aria-selected={isManga} disabled={running || refreshing} onClick={() => setMediaType('manga')}>
          {t('bulkManga')}
        </button>
      </div>

      {/* ---- Id-range import (queue 24) ---- */}
      <section className="bulk-range">
        <h3>{t('bulkRangeTitle')}</h3>
        <form className="adm-inline" onSubmit={(event) => runRange(event, false)}>
          <label>
            <span>{t('bulkFrom')}</span>
            <input type="number" min="1" value={from} onChange={(event) => setFrom(event.target.value)} disabled={running} placeholder="1" />
          </label>
          <label>
            <span>{t('bulkTo')}</span>
            <input type="number" min="1" value={to} onChange={(event) => setTo(event.target.value)} disabled={running} placeholder="100" />
          </label>
          <button className="adm-btn" type="button" disabled={running || !total} onClick={(event) => runRange(event, true)}>
            {running ? t('bulkRunning') : t('bulkPreview')}
          </button>
          <button className="adm-btn adm-primary" type="submit" disabled={running || !total || !rangePreviewDone}>
            {running ? t('bulkRunning') : t('bulkSaveNow')}
          </button>
        </form>
        {total > 0 && !running && (
          <p className="adm-muted">{t(rangePreviewDone ? 'bulkPreviewReady' : 'bulkPreviewHint')}</p>
        )}
      </section>

      {/* ---- Facet import (queue 26/27): same preview → save flow ---- */}
      <section className="bulk-facet">
        <h3>{t('bulkFacetTitle')}</h3>
        <p className="adm-muted">{t('bulkFacetHint')}</p>
        <div className="adm-inline">
          <label>
            <span>{t('bulkFacetGenre')}</span>
            <input list="bulk-genre-list" dir="ltr" value={facet.genre} onChange={(event) => setFacet((current) => ({ ...current, genre: event.target.value }))} disabled={running || discovering} />
            <datalist id="bulk-genre-list">
              {['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Psychological'].map((g) => <option value={g} key={g} />)}
            </datalist>
          </label>
          <label>
            <span>{t('bulkFacetYear')}</span>
            <input type="number" min="1900" dir="ltr" value={facet.year} onChange={(event) => setFacet((current) => ({ ...current, year: event.target.value }))} disabled={running || discovering} placeholder="1970" />
          </label>
          <label>
            <span>{t('bulkFacetMinScore')}</span>
            <select value={facet.minScore} onChange={(event) => setFacet((current) => ({ ...current, minScore: event.target.value }))} disabled={running || discovering}>
              <option value="">—</option>
              <option value="6">6+</option>
              <option value="7">7+</option>
              <option value="8">8+</option>
              <option value="9">9+</option>
            </select>
          </label>
          <button className="adm-btn" type="button" disabled={running || discovering} onClick={discover}>
            {discovering ? t('bulkDiscovering') : t('bulkDiscover')}
          </button>
        </div>
        {candidates && (
          <div className="bulk-candidates">
            {candidates.length === 0 ? (
              <p className="adm-muted">{t('bulkFacetEmpty')}</p>
            ) : (
              <>
                <label className="bulk-select-all">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleAllCandidates(event.target.checked)}
                    disabled={running}
                  />
                  <span>{t('bulkSelectAll')}</span>
                </label>
                <ul className="bulk-candidate-list">
                  {candidates.map((row) => (
                    <li key={row.malId}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected.includes(row.malId)}
                          onChange={() => toggleCandidate(row.malId)}
                          disabled={running}
                        />
                        <span dir="auto">{row.title}</span>
                        <span dir="ltr" className="bulk-candidate-meta">
                          {row.year || '—'} · {row.category || '—'}{row.score != null ? ` · ${row.score}` : ''} · #{row.malId}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="adm-inline">
                  <button className="adm-btn" type="button" disabled={running || selected.length === 0} onClick={() => runSelectedIds(true)}>
                    {running ? t('bulkRunning') : t('bulkPreview')}
                  </button>
                  <button className="adm-btn adm-primary" type="button" disabled={running || selected.length === 0 || !facetPreviewDone} onClick={() => runSelectedIds(false)}>
                    {running ? t('bulkRunning') : t('bulkSaveNow')}
                  </button>
                </div>
                <p className="adm-muted">{t(facetPreviewDone ? 'bulkPreviewReady' : 'bulkPreviewHint')}</p>
              </>
            )}
          </div>
        )}
      </section>

      {progress && (
        <div className="bulk-progress" role="progressbar" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <div className="bulk-progress-bar" style={{ '--done': `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }} />
          <span dir="ltr">{progress.done}/{progress.total}</span>
        </div>
      )}
      {summary && (
        <p className="bulk-summary">
          <span className="ok">{t('bulkImported')}: {summary.imported}</span>
          <span className="warn">{t('bulkExists')}: {summary.exists}</span>
          {summary.ok > 0 && <span className="ok">{t('bulkPreviewFound')}: {summary.ok}</span>}
          {summary.missing > 0 && <span className="warn">{t('bulkMissing')}: {summary.missing}</span>}
          <span className="fail">{t('bulkFailed')}: {summary.failed}</span>
        </p>
      )}

      {log.length > 0 && (
        <ul className="bulk-log">
          {log.map((row) => (
            <li key={`${row.malId}-${row.status}-${row.title ?? ''}`} className={`is-${statusClass(row.status)}`}>
              <span className="bulk-log-id" dir="ltr">#{row.malId}</span>
              <span className="bulk-log-title" dir="auto">
                {row.title || row.error || ''}
                {row.status === 'ok' && (row.year || row.category) ? (row.year ? ` — ${row.year}` : '') + (row.category ? ` · ${row.category}` : '') : ''}
              </span>
              <span className="bulk-log-status">{row.status === 'ok' && row.score != null ? `${statusLabel(row)} (${row.score})` : statusLabel(row)}</span>
            </li>
          ))}
        </ul>
      )}

      {isManga && (
        <section className="bulk-refresh">
          <h3>{t('bulkRefreshMangaTitle')}</h3>
          <p className="adm-muted">{t('bulkRefreshMangaHint')}</p>
          <button className="adm-btn" type="button" onClick={runMangaRefresh} disabled={running || refreshing}>
            {refreshing ? t('bulkRefreshing') : t('bulkRefreshAll')}
          </button>
          {refreshReport && (
            <p className="bulk-summary">
              <span className="ok">{t('bulkRefreshedCount', { n: refreshReport.updated })}</span>
              {refreshReport.failed > 0 && <span className="fail">{t('bulkRefreshFailedCount', { n: refreshReport.failed })}</span>}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
