import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

export default function Login({ onLogin, configured }) {
  const { t } = useAdmin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(configured === false ? 'notConfigured' : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (configured === false) setError('notConfigured'); }, [configured]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.login(username, password);
      onLogin(result.user);
    } catch (err) {
      if (err.status === 401) setError('loginFailed');
      else if (err.status === 503) setError('notConfigured');
      else setError(errText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="adm-card adm-login" onSubmit={submit}>
      <h1>{t('loginTitle')}</h1>
      <div className="adm-field">
        <label htmlFor="adm-user">{t('username')}</label>
        <input id="adm-user" dir="ltr" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
      </div>
      <div className="adm-field">
        <label htmlFor="adm-pass">{t('password')}</label>
        <input id="adm-pass" dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p className="adm-error" role="alert">{t(error) === error ? error : t(error)}</p>}
      <button className="adm-btn adm-primary" type="submit" disabled={busy}>{busy ? t('loading') : t('signIn')}</button>
    </form>
  );
}
