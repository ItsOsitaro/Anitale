import React, { useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const AREAS = ['catalog', 'import', 'translate', 'community', 'users', 'system'];
const areaKey = (area) => `area${area[0].toUpperCase()}${area.slice(1)}`;

// "My account": who I am, what I may do, and (for extra admins) a password change.
export default function AccountPage() {
  const { t, lang, toast, me } = useAdmin();
  const num = (value) => Number(value).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    if (form.next !== form.again) { toast(t('accountPwMismatch'), 'error'); return; }
    if (form.next === form.current) { toast(t('accountPwSame'), 'error'); return; }
    setBusy(true);
    try {
      await api.changeOwnPassword(form.current, form.next);
      toast(t('accountPwDone'));
      setForm({ current: '', next: '', again: '' });
    } catch (err) {
      toast(errText(err, t), 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="adm-admins">
      <div className="adm-card">
        <header className="adm-card-head">
          <div>
            <h2 className="adm-card-title">{t('accountTitle')}</h2>
            <p className="adm-card-sub">{t('accountSub')}</p>
          </div>
        </header>
        <div className="adm-card-body">
          <p>{t('accountSignedAs')} <strong dir="ltr">{me?.username}</strong> <span className="adm-chip">{me?.owner ? t('dashRoleOwner') : t('dashRoleAdmin')}</span>{me?.owner ? '' : ` — ${t('accountEditCount', { n: num(AREAS.filter((a) => me?.permissions?.[a] === 'edit').length), total: num(AREAS.length) })}`}</p>
          <h3 className="adm-panel-title">{t('accountAccess')}</h3>
          <ul className="adm-account-areas">
            {AREAS.map((area) => {
              const level = me?.owner ? 'edit' : me?.permissions?.[area];
              return (
                <li key={area}>
                  <span><strong>{t(areaKey(area))}</strong><small>{t(`${areaKey(area)}Hint`)}</small></span>
                  <span className={`adm-chip ${level === 'edit' ? 'is-ok' : level === 'view' ? '' : 'is-bad'}`}>{t(level === 'edit' ? 'permEdit' : level === 'view' ? 'permView' : 'permNone')}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <form className="adm-card" onSubmit={save}>
        <header className="adm-card-head"><div><h2 className="adm-card-title">{t('accountPwTitle')}</h2></div></header>
        <div className="adm-card-body">
          {me?.owner ? <>
              <p className="adm-muted">{t('accountOwnerNote')}</p>
              <code className="adm-code" dir="ltr">npm run setup-admin</code>
            </> : (
            <>
              <div className="adm-grid">
                <label className="adm-field"><span>{t('accountPwCurrent')}</span><input type={showPw ? 'text' : 'password'} value={form.current} required autoComplete="current-password" dir="ltr" onChange={(e) => setForm({ ...form, current: e.target.value })} /></label>
                <label className="adm-field"><span>{t('accountPwNext')}</span><input type={showPw ? 'text' : 'password'} value={form.next} required minLength={10} autoComplete="new-password" dir="ltr" onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>
                <label className="adm-field"><span>{t('accountPwAgain')}</span><input type={showPw ? 'text' : 'password'} value={form.again} required minLength={10} autoComplete="new-password" dir="ltr" aria-invalid={form.again !== '' && form.again !== form.next} onChange={(e) => setForm({ ...form, again: e.target.value })} />{form.again !== '' && form.again !== form.next && <small className="adm-hint-bad">{t('accountPwMismatch')}</small>}</label>
              </div>
              <p className="adm-muted">{t('accountPwNote')} <b className={form.next.length >= 10 ? 'adm-ok' : ''}>{form.next.length >= 10 ? '✓' : `${num(form.next.length)}/${num(10)}`}</b></p>
              <div className="adm-actions adm-form-actions">
                <button className="adm-btn adm-primary" type="submit" disabled={busy || form.next.length < 10 || form.next !== form.again}>{busy ? t('loading') : t('accountPwSave')}</button>
                <button className="adm-btn" type="button" onClick={() => setShowPw((v) => !v)}>{showPw ? t('adminsHide') : t('adminsShow')}</button>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
