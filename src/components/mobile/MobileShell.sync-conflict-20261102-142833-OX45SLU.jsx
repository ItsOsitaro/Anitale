import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './mobile.css';
import MobileTopBar from './MobileTopBar';
import BottomTabBar from './BottomTabBar';
import MoreSheet from './MoreSheet';
import MobileSearchOverlay from './MobileSearchOverlay';
import { useUser } from '@/user';

// Pages that are a focused form: no bottom tab bar (spec 5.8).
const FOCUSED_ROUTES = ['/login', '/register'];

export default function MobileShell({ children }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const me = user?.me;
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Any navigation closes overlays (e.g. tapping a search result).
  useEffect(() => {
    setSearchOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  const focused = FOCUSED_ROUTES.includes(pathname);

  return (
    <>
      <MobileTopBar
        user={me ? { name: me.username } : null}
        onSearch={() => setSearchOpen(true)}
        onLogin={() => navigate('/login')}
        onAvatar={() => navigate('/dashboard')}
      />
      <main className="mobile-shell__content" style={{ paddingBottom: focused ? 'calc(24px + env(safe-area-inset-bottom))' : 'calc(66px + 12px + env(safe-area-inset-bottom) + 16px)' }}>{children}</main>
      {!focused && <BottomTabBar onMore={() => setMoreOpen(true)} />}
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <MobileSearchOverlay open={searchOpen} onClose={closeSearch} />
    </>
  );
}
