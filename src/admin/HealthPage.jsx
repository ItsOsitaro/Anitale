import React, { useCallback, useEffect, useRef, useState } from 'react';
import ChatBotSettings from './ChatBotSettings.jsx';
import { SelfCheck } from './ToolsPages.jsx';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const INTERVALS = [[5000, 'hlEvery5'], [15000, 'hlEvery15'], [60000, 'hlEvery60']];
const SLOW_MS = 3000;
const PREF = 'anitale.admin.health';
const readPref = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; } };

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const tone = (value, warn, bad) => (value >= bad ? 'bad' : value >= warn ? 'warn' : '');

function Tile({ label, value, sub, tone: level, meter }) {
  return (
    <div className={`adm-health-tile${level ? ` is-${level}` : ''}`}>
      <span>{label}</span>
      <strong dir="ltr">{value}</strong>
      {sub && <small dir="ltr">{sub}</small>}
      {meter != null && <div className="sys-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, meter)}><i style={{ width: `${Math.min(100, meter)}%` }} /></div>}
    </div>
  );
}

// One page that answers "is the site healthy?": server resources, data size, outside services, recent errors.
export default function HealthPage() {
  const { t, lang, toast, can } = useAdmin();
  const canEdit = can('system', 'edit');
  const locale = lang === 'fa' ? 'fa-IR' : 'en-GB';
  const num = (n) => Number(n || 0).toLocaleString(locale);
  const mb = (bytes) => `${num(Math.round((bytes || 0) / 1048576))} MB`;
  const gb = (bytes) => `${num(Math.round(((bytes || 0) / 1073741824) * 10) / 10)} GB`;
  const clock = (value) => new Date(value).toLocaleTimeString(locale);
  const dateTime = (value) => new Date(value).toLocaleString(locale);
  const duration = (seconds) => {
    const d = Math.floor(seconds / 86400); const h = Math.floor((seconds % 86400) / 3600); const m = Math.floor((seconds % 3600) / 60);
    const unit = lang === 'fa' ? { d: ' روز', h: ' ساعت', m: ' دقیقه' } : { d: 'd', h: 'h', m: 'm' };
    return d ? `${num(d)}${unit.d} ${num(h)}${unit.h}` : h ? `${num(h)}${unit.h} ${num(m)}${unit.m}` : `${num(m)}${unit.m}`;
  };

  const [snap, setSnap] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [everyMs, setEveryMs] = useState(() => (INTERVALS.some(([ms]) => ms === readPref().every) ? readPref().every : 15000));
  const [paused, setPaused] = useState(() => Boolean(readPref().paused));
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const [errFilter, setErrFilter] = useState('all');
  const inflight = useRef(false);
  useEffect(() => { try { localStorage.setItem(PREF, JSON.stringify({ every: everyMs, paused })); } catch { /* private mode */ } }, [everyMs, paused]);

  const load = useCallback(async (manual = false) => {
    if (inflight.current) return; // never stack requests on a slow server
    inflight.current = true;
    try { setSnap(await api.health()); setLoadFailed(false); } catch (err) { setLoadFailed(true); if (manual || !snap) toast(errText(err, t), 'error'); } finally { inflight.current = false; }
  }, [t, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    if (paused) return undefined;
    // Skip ticks while the tab is hidden; catch up as soon as it is visible again.
    const tick = () => { if (!document.hidden) load(); };
    const timer = setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [load, paused, everyMs]);

  const clearErrors = async () => {
    try {
      const res = await fetch('/api/admin/health/errors', { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || res.statusText);
      toast(t('hlCleared')); load(true);
    } catch (err) { toast(errText(err, t), 'error'); }
  };

  const runProbe = async () => {
    setProbing(true);
    try { setProbe(await api.healthProbe()); } catch (err) { toast(errText(err, t), 'error'); } finally { setProbing(false); }
  };

  const copyErrors = async (errors) => {
    try { await navigator.clipboard.writeText(errors.map((e) => `${e.at} [${e.level}]${e.count > 1 ? ` x${e.count}` : ''} ${e.text}`).join('\n\n')); toast(t('hlCopied')); } catch { toast(t('vpnPasteFail'), 'error'); }
  };

  if (!snap) {
    return loadFailed
      ? (
        <div className="adm-card"><div className="adm-card-body sys-error-box" role="alert">
          <p className="adm-error">{t('hlLoadFail')}</p>
          <button className="adm-btn" type="button" onClick={() => load(true)}>{t('logRetry')}</button>
        </div></div>
      )
      : <div className="adm-card"><div className="adm-skeleton" aria-label={t('loading')}>{[0, 1, 2, 3].map((i) => <i key={i} />)}</div></div>;
  }

  const { system: s, data: d, sources: src } = snap;
  const memUsed = s.memTotal - s.memAvailable;
  const diskUsed = s.disk.total - s.disk.free;
  const memPct = pct(memUsed, s.memTotal);
  const diskPct = pct(diskUsed, s.disk.total);
  const swapPct = s.swapTotal ? pct(s.swapUsed, s.swapTotal) : 0;
  const loadHigh = s.load[0] > s.cpus * 1.5;
  const lag = s.loopLagMs || 0;
  const walBig = d.walBytes > 256 * 1048576;

  const warnings = [];
  if (memPct > 90) warnings.push(t('hlWarnMem', { n: num(memPct) }));
  if (swapPct > 70) warnings.push(t('hlWarnSwap', { n: num(swapPct) }));
  if (s.disk.total && diskPct > 90) warnings.push(t('hlWarnDisk', { n: num(diskPct) }));
  if (loadHigh) warnings.push(t('hlWarnLoad'));
  if (lag > 500) warnings.push(t('hlWarnLag', { n: num(lag) }));
  if (src.tenraiPaused && !src.tenraiDisabled) warnings.push(t('hlWarnTenrai'));
  if (src.vpnActive && !src.vpnRunning) warnings.push({ text: t('hlWarnVpn'), to: '/admin/vpn' });
  if (walBig) warnings.push(t('hlWarnWal', { size: mb(d.walBytes) }));

  const probeLine = (label, result) => (
    <li key={label}>
      <span className={`adm-dot ${result.ok ? 'ok' : 'bad'}`} aria-hidden="true" />
      <strong>{label}</strong>
      <span dir="ltr">{result.ok ? `${num(result.ms)} ms` : result.error}</span>
      {result.ok && result.ms > SLOW_MS && <span className="adm-chip">{t('hlSlow')}</span>}
    </li>
  );

  const errors = snap.errors.filter((e) => errFilter === 'all' || (errFilter === 'error' ? e.level === 'error' : e.level !== 'error'));

  return (
    <div className="adm-health">
      <div className="sys-bar">
        <span className="adm-muted" aria-live="off">{paused ? t('hlPaused') : t('hlUpdated', { time: clock(snap.at) })}</span>
        <div className="sys-bar sys-grow">
          <label className="sys-switch">
            {t('hlEvery')}
            <select value={everyMs} onChange={(e) => setEveryMs(Number(e.target.value))} aria-label={t('hlEvery')}>
              {INTERVALS.map(([ms, key]) => <option key={ms} value={ms}>{t(key)}</option>)}
            </select>
          </label>
          <button className="adm-btn" type="button" onClick={() => setPaused((v) => !v)} aria-pressed={paused}>{paused ? t('hlResume') : t('hlPause')}</button>
          <button className="adm-btn" type="button" onClick={() => load(true)}>↻ {t('hlRefresh')}</button>
        </div>
      </div>

      {loadFailed && <p className="sys-stale" role="alert">{t('hlStale', { time: clock(snap.at) })}</p>}
      {warnings.length > 0
        ? <div className="sys-warns" role="alert"><strong>{t('hlProblems')}</strong><ul>{warnings.map((w) => { const text = w.text || w; return <li key={text}>{text}{w.to && <> <Link to={w.to}>{t('hlOpen')}</Link></>}</li>; })}</ul></div>
        : <p className="sys-okbar" role="status">{t('hlAllGood')}</p>}

      <div className="adm-card">
        <header className="adm-card-head">
          <div>
            <h2 className="adm-card-title">{t('hlServer')}</h2>
            <p className="adm-card-sub">{t('hlServerSub', { up: duration(s.uptimeSec), app: duration(s.processUptimeSec) })}</p>
          </div>
        </header>
        <div className="adm-card-body adm-health-grid">
          <Tile label={t('hlMemory')} value={`${num(memPct)}%`} sub={`${mb(memUsed)} / ${mb(s.memTotal)}`} tone={tone(memPct, 80, 90)} meter={memPct} />
          <Tile label={t('hlSwap')} value={s.swapTotal ? `${num(swapPct)}%` : '—'} sub={s.swapTotal ? `${mb(s.swapUsed)} / ${mb(s.swapTotal)}` : t('hlNoSwap')} tone={s.swapTotal ? tone(swapPct, 50, 70) : ''} meter={s.swapTotal ? swapPct : null} />
          <Tile label={t('hlDisk')} value={s.disk.total ? `${num(diskPct)}%` : '—'} sub={s.disk.total ? `${gb(diskUsed)} / ${gb(s.disk.total)}` : ''} tone={tone(diskPct, 80, 90)} meter={s.disk.total ? diskPct : null} />
          <Tile label={t('hlLoad')} value={s.load.map(num).join(' · ')} sub={t('hlCpus', { n: num(s.cpus) })} tone={loadHigh ? 'warn' : ''} />
          <Tile label={t('hlLag')} value={`${num(lag)} ms`} sub={t('hlLagSub')} tone={tone(lag, 200, 500)} />
          <Tile label={t('hlSiteMem')} value={mb(s.processRss)} sub={`${t('hlHeap')}: ${mb(s.heapUsed)} · Node ${s.node}`} />
        </div>
      </div>

      <div className="adm-card">
        <header className="adm-card-head">
          <div>
            <h2 className="adm-card-title">{t('hlSources')}</h2>
            <p className="adm-card-sub">{t('hlSourcesSub')}</p>
          </div>
          <button className="adm-btn adm-primary" type="button" onClick={runProbe} disabled={probing}>{probing ? t('hlChecking') : t('hlCheckNow')}</button>
        </header>
        <div className="adm-card-body">
          <ul className="adm-health-list">
            <li><span className={`adm-dot ${src.tenraiDisabled ? 'off' : src.tenraiPaused ? 'bad' : 'ok'}`} aria-hidden="true" /><strong>Tenrai</strong><span>{src.tenraiDisabled ? t('hlDisabled') : src.tenraiPaused ? t('hlTenraiPaused') : t('hlTenraiOk')}</span></li>
            <li><span className={`adm-dot ${src.vpnActive ? (src.vpnRunning ? 'ok' : 'bad') : 'off'}`} aria-hidden="true" /><strong>VPN</strong><span>{src.vpnActive ? (src.vpnRunning ? t('hlVpnRunning', { kind: src.vpnActive }) : t('hlVpnDown', { err: src.vpnError })) : t('hlVpnOff')}</span></li>
            {src.provider && <li><span className="adm-dot off" aria-hidden="true" /><strong>PROVIDER</strong><span dir="ltr">{src.provider}</span></li>}
            {snap.autoImport && <li><span className={`adm-dot ${snap.autoImport.enabled ? 'ok' : 'off'}`} aria-hidden="true" /><strong>{t('autoNav')}</strong><span>{snap.autoImport.enabled ? (snap.autoImport.last ? dateTime(snap.autoImport.last.at) : t('autoNever')) : t('autoOff')}</span></li>}
          </ul>
          {probe && (
            <ul className="adm-health-list adm-health-probe" aria-live="polite">
              {probeLine('Tenrai', probe.tenrai)}
              {probeLine('AniList', probe.anilist)}
              {probe.at && <li className="sys-probe-note" dir="auto">{t('hlChecked', { time: clock(probe.at) })}</li>}
            </ul>
          )}
        </div>
      </div>

      <div className="adm-card">
        <header className="adm-card-head"><div><h2 className="adm-card-title">{t('hlData')}</h2></div></header>
        <div className="adm-card-body adm-health-grid">
          <Tile label={t('statsTitles')} value={`${num(d.anime)} + ${num(d.manga)}`} sub={t('hlAnimeManga')} />
          <Tile label={t('siteUsers')} value={num(d.users)} sub={t('hlEntries', { n: num(d.listEntries) })} />
          <Tile label={t('rvNav')} value={num(d.reviews)} />
          <Tile label={t('hlDb')} value={mb(d.dbBytes)} sub={`WAL ${mb(d.walBytes)}`} tone={walBig ? 'warn' : ''} />
          <Tile label={t('hlCovers')} value={num(d.covers.files)} sub={mb(d.covers.bytes)} />
          <Tile label={t('hlCache')} value={`${num(d.extrasCached)} / ${num(d.peopleCached)}`} sub={`${t('hlImages')} ${num(d.imageCache.files)} · ${mb(d.imageCache.bytes)}`} />
          <Tile label={t('missNav')} value={num(d.missingTitles)} />
        </div>
      </div>

      <div className="adm-card">
        <header className="adm-card-head">
          <div><h2 className="adm-card-title">{t('hlErrors')}</h2><p className="adm-card-sub">{t('hlErrorsSub')}</p></div>
        </header>
        <div className="adm-card-body">
          {snap.errors.length === 0 ? <p className="adm-muted">{t('hlNoErrors')}</p> : (
            <>
              <div className="sys-err-tools">
                {[['all', 'hlErrAll'], ['error', 'hlErrErrors'], ['warn', 'hlErrWarns']].map(([key, label]) => (
                  <button key={key} type="button" className={`adm-fchip${errFilter === key ? ' is-on' : ''}`} aria-pressed={errFilter === key} onClick={() => setErrFilter(key)}>{t(label)} <b>{num(snap.errors.filter((e) => key === 'all' || (key === 'error' ? e.level === 'error' : e.level !== 'error')).length)}</b></button>
                ))}
                <button className="adm-btn sys-grow" type="button" onClick={() => copyErrors(errors)} disabled={!errors.length}>{t('hlCopy')}</button>
                {canEdit && <button className="adm-btn" type="button" onClick={clearErrors}>{t('hlClear')}</button>}
              </div>
              {errors.length === 0 ? <p className="adm-muted">{t('hlNoErrors')}</p> : (
                <ul className="adm-health-errors">
                  {errors.map((e, i) => (
                    <li key={`${e.at}-${i}`}><div className="sys-err-head"><span className={`adm-chip ${e.level === 'error' ? 'adm-chip-bad' : ''}`}>{e.level === 'error' ? t('hlErrLevelError') : t('hlErrLevelWarn')}</span>{e.count > 1 && <span className="adm-chip" dir="ltr">×{num(e.count)}</span>}<time dateTime={e.at}>{dateTime(e.at)}</time></div><code dir="ltr">{e.text}</code></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      <SelfCheck />
      <ChatBotSettings />
    </div>
  );
}
