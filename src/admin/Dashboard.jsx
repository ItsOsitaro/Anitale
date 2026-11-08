import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';

const number = (value, lang) => Number(value || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
const megabytes = (bytes) => `${Math.round(bytes / 1048576)} MB`;
const gigabytes = (bytes, lang) => `${(bytes / 1073741824).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: 1 })} GB`;

// The panel's home: numbers, what needs attention, quick actions, running jobs, server and recent changes.
export default function Dashboard() {
  const { t, lang, can, me } = useAdmin();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [queues, setQueues] = useState(null); // search misses + browser errors (community area)
  const [loadedAt, setLoadedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const arrow = lang === 'fa' ? '←' : '→'; // "go" arrow must point the reading direction

  const load = useCallback(() => {
    setRefreshing(true);
    return api.overview()
      .then((result) => { setData(result); setFailed(false); setLoadedAt(new Date()); api.queues().then(setQueues).catch(() => setQueues(null)); })
      .catch(() => setFailed(true))
      .finally(() => setRefreshing(false));
  }, []);
  useEffect(() => {
    load();
    // Keeps a running import's progress fresh, but never polls from a hidden tab.
    const timer = setInterval(() => { if (!document.hidden) load(); }, 20000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const uptime = (seconds) => {
    if (seconds >= 86400) return t('dashDays', { n: number(Math.floor(seconds / 86400), lang) });
    if (seconds >= 3600) return t('dashHours', { n: number(Math.floor(seconds / 3600), lang) });
    return t('dashMinutes', { n: number(Math.max(1, Math.floor(seconds / 60)), lang) });
  };
  // Log rows are 'YYYY-MM-DD HH:MM:SS' (UTC); the auto-import report is already an ISO string.
  const when = (value) => {
    const text = String(value);
    const date = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const logText = (row) => `${row.method} ${String(row.path).replace(/^\/api\//, '')}`;

  const stats = data && [
    { key: 'dashAnime', value: data.counts.anime, week: data.week.titles, to: can('catalog') ? '/admin/anime' : null },
    { key: 'dashManga', value: data.counts.manga, to: can('catalog') ? '/admin/manga' : null },
    { key: 'dashUsers', value: data.counts.users, week: data.week.users, to: can('users') ? '/admin/users' : null },
    { key: 'dashEntries', value: data.counts.entries, weekReviews: data.week.reviews },
  ];

  // What needs attention: queues first, then catalog gaps. Items the admin cannot open are not listed.
  const todo = data && [
    { key: 'dashSuggestions', n: data.badges.suggestions, to: '/admin/suggestions', area: 'community' },
    { key: 'dashReports', n: data.badges.reports || 0, to: '/admin/reports', area: 'community' },
    { key: 'dashMissing', n: data.badges.missing, to: '/admin/missing', area: 'community' },
    { key: 'dashSearchMisses', n: queues?.searchMisses || 0, to: '/admin/search-misses', area: 'community' },
    { key: 'dashClientErrors', n: queues?.clientErrors || 0, to: '/admin/health', area: 'system' },
    { key: 'dashNoPersian', n: data.attention.noPersian, to: '/admin/anime?filter=noPersian', area: 'catalog' },
    { key: 'dashNoScore', n: data.attention.noScore, to: '/admin/anime?filter=noScore', area: 'catalog' },
    { key: 'dashNoCover', n: data.attention.noCover, to: '/admin/anime?filter=noCover', area: 'catalog' },
    { key: 'dashNoMal', n: data.attention.noMal, to: '/admin/anime?filter=noMal', area: 'catalog' },
  ].filter((row) => row.n > 0 && can(row.area));

  const quick = [
    { to: '/admin/new', label: t('newAnime'), area: 'catalog', level: 'edit', primary: true },
    { to: '/admin/quick-add', label: t('quickNav'), area: 'import', level: 'edit' },
    { to: '/admin/auto-import', label: t('autoNav'), area: 'import', level: 'edit' },
    { to: '/admin/translate/review', label: t('reviewNav'), area: 'translate', level: 'view' },
    { to: '/admin/reviews', label: t('rvNav'), area: 'community', level: 'view' },
    { to: '/admin/health', label: t('hlNav'), area: 'system', level: 'view' },
  ].filter((row) => can(row.area, row.level));

  const importAll = data?.importAll;
  const totalMem = data?.system.totalMem || 1024 * 1024 * 1024;
  const memoryPct = data ? Math.min(100, Math.round((data.system.rss / totalMem) * 100)) : 0;
  const memoryLevel = memoryPct >= 80 ? 'bad' : memoryPct >= 60 ? 'warn' : 'ok';

  return (
    <div className="adm-dash">
      <header className="adm-dash-hero">
        <div>
          <h1 className="adm-dash-title">{t('dashHello', { name: me?.username || '' })} <span className="adm-chip">{me?.owner ? t('dashRoleOwner') : t('dashRoleAdmin')}</span></h1>
          <p className="adm-muted">{t('dashSub')}</p>
        </div>
        <div className="adm-dash-refresh">
          {loadedAt && <span className="adm-muted">{t('dashUpdated', { when: loadedAt.toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) })}</span>}
          <button className="adm-btn" type="button" disabled={refreshing} onClick={load}>{refreshing ? t('loading') : t('dashRefresh')}</button>
        </div>
      </header>

      {failed && (
        <p className="adm-error" role="alert">{t('network')} <button className="adm-btn" type="button" onClick={load}>{t('dashRetry')}</button></p>
      )}
      {!data && !failed && <div className="adm-skeleton adm-dash-skel" aria-busy="true" aria-label={t('loading')}>{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>}

      {data && (
        <>
          <div className="adm-dash-stats" role="list">
            {stats.map((stat) => {
              const body = (
                <>
                  <span>{t(stat.key)}</span>
                  <strong>{number(stat.value, lang)}</strong>
                  {stat.week > 0 && <small>{t('dashWeekNew', { n: number(stat.week, lang) })}</small>}
                  {stat.weekReviews > 0 && <small>{t('dashWeekReviewsN', { n: number(stat.weekReviews, lang) })}</small>}
                </>
              );
              return stat.to
                ? <Link key={stat.key} className="adm-dash-stat" role="listitem" to={stat.to}>{body}</Link>
                : <div key={stat.key} className="adm-dash-stat" role="listitem">{body}</div>;
            })}
          </div>

          <div className="adm-dash-grid">
            <section className="adm-card adm-dash-card">
              <h2>{t('dashAttention')}</h2>
              {todo.length === 0 ? <p className="adm-muted">{t('dashAllGood')}</p> : (
                <ul className="adm-dash-todo">
                  {todo.map((row) => (
                    <li key={row.key}>
                      <Link to={row.to}><span>{t(row.key)}</span><b>{number(row.n, lang)}</b></Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="adm-card adm-dash-card">
              <h2>{t('dashQuick')}</h2>
              <div className="adm-dash-quick">
                {quick.map((row) => <Link key={row.to} className={`adm-btn${row.primary ? ' adm-primary' : ''}`} to={row.to}>{row.label}</Link>)}
              </div>
            </section>

            <section className="adm-card adm-dash-card">
              <h2>{t('dashImport')}</h2>
              {importAll?.running ? (
                <>
                  <p>{t('dashImportRunning', { page: number(importAll.page, lang), pages: importAll.pages ? number(importAll.pages, lang) : '?' })}</p>
                  <div className="adm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={importAll.pages ? Math.round((importAll.page / importAll.pages) * 100) : 0}>
                    <span style={{ width: `${importAll.pages ? Math.min(100, (importAll.page / importAll.pages) * 100) : 3}%` }} />
                  </div>
                  <p className="adm-muted">{t('dashImportAdded', { n: number(importAll.imported, lang) })}</p>
                </>
              ) : <p className="adm-muted">{t('dashImportIdle')}</p>}
              <p className="adm-muted">
                {data.autoImport?.last ? t('dashAutoLast', { when: when(data.autoImport.last.at) }) : t('dashAutoNever')}
              </p>
              {can('import') && <Link className="adm-dash-link" to="/admin/auto-import">{t('autoNav')} {arrow}</Link>}
            </section>

            <section className="adm-card adm-dash-card">
              <h2>{t('dashSystem')}</h2>
              <dl className="adm-dash-sys">
                <div><dt>{t('dashMemory')}</dt><dd dir="ltr">{megabytes(data.system.rss)} <small className="adm-muted">({number(memoryPct, lang)}%)</small></dd></div>
                <div><dt>{t('dashUptime')}</dt><dd>{uptime(data.system.uptimeSec)}</dd></div>
                {data.system.disk && <div><dt>{t('dashDisk')}</dt><dd dir="ltr">{gigabytes(data.system.disk.free, lang)}</dd></div>}
                <div><dt>{t('dashLoad')}</dt><dd>{Number(data.system.load).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: 2 })}</dd></div>
              </dl>
              <div className={`adm-bar is-${memoryLevel}`} role="meter" aria-label={t('dashMemory')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={memoryPct}><span style={{ width: `${Math.max(memoryPct, 2)}%` }} /></div>
              {can('system') && <Link className="adm-dash-link" to="/admin/health">{t('dashOpenHealth')} {arrow}</Link>}
            </section>

            <section className="adm-card adm-dash-card adm-dash-wide">
              <h2>{t('dashRecent')}</h2>
              {data.recent.length === 0 ? <p className="adm-muted">{t('dashRecentEmpty')}</p> : (
                <ul className="adm-dash-recent">
                  {data.recent.map((row) => (
                    <li key={row.id}>
                      <span className={`adm-dot ${row.status < 400 ? 'ok' : 'bad'}`} role="img" aria-label={row.status < 400 ? t('logOk') : t('logFail')} title={String(row.status)} />
                      <code dir="ltr">{logText(row)}</code>
                      <span className="adm-muted">{row.admin ? `${row.admin} · ` : ''}{when(row.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {can('system') && <Link className="adm-dash-link" to="/admin/log">{t('dashOpenLog')} {arrow}</Link>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
