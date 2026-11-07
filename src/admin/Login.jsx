import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const LAST_USER = 'anitale.admin.lastUser'; // username only, never the password
const COOLDOWN = 30; // seconds the button stays locked after a rate-limit answer

export default function Login({ onLogin, configured }) {
  const { t, lang } = useAdmin();
  const [username, setUsername] = useState(() => { try { return localStorage.getItem(LAST_USER) || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [error, setError] = useState(configured === false ? 'notConfigured' : '');
  const [fails, setFails] = useState(0);
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState(false);
  const [caps, setCaps] = useState(false);
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem(LAST_USER + '.off') === null; } catch { return true; } });
  const [wait, setWait] = useState(0);
  const [badField, setBadField] = useState('');
  const userRef = useRef(null);
  const passRef = useRef(null);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  useEffect(() => { if (configured === false) setError('notConfigured'); }, [configured]);
  // Remembered username -> start on the password field.
  useEffect(() => { (username ? passRef : userRef).current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (event) => {
    event.preventDefault();
    if (busy || wait > 0) return;
    const name = username.trim();
    if (!name || !password) {
      setError('loginEmpty'); setBadField(name ? 'pass' : password ? 'user' : 'both');
      (name ? passRef : userRef).current?.focus();
      return;
    }
    setBusy(true);
    setError(''); setBadField('');
    try {
      const result = await api.login(name, password);
      try { if (remember) { localStorage.setItem(LAST_USER, name); localStorage.removeItem(LAST_USER + '.off'); } else { localStorage.removeItem(LAST_USER); localStorage.setItem(LAST_USER + '.off', '1'); } } catch { /* private mode */ }
      onLogin(result.user);
    } catch (err) {
      if (err.status === 401) { setFails((n) => n + 1); setError('loginFailed'); }
      else if (err.status === 503) setError('notConfigured');
      else if (err.status === 429) { setError('tooMany'); setWait(COOLDOWN); }
      else if (err.status >= 500) setError('loginServerDown');
      else setError(errText(err, t));
      setPassword('');
      passRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const message = !error ? '' : error === 'loginFailed' && fails > 1 ? t('loginFailedN', { n: fails }) : (t(error) === error ? error : t(error));
  const bad = Boolean(error) && error !== 'notConfigured' && error !== 'tooMany';
  const userBad = bad && (badField === '' || badField === 'user' || badField === 'both');
  const passBad = bad && (badField === '' || badField === 'pass' || badField === 'both');

  return (
    <form className="adm-card adm-login" onSubmit={submit} noValidate>
      <h1>{t('loginTitle')}</h1>
      <p className="adm-muted sys-sub">{t('loginSub')}</p>
      <div className="adm-field">
        <label htmlFor="adm-user">{t('username')}</label>
        <input id="adm-user" ref={userRef} dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} aria-invalid={userBad} aria-describedby={error ? 'adm-login-err' : undefined} maxLength={60} readOnly={busy} enterKeyHint="next" />
      </div>
      <div className="adm-field">
        <label htmlFor="adm-pass">{t('password')}</label>
        <div className="sys-pass" dir="ltr">
          <input
            id="adm-pass"
            ref={passRef}
            dir="ltr"
            type={peek ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => setCaps(Boolean(e.getModifierState?.('CapsLock')))}
            onKeyUp={(e) => setCaps(Boolean(e.getModifierState?.('CapsLock')))}
            onBlur={() => setCaps(false)}
            aria-invalid={passBad}
            readOnly={busy}
            enterKeyHint="go"
            aria-describedby={error ? 'adm-login-err' : undefined}
            maxLength={200}
          />
          <button className="adm-btn sys-peek" type="button" onClick={() => setPeek((v) => !v)} aria-pressed={peek} aria-label={t(peek ? 'loginHide' : 'loginShow')} title={t(peek ? 'loginHide' : 'loginShow')}>{t(peek ? 'loginHideShort' : 'loginShowShort')}</button>
        </div>
        {caps && <p className="sys-caps" role="status">{t('loginCaps')}</p>}
      </div>
      <label className="sys-remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{t('loginRemember')}</label>
      {error && <p id="adm-login-err" className="adm-error" role="alert">{message}{error === 'tooMany' && wait > 0 ? ` ${t('loginWait', { n: wait.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB') })}` : ''}</p>}
      <button className="adm-btn adm-primary" type="submit" disabled={busy || wait > 0 || configured === false}>{busy ? t('loading') : t('signIn')}</button>
      <a className="sys-back" href="/">{t('loginBack')}</a>
    </form>
  );
}
