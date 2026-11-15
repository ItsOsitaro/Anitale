import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { useSiteLang } from '@/i18n';

export default function JumpToTop({ threshold = 600 }) {
  const { t } = useSiteLang();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const checkScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setVisible(window.scrollY > threshold);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => window.removeEventListener('scroll', checkScroll);
  }, [threshold]);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="detail-jump-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label={t('jumpToTop')}
      title={t('jumpToTop')}
    >
      <ChevronUp width={20} height={20} aria-hidden="true" />
    </button>
  );
}
