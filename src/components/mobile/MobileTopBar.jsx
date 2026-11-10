import { Bell, ChevronRight, LogIn, Menu, Moon, Search, Sun } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { useTheme } from '@/theme-context.jsx';
import { cn } from 'cn';

export default function MobileTopBar({
  title,
  user,
  onSearch,
  onLogin,
  onAvatar,
  onBack,
  onMore,
  alerts,
  notifications,
  onAlerts,
  className,
}) {
  const { t } = useSiteLang();
  const { isDark, toggle } = useTheme();
  const bellCount = (alerts?.unread || 0) + (notifications?.unread || 0);

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
          <img className="mobile-topbar__logo logo-on-light" src="/logo-light.svg" alt="" aria-hidden="true" width={51} height={23} decoding="async" />
          <img className="mobile-topbar__logo logo-on-dark" src="/logo-dark.svg" alt="" aria-hidden="true" width={51} height={23} decoding="async" />
          <span className="mobile-topbar__title">{title ?? t('siteName')}</span>
        </NavLink>
      )}

      <div className="mobile-topbar__spacer" />

      <button
        type="button"
        className="mobile-topbar__search mobile-topbar__theme"
        onClick={toggle}
        aria-label={isDark ? t('themeOn') : t('themeOff')}
        aria-pressed={isDark}
      >
        {isDark
          ? <Sun width={20} height={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          : <Moon width={20} height={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
      </button>

      <button
        type="button"
        className="mobile-topbar__search"
        onClick={onSearch}
        aria-label={t('searchAria')}
      >
        <Search width={20} height={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </button>

      {user ? (
        <button
          type="button"
          className="mobile-topbar__search mobile-topbar__bell"
          onClick={onAlerts}
          aria-label={bellCount ? t('notifAria', { n: bellCount }) : t('notifTitle')}
        >
          <Bell width={20} height={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          {bellCount > 0 && <span className="mobile-topbar__badge" aria-hidden="true">{bellCount}</span>}
        </button>
      ) : null}

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
          <LogIn width={16} height={16} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" />
          <span>{t('authSubmitLogin')}</span>
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
