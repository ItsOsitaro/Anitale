import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const mb = (bytes) => `${Math.round((bytes || 0) / 1048576).toLocaleString('en-US')} MB`;
const gb = (bytes) => `${((bytes || 0) / 1073741824).toFixed(1)} GB`;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const duration = (seconds) => {
  const d = Math.floor(seconds / 86400); const h = Math.floor((seconds % 86400) / 3600); const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`adm-health-tile${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong dir="ltr">{value}</strong>
      {sub && <small dir="ltr">{sub}</small>}
    </div>
  );
}

// One page that answers "is the site healthy?": server resources, data size, outside services, recent errors.
export default function HealthPage() {
  const { t, toast } = useAdmin();
  const [snap, setSnap] = useState(null);
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);

  const load = useCallback(async () => {
    try { setSnap(await api.health()); } catch (err) { toast(errText(err, t), 'error'); }
  }, [t, toast]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const runProbe = async () => {
    setProbing(true);
    try { setProbe(await api.healthProbe()); } catch (err) { toast(errText(err, t), 'error'); } finally { setProbing(false); }
  };

  if (!snap) return <p className="adm-muted">{t('loading')}</p>;
  const { system: s, data: d, sources: src } = snap;
  const memUsed = s.memTotal - s.memAvailable;
  const diskUsed = s.disk.total - s.disk.free;
  const memPct = pct(memUsed, s.memTotal);
  const diskPct = pct(diskUsed, s.disk.total);
  const loadHigh = s.load[0] > s.cpus * 1.5;
  const probeLine = (label, result) => (
    <li key={label}>
      <span className={`adm-dot ${result.ok ? 'ok' : 'bad'}`} aria-hidden="true" />
      <strong>{label}</strong>
      <span dir="ltr">{result.ok ? `${result.ms} ms` : result.error}</span>
    </li>
  );

  return (
    <div className="adm-health">
      <div className="adm-card">
        <header className="adm-card-head">
          <div>
            <h2 className="adm-card-title">{t('hlServer')}</h2>
            <p className="adm-card-sub">{t('hlServerSub', { up: duration(s.uptimeSec), app: duration(s.processUptimeSec) })}</p>
          </div>
        </header>
        <div className="adm-card-body adm-health-grid">
          <Tile label={t('hlMemory')} value={`${memPct}%`} sub={`${mb(memUsed)} / ${mb(s.memTotal)}`} tone={memPct > 90 ? 'bad' : memPct > 80 ? 'warn' : ''} />
          <Tile label={t('hlSwap')} value={s.swapTotal ? `${pct(s.swapUsed, s.swapTotal)}%` : '—'} sub={s.swapTotal ? `${mb(s.swapUsed)} / ${mb(s.swapTotal)}` : t('hlNoSwap')} tone={s.swapTotal && pct(s.swapUsed, s.swapTotal) > 50 ? 'warn' : ''} />
          <Tile label={t('hlDisk')} value={`${diskPct}%`} sub={`${gb(diskUsed)} / ${gb(s.disk.total)}`} tone={diskPct > 90 ? 'bad' : diskPct > 80 ? 'warn' : ''} />
          <Tile label={t('hlLoad')} value={s.load.join(' · ')} sub={t('hlCpus', { n: s.cpus })} tone={loadHigh ? 'warn' : ''} />
          <Tile label={t('hlSiteMem')} value={mb(s.processRss)} sub={`Node ${s.node}`} />
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
            {snap.autoImport && <li><span className={`adm-dot ${snap.autoImport.enabled ? 'ok' : 'off'}`} aria-hidden="true" /><strong>{t('autoNav')}</strong><span>{snap.autoImport.enabled ? (snap.autoImport.last ? new Date(snap.autoImport.last.at).toLocaleString() : t('autoNever')) : t('autoOff')}</span></li>}
          </ul>
          {probe && (
            <ul className="adm-health-list adm-health-probe" aria-live="polite">
              {probeLine('Tenrai', probe.tenrai)}
              {probeLine('AniList', probe.anilist)}
            </ul>
          )}
        </div>
      </div>

      <div className="adm-card">
        <header className="adm-card-head"><div><h2 className="adm-card-title">{t('hlData')}</h2></div></header>
        <div className="adm-card-body adm-health-grid">
          <Tile label={t('statsTitles')} value={`${d.anime} + ${d.manga}`} sub={t('hlAnimeManga')} />
          <Tile label={t('siteUsers')} value={d.users} sub={t('hlEntries', { n: d.listEntries })} />
          <Tile label={t('rvNav')} value={d.reviews} />
          <Tile label={t('hlDb')} value={mb(d.dbBytes)} sub={`WAL ${mb(d.walBytes)}`} />
          <Tile label={t('hlCovers')} value={d.covers.files} sub={mb(d.covers.bytes)} />
          <Tile label={t('hlCache')} value={`${d.extrasCached} / ${d.peopleCached}`} sub={`${t('hlImages')} ${d.imageCache.files} · ${mb(d.imageCache.bytes)}`} />
          <Tile label={t('missNav')} value={d.missingTitles} />
        </div>
      </div>

      <div className="adm-card">
        <header className="adm-card-head"><div><h2 className="adm-card-title">{t('hlErrors')}</h2><p className="adm-card-sub">{t('hlErrorsSub')}</p></div></header>
        <div className="adm-card-body">
          {snap.errors.length === 0 ? <p className="adm-muted">{t('hlNoErrors')}</p> : (
            <ul className="adm-health-errors">
              {snap.errors.map((e, i) => (
                <li key={`${e.at}-${i}`}><time dir="ltr">{new Date(e.at).toLocaleString()}</time><span className={`adm-chip ${e.level === 'error' ? 'adm-chip-bad' : ''}`}>{e.level}</span><code dir="ltr">{e.text}</code></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
