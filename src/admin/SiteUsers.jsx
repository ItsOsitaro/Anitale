import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import {
  Chip, ErrorBar, Pager, Skeleton, call, fmtDate, num, qs, useDebounced, useRemoteList, useSearchHotkey,
} from './pages/communityKit.jsx';

const SORTS = ['new', 'old', 'name', 'entries'];
const FILTERS = ['listed', 'empty', 'verified', 'unverified'];
const USERNAME_RE = '[A-Za-z0-9_\\-]{3,24}';
const MIN_PASS = 8;

const genPassword = () => {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};

function PasswordField({ label, value, onChange, placeholder, autoComplete, required, t }) {
  const [show, setShow] = useState(false);
  return (
    <label className="adm-field">
      <span className="adm-label">{label}</span>
      <span className="cm-pass">
        <input type={show ? 'text' : 'password'} dir="ltr" required={required} minLength={required ? MIN_PASS : undefined} maxLength={100} placeholder={placeholder} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
        <button className="adm-btn" type="button" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? t('cmHide') : t('cmShow')}</button>
        <button className="adm-btn" type="button" onClick={() => { onChange(genPassword()); setShow(true); }}>{t('uGenerate')}</button>
      </span>
    </label>
  );
}

export default function SiteUsers() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('users', 'edit');
  const statusLabel = (status) => t('statusLabels')?.[status] ?? status;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  const [busyUsername, setBusyUsername] = useState('');
  const searchRef = useRef(null);
  const q = useDebounced(query.trim(), 300);
  const filters = { q, filter, sort };

  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', bio: '' });
  const [createBusy, setCreateBusy] = useState(false);

  // Selected user detail (profile + personal-list entries + activity summary)
  const [selected, setSelected] = useState(null); // { user, entries } | 'loading'
  const [summary, setSummary] = useState(null);
  const [edit, setEdit] = useState({ username: '', password: '', bio: '' });
  const [savingUser, setSavingUser] = useState(false);
  const [entryType, setEntryType] = useState('anime');
  const [entryQuery, setEntryQuery] = useState('');
  const detailRef = useRef(null);

  useEffect(() => { setPage(1); }, [q, filter, sort]);
  const { data, error, loading, reload } = useRemoteList('/api/admin/x/users/list', { ...filters, page, limit: 15 }, (e) => errText(e, t));
  const onSearchKey = useSearchHotkey(searchRef, () => setQuery(''));
  const counts = data?.counts;
  const isOpen = (name) => selected && selected !== 'loading' && selected.user.username === name;

  // Close the detail editor when the detail target disappears (search/list change).
  useEffect(() => {
    if (selected && selected !== 'loading' && data && !data.items.some((item) => item.username === selected.user.username)) setSelected(null);
  }, [data, selected]);

  const dirty = useMemo(() => {
    if (!selected || selected === 'loading') return false;
    return edit.username.trim() !== selected.user.username || edit.password !== '' || edit.bio !== (selected.user.bio || '');
  }, [edit, selected]);

  useEffect(() => {
    if (!selected || selected === 'loading') return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !dirty) setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, dirty]);

  const fillEdit = (result) => {
    setSelected(result);
    setEdit({ username: result.user.username, password: '', bio: result.user.bio || '' });
  };
  const loadSummary = (username) => {
    call('GET', `/api/admin/x/users/${encodeURIComponent(username)}/summary`).then(setSummary).catch(() => setSummary(null));
  };

  const openUser = async (username) => {
    if (busyUsername) return;
    if (dirty && !await confirm(t('cmDiscard'))) return;
    setBusyUsername(username);
    setSelected('loading');
    setSummary(null);
    setEntryQuery('');
    try {
      fillEdit(await api.usersGet(username));
      loadSummary(username);
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } catch (err) {
      setSelected(null);
      toast(errText(err, t), 'error');
    } finally {
      setBusyUsername('');
    }
  };

  const reloadSelected = async (username) => {
    try { fillEdit(await api.usersGet(username)); loadSummary(username); return true; } catch { setSelected(null); return false; }
  };

  const createUser = async (event) => {
    event.preventDefault();
    if (createBusy) return;
    setCreateBusy(true);
    try {
      const { user } = await api.usersCreate({ username: newUser.username.trim(), password: newUser.password, bio: newUser.bio.trim() });
      toast(t('uCreated', { name: user.username }));
      setCreating(false);
      setNewUser({ username: '', password: '', bio: '' });
      reload();
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setCreateBusy(false);
    }
  };

  const saveUser = async () => {
    if (!dirty || !selected || selected === 'loading') return;
    const current = selected.user.username;
    const payload = {};
    const username = edit.username.trim();
    if (username && username !== current) payload.username = username;
    if (edit.password) payload.password = edit.password;
    if (edit.bio !== (selected.user.bio || '')) payload.bio = edit.bio.trim();
    if (payload.username && !await confirm(t('uRenameConfirm', { from: current, to: payload.username }))) return;
    setSavingUser(true);
    try {
      await api.usersPatch(current, payload);
      toast(t('uSaved'));
      await reloadSelected(payload.username || current);
      reload();
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const removeUser = async (user) => {
    if (!await confirm(t('uDeleteConfirm', { name: user.username }) + (user.animeCount + user.mangaCount ? ` ${t('uDeleteLists', { n: user.animeCount + user.mangaCount })}` : ''))) return;
    try {
      await api.usersRemove(user.username);
      toast(t('uDeleted'));
      setSelected(null);
      if (data && data.items.length === 1 && page > 1) setPage(page - 1); else reload();
    } catch (err) {
      toast(errText(err, t), 'error');
    }
  };

  const handleRemoveEntry = async (mediaType, slug) => {
    if (!selected || selected === 'loading') return;
    if (!await confirm(t('uRemoveEntryConfirm', { slug }))) return;
    try {
      await api.usersRemoveEntry(selected.user.username, mediaType, slug);
      toast(t('uEntryRemoved'));
      await reloadSelected(selected.user.username);
      reload();
    } catch (err) {
      toast(errText(err, t), 'error');
    }
  };

  const copyName = async (name) => {
    try { await navigator.clipboard.writeText(name); toast(t('cmCopied')); } catch { toast(t('cmCopyFail'), 'error'); }
  };
  const closeMenu = (e) => { const d = e.currentTarget.closest('details'); if (d) d.open = false; };

  const nameOk = new RegExp(`^${USERNAME_RE}$`).test(newUser.username.trim());
  const createValid = nameOk && newUser.password.length >= MIN_PASS;
  const colCount = 6;

  const renderDetail = (user) => {
    const entries = (selected.entries[entryType] || []).filter((e) => !entryQuery.trim() || e.slug.toLowerCase().includes(entryQuery.trim().toLowerCase()));
    const total = (selected.entries.anime || []).length + (selected.entries.manga || []).length;
    return (
      <tr className="cm-detail-row">
        <td colSpan={colCount}>
          <div className="adm-user-detail" ref={detailRef}>
            <div className="adm-user-half">
              {summary && (
                <div className="cm-summary">
                  <span className="adm-chip">{t('uSumReviews')}: {num(summary.reviews, lang)}</span>
                  <span className="adm-chip">{t('uSumRecs')}: {num(summary.recs, lang)}</span>
                  <span className="adm-chip">{t('uSumSuggestions')}: {num(summary.suggestions, lang)}</span>
                  <span className="adm-chip">{t('uSumFollowers')}: {num(summary.followers, lang)}</span>
                  <span className="adm-chip">{t('uSumFollowing')}: {num(summary.following, lang)}</span>
                  {Object.entries(summary.statuses || {}).map(([status, n]) => <span key={status} className="adm-chip cm-status">{statusLabel(status)}: {num(n, lang)}</span>)}
                  {summary.email
                    ? <span className={`adm-chip ${summary.emailVerified ? 'is-ok' : 'is-bad'}`} dir="ltr">{summary.email} · {summary.emailVerified ? t('uVerified') : t('uUnverified')}</span>
                    : <span className="adm-chip">{t('uNoEmail')}</span>}
                </div>
              )}
              <fieldset className="cm-fieldset" disabled={!canEdit}>
                <div className="adm-grid">
                  <label className="adm-field">
                    <span className="adm-label">{t('uName')}</span>
                    <input dir="ltr" minLength={3} maxLength={24} pattern={USERNAME_RE} title={t('uNameRule')} value={edit.username} onChange={(e) => setEdit((f) => ({ ...f, username: e.target.value }))} />
                  </label>
                  <PasswordField label={t('uPassNew')} value={edit.password} onChange={(v) => setEdit((f) => ({ ...f, password: v }))} placeholder={t('uPassHint')} autoComplete="new-password" t={t} />
                </div>
                <p className="adm-muted cm-hint">{t('uRenameHint')} {t('uPassHint')}</p>
                <label className="adm-field">
                  <span className="adm-label">{t('uBio')} <span className="adm-muted">{edit.bio.length}/300</span></span>
                  <textarea rows={3} maxLength={300} dir="auto" value={edit.bio} onChange={(e) => setEdit((f) => ({ ...f, bio: e.target.value }))} />
                </label>
              </fieldset>
              <div className="adm-actions">
                {canEdit && <button className="adm-btn adm-primary" type="button" disabled={savingUser || !dirty || (edit.password && edit.password.length < MIN_PASS)} onClick={saveUser}>{savingUser ? t('uSaving') : t('save')}</button>}
                {canEdit && dirty && <button className="adm-btn" type="button" onClick={() => fillEdit(selected)}>{t('cmReset')}</button>}
                <button className="adm-btn" type="button" onClick={() => setSelected(null)}>{t('cmClose')}</button>
              </div>
            </div>
            <div className="adm-user-half">
              <div className="cm-entries-head">
                <span className="adm-label">{t('uEntries')} ({num(total, lang)})</span>
                <div className="adm-filters">
                  {['anime', 'manga'].map((m) => (
                    <Chip key={m} on={entryType === m} count={num((selected.entries[m] || []).length, lang)} onClick={() => setEntryType(m)}>{m === 'anime' ? t('uAnime') : t('uManga')}</Chip>
                  ))}
                </div>
                {(selected.entries[entryType] || []).length > 8 && (
                  <input className="adm-search" type="search" dir="auto" placeholder={t('uEntrySearch')} aria-label={t('uEntrySearch')} value={entryQuery} onChange={(e) => setEntryQuery(e.target.value)} />
                )}
              </div>
              {entries.length > 0 ? (
                <ul className="adm-entry-list cm-entry-scroll">
                  {entries.map((entry) => (
                    <li key={`${entryType}-${entry.slug}`} className="adm-entry-row" dir="ltr">
                      <a className="adm-entry-slug" href={`/${entryType}/${encodeURIComponent(entry.slug)}`} target="_blank" rel="noreferrer">{entry.slug}</a>
                      <span className="adm-chip">{statusLabel(entry.status)}</span>
                      <span className="adm-muted">{fmtDate(entry.added, lang)}</span>
                      {canEdit && <button className="adm-btn adm-danger" type="button" onClick={() => handleRemoveEntry(entryType, entry.slug)}>{t('uRemoveEntry')}</button>}
                    </li>
                  ))}
                </ul>
              ) : <p className="adm-empty">{total === 0 ? t('uNoEntries') : t('cmNoMatch')}</p>}
            </div>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <section>
      <div className="adm-toolbar">
        <input ref={searchRef} className="adm-search" type="search" dir="auto" placeholder={t('uSearchHint')} aria-label={t('uSearchHint')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} />
        <label className="adm-sort">
          <span className="adm-muted">{t('cmSort')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`uSort_${s}`)}</option>)}
          </select>
        </label>
        {data && <span className="adm-muted">{t('usersTotal', { n: num(data.total, lang) })}</span>}
        <a className="adm-btn adm-push" href={`/api/admin/x/users/export.csv?${qs(filters)}`} download aria-disabled={!data?.total}>{t('uExport')}</a>
        {canEdit && <button className="adm-btn adm-primary" type="button" aria-expanded={creating} onClick={() => setCreating((open) => !open)}>+ {t('newUser')}</button>}
      </div>

      <div className="adm-filters" role="group" aria-label={t('cmFilters')}>
        <Chip on={!filter} count={counts ? num(counts.all, lang) : null} onClick={() => setFilter('')}>{t('cmAll')}</Chip>
        {FILTERS.map((f) => <Chip key={f} on={filter === f} count={counts ? num(counts[f], lang) : null} onClick={() => setFilter(filter === f ? '' : f)}>{t(`uFilter_${f}`)}</Chip>)}
      </div>
      <ErrorBar error={error} onRetry={reload} t={t} />
      {!canEdit && <p className="adm-muted cm-readonly">{t('cmReadOnly')}</p>}

      {creating && canEdit && (
        <form className="adm-card cm-create" onSubmit={createUser}>
          <h3 className="cm-create-title">{t('createUserTitle')}</h3>
          <div className="adm-grid">
            <label className="adm-field">
              <span className="adm-label">{t('uName')}</span>
              <input dir="ltr" required minLength={3} maxLength={24} pattern={USERNAME_RE} title={t('uNameRule')} autoFocus aria-invalid={Boolean(newUser.username) && !nameOk} value={newUser.username} onChange={(e) => setNewUser((f) => ({ ...f, username: e.target.value }))} />
            </label>
            <PasswordField label={t('uPass')} required value={newUser.password} onChange={(v) => setNewUser((f) => ({ ...f, password: v }))} autoComplete="new-password" t={t} />
          </div>
          <p className={`adm-muted cm-hint${newUser.username && !nameOk ? ' is-bad' : ''}`}>{t('uNameRule')} {t('uPassRule', { n: MIN_PASS })}</p>
          <label className="adm-field">
            <span className="adm-label">{t('uBio')} <span className="adm-muted">{newUser.bio.length}/300</span></span>
            <textarea rows={2} maxLength={300} dir="auto" value={newUser.bio} onChange={(e) => setNewUser((f) => ({ ...f, bio: e.target.value }))} />
          </label>
          <div className="adm-actions">
            <button className="adm-btn adm-primary" type="submit" disabled={!createValid || createBusy}>{t('save')}</button>
            <button className="adm-btn" type="button" onClick={() => setCreating(false)}>{t('cancel')}</button>
          </div>
        </form>
      )}

      <div className={`adm-card adm-table-wrap${loading && data ? ' cm-stale' : ''}`} aria-busy={loading}>
        {!data && !error ? <Skeleton /> : (
          <table className="adm-table adm-users-table">
            <thead>
              <tr><th aria-label="avatar" /><th>{t('uName')}</th><th>{t('uJoined')}</th><th>{t('uListCount')}</th><th>{t('uBio')}</th><th>{t('actions')}</th></tr>
            </thead>
            <tbody>
              {data?.items.map((user) => (
                <React.Fragment key={user.username}>
                  <tr className={isOpen(user.username) ? 'is-selected' : undefined}>
                    <td className="cm-u-avatar"><span className="cm-avatar" style={{ background: `oklch(0.62 0.17 ${user.bloom})` }} aria-hidden="true">{Array.from(user.username)[0]?.toUpperCase()}</span></td>
                    <td className="cm-u-name">
                      <strong dir="ltr">{user.username}</strong>
                      {user.email && (
                        <span className="cm-u-mail">
                          <span dir="ltr" className="adm-muted" title={user.email}>{user.email}</span>
                          <span className={`adm-chip ${user.emailVerified ? 'is-ok' : 'is-bad'}`}>{user.emailVerified ? t('uVerified') : t('uUnverified')}</span>
                        </span>
                      )}
                    </td>
                    <td data-th={t('uJoined')} title={fmtDate(user.joined, lang, true)}>{fmtDate(user.joined, lang)}</td>
                    <td data-th={t('uListCount')} className="cm-u-counts">
                      <span className={`adm-chip${user.animeCount ? '' : ' cm-zero'}`}>{t('uAnime')}: {num(user.animeCount, lang)}</span>
                      <span className={`adm-chip${user.mangaCount ? '' : ' cm-zero'}`}>{t('uManga')}: {num(user.mangaCount, lang)}</span>
                    </td>
                    <td data-th={t('uBio')} className="cm-u-bio" dir="auto" title={user.bio || undefined}>{user.bio ? <span className="cm-clamp">{user.bio}</span> : <span className="adm-muted">{t('uNoBio')}</span>}</td>
                    <td data-th={t('actions')} className="cm-u-actions"><div className="adm-actions">
                      <button className="adm-btn" type="button" disabled={busyUsername === user.username} aria-expanded={isOpen(user.username)} onClick={() => (isOpen(user.username) ? setSelected(null) : openUser(user.username))}>
                        {busyUsername === user.username ? '…' : t(canEdit ? 'uManage' : 'uView')}
                      </button>
                      <details className="adm-more">
                        <summary className="adm-btn" aria-label={t('cmMoreActions')}>⋯</summary>
                        <div className="adm-more-menu">
                          <a href={`/user/${encodeURIComponent(user.username)}`} target="_blank" rel="noreferrer" onClick={closeMenu}>{t('uProfile')}</a>
                          <button type="button" onClick={(e) => { closeMenu(e); copyName(user.username); }}>{t('cmCopyName')}</button>
                          {user.email && <button type="button" onClick={(e) => { closeMenu(e); copyName(user.email); }}>{t('uCopyEmail')}</button>}
                          {canEdit && <button type="button" className="is-danger" onClick={(e) => { closeMenu(e); removeUser(user); }}>{t('delete')}</button>}
                        </div>
                      </details>
                    </div></td>
                  </tr>
                  {isOpen(user.username) && renderDetail(user)}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
        {selected === 'loading' && <p className="adm-muted cm-loading">{t('loading')}</p>}
        {data && data.items.length === 0 && (
          <div className="adm-empty">
            <p>{q || filter ? t('cmNoMatch') : t('usersEmpty')}</p>
            {(q || filter) && <button className="adm-btn" type="button" onClick={() => { setQuery(''); setFilter(''); }}>{t('cmClearFilters')}</button>}
          </div>
        )}
      </div>
      <Pager data={data} page={page} setPage={setPage} t={t} />
    </section>
  );
}
