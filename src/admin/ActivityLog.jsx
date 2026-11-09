import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const PAGE = 50;
const VERB = { POST: 'logVerbPOST', PUT: 'logVerbEdit', PATCH: 'logVerbEdit', DELETE: 'logVerbDELETE' };
const SAVED = 'anitale.admin.log';
const loadSaved = () => { try { return JSON.parse(sessionStorage.getItem(SAVED) || 'null'); } catch { return null; } };
const STATUS_HINT = { 400: 'logHint400', 403: 'logHint403', 404: 'logHint404', 409: 'logHint409', 422: 'logHint422', 429: 'logHint429', 500: 'logHint500' };
const EMPTY = { admin: '', status: '', method: '', from: '', to: '', q: '' };

// Same-origin cookie session, so a plain fetch is enough (api.js is not ours to change).
const fetchLog = async (params) => {
  const response = await fetch(`/api/admin/log?${params}`, { credentials: 'same-origin' });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.error || response.statusText), { status: response.status });
  return data;
};

const buildParams = (f, extra = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== '' && v != null) p.set(k, v);
  return p.toString();
};

export default function ActivityLog() {
  const { t, lang, toast } = useAdmin();
  const saved = useRef(loadSaved());
  const [filters, setFilters] = useState(() => ({ ...EMPTY, ...(saved.current || {}) }));
  const [search, setSearch] = useState(() => saved.current?.q || '');
  const [updated, setUpdated] = useState(null);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const reqId = useRef(0);
  useEffect(() => { try { sessionStorage.setItem(SAVED, JSON.stringify(filters)); } catch { /* private mode */ } }, [filters]);

  // Debounce the text search so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => { setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim() })); setOffset(0); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (quiet = false) => {
    const id = ++reqId.current;
    if (!quiet) setBusy(true);
    try {
      const res = await fetchLog(buildParams(filters, { limit: PAGE, offset }));
      if (id !== reqId.current) return; // a newer request replaced this one
      setData(res);
      setUpdated(new Date());
      setFailed(false);
    } catch (err) {
      if (id !== reqId.current) return;
      if (!quiet) toast(errText(err, t), 'error');
      setFailed(true);
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, [filters, offset, t, toast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!auto) return undefined;
    const timer = setInterval(() => { if (!document.hidden) load(true); }, 30000);
    return () => clearInterval(timer);
  }, [auto, load]);

  const set = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setOffset(0); };
  const dirty = Object.entries(filters).some(([, v]) => v !== '');
  const clear = () => { setFilters(EMPTY); setSearch(''); setOffset(0); };

  const locale = lang === 'fa' ? 'fa-IR' : 'en-GB';
  const stamp = (value) => new Date(`${String(value).replace(' ', 'T')}Z`);
  const nowDate = new Date();
  const todayIso = nowDate.toISOString().slice(0, 10);
  const num = (n) => Number(n).toLocaleString(locale);

  const items = data?.items;
  const total = data?.total || 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);

  return (
    <div className="adm-card">
      <header className="adm-card-head">
        <div>
          <h2 className="adm-card-title">{t('navLog')}</h2>
          <p className="adm-card-sub">{t('logSub')}{data ? ` · ${t('logTotalNote', { n: num(total) })}` : ''}{updated ? ` · ${t('logUpdated', { time: updated.toLocaleTimeString(locale) })}` : ''}</p>
        </div>
        <div className="sys-bar">
          <label className="sys-switch"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />{t('logAuto')}</label>
          <button className="adm-btn" type="button" onClick={() => load()} disabled={busy} aria-label={t('logRefresh')} title={t('logRefresh')}>↻</button>
          <a className="adm-btn" href={`/api/admin/log?${buildParams(filters, { format: 'csv' })}`} download="admin-log.csv">{t('logExport')}</a>
        </div>
      </header>

      <div className="sys-log-filters" role="search" aria-label={t('logFilters')}>
        <div className="adm-field">
          <label htmlFor="log-q">{t('logSearch')}</label>
          <input id="log-q" dir="ltr" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} />
        </div>
        <div className="adm-field">
          <label htmlFor="log-admin">{t('logAdmin')}</label>
          <select id="log-admin" value={filters.admin} onChange={(e) => set('admin', e.target.value)}>
            <option value="">{t('logAllAdmins')}</option>
            {(data?.admins || []).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="adm-field">
          <label htmlFor="log-status">{t('logResult')}</label>
          <select id="log-status" value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">{t('logStatusAll')}</option>
            <option value="ok">{t('logStatusOk')}</option>
            <option value="fail">{t('logStatusFail')}</option>
          </select>
        </div>
        <div className="adm-field">
          <label htmlFor="log-method">{t('logAction')}</label>
          <select id="log-method" value={filters.method} onChange={(e) => set('method', e.target.value)}>
            <option value="">{t('logMethodAll')}</option>
            <option value="POST">{t('logVerbPOST')}</option>
            <option value="PUT">{t('logVerbEdit')} (PUT)</option>
            <option value="PATCH">{t('logVerbEdit')} (PATCH)</option>
            <option value="DELETE">{t('logVerbDELETE')}</option>
          </select>
        </div>
        <div className="adm-field">
          <label htmlFor="log-from">{t('logFrom')}</label>
          <input id="log-from" type="date" dir="ltr" value={filters.from} max={filters.to || undefined} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div className="adm-field">
          <label htmlFor="log-to">{t('logTo')}</label>
          <input id="log-to" type="date" dir="ltr" value={filters.to} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} />
        </div>
        {dirty && <button className="adm-btn" type="button" onClick={clear}>{t('logClear')}</button>}
      </div>

      <div className="sys-log-quick">
        <button type="button" className={`adm-fchip${filters.status === 'fail' ? ' is-on' : ''}`} aria-pressed={filters.status === 'fail'} onClick={() => set('status', filters.status === 'fail' ? '' : 'fail')}>{t('logQuickFail')}{data && filters.status !== 'ok' ? <b>{num(data.failed || 0)}</b> : null}</button>
        <button type="button" className={`adm-fchip${filters.from === todayIso && filters.to === todayIso ? ' is-on' : ''}`} aria-pressed={filters.from === todayIso && filters.to === todayIso} onClick={() => { const on = filters.from === todayIso && filters.to === todayIso; setFilters((f) => ({ ...f, from: on ? '' : todayIso, to: on ? '' : todayIso })); setOffset(0); }}>{t('logQuickToday')}</button>
      </div>

      <div className="adm-table-wrap" aria-busy={busy}>
        {items && items.length > 0 && (
          <table className="adm-table">
            <thead><tr><th>{t('logWhen')}</th><th>{t('logWho')}</th><th>{t('logAction')}</th><th>{t('logResult')}</th></tr></thead>
            <tbody>
              {items.map((row) => {
                const ok = row.status < 400;
                return (
                  <tr key={row.id} className={`sys-log-row${ok ? '' : ' is-fail'}`}>
                    <td data-th={t('logWhen')} className="sys-when"><time dateTime={`${row.at.replace(' ', 'T')}Z`}><span>{stamp(row.at).toLocaleDateString(locale)}</span> <span className="sys-time">{stamp(row.at).toLocaleTimeString(locale)}</span></time></td>
                    <td data-th={t('logWho')} className="sys-who">{row.admin || t('logUnknownAdmin')}</td>
                    <td data-th={t('logAction')}><span className="adm-verb">{t(VERB[row.method] || 'logVerbEdit')}</span> {row.label && <strong dir="auto" className="sys-log-label">{row.label}</strong>} <code dir="ltr" className="sys-log-path" title={row.path}>{row.path.replace(/^\/api\/+/, '')}</code></td>
                    <td data-th={t('logResult')}>
                      <span className={`adm-chip ${ok ? 'is-ok' : 'is-bad'}`} title={ok ? undefined : t(STATUS_HINT[row.status] || 'logHintOther')}>{ok ? t('logOk') : `${t('logFail')} (${num(row.status)})`}</span>{' '}
                      <span className="sys-ms" dir="ltr">{num(row.ms)} ms</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!data && !failed && <div className="adm-skeleton" aria-label={t('loading')}>{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>}
        {failed && !data && (
          <div className="adm-empty sys-error-box" role="alert">
            <span>{t('logLoadFail')}</span>
            <button className="adm-btn" type="button" onClick={() => load()}>{t('logRetry')}</button>
          </div>
        )}
        {data && items.length === 0 && <div className="adm-empty"><p>{dirty ? t('logNoMatch') : t('logEmpty')}</p>{dirty && <button className="adm-btn" type="button" onClick={clear}>{t('logClear')}</button>}</div>}
      </div>

      {data && total > 0 && (
        <footer className="sys-log-foot">
          <span className="adm-muted" aria-live="polite">{t('logPageOf', { from: num(from), to: num(to), total: num(total) })} · {t('logPageN', { n: num(Math.floor(offset / PAGE) + 1), pages: num(Math.max(1, Math.ceil(total / PAGE))) })}</span>
          <div className="sys-bar">
            <button className="adm-btn" type="button" disabled={busy || offset === 0} onClick={() => setOffset(0)} aria-label={t('logFirst')} title={t('logFirst')}>«</button>
            <button className="adm-btn" type="button" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t('logPrev')}</button>
            <button className="adm-btn" type="button" disabled={busy || offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>{t('logNext')}</button>
          </div>
        </footer>
      )}
    </div>
  );
}
