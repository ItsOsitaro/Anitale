import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const num = (value, lang) => Number(value || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');

// Small bar chart: one bar per day, the tallest day fills the height. Pure SVG, no library.
function Bars({ rows, label, lang }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  return (
    <figure className="tp-chart">
      <figcaption><strong>{label}</strong> <span className="adm-muted">{num(total, lang)}</span></figcaption>
      <svg viewBox={`0 0 ${rows.length * 10} 50`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${total}`}>
        {rows.map((r, i) => (
          <rect key={r.d} x={i * 10 + 1} width="8" y={50 - (r.n / max) * 48} height={Math.max(0.6, (r.n / max) * 48)} rx="1.5">
            <title>{`${r.d}: ${r.n}`}</title>
          </rect>
        ))}
      </svg>
      <div className="tp-axis" aria-hidden="true"><span dir="ltr">{rows[0]?.d.slice(5)}</span><span dir="ltr">{rows[rows.length - 1]?.d.slice(5)}</span></div>
    </figure>
  );
}

export function GrowthPage() {
  const { t, lang } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.growth().then(setData).catch((err) => setError(errText(err, t))); }, [t]);
  return (
    <section className="adm-card tp-page">
      <h2>{t('gwTitle')}</h2>
      <p className="adm-muted">{t('gwHint')} {data && `· ${t('gwDays', { n: num(data.days, lang) })}`}</p>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {!data && !error && <div className="adm-skeleton" aria-busy="true"><i /><i /></div>}
      {data && (
        <>
          <div className="tp-charts">
            <Bars rows={data.series.users} label={t('gwUsers')} lang={lang} />
            <Bars rows={data.series.entries} label={t('gwEntries')} lang={lang} />
            <Bars rows={data.series.reviews} label={t('gwReviews')} lang={lang} />
            <Bars rows={data.series.titles} label={t('gwTitles')} lang={lang} />
          </div>
          <div className="tp-lists">
            <div>
              <h3>{t('gwTop')}</h3>
              {data.top.length === 0 ? <p className="adm-muted">{t('gwNone')}</p> : <ol>{data.top.map((row) => <li key={row.slug}><Link to={`/admin/edit/${row.slug}`} dir="auto">{row.title}</Link> <b>{num(row.n, lang)}</b></li>)}</ol>}
            </div>
            <div>
              <h3>{t('gwMisses')}</h3>
              {data.misses.length === 0 ? <p className="adm-muted">{t('gwNone')}</p> : <ol>{data.misses.map((row) => <li key={row.q}><Link to="/admin/search-misses" dir="auto">{row.q}</Link> <b>{num(row.n, lang)}</b></li>)}</ol>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function QualityPage() {
  const { t, lang } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.quality().then(setData).catch((err) => setError(errText(err, t))); }, [t]);
  const labels = t('qlGroups') || {};
  const filterable = ['noCover', 'noPersian', 'noScore', 'noMal']; // the filters the anime list knows
  const open = (group) => (group.type === 'manga' ? '/admin/manga' : filterable.includes(group.key) ? `/admin/anime?filter=${group.key}` : '/admin/anime');
  const bad = data?.groups.filter((g) => g.count > 0) || [];
  return (
    <section className="adm-card tp-page">
      <h2>{t('qlTitle')}</h2>
      <p className="adm-muted">{t('qlHint')}</p>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {!data && !error && <div className="adm-skeleton" aria-busy="true"><i /><i /></div>}
      {data && bad.length === 0 && data.dupes.length === 0 && <p className="adm-empty">{t('qlAllGood')}</p>}
      {bad.map((group) => (
        <div key={`${group.type}-${group.key}`} className="tp-group">
          <h3>{t(group.type === 'manga' ? 'qlManga' : 'qlAnime')} · {labels[group.key] || group.key} <b>{num(group.count, lang)}</b></h3>
          <ul>{group.samples.map((row) => <li key={row.slug}><Link to={`/admin/edit/${row.slug}`} dir="auto">{row.title}</Link></li>)}</ul>
          <Link className="adm-btn" to={open(group)}>{t('qlFix')}</Link>
        </div>
      ))}
      {data?.dupes.length > 0 && (
        <div className="tp-group">
          <h3>{t('qlDupes')}</h3>
          <ul>{data.dupes.map((row) => <li key={row.title} dir="auto">{row.title} <b>{num(row.n, lang)}</b> {row.slugs.map((slug) => <Link key={slug} to={`/admin/edit/${slug}`} dir="ltr">{slug}</Link>)}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

// Health page: run the post-deploy checks against this server and show each result.
export function SelfCheck() {
  const { t } = useAdmin();
  const [state, setState] = useState({ busy: false, result: null, error: '' });
  const run = async () => {
    setState({ busy: true, result: null, error: '' });
    try { setState({ busy: false, result: await api.selfcheck(), error: '' }); } catch (err) { setState({ busy: false, result: null, error: errText(err, t) }); }
  };
  const { busy, result, error } = state;
  return (
    <section className="adm-card tp-page">
      <h2>{t('scTitle')}</h2>
      <p className="adm-muted">{t('scHint')}</p>
      <button type="button" className="adm-btn adm-primary" disabled={busy} onClick={run}>{busy ? t('scRunning') : t('scRun')}</button>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {result && (
        <>
          <p role="status"><strong className={result.ok ? '' : 'is-bad'}>{result.ok ? t('scOk') : t('scFail')}</strong></p>
          <ul className="tp-check">
            {result.results.map((row) => (
              <li key={row.name}><span aria-hidden="true">{row.ok ? '✓' : '✗'}</span><span className={row.ok ? '' : 'is-bad'}>{row.name}</span><small className="adm-muted" dir="ltr">{row.detail}{row.ms ? ` · ${row.ms}ms` : ''}</small></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// Member detail: suspend for some days (signs them out and blocks login and writes) or lift it.
export function BanControl({ username, summary, onChanged, canEdit }) {
  const { t, toast, confirm } = useAdmin();
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  if (!summary) return null;
  const act = async (task, doneKey) => {
    try { await task(); toast(t(doneKey)); onChanged(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  return (
    <div className="tp-ban">
      {summary.lastActive && <span className="adm-chip">{t('lastActive')}: {String(summary.lastActive).slice(0, 10)}</span>}
      {summary.bannedUntil ? (
        <>
          <span className="adm-chip is-bad">{t('banned', { until: summary.bannedUntil.slice(0, 10) })}{summary.banReason ? ` · ${summary.banReason}` : ''}</span>
          {canEdit && <button type="button" className="adm-btn" onClick={() => act(() => api.userUnban(username), 'banLifted')}>{t('banUnban')}</button>}
        </>
      ) : canEdit && (
        <>
          <input type="number" min="1" max="3650" value={days} onChange={(e) => setDays(e.target.value)} aria-label={t('banDays')} style={{ width: 80 }} />
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t('banReason')} aria-label={t('banReason')} dir="auto" />
          <button type="button" className="adm-btn is-danger" onClick={async () => { if (await confirm(t('banBtn'), { danger: true })) act(() => api.userBan(username, { days: Number(days), reason }), 'banDone'); }}>{t('banBtn')}</button>
        </>
      )}
    </div>
  );
}

export function JobsPage() {
  const { t, lang, toast } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.jobs().then((d) => { setData(d); setError(''); }).catch((err) => setError(errText(err, t))), [t]);
  useEffect(() => { load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 15000); return () => clearInterval(timer); }, [load]);
  const names = t('jbNames') || {};
  const toggle = async (job) => {
    try { await api.jobToggle(job.id, !job.enabled); load(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  return (
    <section className="adm-card tp-page">
      <h2>{t('jbTitle')}</h2>
      <p className="adm-muted">{t('jbHint')}</p>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {!data && !error && <div className="adm-skeleton" aria-busy="true"><i /><i /></div>}
      {data && (
        <ul className="tp-jobs">
          {data.jobs.map((job) => (
            <li key={job.id}>
              <div>
                <strong>{names[job.id] || job.id}</strong>
                <span className={`adm-chip ${job.running ? 'is-live' : job.enabled ? 'is-ok' : ''}`}>{job.running ? t('jbRunning') : job.enabled ? t('jbOn') : t('jbOff')}</span>
                {job.info?.waiting != null && <small className="adm-muted">{t('jbWaiting', { n: num(job.info.waiting, lang) })}</small>}
              </div>
              <div className="adm-actions">
                <button type="button" className="adm-btn" onClick={() => toggle(job)}>{job.enabled ? t('jbOff') : t('jbOn')}</button>
                <Link className="adm-btn" to={job.link}>{t('jbOpen')}</Link>
              </div>
            </li>
          ))}
          {['anime', 'manga'].map((kind) => {
            const state = data.importAll[kind];
            return (
              <li key={kind}>
                <div>
                  <strong>{t('jbImportAll')} · {t(kind === 'anime' ? 'qlAnime' : 'qlManga')}</strong>
                  <span className={`adm-chip ${state.running ? 'is-live' : ''}`}>{state.running ? t('jbRunning') : t('jbIdle')}</span>
                  <small className="adm-muted">{t('jbPage', { n: num(state.page, lang) })}</small>
                </div>
                <div className="adm-actions"><Link className="adm-btn" to="/admin/auto-import">{t('jbOpen')}</Link></div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
