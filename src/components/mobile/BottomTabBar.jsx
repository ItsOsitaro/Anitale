import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, Home, LayoutGrid, ListChecks, Tv } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { cn } from 'cn';

const TABS = [
  { to: '/', key: 'breadcrumbHome', Icon: Home },
  { to: '/anime', key: 'breadcrumbAnime', Icon: Tv },
  { to: '/manga', key: 'breadcrumbManga', Icon: BookOpen },
  { to: '/dashboard', key: 'tabMyList', Icon: ListChecks },
];

export default function BottomTabBar({ onMore }) {
  const { t } = useSiteLang();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const onFocusIn = () => setKeyboardOpen(true);
    const onFocusOut = () => setKeyboardOpen(false);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    <nav
      className={cn('bottom-tabbar', keyboardOpen && 'is-keyboard-open')}
      aria-label={t('navMain')}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            cn('bottom-tabbar__link', isActive && 'is-active-tab')
          }
          aria-current={({ isActive }) => (isActive ? 'page' : undefined)}
        >
          <tab.Icon
            width={22}
            height={22}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="bottom-tabbar__icon"
            aria-hidden="true"
          />
          <span className="bottom-tabbar__label">{t(tab.key)}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className="bottom-tabbar__more"
        onClick={onMore}
        aria-label={t('more')}
      >
        <LayoutGrid
          width={22}
          height={22}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="bottom-tabbar__icon"
          aria-hidden="true"
        />
        <span className="bottom-tabbar__label">{t('more')}</span>
      </button>
    </nav>
  );
}
