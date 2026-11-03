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

  const last = state?.last;
  return (
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
  );
}
