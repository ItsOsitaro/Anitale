import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

export default function AutoImport() {
  const { t, toast } = useAdmin();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try { setState(await api.autoImportGet()); } catch (err) { toast(errText(err, t), 'error'); }
  }, [t, toast]);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    setBusy('toggle');
    try { setState(await api.autoImportSet(!state.enabled)); } catch (err) { toast(errText(err, t), 'error'); } finally { setBusy(''); }
  };

  const runNow = async () => {
    setBusy('run');
    try {
      const res = await api.autoImportRun();
      toast(t('autoRunDone', { anime: res?.anime || 0, manga: res?.manga || 0 }));
      await load();
    } catch (err) {
      toast(err?.status === 429 ? t('translateRunningNow') : errText(err, t), 'error');
    } finally { setBusy(''); }
  };

  // One-click full import: polls while it runs.
  const [all, setAll] = useState(null);
  const loadAll = useCallback(async () => {
    try { setAll(await api.importAllGet()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (!all?.running) return undefined;
    const timer = setInterval(loadAll, 3000);
    return () => clearInterval(timer);
  }, [all?.running, loadAll]);
  const doAll = async (action) => {
    if (action !== 'stop' && !window.confirm(t('allConfirm'))) return;
    try { setAll(await api.importAllDo(action)); } catch (err) { toast(errText(err, t), 'error'); }
  };

  const last = state?.last;
  return (
    <>
    <div className="adm-card">
      <header className="adm-card-head">
        <div>
          <h2 className="adm-card-title">{t('autoTitle')}</h2>
          <p className="adm-card-sub">{t('autoSub')}</p>
        </div>
        {state && <span className="adm-chip" aria-live="polite">{t(state.enabled ? 'autoOn' : 'autoOff')}</span>}
      </header>
      <div className="adm-card-body">
        <div className="adm-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className={`adm-btn ${state?.enabled ? '' : 'adm-primary'}`} type="button" disabled={!state || Boolean(busy)} onClick={toggle}>
            {t(state?.enabled ? 'autoDisable' : 'autoEnable')}
          </button>
          <button className="adm-btn" type="button" disabled={!state || Boolean(busy) || state?.running} onClick={runNow}>
            {busy === 'run' || state?.running ? t('autoRunning') : t('autoRunNow')}
          </button>
        </div>
        <div className="adm-panel" style={{ marginTop: 16 }}>
          <h3 className="adm-panel-title">{t('autoLast')}</h3>
          {!last ? <p className="adm-muted">{t('autoNever')}</p> : (
            <>
              <p className="adm-muted">{new Date(last.at).toLocaleString(undefined)}</p>
              <p>{t('autoResult', { anime: last.anime, manga: last.manga, failed: last.failed })}</p>
              {last.error && <p className="adm-error">{t('autoErr', { msg: last.error })}</p>}
            </>
          )}
        </div>
      </div>
    </div>
    <div className="adm-card" style={{ marginTop: 16 }}>
      <header className="adm-card-head">
        <div>
          <h2 className="adm-card-title">{t('allTitle')}</h2>
          <p className="adm-card-sub">{t('allSub')}</p>
        </div>
        {all && <span className="adm-chip" aria-live="polite">{t(all.running ? (all.stop ? 'allStopping' : 'allRunning') : 'allIdle')}</span>}
      </header>
      <div className="adm-card-body">
        <div className="adm-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {all?.running
            ? <button className="adm-btn" type="button" disabled={all.stop} onClick={() => doAll('stop')}>{t('allStop')}</button>
            : (
              <>
                <button className="adm-btn adm-primary" type="button" disabled={!all} onClick={() => doAll('start')}>{t(all?.page > 1 ? 'allContinue' : 'allStart')}</button>
                {all?.page > 1 && <button className="adm-btn" type="button" onClick={() => doAll('restart')}>{t('allRestart')}</button>}
              </>
            )}
        </div>
        {all && (all.running || all.imported > 0 || all.error) && (
          <div className="adm-panel" style={{ marginTop: 16 }}>
            <p>{t('allProgress', { page: all.page, pages: all.pages || '?', imported: all.imported, skipped: all.skipped, missing: all.missing, failed: all.failed })}</p>
            {all.error && <p className="adm-error">{t('allErr', { msg: all.error })}</p>}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
