import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import AiringAlertList from '@/components/AiringAlertList';
import NotificationList from '@/components/NotificationList';
import { useAiringAlerts } from '@/hooks/use-airing-alerts';
import { useNotifications } from '@/hooks/use-notifications';
import { useSiteLang } from './i18n.js';
import { useUser } from './user.jsx';

const TABS = [['', 'notifTabAll'], ['titles', 'notifTabTitles'], ['social', 'notifTabSocial'], ['results', 'notifTabResults']];

// Full notification history (180 days): tabs, "mark all read", "clear read ones". The "all" tab also lists today's
// airing episodes, the one alert that is worked out in the browser, so nothing lives in two places.
export default function NotificationsPage() {
  const { t } = useSiteLang();
  const user = useUser();
  const [tab, setTab] = useState('');
  const notifications = useNotifications(Boolean(user.me), { tab, limit: 100 });
  const alerts = useAiringAlerts();
  useEffect(() => { document.title = `${t('notifTitle')} · ${t('siteName')}`; }, [t]);

  if (user.meLoaded && !user.me) return <main className="stacks-shell"><h1>{t('notifTitle')}</h1><p><Link to="/login">{t('navAuth')}</Link></p></main>;
  const showAiring = tab === '' && alerts.items.length > 0;
  const empty = notifications.loaded && notifications.items.length === 0 && !showAiring;
  return (
    <main className="stacks-shell notif-page">
      <h1>{t('notifTitle')}</h1>
      <div className="notif-page__bar">
        <div className="notif-tabs" role="tablist" aria-label={t('notifTitle')}>
          {TABS.map(([key, label]) => (
            <button key={key || 'all'} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{t(label)}</button>
          ))}
        </div>
        <div className="notif-page__actions">
          <Button type="button" variant="outline" size="sm" disabled={!notifications.unread} onClick={() => notifications.markAllRead().then(notifications.reload)}>{t('notifMarkAll')}</Button>
          <Button type="button" variant="outline" size="sm" disabled={!notifications.items.length} onClick={() => notifications.clear(false)}>{t('notifClear')}</Button>
        </div>
      </div>
      {showAiring && (
        <section className="notif-section">
          <h2 className="notif-section__head">{t('airingToday')}</h2>
          <AiringAlertList alerts={alerts} />
        </section>
      )}
      {notifications.items.length > 0 && <NotificationList items={notifications.items} />}
      {empty && <p className="extras-muted">{tab ? t('notifNone') : t('notifEmpty')}</p>}
      <p className="extras-muted">{t('notifRetention')} <Link to="/account">{t('notifPrefsHead')}</Link></p>
    </main>
  );
}
