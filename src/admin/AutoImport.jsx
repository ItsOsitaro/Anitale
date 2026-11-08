import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import ScoreBackfill from './ScoreBackfill.jsx';
import { faDigits, fmtDate, fmtDur, fmtNum, friendly } from './pages/import-util.js';

const POLL_MS = 3000;
const IDLE_POLL_MS = 15000; // a slow look while idle, so a run started in another tab or by the scheduler shows up

// Polls `load` every POLL_MS while `active`, pauses while the tab is hidden and backs off after failures.
const usePoll = (active, load, every = POLL_MS) => {
  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let timer;
    let misses = 0;
    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try { await load(); misses = 0; } catch { misses = Math.min(misses + 1, 5); }
      }
      if (!stopped) timer = setTimeout(tick, every * (1 + misses));
    };
    timer = setTimeout(tick, every);
    return () => { stopped = true; clearTimeout(timer); };
  }, [active, load, every]);
};

const Stat = ({ value, label, tone = '', lang }) => (
  <div className={`imp-stat${tone ? ` is-${tone}` : ''}`}><b>{fmtNum(value, lang)}</b><span>{label}</span></div>
);

export default function AutoImport() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('import', 'edit');
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const next = await api.autoImportGet();
    setState(next);
    setLoadError('');
    return next;
  }, []);
  const loadFailed = (err) => setLoadError(friendly(errText(err, t), t));
  useEffect(() => { load().catch((err) => setLoadError(friendly(errText(err, t), t))); }, [load, t]);
  usePoll(Boolean(state?.running), load);
  usePoll(Boolean(state) && !state.running, load, IDLE_POLL_MS);

  // The run goes on in the background: tell the admin when it has finished.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && state && !state.running && state.last) {
      toast(t('autoRunDone', { anime: fmtNum(state.last.anime, lang), manga: fmtNum(state.last.manga, lang) }), state.last.error ? 'error' : 'ok');
    }
    wasRunning.current = Boolean(state?.running);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.running]);

  const toggle = async () => {
    setBusy('toggle');
    try { setState(await api.autoImportSet(!state.enabled)); } catch (err) { toast(errText(err, t), 'error'); } finally { setBusy(''); }
  };

  const runNow = async () => {
    setBusy('run');
    try {
      setState(await api.autoImportRun());
    } catch (err) {
      toast(err?.status === 429 ? t('autoAlreadyRunning') : friendly(errText(err, t), t), 'error');
    } finally { setBusy(''); }
  };

  // One-click full import: polls while it runs.
  const [all, setAll] = useState(null);
  const [allError, setAllError] = useState('');
  const loadAll = useCallback(async () => {
    const next = await api.importAllGet();
    setAll(next);
    setAllError('');
    return next;
  }, []);
  useEffect(() => { loadAll().catch((err) => setAllError(friendly(errText(err, t), t))); }, [loadAll, t]);
  usePoll(Boolean(all?.running), loadAll);
  usePoll(Boolean(all) && !all.running, loadAll, IDLE_POLL_MS);

  const doAll = async (action) => {
    if (action === 'start' && !(all?.page > 1) && !await confirm(t('allConfirm'))) return;
    if (action === 'restart' && !await confirm(t('allRestartConfirm'))) return;
    setBusy(`all-${action}`);
    try { setAll(await api.importAllDo(action)); } catch (err) { toast(friendly(errText(err, t), t), 'error'); } finally { setBusy(''); }
  };

  const last = state?.last;
  const pct = all?.pages ? Math.min(100, Math.round(((all.page - 1) / all.pages) * 100)) : 0;
  const lastAll = all?.last;
  const showAll = all && (all.running || all.imported > 0 || all.failed > 0 || all.error);

  return (
    <>
      <div className="adm-card imp-card">
        <header className="imp-card-head">
          <div>
            <h2 className="imp-card-title">{t('autoTitle')}</h2>
            <p className="imp-card-sub">{t('autoSub')}</p>
          </div>
          {state && <span className={`adm-chip ${state.running ? 'is-live' : state.enabled ? 'is-ok' : ''}`} aria-live="polite">{t(state.running ? 'autoRunning' : state.enabled ? 'autoOn' : 'autoOff')}</span>}
        </header>
        <div className="imp-card-body">
          {!canEdit && <p className="imp-readonly">{t('impReadOnly')}</p>}
          {!state && !loadError && <div className="imp-skel" aria-busy="true"><i /><i /></div>}
          {loadError && <p className="adm-error" role="alert" dir="auto">{loadError} <button type="button" className="adm-btn" onClick={() => load().catch(loadFailed)}>{t('impRetry')}</button></p>}
          {state && (
            <>
              <div className="imp-actions">
                <button className={`adm-btn ${state.enabled ? '' : 'adm-primary'}`} type="button" disabled={!canEdit || Boolean(busy)} onClick={toggle}>
                  {t(state.enabled ? 'autoDisable' : 'autoEnable')}
                </button>
                <button className="adm-btn" type="button" disabled={!canEdit || Boolean(busy) || state.running} onClick={runNow}>
                  {busy === 'run' || state.running ? t('autoRunning') : t('autoRunNow')}
                </button>
              </div>
              {state.enabled && state.nextRunAt && !state.running && <p className="imp-note">{t('autoNext', { date: fmtDate(state.nextRunAt, lang), max: fmtNum(state.maxPerRun, lang) })}</p>}
              {state.running && <p className="imp-note is-live" role="status">{t('autoRunningNote')}</p>}
              <div className="imp-panel">
                <h3 className="imp-panel-title">{t('autoLast')}</h3>
                {!last ? <p className="adm-muted">{t('autoNever')}</p> : (
                  <>
                    <p className="adm-muted">{fmtDate(last.at, lang)}{last.seconds != null ? ` · ${faDigits(fmtDur(last.seconds) || '0:00', lang)}` : ''}</p>
                    <div className="imp-stats">
                      <Stat lang={lang} value={last.anime} label={t('quickAnime')} tone="ok" />
                      <Stat lang={lang} value={last.manga} label={t('quickManga')} tone="ok" />
                      <Stat lang={lang} value={last.failed} label={t('bulkFailed')} tone={last.failed ? 'bad' : ''} />
                    </div>
                    {last.error && <p className="adm-error" role="alert" dir="auto">{t('autoErr', { msg: friendly(last.error, t) })}</p>}
                  </>
                )}
              </div>
              {state.history?.length > 1 && (
                <details className="imp-history">
                  <summary>{t('autoHistory', { n: fmtNum(state.history.length, lang) })}</summary>
                  <ul>
                    {state.history.map((run) => (
                      <li key={run.at} className={run.error || run.failed ? 'is-bad' : ''}>
                        <span>{fmtDate(run.at, lang)}</span>
                        <span>{t('autoHistRow', { anime: fmtNum(run.anime, lang), manga: fmtNum(run.manga, lang), failed: fmtNum(run.failed, lang) })}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </div>

      <div className="adm-card imp-card">
        <header className="imp-card-head">
          <div>
            <h2 className="imp-card-title">{t('allTitle')}</h2>
            <p className="imp-card-sub">{t('allSub')}</p>
          </div>
          {all && <span className={`adm-chip ${all.running ? 'is-live' : all.completed ? 'is-ok' : ''}`} aria-live="polite">{t(all.running ? (all.stop ? 'allStopping' : 'allRunning') : (all.completed ? 'allCompleted' : all.page > 1 ? 'allPaused' : 'allIdle'))}</span>}
        </header>
        <div className="imp-card-body">
          {/* read-only notice: shown once, in the first card */}
          {!all && !allError && <div className="imp-skel" aria-busy="true"><i /></div>}
          {allError && <p className="adm-error" role="alert" dir="auto">{allError} <button type="button" className="adm-btn" onClick={() => loadAll().catch((err) => setAllError(friendly(errText(err, t), t)))}>{t('impRetry')}</button></p>}
          {all && (
            <div className="imp-actions">
              {all.running
                ? <button className="adm-btn" type="button" disabled={!canEdit || all.stop || Boolean(busy)} onClick={() => doAll('stop')}>{t('allStop')}</button>
                : (
                  <>
                    <button className="adm-btn adm-primary" type="button" disabled={!canEdit || Boolean(busy)} onClick={() => doAll('start')}>{t(all.page > 1 ? 'allContinue' : 'allStart')}</button>
                    {all.page > 1 && <button className="adm-btn" type="button" disabled={!canEdit || Boolean(busy)} onClick={() => doAll('restart')}>{t('allRestart')}</button>}
                  </>
                )}
              <Link className="adm-btn" to="/admin/anime">{t('allViewList')}</Link>
            </div>
          )}
          {all?.have > 0 && <p className="imp-note">{all.total >= all.have ? t('allHaveOf', { have: fmtNum(all.have, lang), total: fmtNum(all.total, lang) }) : t('allHave', { have: fmtNum(all.have, lang) })}</p>}
          {all && all.page > 1 && !all.running && <p className="imp-note">{t('allResumeAt', { page: fmtNum(all.page, lang) })}</p>}
          {all?.running && (
            <>
              <div className="imp-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct} aria-label={t('allTitle')}>
                <div className={`imp-meter-bar${all.retrying ? ' is-wait' : ''}`} style={{ '--done': `${pct}%` }} />
                <span dir="ltr">{all.pages ? `${fmtNum(all.page, lang)}/${fmtNum(all.pages, lang)} · ${fmtNum(pct, lang)}%` : `${fmtNum(all.page, lang)}/?`}</span>
              </div>
              <p className="imp-note" dir="auto">
                {t('allTimes', { elapsed: faDigits(fmtDur(all.elapsedSec) || '0:00', lang), eta: all.etaSec != null ? faDigits(fmtDur(all.etaSec), lang) : '—', rate: fmtNum(all.perMin || 0, lang) })}
              </p>
              {all.retrying > 0 && <p className="imp-note is-warn" role="status">{t('allRetrying', { n: fmtNum(all.retrying, lang), max: fmtNum(10, lang) })}</p>}
            </>
          )}
          {showAll && (
            <div className="imp-panel">
              <div className="imp-stats">
                <Stat lang={lang} value={all.imported} label={t('bulkImported')} tone="ok" />
                <Stat lang={lang} value={all.skipped} label={t('allSkipped')} />
                <Stat lang={lang} value={all.missing} label={t('bulkMissing')} tone={all.missing ? 'warn' : ''} />
                <Stat lang={lang} value={all.failed} label={t('bulkFailed')} tone={all.failed ? 'bad' : ''} />
              </div>
              {all.error && <p className="adm-error" role="alert" dir="auto">{t('allErr', { msg: friendly(all.error, t) })}</p>}
            </div>
          )}
          {lastAll && !all?.running && (
            <p className="imp-note">
              {t('allLastRun', { date: fmtDate(lastAll.at, lang), imported: fmtNum(lastAll.imported, lang), failed: fmtNum(lastAll.failed, lang), time: faDigits(fmtDur(lastAll.seconds) || '0:00', lang) })}
              {lastAll.completed ? ` · ${t('allCompleted')}` : lastAll.stopped ? ` · ${t('allStoppedByYou')}` : ''}
            </p>
          )}
        </div>
      </div>
      <ScoreBackfill />
    </>
  );
}
