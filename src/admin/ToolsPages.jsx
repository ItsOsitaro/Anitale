import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
      {data && <button type="button" className="adm-btn" onClick={() => downloadCsv('growth.csv', ['date', 'new_members', 'list_additions', 'reviews', 'titles_added'], data.series.users.map((row, i) => [row.d, row.n, data.series.entries[i].n, data.series.reviews[i].n, data.series.titles[i].n]))}>{t('csvDownload')}</button>}
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

// Merge duplicates of one title: pick the one to keep, the others move their members' data into it and are deleted.
function MergeButton({ slugs, onDone }) {
  const { t, toast, confirm, can } = useAdmin();
  if (!can('catalog', 'edit') || slugs.length < 2) return null;
  const merge = async () => {
    const keep = slugs[0];
    if (!await confirm(t('mgConfirm', { keep, others: slugs.slice(1).join(', ') }), { danger: true })) return;
    try {
      for (const from of slugs.slice(1)) await api.mergeTitles({ type: 'anime', from, into: keep });
      toast(t('mgDone'));
      onDone();
    } catch (err) { toast(errText(err, t), 'error'); }
  };
  return <button type="button" className="adm-btn" onClick={merge}>{t('mgButton', { keep: slugs[0] })}</button>;
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
      {data && <button type="button" className="adm-btn" onClick={() => downloadCsv('catalog-quality.csv', ['type', 'gap', 'count', 'examples'], data.groups.map((g) => [g.type, g.key, g.count, g.samples.map((s) => s.slug).join(' ')]))}>{t('csvDownload')}</button>}
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
          <ul>{data.dupes.map((row) => <li key={row.title} dir="auto">{row.title} <b>{num(row.n, lang)}</b> {row.slugs.map((slug) => <Link key={slug} to={`/admin/edit/${slug}`} dir="ltr">{slug}</Link>)} <MergeButton slugs={row.slugs} onDone={() => api.quality().then(setData)} /></li>)}</ul>
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

// Bulk bar for the title lists (anime and manga): refresh, delete, add a genre, Persian synopsis. Items are done one after
// another with the existing single-title routes; the add-genre and translate routes take a few slugs at once.
export function BulkBar({ kind, items, picked, clear, reload }) {
  const { t, toast, confirm, can } = useAdmin();
  const [busy, setBusy] = useState('');
  const [genre, setGenre] = useState('');
  if (!picked.size) return null;
  const slugs = items.filter((item) => picked.has(item.slug)).map((item) => item.slug);
  const run = async (name, task) => {
    setBusy(name);
    let ok = 0;
    let bad = 0;
    try { ({ ok, bad } = await task()); } catch (err) { toast(errText(err, t), 'error'); bad = slugs.length; }
    setBusy('');
    toast(t('bulkDone', { ok, bad }), bad ? 'error' : undefined);
    clear();
    reload();
  };
  const each = (fn, only = () => true) => async () => {
    let ok = 0;
    let bad = 0;
    for (const item of items.filter((i) => picked.has(i.slug) && only(i))) { try { await fn(item); ok += 1; } catch { bad += 1; } }
    return { ok, bad };
  };
  const refresh = () => run('refresh', each((item) => (kind === 'manga' ? api.mangaRefresh(item.slug) : api.refresh(item.slug)), (item) => item.malId));
  const remove = async () => {
    if (await confirm(t('bulkDeleteConfirm', { n: slugs.length }), { danger: true })) run('delete', each((item) => (kind === 'manga' ? api.mangaRemove(item.slug) : api.remove(item.slug))));
  };
  const genreAction = (mode) => run('genre', async () => { const r = await api.bulkGenre({ type: kind, slugs, genre, mode }); return { ok: r.changed, bad: 0 }; });
  const translate = () => run('translate', async () => {
    let ok = 0;
    let bad = 0;
    for (let i = 0; i < slugs.length; i += 3) {
      const r = await api.translateTitles({ type: kind, slugs: slugs.slice(i, i + 3) });
      ok += r.translated;
      bad += r.failed;
    }
    return { ok, bad };
  });
  return (
    <div className="adm-bulkbar" role="region" aria-label={t('bulkBar')}>
      <strong>{t('bulkPicked', { n: slugs.length })}</strong>
      <button type="button" className="adm-btn" disabled={Boolean(busy)} onClick={refresh}>{busy === 'refresh' ? t('refreshing') : t('refreshBtn')}</button>
      {can('translate', 'edit') && <button type="button" className="adm-btn" disabled={Boolean(busy)} onClick={translate}>{busy === 'translate' ? t('refreshing') : t('bulkTranslate')}</button>}
      <input value={genre} maxLength={40} onChange={(e) => setGenre(e.target.value)} placeholder={t('bulkGenre')} aria-label={t('bulkGenre')} dir="auto" />
      <button type="button" className="adm-btn" disabled={Boolean(busy) || !genre.trim()} onClick={() => genreAction('add')}>{t('bulkGenreAdd')}</button>
      <button type="button" className="adm-btn" disabled={Boolean(busy) || !genre.trim()} onClick={() => genreAction('remove')}>{t('bulkGenreRemove')}</button>
      <button type="button" className="adm-btn is-danger" disabled={Boolean(busy)} onClick={remove}>{t('delete')}</button>
      <button type="button" className="adm-btn" disabled={Boolean(busy)} onClick={clear}>{t('bulkClear')}</button>
    </div>
  );
}

// Notes only admins see, on a title ({type, slug}) or a member ({username}).
export function AdminNotes({ type, slug, username }) {
  const { t, toast, confirm, can } = useAdmin();
  const area = username ? 'users' : 'catalog';
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const load = useCallback(() => api.notes(username ? { username } : { type, slug }).then((d) => setItems(d.items)).catch(() => setItems([])), [type, slug, username]);
  useEffect(() => { load(); }, [load]);
  if (!username && !slug) return null;
  const add = async (event) => {
    event.preventDefault();
    try { await api.noteAdd(username ? { username, body } : { type, slug, body }); setBody(''); load(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  const remove = async (id) => {
    if (!await confirm(t('ntDelete'))) return;
    try { await api.noteRemove(username ? 'users' : 'catalog', id); load(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  return (
    <section className="adm-card tp-notes" aria-label={t('ntTitle')}>
      <h3>{t('ntTitle')} <small className="adm-muted">{t('ntHint')}</small></h3>
      <ul>
        {items.map((n) => (
          <li key={n.id}><span dir="auto">{n.body}</span> <small className="adm-muted" dir="ltr">{n.admin} · {n.createdAt.slice(0, 10)}</small>
            {can(area, 'edit') && <button type="button" className="adm-btn" onClick={() => remove(n.id)} aria-label={t('ntDelete')}>×</button>}</li>
        ))}
      </ul>
      {can(area, 'edit') && (
        <form className="tp-ban" onSubmit={add}>
          <input value={body} maxLength={1000} required onChange={(e) => setBody(e.target.value)} placeholder={t('ntPlaceholder')} aria-label={t('ntPlaceholder')} dir="auto" style={{ flex: '1 1 260px' }} />
          <button type="submit" className="adm-btn">{t('ntAdd')}</button>
        </form>
      )}
    </section>
  );
}

// Saved views of a list, shared by all admins (stored on the server). `value` is what describes the current view (the
// address query for the anime/manga lists, a JSON string for the member list); `onApply(value)` restores a saved one.
export function SavedViews({ scope, value, onApply }) {
  const { t, toast } = useAdmin();
  const [views, setViews] = useState([]);
  const [name, setName] = useState('');
  const load = useCallback(() => api.views(scope).then((d) => setViews(d.items)).catch(() => setViews([])), [scope]);
  useEffect(() => { load(); }, [load]);
  const save = async (event) => {
    event.preventDefault();
    try { await api.viewAdd(scope, name.trim(), value); setName(''); load(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  const drop = async (view) => { try { await api.viewRemove(scope, view.id); load(); } catch (err) { toast(errText(err, t), 'error'); } };
  return (
    <div className="tp-views" role="group" aria-label={t('svTitle')}>
      {views.map((v) => (
        <span key={v.id} className="adm-fchip tp-view">
          <button type="button" onClick={() => onApply(v.search)} aria-pressed={v.search === value} title={v.admin}>{v.name}</button>
          <button type="button" onClick={() => drop(v)} aria-label={`${t('ntDelete')}: ${v.name}`}>×</button>
        </span>
      ))}
      {value && (
        <form onSubmit={save} className="tp-viewform">
          <input value={name} required maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('svName')} aria-label={t('svName')} dir="auto" />
          <button type="submit" className="adm-btn">{t('svSave')}</button>
        </form>
      )}
    </div>
  );
}

// Ready-made rejection reasons shared by all admins (edit them here; the reject form offers them as chips).
export function CannedEditor({ items, onSaved }) {
  const { t, toast, can } = useAdmin();
  const [text, setText] = useState(items.join('\n'));
  useEffect(() => { setText(items.join('\n')); }, [items]);
  if (!can('reviews', 'edit')) return null;
  const save = async () => {
    try { const r = await api.cannedSave(text.split('\n')); onSaved(r.items); toast(t('cnSaved')); } catch (err) { toast(errText(err, t), 'error'); }
  };
  return (
    <details className="adm-card tp-canned">
      <summary>{t('cnTitle')}</summary>
      <p className="adm-muted">{t('cnHint')}</p>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} dir="auto" aria-label={t('cnTitle')} />
      <button type="button" className="adm-btn adm-primary" onClick={save}>{t('cnSave')}</button>
    </details>
  );
}

// Preview of how the title will look to visitors, from the form values (before saving).
export function TitlePreview({ form, cover, slug = '' }) {
  const { t } = useAdmin();
  const [live, setLive] = useState(0); // 0 = closed, otherwise a counter that reloads the frame
  const synopsis = String(form.synopsisFa || form.synopsis || '').slice(0, 220);
  return (
    <details className="adm-card tp-preview">
      <summary>{t('pvTitle')}</summary>
      <div className="tp-preview__card">
        {cover ? <img src={cover} alt="" width="120" height="170" /> : <span className="tp-preview__empty" aria-hidden="true" />}
        <div>
          <strong dir="auto">{form.title || t('pvNoTitle')}</strong>
          <p className="adm-muted" dir="auto">{[form.category, form.year, form.format, form.score ? `★ ${form.score}` : ''].filter(Boolean).join(' · ')}</p>
          <p dir="auto">{synopsis || t('pvNoSynopsis')}{synopsis.length >= 220 ? '…' : ''}</p>
        </div>
      </div>
      {slug && (
        <div className="tp-livepage">
          <button type="button" className="adm-btn" onClick={() => setLive((n) => n + 1)}>{live ? t('pvReload') : t('pvOpenLive')}</button>
          <small className="adm-muted">{t('pvLiveNote')}</small>
          {live > 0 && <iframe key={live} title={t('pvOpenLive')} src={`/anime/${encodeURIComponent(slug)}`} loading="lazy" />}
        </div>
      )}
    </details>
  );
}

// Active admin sessions (owner): who is signed in where, end one or all the others.
export function AdminSessions() {
  const { t, toast, confirm } = useAdmin();
  const [data, setData] = useState(null);
  const load = useCallback(() => api.sessions().then(setData).catch(() => setData(null)), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const end = async (sid) => { try { await api.sessionEnd(sid); load(); } catch (err) { toast(errText(err, t), 'error'); } };
  const others = async () => {
    if (!await confirm(t('ssEndOthersConfirm'), { danger: true })) return;
    try { const r = await api.sessionsEndOthers(); toast(t('ssEnded', { n: r.ended })); load(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  return (
    <section className="adm-card tp-page">
      <h2>{t('ssTitle')}</h2>
      <p className="adm-muted">{t('ssHint')}</p>
      <ul className="tp-jobs">
        {data.items.map((s) => (
          <li key={s.sid}>
            <div>
              <strong dir="ltr">{s.admin}</strong>
              {s.sid === data.current && <span className="adm-chip is-ok">{t('ssThis')}</span>}
              <small className="adm-muted" dir="ltr">{s.ip} · {s.lastSeen}</small>
              <small className="adm-muted" dir="ltr">{s.ua.slice(0, 70)}</small>
            </div>
            {s.sid !== data.current && <button type="button" className="adm-btn is-danger" onClick={() => end(s.sid)}>{t('ssEnd')}</button>}
          </li>
        ))}
      </ul>
      {data.items.length > 1 && <button type="button" className="adm-btn" onClick={others}>{t('ssEndOthers')}</button>}
    </section>
  );
}

// Two-step sign-in card (account page): secret key, confirm with a code, turn off with a code.
export function TwoFactor() {
  const { t, toast } = useAdmin();
  const [state, setState] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const load = useCallback(() => api.twofa().then(setState).catch(() => setState(null)), []);
  useEffect(() => { load(); }, [load]);
  if (!state) return null;
  const act = async (task, doneKey) => {
    try { await task(); if (doneKey) toast(t(doneKey)); setSetup(null); setCode(''); load(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  return (
    <section className="adm-card tp-page">
      <h2>{t('tfTitle')}</h2>
      <p className="adm-muted">{t('tfHint')}</p>
      {state.suspended && <p className="adm-error" role="alert">{t('tfSuspended')}</p>}
      <p><strong>{state.enabled ? t('tfOn') : t('tfOff')}</strong></p>
      {!state.enabled && !setup && <button type="button" className="adm-btn adm-primary" onClick={async () => { try { setSetup(await api.twofaStart()); } catch (err) { toast(errText(err, t), 'error'); } }}>{t('tfStart')}</button>}
      {!state.enabled && setup && (
        <div className="tp-ban">
          <p>{t('tfKey')}</p>
          <code dir="ltr" className="tp-secret">{setup.secret}</code>
          <a className="adm-btn" href={setup.uri}>{t('tfOpen')}</a>
          <p>{t('tfConfirm')}</p>
          <input dir="ltr" inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('loginCode')} autoComplete="one-time-code" />
          <button type="button" className="adm-btn adm-primary" disabled={code.replace(/\s/g, '').length !== 6} onClick={() => act(() => api.twofaEnable(code), 'tfDone')}>{t('tfEnable')}</button>
        </div>
      )}
      {state.enabled && (
        <div className="tp-ban">
          <input dir="ltr" inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('loginCode')} autoComplete="one-time-code" />
          <button type="button" className="adm-btn is-danger" disabled={code.replace(/\s/g, '').length !== 6} onClick={() => act(() => api.twofaDisable(code), 'tfOffDone')}>{t('tfDisable')}</button>
        </div>
      )}
      <p className="adm-muted">{t('tfLost')}</p>
    </section>
  );
}

// Download rows as a CSV file (spreadsheet-safe: cells starting with = + - @ are prefixed).
export const downloadCsv = (name, header, rows) => {
  const cell = (v) => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
  const blob = new Blob([`﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Revisions: every admin edit/refresh/delete/bulk change keeps the old row; revert puts it back.
export function RevisionsPage() {
  const { t, toast, confirm, can } = useAdmin();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const load = useCallback(() => api.revisions(q).then((d) => { setItems(d.items); setError(''); }).catch((err) => setError(errText(err, t))), [t, q]);
  useEffect(() => { load(); }, [load]);
  const revert = async (row) => {
    if (!await confirm(t('rvConfirm', { title: row.title || row.slug }))) return;
    try { await api.revisionRevert(row.id); toast(t('rvDone')); load(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  const actions = t('rvActions') || {};
  return (
    <section className="adm-card tp-page">
      <h2>{t('rvTitle')}</h2>
      <p className="adm-muted">{t('rvHint')}</p>
      <input type="search" className="adm-search" dir="auto" value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} placeholder={t('rvSearch')} aria-label={t('rvSearch')} />
      {error && <p className="adm-error" role="alert">{error}</p>}
      {items && items.length === 0 && <p className="adm-empty">{t('rvEmpty')}</p>}
      <ul className="tp-jobs">
        {(items || []).map((row) => (
          <li key={row.id}>
            <div>
              <strong dir="auto">{row.title || row.slug}</strong>
              <span className="adm-chip">{actions[row.action] || row.action}</span>
              <small className="adm-muted" dir="ltr">{row.at} · {row.admin}</small>
            </div>
            <div className="adm-actions">
              {row.reverted ? <span className="adm-chip is-ok">{t('rvReverted')}</span> : can('system', 'edit') && <button type="button" className="adm-btn" onClick={() => revert(row)}>{t('rvRevert')}</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Reports from members: open queue, mark as handled or dismissed.
export function ReportsPage() {
  const { t, toast, can } = useAdmin();
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.reports(status).then((d) => { setItems(d.items); setError(''); }).catch((err) => setError(errText(err, t))), [t, status]);
  useEffect(() => { setItems(null); load(); }, [load]);
  const [note, setNote] = useState('');
  const [canned, setCanned] = useState([]);
  useEffect(() => { api.canned().then((d) => setCanned(d.items)).catch(() => {}); }, []);
  const close = async (row, next) => { try { await api.reportClose(row.id, next, note); setNote(''); load(); } catch (err) { toast(errText(err, t), 'error'); } };
  const kinds = t('rpKinds') || {};
  return (
    <section className="adm-card tp-page">
      <h2>{t('rpTitle')}</h2>
      <p className="adm-muted">{t('rpHint')}</p>
      <div className="adm-filters" role="group">
        {['open', 'done', 'dismissed'].map((s) => <button key={s} type="button" className={`adm-fchip${status === s ? ' is-on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{t(`rp_${s}`)}</button>)}
      </div>
      {status === 'open' && can('reports', 'edit') && (
        <div className="tp-ban">
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t('rpNote')} aria-label={t('rpNote')} dir="auto" style={{ flex: '1 1 300px' }} />
          {canned.map((text) => <button key={text} type="button" className="adm-fchip" onClick={() => setNote(text)}>{text}</button>)}
        </div>
      )}
      {error && <p className="adm-error" role="alert">{error}</p>}
      {items && items.length === 0 && <p className="adm-empty">{t('rpEmpty')}</p>}
      <ul className="tp-jobs">
        {(items || []).map((row) => (
          <li key={row.id}>
            <div className="tp-report">
              <strong>{kinds[row.kind] || row.kind} · {row.subject?.by || '—'} {row.times > 1 && <span className="adm-chip is-bad">×{row.times}</span>}</strong>
              {row.subject ? <p dir="auto">{row.subject.text || '—'}</p> : <p className="adm-muted">{t('rpGone')}</p>}
              <small className="adm-muted" dir="auto">{t('rpBy', { who: row.reporter })}{row.reason ? ` · ${row.reason}` : ''} · {row.subject?.where}{row.note ? ` · ${t('rpNoteShown')}: ${row.note}` : ''}</small>
            </div>
            {status === 'open' && can('reports', 'edit') && (
              <div className="adm-actions">
                <button type="button" className="adm-btn adm-primary" onClick={() => close(row, 'done')}>{t('rpDone')}</button>
                <button type="button" className="adm-btn" onClick={() => close(row, 'dismissed')}>{t('rpDismiss')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Site-wide notice: text, kind, how long it stays.
export function AnnouncementPage() {
  const { t, toast, can } = useAdmin();
  const [state, setState] = useState(null);
  const [form, setForm] = useState({ text: '', level: 'info', hours: 24 });
  const load = useCallback(() => api.announcement().then(setState).catch(() => setState(null)), []);
  useEffect(() => { load(); }, [load]);
  const canEdit = can('system', 'edit');
  const save = async (event) => {
    event.preventDefault();
    try { setState(await api.announcementSave({ ...form, hours: Number(form.hours) })); toast(t('anSaved')); } catch (err) { toast(errText(err, t), 'error'); }
  };
  const remove = async () => { try { setState(await api.announcementRemove()); toast(t('anRemoved')); } catch (err) { toast(errText(err, t), 'error'); } };
  return (
    <section className="adm-card tp-page">
      <h2>{t('anTitle')}</h2>
      <p className="adm-muted">{t('anHint')}</p>
      {state?.active && (
        <p className={`tp-note is-${state.level}`} role="status" dir="auto"><strong>{t('anLive')}:</strong> {state.text} <small className="adm-muted" dir="ltr">→ {state.until.slice(0, 16).replace('T', ' ')} UTC</small>
          {canEdit && <button type="button" className="adm-btn" onClick={remove}>{t('anRemove')}</button>}</p>
      )}
      {canEdit && (
        <form className="tp-ban" onSubmit={save}>
          <input value={form.text} maxLength={280} required onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder={t('anText')} aria-label={t('anText')} dir="auto" style={{ flex: '1 1 320px' }} />
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} aria-label={t('anLevel')}>
            <option value="info">{t('anInfo')}</option>
            <option value="warn">{t('anWarn')}</option>
          </select>
          <label>{t('anHours')} <input type="number" min="1" max="1440" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} style={{ width: 80 }} /></label>
          <button type="submit" className="adm-btn adm-primary">{t('anSave')}</button>
        </form>
      )}
    </section>
  );
}

// Database snapshots made by the app itself (not an off-site backup).
export function BackupCard() {
  const { t, toast, can } = useAdmin();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.backups().then(setState).catch(() => setState(null)), []);
  useEffect(() => { load(); }, [load]);
  if (!state) return null;
  const act = async (body) => {
    setBusy(true);
    try { setState(await api.backupAct(body)); } catch (err) { toast(errText(err, t), 'error'); } finally { setBusy(false); }
  };
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  return (
    <section className="adm-card tp-page">
      <h2>{t('bkTitle')}</h2>
      <p className="adm-muted">{t('bkHint')}</p>
      {state.stale && <p className="adm-error" role="alert">{t('bkStale')}</p>}
      <p>{state.files[0] ? t('bkLast', { when: state.newest.slice(0, 16).replace('T', ' '), size: mb(state.files[0].size) }) : t('bkNone')}</p>
      {can('system', 'edit') && (
        <div className="adm-actions">
          <button type="button" className="adm-btn adm-primary" disabled={busy} onClick={() => act({ now: true })}>{busy ? t('scRunning') : t('bkNow')}</button>
          <button type="button" className="adm-btn" disabled={busy} onClick={() => act({ enabled: !state.enabled })}>{state.enabled ? t('bkAutoOff') : t('bkAutoOn')}</button>
        </div>
      )}
      <ul className="tp-check">{state.files.map((f) => <li key={f.name}><span dir="ltr">{f.name}</span><small className="adm-muted">{mb(f.size)}</small></li>)}</ul>
    </section>
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
