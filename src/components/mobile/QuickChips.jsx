import { NavLink, useLocation } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { cn } from 'cn';

const CHIPS = [
  { labelKey: 'airingToday', to: '/episodes' },
  { labelKey: 'chipSeason', to: '/seasonal' },
  { labelKey: 'chipTop', to: '/top/anime' },
  { labelKey: 'chipLatest', to: '/anime' },
  { labelKey: 'chipNews', to: '/news' },
];

export default function QuickChips() {
  const { t } = useSiteLang();
  const { pathname } = useLocation();
  return (
    <div className="mobile-quick-chips">
      {CHIPS.map((chip) => (
        <NavLink
          key={chip.to}
          to={chip.to}
          end={chip.to === '/'}
          className={({ isActive }) => cn('mobile-chip', isActive && 'is-active')}
        >
          {t(chip.labelKey)}
        </NavLink>
      ))}
    </div>
  );
}
