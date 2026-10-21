import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const fmtDate = (value, lang) => new Date(`${value.replace(' ', 'T')}Z`).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB');

export default function SiteUsers() {
  const { t, lang, toast } = useAdmin();
  const statusLabel = (status) => t('statusLabels')?.[status] ?? status;

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyUsername, setBusyUsername] = useState('');

  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', bio: '' });

  // Selected user detail (profile + personal-list entries)
  const [selected, setSelected] = useState(null); // { user, entries } | 'loading'
  const [edit, setEdit] = useState({ username: '', password: '', bio: '' });
  const [savingUser, setSavingUser] = useState(false);

  const detailRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    // alive-guard: a stale response must not overwrite a newer one.
    let active = true;
    api.usersList(debounced, page).then((result) => { if (active) { setData(result); setError(''); } }).catch((err) => { if (active) setError(errText(err, t)); });
    return () => { active = false; };
  }, [debounced, page, t]);
  useEffect(load, [load]);

  // Close the detail editor when the detail target disappears (search/list change).
  useEffect(() => {
    if (selected && selected !== 'loading' && data && !data.items.some((item) => item.username === selected.user.username)) {
      setSelected(null);
    }
  }, [data, selected]);

  const openUser = async (username) => {
    if (busyUsername) return;
    setBusyUsername(username);
    setSelected('loading');
    try {
      const result = await api.usersGet(username);
      setSelected(result);
      setEdit({ username: result.user.username, password: '', bio: result.user.bio || '' });
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } catch (err) {
      setSelected(null);
      toast(errText(err, t), 'error');
    } finally {
      setBusyUsername('');
    }
  };

  const reloadSelected = async (username) => {
    try {
      const result = await api.usersGet(username);
      setSelected(result);
      setEdit({ username: result.user.username, password: '', bio: result.user.bio || '' });
      return true;
    } catch {
      setSelected(null);
      return false;
    }
  };

  const createUser = async (event) => {
    event.preventDefault();
    if (!newUser.username.trim() || newUser.password.length < 6) return;
    try {
      const { user } = await api.usersCreate({ username: newUser.username.trim(), password: newUser.password, bio: newUser.bio });
      toast(t('uCreated', { name: user.username }));
      setCreating(false);
      setNewUser({ username: '', password: '', bio: '' });
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    }
  };

  const saveUser = async () => {
    if (!selected || selected === 'loading') return;
    const current = selected.user.username;
    const payload = {};
    const username = edit.username.trim();
    if (username && username !== current) payload.username = username;
    if (edit.password) payload.password = edit.password;
    if (edit.bio !== selected.user.bio) payload.bio = edit.bio;
    if (Object.keys(payload).length === 0) { toast(t('uSaved')); return; }
    setSavingUser(true);
    try {
      await api.usersPatch(current, payload);
      toast(t('uSaved'));
      await reloadSelected(payload.username || current);
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const removeUser = async (user) => {
    if (!window.confirm(t('uDeleteConfirm', { name: user.username }))) return;
    try {
      await api.usersRemove(user.username);
      toast(t('uDeleted'));
      setSelected(null);
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    }
  };

  const exportCsv = () => {
    // Downloads the full CSV (all pages), not only what is on screen.
    window.open('/api/admin/users/export.csv', '_blank');
  };

  const handleRemoveEntry = async (mediaType, slug) => {
    if (!selected || selected === 'loading') return;
    try {
      await api.usersRemoveEntry(selected.user.username, mediaType, slug);
      toast(t('uEntryRemoved'));
      await reloadSelected(selected.user.username);
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    }
  };

  return (
    <section>
      <div className="adm-toolbar">
        <input className="adm-search" type="search" dir="auto" placeholder={t('usersSearch')} aria-label={t('usersSearch')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {data && <span className="adm-muted">{t('usersTotal', { n: data.total })}</span>}
        <button className="adm-btn" type="button" onClick={exportCsv} disabled={!data || data.total === 0}>{t('uExport')}</button>
        <button className="adm-btn adm-push" type="button" aria-expanded={creating} onClick={() => setCreating((open) => !open)}>+ {t('newUser')}</button>
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}

      {creating && (
        <form className="adm-card adm-user-create" onSubmit={createUser}>
          <fieldset className="adm-card" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>{t('createUserTitle')}</legend>
            <div className="adm-grid">
              <label className="adm-field">
                <span className="adm-label">{t('uName')}</span>
                <input dir="ltr" required minLength={3} maxLength={24} value={newUser.username} onChange={(e) => setNewUser((f) => ({ ...f, username: e.target.value }))} />
              </label>
              <label className="adm-field">
                <span className="adm-label">{t('uPass')}</span>
                <input type="password" dir="ltr" required minLength={6} value={newUser.password} onChange={(e) => setNewUser((f) => ({ ...f, password: e.target.value }))} />
              </label>
            </div>
            <label className="adm-field">
              <span className="adm-label">{t('uBio')}</span>
              <textarea rows={2} maxLength={300} value={newUser.bio} onChange={(e) => setNewUser((f) => ({ ...f, bio: e.target.value }))} />
            </label>
            <div className="adm-actions">
              <button className="adm-btn adm-primary" type="submit" disabled={newUser.password.length < 6 || !newUser.username.trim()}>{t('save')}</button>
              <button className="adm-btn" type="button" onClick={() => setCreating(false)}>{t('cancel')}</button>
            </div>
          </fieldset>
        </form>
      )}

      <div className="adm-card adm-table-wrap">
        <table className="adm-table adm-users-table">
          <thead>
            <tr><th aria-label="avatar" /><th>{t('uName')}</th><th>{t('uJoined')}</th><th>{t('uListCount')}</th><th>{t('uBio')}</th><th>{t('actions')}</th></tr>
          </thead>
          <tbody>
            {data?.items.map((user) => (
              <React.Fragment key={user.username}>
                <tr className={selected?.user?.username === user.username ? 'is-selected' : undefined}>
                  <td><span className="adm-avatar-dot" style={{ background: `oklch(0.65 0.19 ${user.bloom})` }} aria-hidden="true" /></td>
                  <td>
                    <strong dir="ltr">{user.username}</strong>
                  </td>
                  <td>{fmtDate(user.joined, lang)}</td>
                  <td>
                    <span className="adm-chip">{t('uAnime')}: {user.animeCount}</span>
                    <span className="adm-chip">{t('uManga')}: {user.mangaCount}</span>
                  </td>
                  <td dir="auto">{user.bio ? user.bio.slice(0, 60) : <span className="adm-muted">{t('uNoBio')}</span>}</td>
                  <td><div className="adm-actions">
                    <button className="adm-btn" type="button" disabled={busyUsername === user.username} onClick={() => (selected?.user?.username === user.username ? setSelected(null) : openUser(user.username))}>
                      {busyUsername === user.username ? '…' : t('uManage')}
                    </button>
                    <a className="adm-btn" href={`/user/${encodeURIComponent(user.username)}`} target="_blank" rel="noreferrer">{t('uProfile')}</a>
                    <button className="adm-btn adm-danger" type="button" onClick={() => removeUser(user)}>{t('delete')}</button>
                  </div></td>
                </tr>
                {selected?.user?.username === user.username && selected !== 'loading' && (
                  <tr>
                    <td colSpan={6}>
                      <div className="adm-user-detail" ref={detailRef}>
                        <div className="adm-user-half">
                          <div className="adm-grid">
                            <label className="adm-field">
                              <span className="adm-label">{t('uName')}</span>
                              <input dir="ltr" minLength={3} maxLength={24} value={edit.username} onChange={(e) => setEdit((f) => ({ ...f, username: e.target.value }))} />
                            </label>
                            <label className="adm-field">
                              <span className="adm-label">{t('uPassNew')}</span>
                              <input type="password" dir="ltr" placeholder={t('uPassHint')} autoComplete="new-password" value={edit.password} onChange={(e) => setEdit((f) => ({ ...f, password: e.target.value }))} />
                            </label>
                          </div>
                          <p className="adm-muted" style={{ margin: '4px 0 0' }}>{t('uRenameHint')} {t('uPassHint')}</p>
                          <label className="adm-field" style={{ marginBlockStart: '10px' }}>
                            <span className="adm-label">{t('uBio')}</span>
                            <textarea rows={2} maxLength={300} value={edit.bio} onChange={(e) => setEdit((f) => ({ ...f, bio: e.target.value }))} />
                          </label>
                          <div className="adm-actions">
                            <button className="adm-btn adm-primary" type="button" disabled={savingUser} onClick={saveUser}>{savingUser ? t('uSaving') : t('save')}</button>
                          </div>
                        </div>
                        <div className="adm-user-half">
                          <span className="adm-label">{t('uEntries')}</span>
                          {['anime', 'manga'].map((mediaType) => (
                            (selected.entries[mediaType] || []).length > 0 && (
                              <div className="adm-entry-group" key={mediaType}>
                                <div className="adm-label" dir="auto">{mediaType === 'anime' ? t('uAnime') : t('uManga')}</div>
                                <ul className="adm-entry-list">
                                  {selected.entries[mediaType].map((entry) => (
                                    <li key={`${mediaType}-${entry.slug}`} className="adm-entry-row" dir="ltr">
                                      <span className="adm-entry-slug">{entry.slug}</span>
                                      <span className="adm-chip">{statusLabel(entry.status)}</span>
                                      <span className="adm-muted">{fmtDate(entry.added, lang)}</span>
                                      <button className="adm-btn adm-danger" type="button" onClick={() => handleRemoveEntry(mediaType, entry.slug)}>{t('uRemoveEntry')}</button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )
                          ))}
                          {(selected.entries.anime || []).length === 0 && (selected.entries.manga || []).length === 0 && (
                            <p className="adm-empty">{t('uNoEntries')}</p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="adm-empty">{t('usersEmpty')}</p>}
        {!data && !error && <p className="adm-empty">{t('loading')}</p>}
      </div>
      {data && data.pages > 1 && (
        <div className="adm-pager">
          <button className="adm-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</button>
          <span>{t('pageOf', { page: data.page, pages: data.pages })}</span>
          <button className="adm-btn" type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>{t('next')}</button>
        </div>
      )}
    </section>
  );
}
