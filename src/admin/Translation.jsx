import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';

const MEDIA = [['both', 'translateMediaAll'], ['anime', 'translateMediaAnime'], ['manga', 'translateMediaManga']];
const clock = (seconds, lang) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`.replace(/\d/g, (d) => (lang === 'fa' ? '۰۱۲۳۴۵۶۷۸۹'[d] : d));
const mediaLabel = (table, t) => t(table === 'manga' ? 'translateMediaManga' : 'translateMediaAnime');

export default function Translation() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('translate', 'edit');
  const saved = (key, fallback) => { try { return window.localStorage.getItem(`adm-tr-${key}`) ?? fallback; } catch { return fallback; } };
  const [media, setMediaRaw] = useState(() => (MEDIA.some(([k]) => k === saved('media', '')) ? saved('media', '') : 'both')); // both | anime | manga
  const [keepGoing, setKeepGoingRaw] = useState(() => saved('keep', '1') !== '0');
  const remember = (key, value) => { try { window.localStorage.setItem(`adm-tr-${key}`, value); } catch { /* private mode */ } };
  const setMedia = (value) => { setMediaRaw(value); remember('media', value); };
  const setKeepGoing = (value) => { setKeepGoingRaw(value); remember('keep', value ? '1' : '0'); };
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState('missing'); // missing | forceauto
  const [pass, setPass] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [last, setLast] = useState(null);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const stopRef = useRef(false);
  const alive = useRef(true);
  const num = (value) => Number(value || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const loadStatus = useCallback(() => {
    setStatusError(false);
    return api.translateStatus().then((data) => { if (alive.current) setStatus(data); })
      .catch(() => { if (alive.current) setStatusError(true); });
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Elapsed timer + leave-page guard while a (long) run is in flight.
  useEffect(() => {
    if (!running) return undefined;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    const guard = (event) => { event.preventDefault(); event.returnValue = t('trLeaveWarn'); };
    window.addEventListener('beforeunload', guard);
    return () => { window.clearInterval(timer); window.removeEventListener('beforeunload', guard); };
  }, [running, t]);

  const run = async (runMode) => {
    if (running || !canEdit) return;
    const scope = t(MEDIA.find(([key]) => key === media)[1]);
    if (runMode === 'forceauto' && !await confirm(t('trForceConfirm', { scope }))) return;
    stopRef.current = false;
    setStopping(false);
    setMode(runMode);
    setRunning(true);
    setPass(0);
    setOnlyFailed(false);
    setLast(null);
    // Totals across passes: one request translates for at most ~4 minutes, so "missing" loops.
    const total = { scanned: 0, translated: 0, failed: 0, remaining: 0, elapsedMs: 0, results: [] };
    let n = 0;
    try {
      let again = true;
      while (again) {
        n += 1;
        setPass(n);
        // eslint-disable-next-line no-await-in-loop
        const res = await api.backfill({ mode: runMode, media, budgetMs: 240000 });
        total.scanned += res.scanned || 0;
        total.translated += res.translated || 0;
        total.failed += res.failed || 0;
        total.remaining = res.remaining || 0;
        total.elapsedMs += res.elapsedMs || 0;
        total.results = [...new Map([...total.results, ...(res.results || [])].map((r) => [`${r.table}/${r.slug}`, r])).values()].sort((a, b) => Number(a.ok) - Number(b.ok)).slice(0, 200);
        if (alive.current) setLast({ ...total });
        if (runMode === 'missing' && total.remaining > 0 && !res.translated) {
          toast(t('trStoppedNoProgress'), 'error'); // a whole pass produced nothing: do not hammer the service
          break;
        }
        again = runMode === 'missing' && keepGoing && total.remaining > 0 && !stopRef.current;
      }
      if (!alive.current) return;
      if (total.translated === 0 && total.failed === 0) toast(t('translateNoWork'), 'ok');
      else toast(t('translateDone', { translated: total.translated, failed: total.failed }), total.failed ? 'error' : 'ok');
    } catch (err) {
      if (alive.current) toast(err?.status === 429 ? t('translateRunningNow') : (err?.message || String(err)), 'error');
    } finally {
      if (alive.current) { setRunning(false); setStopping(false); loadStatus(); }
    }
  };

  const stop = () => { stopRef.current = true; setStopping(true); };

  const failedRows = last?.results.filter((r) => !r.ok) || [];
  const rows = (onlyFailed ? failedRows : last?.results || []).slice(0, 50);
  const busyElsewhere = Boolean(status?.running) && !running;
  const progressLabel = running ? (mode === 'missing' && keepGoing ? `${t('trPass', { n: num(pass) })} · ${clock(seconds, lang)}` : clock(seconds, lang)) : '';

  return (
    <div className="adm-card adm-tr">
      <header className="adm-card-head">
        <div>
          <h2 className="adm-card-title">{t('translateTitle')}</h2>
          <p className="adm-card-sub">{t('translateManualProtected')}</p>
        </div>
      </header>
      <div className="adm-card-body">
        {!canEdit && <p className="adm-tr-note" role="note">{t('trReadOnly')}</p>}
        {running && <p className="adm-tr-note is-run" role="status">{t('trRunningBanner', { time: progressLabel })}{last && ` ${t('trRunningSoFar', { n: num(last.translated), left: num(last.remaining) })}`}</p>}
        {busyElsewhere && <p className="adm-tr-note" role="status">{t('trServerBusy')}</p>}

        {!status && !statusError && <div className="adm-skeleton adm-tr-skel" aria-busy="true"><i /><i /></div>}
        {statusError && (
          <p className="adm-error" role="alert">
            {t('trStatusError')} <button className="adm-btn" type="button" onClick={loadStatus}>{t('trRetry')}</button>
          </p>
        )}
        {status && (
          <div className="adm-stats adm-tr-stats">
            <div className="adm-stat"><strong>{num(status.missing)}</strong><span>{t('translateStatusMissing')}</span></div>
            <Link className="adm-stat adm-tr-link" to="/admin/translate/review">
              <strong>{num(status.pending)}</strong><span>{t('translateStatusPending')} ›</span>
            </Link>
            <button className="adm-btn adm-tr-refresh" type="button" disabled={running} onClick={loadStatus}>{t('trRefresh')}</button>
          </div>
        )}
        {status && status.total > 0 && (
          <div className="adm-tr-cover" role="img" aria-label={t('trCoverage', { done: num(status.approved), total: num(status.total) })}>
            <div className="adm-tr-bar">
              <i className="is-done" style={{ inlineSize: `${(status.approved / status.total) * 100}%` }} />
              <i className="is-pending" style={{ inlineSize: `${(status.pending / status.total) * 100}%` }} />
            </div>
            <p className="adm-muted">{t('trCoverage', { done: num(status.approved), total: num(status.total) })}</p>
          </div>
        )}
        {status && status.missing === 0 && !running && <p className="adm-muted">{t('trAllDone')}</p>}

        <div className="adm-filters" role="group" aria-label={t('trScope')}>
          <span className="adm-muted adm-tr-scope">{t('trScope')}</span>
          {MEDIA.map(([key, label]) => (
            <button key={key} type="button" className={`adm-fchip${media === key ? ' is-on' : ''}`} aria-pressed={media === key} disabled={running} onClick={() => setMedia(key)}>{t(label)}</button>
          ))}
        </div>

        <div className="adm-tr-grid">
          <section className="adm-tr-panel">
            <h3>{t('trFillTitle')}</h3>
            <p className="adm-muted">{t('trFillDesc')}</p>
            <label className="adm-tr-check">
              <input type="checkbox" checked={keepGoing} disabled={running || !canEdit} onChange={(e) => setKeepGoing(e.target.checked)} />
              <span>{t('trKeepGoing')}</span>
            </label>
            <p className="adm-muted adm-tr-hint">{t('trKeepGoingHint')}</p>
            <div className="adm-tr-actions">
              <button className="adm-btn adm-primary" type="button" disabled={running || !canEdit || busyElsewhere} aria-busy={running && mode === 'missing'} onClick={() => run('missing')}>
                {running && mode === 'missing' ? t('translateRunning') : t('trStart')}
              </button>
              {running && mode === 'missing' && keepGoing && (
                <button className="adm-btn" type="button" disabled={stopping} onClick={stop}>{stopping ? t('trStopping') : t('trStop')}</button>
              )}
            </div>
          </section>
          <section className="adm-tr-panel">
            <h3>{t('trForceTitle')}</h3>
            <p className="adm-muted">{t('trForceDesc')}</p>
            <div className="adm-tr-actions">
              <button className="adm-btn" type="button" disabled={running || !canEdit || busyElsewhere} aria-busy={running && mode === 'forceauto'} onClick={() => run('forceauto')}>
                {running && mode === 'forceauto' ? t('translateRunning') : t('trForceStart')}
              </button>
            </div>
          </section>
        </div>

        {last && (
          <section className="adm-tr-panel adm-tr-result" aria-live="polite">
            <h3>{t('trLastRun')}</h3>
            <div className="adm-stats">
              {last.scanned > 0 && <div className="adm-stat"><strong>{num(last.scanned)}</strong><span>{t('translateScanned')}</span></div>}
              <div className="adm-stat"><strong>{num(last.translated)}</strong><span>{t('translateTranslated')}</span></div>
              <div className="adm-stat"><strong>{num(last.failed)}</strong><span>{t('translateFailed')}</span></div>
              {mode === 'missing' && <div className="adm-stat"><strong>{num(last.remaining)}</strong><span>{t('translateRemaining')}</span></div>}
              <div className="adm-stat"><strong>{clock(Math.round(last.elapsedMs / 1000), lang)}</strong><span>{t('trTime')}</span></div>
            </div>
            {last.results.length > 0 && (
              <>
                <div className="adm-filters">
                  <button type="button" className={`adm-fchip${onlyFailed ? ' is-on' : ''}`} aria-pressed={onlyFailed} onClick={() => setOnlyFailed((v) => !v)}>
                    {t('trOnlyFailed')}<b>{failedRows.length}</b>
                  </button>
                </div>
                {rows.length === 0 ? <p className="adm-muted">{t('trNothingFailed')}</p> : (
                  <div className="adm-card adm-table-wrap">
                    <table className="adm-table">
                      <thead><tr><th>{t('trType')}</th><th>{t('trTitleSlug')}</th><th>{t('trResult')}</th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={`${r.table}/${r.slug}`}>
                            <td data-th={t('trType')}>{mediaLabel(r.table, t)}</td>
                            <td data-th={t('trTitleSlug')} dir="ltr">{r.table === 'anime' ? <Link to={`/admin/edit/${encodeURIComponent(r.slug)}`}>{r.slug}</Link> : r.slug}</td>
                            <td data-th={t('trResult')}>
                              {r.ok ? <span className="adm-chip is-ok">{t('trOk')}</span> : <span className="adm-chip is-bad" title={r.error || ''}>{r.error || t('translateFailed')}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(onlyFailed ? failedRows : last.results).length > rows.length && (
                  <p className="adm-muted">{t('trShownOf', { shown: rows.length, total: (onlyFailed ? failedRows : last.results).length })}</p>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
