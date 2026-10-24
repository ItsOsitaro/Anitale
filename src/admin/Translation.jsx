import React, { useContext, useState } from 'react';
import { api } from './api.js';
import { AdminContext } from './context.js';

const IconTranslate = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 8l6 6" />
    <path d="M4 14l6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2h1" />
    <path d="M22 22l-5-10-5 10" />
    <path d="M14 18h6" />
  </svg>
);

export default function Translation() {
  const { t, toast } = useContext(AdminContext);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState('missing'); // missing | forceAuto
  const [media, setMedia] = useState('both'); // both | anime | manga
  const [last, setLast] = useState(null);

  const run = async (runMode = mode) => {
    if (running) return;
    setRunning(true);
    setMode(runMode);
    try {
      const res = await api.backfill({ mode: runMode, media, budgetMs: 240000 });
      setLast(res);
      if (res?.translated > 0) {
        toast(t('translateDone').replace('{translated}', res.translated).replace('{failed}', res.failed), 'ok');
      } else if (res?.remaining === 0 && runMode === 'missing') {
        toast(t('translateNoWork'), 'ok');
      } else {
        toast(t('translateDone').replace('{translated}', res.translated || 0).replace('{failed}', res.failed || 0), 'ok');
      }
    } catch (err) {
      if (err?.status === 429) {
        toast(t('translateRunningNow'), 'error');
      } else {
        toast(err?.message || String(err), 'error');
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="adm-card">
      <header className="adm-card-head">
        <div>
          <h2 className="adm-card-title">{t('translateTitle')}</h2>
          <p className="adm-card-sub">{t('translateManualProtected')}</p>
        </div>
      </header>
      <div className="adm-card-body">
        <div className="adm-grid">
          <section className="adm-panel">
            <h3 className="adm-panel-title">{t('translateFillMissing')}</h3>
            <p className="adm-panel-sub">{t('translateFillMissingDesc')}</p>
            <button className="adm-btn adm-btn-primary" type="button" disabled={running} onClick={() => run('missing')}>
              {running && mode === 'missing' ? t('translateRunning') : t('translateRun')}
            </button>
          </section>
          <section className="adm-panel">
            <h3 className="adm-panel-title">{t('translateForceAll')}</h3>
            <p className="adm-panel-sub">{t('translateForceAllDesc')}</p>
            <div className="adm-row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="adm-field" style={{ maxWidth: 200 }}>
                <span className="adm-label">{t('translateMediaAll')}</span>
                <select value={media} onChange={(e) => setMedia(e.target.value)} disabled={running}>
                  <option value="both">{t('translateMediaAll')}</option>
                  <option value="anime">{t('translateMediaAnime')}</option>
                  <option value="manga">{t('translateMediaManga')}</option>
                </select>
              </label>
            </div>
            <button className="adm-btn" type="button" disabled={running} onClick={() => run('forceAuto')}>
              {running && mode === 'forceAuto' ? t('translateRunning') : t('translateRun')}
            </button>
          </section>
        </div>
        {last && (
          <div className="adm-panel" style={{ marginTop: 16 }}>
            <h3 className="adm-panel-title">{t('translateTitle')}</h3>
            <div className="adm-stats" style={{ marginTop: 8 }}>
              <div className="adm-stat"><strong>{last.scanned || 0}</strong><span>{t('translateScanned')}</span></div>
              <div className="adm-stat"><strong>{last.translated || 0}</strong><span>{t('translateTranslated')}</span></div>
              <div className="adm-stat"><strong>{last.failed || 0}</strong><span>{t('translateFailed')}</span></div>
              <div className="adm-stat"><strong>{last.remaining || 0}</strong><span>{t('translateRemaining')}</span></div>
              <div className="adm-stat"><strong>{Math.round((last.elapsedMs || 0)/1000)}s</strong><span>Time</span></div>
            </div>
            {Array.isArray(last.results) && last.results.length > 0 && (
              <div className="adm-table-wrap" style={{ marginTop: 12 }}>
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Slug</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.results.slice(0, 50).map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.table}</td>
                        <td>{r.slug}</td>
                        <td>{r.ok ? 'OK' : (r.error || 'ERR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

