import { useState } from 'react';
import './mobile.css';
import MobileTopBar from './MobileTopBar';
import BottomTabBar from './BottomTabBar';
import MoreSheet from './MoreSheet';

export default function MobileShell({ children }) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <>
      <MobileTopBar />
      <main className="mobile-shell__content">{children}</main>
      <BottomTabBar onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
