import React, { useCallback, useEffect, useState } from 'react';
import { useAdmin } from './context.js';
import { fmtDate, fmtNum } from './pages/import-util.js';

const URL = '/api/admin/x/import/extras';
const FIELDS = [['perTick', 'exPerTick', 5, 500], ['intervalMin', 'exInterval', 1, 1440], ['refreshDays', 'exRefreshDays', 7, 365], ['retryDays', 'exRetryDays', 1, 30]];

// Control panel for the background job that pre-caches every anime's extras (server/extras-backfill.js).
export default function ExtrasBackfill() {
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
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => { if (status && !form) setForm(Object.fromEntries(FIELDS.map(([key]) => [key, status[key]]))); }, [status, form]);

  const send = async (body, okKey) => {
    setBusy(true);
    try {
      const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus(data);
      if (body.perTick != null) setForm(Object.fromEntries(FIELDS.map(([key]) => [key, data[key]])));
      if (okKey) toast(t(okKey));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => { if (await confirm(t('exResetConfirm'))) send({ action: 'reset' }, 'exResetDone'); };
  const dirty = status && form && FIELDS.some(([key]) => Number(form[key]) !== status[key]);
  const n = (value) => fmtNum(value, lang);
  const pct = status && status.total ? Math.min(100, Math.round(((status.total - Math.min(status.waiting, status.total)) / status.total) * 100)) : 0;

  return (
    <div className="adm-card imp-card">
      <header className="imp-card-head">
        <div>
          <h2 className="imp-card-title">{t('exTitle')}</h2>
          <p className="imp-card-sub">{t('exSub')}</p>
        </div>
        {status && <span className={`adm-chip ${status.running ? 'is-live' : status.enabled ? 'is-ok' : ''}`} aria-live="polite">{t(status.running ? 'exRunning' : status.enabled ? 'exOn' : 'exOff')}</span>}
      </header>
      <div className="imp-card-body">
        {!canEdit && <p className="imp-readonly">{t('impReadOnly')}</p>}
        {!status ? <p className="adm-muted">{t('loading')}</p> : (
          <>
            <div className="adm-bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${pct}%` }} /></div>
            <p className="imp-note">{t('exCounts', { cached: n(status.cached), total: n(status.total), waiting: n(status.waiting) })}</p>
            {status.waiting > 0 && status.enabled && <p className="imp-note">{t('exEta', { h: n(status.etaHours) })}</p>}
            <p className="imp-note">
              {status.lastAt ? t('exLast', { date: fmtDate(new Date(status.lastAt).toISOString(), lang), n: n(status.lastFilled), total: n(status.filledTotal) }) : t('exNever')}
            </p>
            {status.error && <p className="adm-error" role="alert" dir="auto">{status.error}</p>}
            {status.breakerOpen && <p className="imp-note is-warn" role="status">{t('exBreaker')}</p>}
            {canEdit && form && (
              <>
                <label className="sys-switch"><input type="checkbox" checked={status.enabled} disabled={busy} onChange={(e) => send({ enabled: e.target.checked })} />{t('exEnable')}</label>
                <div className="imp-fields">
                  {FIELDS.map(([key, label, min, max]) => (
                    <label className="adm-field" key={key}><span>{t(label)}</span>
                      <input type="number" min={min} max={max} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} dir="ltr" /></label>
                  ))}
                </div>
                <p className="adm-muted">{t('exHint')}</p>
                <div className="adm-actions">
                  <button type="button" className="adm-btn adm-primary" disabled={busy || !dirty} onClick={() => send(form, 'exSaved')}>{t('exSave')}</button>
                  <button type="button" className="adm-btn" disabled={busy || status.running} onClick={() => send({ action: 'run' }, 'exStarted')}>{t('exRunNow')}</button>
                  <button type="button" className="adm-btn" disabled={busy} onClick={reset}>{t('exReset')}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
