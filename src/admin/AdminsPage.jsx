import React, { useCallback, useEffect, useState } from 'react';
import { AdminSessions } from './ToolsPages.jsx';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const AREAS = ['catalog', 'import', 'translate', 'community', 'reviews', 'reports', 'users', 'system'];
const areaKey = (area) => `area${area[0].toUpperCase()}${area.slice(1)}`;

// Ready-made permission sets; the matrix below can still be adjusted by hand.
const PRESETS = {
  presetViewer: Object.fromEntries(AREAS.map((area) => [area, 'view'])),
  presetEditor: { catalog: 'edit', translate: 'edit', import: 'view', community: 'view' },
  presetModerator: { community: 'edit', users: 'edit', catalog: 'view' },
  presetImporter: { import: 'edit', catalog: 'edit', translate: 'view' },
  presetFull: Object.fromEntries(AREAS.map((area) => [area, 'edit'])),
};

const randomPassword = () => {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

// Radio matrix: one row per area, none / view / edit.
function PermissionMatrix({ value, onChange, t, disabled }) {
  return (
    <div className="adm-perm" role="group" aria-label={t('adminsColAccess')}>
      <div className="adm-perm-head">
        <span>{t('permArea')}</span>
        {['', 'view', 'edit'].map((level) => (
          <button key={level || 'none'} type="button" className="adm-perm-all" disabled={disabled} title={t('permSetAll')}
            onClick={() => onChange(level ? Object.fromEntries(AREAS.map((area) => [area, level])) : {})}>
            {t(level === '' ? 'permNone' : level === 'view' ? 'permView' : 'permEdit')}
          </button>
        ))}
      </div>
      {AREAS.map((area) => (
        <div className="adm-perm-row" key={area}>
          <span className="adm-perm-name"><strong>{t(areaKey(area))}</strong><small>{t(`${areaKey(area)}Hint`)}</small></span>
          {['', 'view', 'edit'].map((level) => (
            <label key={level || 'none'} className="adm-perm-cell">
              <input
                type="radio"
                name={`perm-${area}-${disabled ? 'ro' : 'rw'}`}
                checked={(value[area] || '') === level}
                disabled={disabled}
                onChange={() => onChange({ ...value, [area]: level || undefined })}
                aria-label={`${t(areaKey(area))}: ${t(level === '' ? 'permNone' : level === 'view' ? 'permView' : 'permEdit')}`}
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// "Can change: A, B" / "View only: C" as two short lines instead of one long sentence.
const Summary = ({ permissions, t }) => {
  const names = (level) => AREAS.filter((area) => permissions[area] === level).map((area) => t(areaKey(area)));
  const edit = names('edit');
  const view = names('view');
  if (!edit.length && !view.length) return <span className="adm-muted">{t('adminsNoAccess')}</span>;
  return (
    <div className="adm-perm-sum">
      {edit.length > 0 && <div><b>{t('permEdit')}:</b> {edit.join('، ')}</div>}
      {view.length > 0 && <div><b>{t('permView')}:</b> {view.join('، ')}</div>}
    </div>
  );
};
const sameSet = (a, b) => AREAS.every((area) => (a[area] || '') === (b[area] || ''));

export default function AdminsPage() {
  const { t, lang, toast, confirm, me } = useAdmin();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ username: '', label: '', password: '', permissions: {} });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { id, permissions, label, password }
  const [fresh, setFresh] = useState(null); // credentials of the admin just created (shown once)

  const load = useCallback(() => {
    api.adminsList().then(setData).catch((err) => toast(errText(err, t), 'error'));
  }, [t, toast]);
  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const row = await api.adminsCreate({ username: form.username.trim(), label: form.label.trim(), password: form.password, permissions: form.permissions });
      toast(t('adminsCreated', { name: row.username }));
      setFresh({ username: row.username, password: form.password });
      setForm({ username: '', label: '', password: '', permissions: {} });
      setShowPw(false);
      load();
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally { setBusy(false); }
  };

  const patch = async (id, body, okText) => {
    try { await api.adminsUpdate(id, body); toast(okText || t('adminsSaved')); load(); return true; } catch (err) { toast(errText(err, t), 'error'); return false; }
  };

  const toggleActive = async (row) => {
    if (row.active && !(await confirm(t('adminsDisableConfirm', { name: row.username }), { danger: true }))) return;
    patch(row.id, { active: !row.active });
  };
  const remove = async (row) => {
    if (!(await confirm(t('adminsDeleteConfirm', { name: row.username }), { danger: true, okLabel: t('adminsDelete') }))) return;
    try { await api.adminsRemove(row.id); toast(t('adminsDeleted')); load(); } catch (err) { toast(errText(err, t), 'error'); }
  };
  const saveEdit = async () => {
    const body = { label: editing.label, permissions: editing.permissions };
    if (editing.password) body.password = editing.password;
    if (await patch(editing.id, body)) setEditing(null);
  };
  const fmt = (value) => new Date(`${value.replace(' ', 'T')}Z`).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const lastLogin = (value) => (value ? fmt(value) : t('adminsNever'));
  const usernameBad = form.username !== '' && !/^[A-Za-z0-9_.-]{3,32}$/.test(form.username);
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast(t('adminsCopied')); } catch { toast(t('adminsCopyFail'), 'error'); }
  };

  return (
    <div className="adm-admins">
      {fresh && (
        <div className="adm-card adm-fresh" role="status">
          <h2 className="adm-card-title">{t('adminsFreshTitle', { name: fresh.username })}</h2>
          <p className="adm-muted">{t('adminsFreshNote')}</p>
          <div className="adm-fresh-box" dir="ltr"><span>{fresh.username}</span><code>{fresh.password}</code></div>
          <div className="adm-actions">
            <button className="adm-btn adm-primary" type="button" onClick={() => copy(`${fresh.username}\n${fresh.password}`)}>{t('adminsCopyBoth')}</button>
            <button className="adm-btn" type="button" onClick={() => setFresh(null)}>{t('adminsFreshDone')}</button>
          </div>
        </div>
      )}
      <div className="adm-card">
        <header className="adm-card-head">
          <div>
            <h2 className="adm-card-title">{t('adminsTitle')}{data && <span className="adm-chip adm-count">{data.items.length + 1}</span>}</h2>
            <p className="adm-card-sub">{t('adminsSub')}</p>
          </div>
        </header>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>{t('adminsCol')}</th><th>{t('adminsColAccess')}</th><th>{t('adminsColLast')}</th><th>{t('adminsColStatus')}</th><th>{t('actions')}</th></tr></thead>
            <tbody>
              {data?.owner && (
                <tr>
                  <td data-th={t('adminsCol')}><div className="adm-admin-id"><strong dir="ltr">{data.owner}</strong> <span className="adm-chip">{t('adminsOwner')}</span>{me?.username === data.owner && <span className="adm-chip">{t('adminsYou')}</span>}</div></td>
                  <td data-th={t('adminsColAccess')}>{t('adminsOwnerAccess')}</td>
                  <td data-th={t('adminsColLast')}>—</td>
                  <td data-th={t('adminsColStatus')}><span className="adm-chip is-ok">{t('adminsActive')}</span></td>
                  <td />
                </tr>
              )}
              {(data?.items || []).map((row) => (
                <React.Fragment key={row.id}>
                  <tr className={row.active ? '' : 'is-off'}>
                    <td data-th={t('adminsCol')}>
                      <div className="adm-admin-id">
                        <strong dir="ltr">{row.username}</strong>
                        {me?.username === row.username && <span className="adm-chip">{t('adminsYou')}</span>}
                        {row.label && <div className="adm-muted" dir="auto">{row.label}</div>}
                        {row.createdBy && <div className="adm-muted">{t('adminsCreatedBy', { name: row.createdBy })}{row.createdAt ? ` · ${fmt(row.createdAt)}` : ''}</div>}
                      </div>
                    </td>
                    <td data-th={t('adminsColAccess')}><Summary permissions={row.permissions} t={t} /></td>
                    <td data-th={t('adminsColLast')}>{lastLogin(row.lastLogin)}</td>
                    <td data-th={t('adminsColStatus')}><span className={`adm-chip ${row.active ? 'is-ok' : 'is-bad'}`}>{row.active ? t('adminsActive') : t('adminsDisabled')}</span></td>
                    <td data-th={t('actions')}>
                      <div className="adm-actions">
                        <button className="adm-btn" type="button" aria-expanded={editing?.id === row.id} onClick={() => setEditing(editing?.id === row.id ? null : { id: row.id, label: row.label, permissions: { ...row.permissions }, password: '' })}>{t('adminsEdit')}</button>
                        <details className="adm-more">
                          <summary className="adm-btn" aria-label={t('moreActions')}>⋯</summary>
                          <div className="adm-more-menu">
                            <button type="button" onClick={(e) => { e.currentTarget.closest('details').open = false; toggleActive(row); }}>{row.active ? t('adminsDisable') : t('adminsEnable')}</button>
                            <button type="button" className="is-danger" onClick={(e) => { e.currentTarget.closest('details').open = false; remove(row); }}>{t('adminsDelete')}</button>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                  {editing?.id === row.id && (
                    <tr className="adm-perm-edit">
                      <td colSpan={5}>
                        <label className="adm-field"><span>{t('adminsLabel')}</span><input value={editing.label} maxLength={60} dir="auto" onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></label>
                        <PermissionMatrix value={editing.permissions} onChange={(permissions) => setEditing({ ...editing, permissions })} t={t} />
                        <label className="adm-field"><span>{t('adminsResetPw')}</span><input type="text" autoComplete="off" dir="ltr" minLength={10} placeholder={t('adminsNewPw')} value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></label>
                        <div className="adm-actions">
                          <button className="adm-btn adm-primary" type="button" onClick={saveEdit}>{t('adminsApply')}</button>
                          <button className="adm-btn" type="button" onClick={() => setEditing(null)}>{t('adminsCancel')}</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && <p className="adm-empty">{t('adminsEmpty')}</p>}
          {!data && <div className="adm-skeleton" aria-busy="true"><i /><i /></div>}
        </div>
      </div>

      <form className="adm-card adm-admins-new" onSubmit={create}>
        <header className="adm-card-head"><div><h2 className="adm-card-title">{t('adminsNew')}</h2></div></header>
        <div className="adm-card-body">
          <div className="adm-grid">
            <label className="adm-field"><span>{t('adminsUsername')}</span><input value={form.username} required minLength={3} maxLength={32} autoComplete="off" dir="ltr" aria-invalid={usernameBad} onChange={(e) => setForm({ ...form, username: e.target.value })} />{usernameBad && <small className="adm-hint-bad">{t('adminsUsernameRule')}</small>}</label>
            <label className="adm-field"><span>{t('adminsLabel')}</span><input value={form.label} maxLength={60} dir="auto" onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
            <div className="adm-field adm-wide">
              <label htmlFor="adm-new-pw">{t('adminsPassword')} <span className="adm-muted">{t('adminsPasswordHint')} {form.password && <b className={form.password.length >= 10 ? 'adm-ok' : 'adm-hint-bad'}>{form.password.length >= 10 ? '✓' : `${form.password.length}/10`}</b>}</span></label>
              <div className="adm-inline">
                <input id="adm-new-pw" className="adm-grow" type={showPw ? 'text' : 'password'} value={form.password} required minLength={10} autoComplete="new-password" dir="ltr" onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button className="adm-btn" type="button" onClick={() => { setForm({ ...form, password: randomPassword() }); setShowPw(true); }}>{t('adminsGenerate')}</button>
                <button className="adm-btn" type="button" onClick={() => setShowPw((v) => !v)}>{showPw ? t('adminsHide') : t('adminsShow')}</button>
                <button className="adm-btn" type="button" disabled={!form.password} onClick={() => copy(form.password)}>{t('adminsCopy')}</button>
              </div>
            </div>
          </div>
          <p className="adm-muted adm-presets-label">{t('adminsPresets')}</p>
          <div className="adm-filters">
            {Object.keys(PRESETS).map((key) => <button key={key} type="button" className={`adm-fchip${sameSet(form.permissions, PRESETS[key]) ? ' is-on' : ''}`} aria-pressed={sameSet(form.permissions, PRESETS[key])} onClick={() => setForm({ ...form, permissions: { ...PRESETS[key] } })}>{t(key)}</button>)}
          </div>
          <PermissionMatrix value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} t={t} />
          <div className="adm-actions adm-form-actions">
            <button className="adm-btn adm-primary" type="submit" disabled={busy || usernameBad || form.password.length < 10}>{busy ? t('loading') : t('adminsCreate')}</button>
          </div>
        </div>
      </form>
      <AdminSessions />
    </div>
  );
}
