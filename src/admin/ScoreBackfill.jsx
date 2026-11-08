import React, { useCallback, useEffect, useState } from 'react';
import { useAdmin } from './context.js';
import { fmtDate, fmtNum } from './pages/import-util.js';

const URL = '/api/admin/x/import/scores';
const FIELDS = [['perTick', 'scPerTick', 5, 300], ['intervalMin', 'scInterval', 1, 1440], ['minVoters', 'scMinVoters', 1, 5000], ['retryDays', 'scRetryDays', 1, 365]];

// Control panel for the background job that fills missing anime scores (server/score-backfill.js).
export default function ScoreBackfill() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('import', 'edit');
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(URL);
      if (res.ok) setStatus(await res.json());
    } catch { /* next poll retries */ }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => { if (status && !form) setForm({ perTick: status.perTick, intervalMin: status.intervalMin, minVoters: status.minVoters, retryDays: status.retryDays }); }, [status, form]);

  const send = async (body, okKey) => {
    setBusy(true);
    try {
      const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus(data);
      if (body.perTick != null) setForm({ perTick: data.perTick, intervalMin: data.intervalMin, minVoters: data.minVoters, retryDays: data.retryDays });
      if (okKey) toast(t(okKey));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => { if (await confirm(t('scResetConfirm'))) send({ action: 'reset' }, 'scResetDone'); };
  const dirty = status && form && FIELDS.some(([key]) => Number(form[key]) !== status[key]);
  const n = (value) => fmtNum(value, lang);

  return (
    <div className="adm-card imp-card">
      <header className="imp-card-head">
        <div>
          <h2 className="imp-card-title">{t('scTitle')}</h2>
          <p className="imp-card-sub">{t('scSub')}</p>
        </div>
        {status && <span className={`adm-chip ${status.running ? 'is-live' : status.enabled ? 'is-ok' : ''}`} aria-live="polite">{t(status.running ? 'scRunning' : status.enabled ? 'scOn' : 'scOff')}</span>}
      </header>
      <div className="imp-card-body">
        {!canEdit && <p className="imp-readonly">{t('impReadOnly')}</p>}
        {!status ? <p className="adm-muted">{t('loading')}</p> : (
          <>
            <p className="imp-note">{t('scCounts', { unscored: n(status.unscored), eligible: n(status.eligible), waiting: n(status.waiting) })}</p>
            <p className="imp-note">
              {status.lastAt ? t('scLast', { date: fmtDate(new Date(status.lastAt).toISOString(), lang), n: n(status.lastFilled), total: n(status.filledTotal) }) : t('scNever')}
            </p>
            {status.error && <p className="adm-error" role="alert" dir="auto">{status.error}</p>}
            {status.breakerOpen && <p className="imp-note is-warn" role="status">{t('scBreaker')}</p>}
            {canEdit && form && (
              <>
                <label className="sys-switch"><input type="checkbox" checked={status.enabled} disabled={busy} onChange={(e) => send({ enabled: e.target.checked })} />{t('scEnable')}</label>
                <div className="imp-fields">
                  {FIELDS.map(([key, label, min, max]) => (
                    <label className="adm-field" key={key}><span>{t(label)}</span>
                      <input type="number" min={min} max={max} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} dir="ltr" /></label>
                  ))}
                </div>
                <p className="adm-muted">{t('scHint')}</p>
                <div className="adm-actions">
                  <button type="button" className="adm-btn adm-primary" disabled={busy || !dirty} onClick={() => send(form, 'scSaved')}>{t('scSave')}</button>
                  <button type="button" className="adm-btn" disabled={busy || status.running} onClick={() => send({ action: 'run' }, 'scStarted')}>{t('scRunNow')}</button>
                  <button type="button" className="adm-btn" disabled={busy} onClick={reset}>{t('scReset')}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
