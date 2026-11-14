import { useState } from 'react';
import { PREF_KEYS, useNotificationPrefs } from '@/hooks/use-notification-prefs';
import { useSiteLang } from '@/i18n';

// Account page block: a switch for each notification type (all on by default).
export default function NotificationPrefs() {
  const { t } = useSiteLang();
  const { prefs, isOn, setPref } = useNotificationPrefs(true);
  const [error, setError] = useState('');

  const toggle = async (key) => {
    setError('');
    if (!(await setPref(key, !isOn(key)))) setError(t('notifPrefError'));
  };

  return (
    <section className="auth-card" aria-labelledby="notifPrefsHeading">
      <h1 id="notifPrefsHeading">{t('notifPrefsHead')}</h1>
      <p className="auth-hint">{t('notifPrefsHint')}</p>
      <ul className="notif-prefs">
        {PREF_KEYS.map((key) => (
          <li key={key}>
            <label>
              <input type="checkbox" role="switch" checked={isOn(key)} disabled={!prefs} onChange={() => toggle(key)} />
              <span>{t(`notifPref_${key}`)}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="auth-hint" role="alert">{error}</p>}
    </section>
  );
}
