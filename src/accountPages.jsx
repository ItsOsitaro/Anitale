import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSiteLang } from './i18n.js';
import { useUser, userApi } from './user.jsx';
import SensitiveToggle from './components/SensitiveToggle.jsx';
import MessengerLinks from './components/MessengerLinks.jsx';
import CalendarLink from './components/CalendarLink.jsx';

// Email-based account recovery: a verified email gets a one-hour, single-use
// link to choose a new password.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (value) => EMAIL_PATTERN.test(String(value).trim());

const slowDown = (error, t) => (error?.status === 429 ? t('authRateLimit') : error?.status === 0 ? t('authNetwork') : null);

const PasswordFields = ({ idPrefix, value, repeat, onValue, onRepeat, labelKey = 'newPasswordLabel' }) => {
  const { t } = useSiteLang();
  return (
    <>
      <div className="auth-field">
        <label htmlFor={`${idPrefix}-new`}>{t(labelKey)}</label>
        <Input id={`${idPrefix}-new`} dir="ltr" type="password" autoComplete="new-password" value={value} onChange={(event) => onValue(event.target.value)} />
        <small className="auth-hint">{t('passwordRule')}</small>
      </div>
      <div className="auth-field">
        <label htmlFor={`${idPrefix}-repeat`}>{t('repeatPasswordLabel')}</label>
        <Input id={`${idPrefix}-repeat`} dir="ltr" type="password" autoComplete="new-password" value={repeat} onChange={(event) => onRepeat(event.target.value)} />
      </div>
    </>
  );
};

const checkNewPassword = (password, repeat, t) => {
  if (password.length < 8) return t('passwordRule');
  if (password !== repeat) return t('passwordMismatch');
  return '';
};

const AuthMark = () => {
  const { lang } = useSiteLang();
  return <span className="auth-mark" aria-hidden="true">{lang === 'fa' ? 'م' : 'M'}</span>;
};

// ---------- /forgot ----------
export function ForgotPasswordPage() {
  const { t } = useSiteLang();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  useEffect(() => { document.title = `${t('forgotTitle')} · ${t('siteName')}`; }, [t]);

  const submit = async (event) => {
    event.preventDefault();
    if (!isEmail(email)) { setError(t('emailInvalid')); return; }
    setSubmitting(true);
    setError('');
    try {
      await userApi.forgot(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(slowDown(err, t) || t('authGenericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="forgotHeading">
        <AuthMark />
        <h1 id="forgotHeading">{t('forgotTitle')}</h1>
        {sentTo ? (
          <div className="mail-notice" role="status">
            <p className="auth-tagline">{t('forgotSent', { email: sentTo })}</p>
            <p className="auth-hint">{t('forgotSentHint')}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setSentTo('')}>{t('forgotTryAgain')}</Button>
          </div>
        ) : (
          <>
            <p className="auth-tagline">{t('forgotTagline')}</p>
            <form onSubmit={submit} noValidate>
              <div className="auth-field">
                <label htmlFor="fg-email">{t('emailLabel')}</label>
                <Input id="fg-email" dir="ltr" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <Button className="auth-submit" type="submit" disabled={submitting}>{submitting ? t('authSubmitting') : t('forgotSubmit')}</Button>
            </form>
          </>
        )}
        <p className="auth-switch"><Link to="/login">{t('authSwitchLogin')}</Link></p>
      </section>
    </main>
  );
}

// ---------- /reset-password?token= ----------
export function ResetPasswordPage() {
  const { t } = useSiteLang();
  const { setMe, refresh } = useUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [fields, setFields] = useState({ password: '', repeat: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(!token);

  useEffect(() => { document.title = `${t('resetTitle')} · ${t('siteName')}`; }, [t]);

  const submit = async (event) => {
    event.preventDefault();
    const problem = checkNewPassword(fields.password, fields.repeat, t);
    if (problem) { setError(problem); return; }
    setSubmitting(true);
    setError('');
    try {
      const result = await userApi.reset(token, fields.password);
      setMe(result.user);
      await refresh();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err?.status === 400) setExpired(true);
      else setError(slowDown(err, t) || t('authGenericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="resetHeading">
        <AuthMark />
        <h1 id="resetHeading">{t('resetTitle')}</h1>
        {expired ? (
          <>
            <p className="auth-error" role="alert">{t('linkExpired')}</p>
            <Button className="auth-submit" render={<Link to="/forgot" />} nativeButton={false}>{t('linkRequestNew')}</Button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <PasswordFields
              idPrefix="rs"
              value={fields.password}
              repeat={fields.repeat}
              onValue={(value) => setFields((c) => ({ ...c, password: value }))}
              onRepeat={(value) => setFields((c) => ({ ...c, repeat: value }))}
            />
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button className="auth-submit" type="submit" disabled={submitting}>{submitting ? t('authSubmitting') : t('forgotSubmit')}</Button>
          </form>
        )}
      </section>
    </main>
  );
}

// ---------- /verify-email?token= ----------
export function VerifyEmailPage() {
  const { t } = useSiteLang();
  const { refresh } = useUser();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState(token ? 'working' : 'failed'); // working | done | failed
  const started = useRef(false);

  useEffect(() => { document.title = `${t('verifyTitle')} · ${t('siteName')}`; }, [t]);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // the link is single-use: never send it twice (StrictMode)
    userApi.verifyEmail(token)
      .then(() => { setState('done'); refresh(); })
      .catch(() => setState('failed'));
  }, [token, refresh]);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="verifyHeading">
        <AuthMark />
        <h1 id="verifyHeading">{t('verifyTitle')}</h1>
        {state === 'working' && <p className="auth-tagline" role="status">{t('verifyWorking')}</p>}
        {state === 'done' && (
          <>
            <p className="auth-ok" role="status">{t('verifyDone')}</p>
            <Button className="auth-submit" render={<Link to="/dashboard" />} nativeButton={false}>{t('verifyContinue')}</Button>
          </>
        )}
        {state === 'failed' && (
          <>
            <p className="auth-error" role="alert">{t('linkExpired')}</p>
            <Button className="auth-submit" render={<Link to="/account" />} nativeButton={false}>{t('verifyResendFromAccount')}</Button>
          </>
        )}
      </section>
    </main>
  );
}

// ---------- /account ----------
export function AccountSecurityPage() {
  const { t } = useSiteLang();
  const user = useUser();
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' });
  const [pwState, setPwState] = useState({ busy: false, error: '', done: false });
  const [mail, setMail] = useState({ email: '', password: '' });
  const [mailState, setMailState] = useState({ busy: false, error: '', note: '' });
  const [editing, setEditing] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);

  useEffect(() => { document.title = `${t('accountTitle')} · ${t('siteName')}`; }, [t]);

  if (user.meLoaded && !user.me) return <Navigate to="/login" replace />;
  if (!user.me) return null;

  const { email, emailVerified } = user.me;
  const showForm = !email || editing;

  const changePassword = async (event) => {
    event.preventDefault();
    const problem = checkNewPassword(pw.next, pw.repeat, t);
    if (problem) { setPwState({ busy: false, error: problem, done: false }); return; }
    setPwState({ busy: true, error: '', done: false });
    try {
      await userApi.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', repeat: '' });
      setPwState({ busy: false, error: '', done: true });
    } catch (err) {
      setPwState({ busy: false, done: false, error: slowDown(err, t) || (err?.status === 403 ? t('wrongCurrentPassword') : t('authGenericError')) });
    }
  };

  const saveEmail = async (event) => {
    event.preventDefault();
    if (!isEmail(mail.email)) { setMailState({ busy: false, error: t('emailInvalid'), note: '' }); return; }
    if (!mail.password) { setMailState({ busy: false, error: t('accountEmailNeedPassword'), note: '' }); return; }
    setMailState({ busy: true, error: '', note: '' });
    try {
      const result = await userApi.setEmail(mail.email.trim(), mail.password);
      user.setMe(result.user);
      setMail({ email: '', password: '' });
      setEditing(false);
      setMailState({ busy: false, error: '', note: t('accountEmailSent') });
    } catch (err) {
      const message = slowDown(err, t)
        || (err?.status === 403 ? t('wrongCurrentPassword') : err?.status === 409 ? t('emailTaken') : t('authGenericError'));
      setMailState({ busy: false, error: message, note: '' });
    }
  };

  const resend = async () => {
    setMailState({ busy: true, error: '', note: '' });
    try {
      await userApi.resendVerification();
      setMailState({ busy: false, error: '', note: t('accountEmailSent') });
    } catch (err) {
      setMailState({ busy: false, error: err?.status === 429 ? t('resendWait') : slowDown(err, t) || t('authGenericError'), note: '' });
    }
  };

  return (
    <main className="auth-shell account-shell">
      <section className="auth-card" aria-labelledby="scHeading">
        <h1 id="scHeading">{t('sensitiveHead')}</h1>
        <SensitiveToggle />
      </section>

      <section className="auth-card" aria-labelledby="emHeading">
        <h1 id="emHeading">{t('accountEmailHead')}</h1>
        {email && (
          <p className="email-state">
            <bdi dir="ltr" className="email-state__address">{email}</bdi>
            <span className={`email-badge ${emailVerified ? 'is-verified' : 'is-pending'}`}>{emailVerified ? t('emailVerified') : t('emailNotVerified')}</span>
          </p>
        )}
        {!email && <p className="auth-tagline">{t('accountEmailNone')}</p>}
        {email && !emailVerified && <p className="auth-hint">{t('accountEmailUnverifiedHint')}</p>}
        {mailState.note && <p className="auth-ok" role="status">{mailState.note}</p>}
        {mailState.error && <p className="auth-error" role="alert">{mailState.error}</p>}
        {email && !emailVerified && !editing && (
          <Button type="button" variant="outline" size="sm" disabled={mailState.busy} onClick={resend}>{t('accountEmailResend')}</Button>
        )}
        {showForm ? (
          <form onSubmit={saveEmail} noValidate>
            <div className="auth-field">
              <label htmlFor="em-email">{t('emailLabel')}</label>
              <Input id="em-email" dir="ltr" type="email" autoComplete="email" inputMode="email" value={mail.email} onChange={(event) => setMail((c) => ({ ...c, email: event.target.value }))} />
            </div>
            <div className="auth-field">
              <label htmlFor="em-password">{t('authPassword')}</label>
              <Input id="em-password" dir="ltr" type="password" autoComplete="current-password" value={mail.password} onChange={(event) => setMail((c) => ({ ...c, password: event.target.value }))} />
            </div>
            <Button className="auth-submit" type="submit" disabled={mailState.busy}>{mailState.busy ? t('authSubmitting') : t(email ? 'accountEmailChange' : 'accountEmailAdd')}</Button>
            {editing && <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>{t('cancel')}</Button>}
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>{t('accountEmailChange')}</Button>
        )}
      </section>

      <MessengerLinks />

      <CalendarLink />

      <section className="auth-card" aria-labelledby="prHeading">
        <h1 id="prHeading">{t('privacyHead')}</h1>
        <p className="auth-hint">{t('privacyHint')}</p>
        {['anime', 'manga'].map((kind) => (
          <div className="auth-field" key={kind}>
            <label htmlFor={`pr-${kind}`}>{t(kind === 'anime' ? 'privacyAnime' : 'privacyManga')}</label>
            <select
              id={`pr-${kind}`}
              className="privacy-select"
              value={user.me.privacy?.[kind] || 'public'}
              disabled={privacyBusy}
              onChange={async (event) => {
                const value = event.target.value;
                setPrivacyBusy(true);
                setPrivacyError(false);
                try {
                  const { user: updated } = await userApi.updatePrivacy({ [kind]: value });
                  user.setMe((current) => ({ ...current, privacy: updated.privacy }));
                } catch { setPrivacyError(true); } finally { setPrivacyBusy(false); }
              }}
            >
              <option value="public">{t('privacyPublic')}</option>
              <option value="friends">{t('privacyFriends')}</option>
              <option value="private">{t('privacyPrivate')}</option>
            </select>
          </div>
        ))}
        {privacyError && <p className="auth-error" role="alert">{t('authGenericError')}</p>}
      </section>

      <section className="auth-card" aria-labelledby="pwHeading">
        <h1 id="pwHeading">{t('accountPasswordHead')}</h1>
        <form onSubmit={changePassword} noValidate>
          <div className="auth-field">
            <label htmlFor="ac-current">{t('currentPasswordLabel')}</label>
            <Input id="ac-current" dir="ltr" type="password" autoComplete="current-password" value={pw.current} onChange={(event) => setPw((c) => ({ ...c, current: event.target.value }))} />
          </div>
          <PasswordFields
            idPrefix="ac"
            value={pw.next}
            repeat={pw.repeat}
            onValue={(value) => setPw((c) => ({ ...c, next: value }))}
            onRepeat={(value) => setPw((c) => ({ ...c, repeat: value }))}
          />
          {pwState.error && <p className="auth-error" role="alert">{pwState.error}</p>}
          {pwState.done && <p className="auth-ok" role="status">{t('accountPasswordDone')}</p>}
          <Button className="auth-submit" type="submit" disabled={pwState.busy}>{pwState.busy ? t('authSubmitting') : t('accountPasswordSubmit')}</Button>
        </form>
      </section>
    </main>
  );
}
