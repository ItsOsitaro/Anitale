import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './mobile.css';
import MobileTopBar from './MobileTopBar';
import BottomTabBar from './BottomTabBar';
import MoreSheet from './MoreSheet';
import MobileSearchOverlay from './MobileSearchOverlay';
import NotificationsSheet from '../NotificationsSheet';
import { useNotifications } from '@/hooks/use-notifications';
import { useAiringAlerts } from '@/hooks/use-airing-alerts';
import { useUser } from '@/user';

// Pages that are a focused form: no bottom tab bar (spec 5.8).
const FOCUSED_ROUTES = ['/login', '/register'];

export default function MobileShell({ children }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alerts = useAiringAlerts();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const me = user?.me;
  const notifications = useNotifications(Boolean(me));
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Any navigation closes overlays (e.g. tapping a search result).
  useEffect(() => {
    setSearchOpen(false);
    setMoreOpen(false);
    setAlertsOpen(false);
  }, [pathname]);

  const focused = FOCUSED_ROUTES.includes(pathname);

  return (
    <>
      <MobileTopBar
        user={me ? { name: me.username } : null}
        alerts={alerts}
        notifications={notifications}
        onAlerts={() => setAlertsOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onLogin={() => navigate('/login')}
        onAvatar={() => navigate('/dashboard')}
      />
      <main className="mobile-shell__content" style={{ paddingBottom: focused ? 'calc(24px + env(safe-area-inset-bottom))' : 'calc(66px + 12px + env(safe-area-inset-bottom) + 16px)' }}>{children}</main>
      {!focused && <BottomTabBar onMore={() => setMoreOpen(true)} />}
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <MobileSearchOverlay open={searchOpen} onClose={closeSearch} />
      <NotificationsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} alerts={alerts} notifications={notifications} />
    </>
  );
}
