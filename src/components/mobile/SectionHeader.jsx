import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { cn } from 'cn';

export default function SectionHeader({ title, to, className }) {
  const { t, lang } = useSiteLang();
  return (
    <div className={cn('mobile-section-head', className)}>
      <h2 className="mobile-section-head__title">{title}</h2>
      {to && (
        <Link
          to={to}
          className="mobile-section-head__all"
          aria-label={t('browseAll')}
        >
          {t('browseAll')}
          <span aria-hidden="true" style={{ direction: lang }}>
            {lang === 'fa' ? '‹' : '›'}
          </span>
        </Link>
      )}
    </div>
  );
}
