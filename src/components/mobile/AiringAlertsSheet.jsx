import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useSheet } from '@/hooks/use-sheet';
import AiringAlertList from '@/components/AiringAlertList';

export default function AiringAlertsSheet({ open, onClose, alerts }) {
  const { t } = useSiteLang();
  const ref = useRef(null);
  useSheet(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div className="filter-sheet__scrim" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="filter-sheet airing-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('airingToday')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="filter-sheet__grab"><div className="more-sheet__handle" aria-hidden="true" /></div>
        <div className="filter-sheet__head">
          <h2 className="filter-sheet__title">{t('airingToday')}</h2>
          <button type="button" className="filter-sheet__close" onClick={onClose} aria-label={t('mcClose')}>
            <X width={20} height={20} aria-hidden="true" />
          </button>
        </div>
        <div className="filter-sheet__body">
          <p className="airing-sheet__hint">{t('alertsHint')}</p>
          <AiringAlertList alerts={alerts} onNavigate={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
