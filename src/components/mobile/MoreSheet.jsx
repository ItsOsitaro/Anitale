import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { sidebarSections } from '@/sectionData';
import { L, useSiteLang } from '@/i18n';
import { useUser } from '@/user';
import { cn } from 'cn';

export default function MoreSheet({ open, onClose }) {
  const { t, lang } = useSiteLang();
  const dialogRef = useRef(null);
  const user = useUser();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="more-sheet__scrim" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('more')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="more-sheet__handle" aria-hidden="true" />
        <div className="more-sheet__groups">
          {sidebarSections.map((group) => (
            <section key={group.title.fa} className="more-sheet__group">
              <h3 className="more-sheet__group-title">{L(group.title, lang)}</h3>
              <div className="more-sheet__tiles">
                {group.links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="more-sheet__tile"
                    onClick={onClose}
                  >
                    {L(link.label, lang)}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="more-sheet__footer">
          <button type="button" className="more-sheet__footer-btn">{t('langButton')}</button>
          {user?.me && (
            <button
              type="button"
              className="more-sheet__footer-btn"
              onClick={() => { onClose(); user.logout(); }}
            >
              {t('dashLogout')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
