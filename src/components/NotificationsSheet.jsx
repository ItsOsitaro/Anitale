import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useSheet } from '@/hooks/use-sheet';
import AiringAlertList from '@/components/AiringAlertList';
import NotificationList from '@/components/NotificationList';

// The bell's list: notifications first, then today's airing episodes. A bottom sheet
// on phones, a centered dialog on desktop.
export default function NotificationsSheet({ open, onClose, alerts, notifications }) {
  const { t } = useSiteLang();
  const ref = useRef(null);
  useSheet(open, onClose, ref);

  // Opening the list counts as reading it.
  useEffect(() => {
    if (!open || !notifications?.unread) return undefined;
    const timer = window.setTimeout(() => notifications.markAllRead(), 900);
    return () => window.clearTimeout(timer);
  }, [open, notifications]);

  if (!open) return null;
  const hasNotifs = notifications?.items?.length > 0;
  const hasAiring = alerts?.items?.length > 0;
  return createPortal(
    <div className="filter-sheet__scrim follow-scrim" onClick={onClose} role="presentation">
      <div ref={ref} className="filter-sheet follow-sheet airing-sheet" role="dialog" aria-modal="true" aria-label={t('notifTitle')} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <div className="filter-sheet__grab"><div className="more-sheet__handle" aria-hidden="true" /></div>
        <div className="filter-sheet__head">
          <h2 className="filter-sheet__title">{t('notifTitle')}</h2>
          <button type="button" className="filter-sheet__close" onClick={onClose} aria-label={t('mcClose')}>
            <X width={20} height={20} aria-hidden="true" />
          </button>
        </div>
        <div className="filter-sheet__body">
          {!hasNotifs && !hasAiring && <p className="follow-sheet__note">{t('notifEmpty')}</p>}
          {hasNotifs && <NotificationList items={notifications.items} onNavigate={onClose} />}
          {hasAiring && (
            <section className="notif-section">
              <h3 className="notif-section__head">{t('airingToday')}</h3>
              <p className="airing-sheet__hint">{t('alertsHint')}</p>
              <AiringAlertList alerts={alerts} onNavigate={onClose} />
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
