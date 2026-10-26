import { ChevronRight, LogIn, Menu, Search, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { cn } from 'cn';

export default function MobileTopBar({
  title,
  user,
  onSearch,
  onLogin,
  onAvatar,
  onBack,
  onMore,
  className,
}) {
  const { t } = useSiteLang();

  return (
    <header className={cn('mobile-topbar', className)} aria-label="نوار بالای صفحه">
      {onBack ? (
        <button
          type="button"
          className="mobile-topbar__icon-btn mobile-topbar__back"
          onClick={onBack}
          aria-label="بازگشت"
        >
          <ChevronRight width={20} height={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </button>
      ) : (
        <NavLink to="/" end className="mobile-topbar__brand" aria-label={t('brandAria')}>
          <div className="mobile-topbar__logo" aria-hidden="true" />
          <span className="mobile-topbar__title">{title ?? t('siteName')}</span>
        </NavLink>
      )}

      <div className="mobile-topbar__spacer" />

      <button
        type="button"
        className="mobile-topbar__search"
        onClick={onSearch}
        aria-label={t('searchAria')}
      >
        <Search width={20} height={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </button>

      {user ? (
        <button type="button" className="mobile-topbar__avatar" onClick={onAvatar} aria-label={t('userKind')}>
          {user.avatarUrl ? (
            <img
              className="mobile-topbar__avatar-img"
              src={user.avatarUrl}
              alt=""
              width={36}
              height={36}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="mobile-topbar__avatar-initials">
              {typeof user.name === 'string' && user.name.length > 0 ? user.name[0] : '?'}
            </span>
          )}
        </button>
      ) : (
        <button type="button" className="mobile-topbar__login" onClick={onLogin} aria-label={t('authSubmitLogin')}>
          {t('authSubmitLogin')}
        </button>
      )}

      {onMore ? (
        <button
          type="button"
          className="mobile-topbar__icon-btn mobile-topbar__more"
          onClick={onMore}
          aria-label={t('more')}
        >
          <Menu width={20} height={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </button>
      ) : null}
    </header>
  );
}
