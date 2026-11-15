import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Share2, Image, Edit3, AlertCircle } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user.jsx';
import { Button } from '@/components/ui/button';
import { SuggestEditDialog } from './SuggestEdit.jsx';

export default function TitleMoreActions({ item, mediaType, onShare, onShareCard, shareNote, glass = false }) {
  const { t } = useSiteLang();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [suggestModal, setSuggestModal] = useState({ open: false, kind: 'synopsis' });
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleOpenSuggest = (kind) => {
    setOpen(false);
    if (!user.me) {
      window.location.href = '/login';
      return;
    }
    setSuggestModal({ open: true, kind });
  };

  return (
    <div className={`detail-more-actions${glass ? ' is-glass' : ''}`} ref={menuRef}>
      {glass ? (
        <button
          className="mobile-detail__glass"
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t('moreActions')}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal width={18} height={18} aria-hidden="true" />
        </button>
      ) : (
        <Button
          className="detail-more-actions-btn"
          variant="outline"
          size="sm"
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal width={16} height={16} aria-hidden="true" />
          <span>{t('moreActions')}</span>
        </Button>
      )}

      {open && (
        <div className="detail-more-actions-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="detail-more-actions-item"
            onClick={() => {
              setOpen(false);
              onShare?.();
            }}
          >
            <Share2 width={15} height={15} aria-hidden="true" />
            <span>{t('shareTitle')}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="detail-more-actions-item"
            onClick={() => {
              setOpen(false);
              onShareCard?.();
            }}
          >
            <Image width={15} height={15} aria-hidden="true" />
            <span>{t('cardOpen')}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="detail-more-actions-item"
            onClick={() => handleOpenSuggest('synopsis')}
          >
            <Edit3 width={15} height={15} aria-hidden="true" />
            <span>{t('sugButton')}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="detail-more-actions-item"
            onClick={() => handleOpenSuggest('report')}
          >
            <AlertCircle width={15} height={15} aria-hidden="true" />
            <span>{t('sugKindReport')}</span>
          </button>
        </div>
      )}

      {/* Rendered outside `open` so closing the menu doesn't unmount the dialog */}
      {suggestModal.open && (
        <SuggestEditDialog
          item={item}
          mediaType={mediaType}
          initialKind={suggestModal.kind}
          onClose={() => setSuggestModal({ open: false, kind: 'synopsis' })}
        />
      )}

      {shareNote && <span className="detail-share-note" role="status">{shareNote}</span>}
    </div>
  );
}
