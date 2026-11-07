import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { AdminContext } from './context.js';
import { makeT } from './i18n.js';
import Login from './Login.jsx';
import AnimeList from './AnimeList.jsx';
import AnimeForm from './AnimeForm.jsx';
import SiteUsers from './SiteUsers.jsx';
import Schedule from './Schedule.jsx';
import MangaList from './MangaList.jsx';
import BulkImport from './BulkImport.jsx';
import QuickAdd from './QuickAdd.jsx';
import MissingTitles from './MissingTitles.jsx';
import AutoImport from './AutoImport.jsx';
import HealthPage from './HealthPage.jsx';
import VpnPage from './VpnPage.jsx';
import Translation from './Translation.jsx';
import ReviewQueue from './ReviewQueue.jsx';
import UserReviews from './UserReviews.jsx';
import UserRecs from './UserRecs.jsx';
import Suggestions from './Suggestions.jsx';
import ActivityLog from './ActivityLog.jsx';
import Dashboard from './Dashboard.jsx';
import AdminsPage from './AdminsPage.jsx';
import AccountPage from './AccountPage.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import Palette from './Palette.jsx';
import './admin.css';
import './pages/shell.css';
import './pages/catalog.css';
import './pages/import.css';
import './pages/translate.css';
import './pages/community.css';
import './pages/system.css';
import './pages/review-1.css';
import './pages/review-2.css';
import './pages/review-3.css';
import './pages/review-4.css';
import './pages/review-5.css';
import './pages/review-6.css';
import './pages/review-7.css';

const readLang = () => {
  try { return localStorage.getItem('adminLang') === 'en' ? 'en' : 'fa'; } catch { return 'fa'; }
};

/* Stroke icon set (lucide-style paths, drawn inline - no icon dependency). */
const makeIcon = (paths, circles = []) =>
  function Icon() {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {paths.map((d, index) => <path key={index} d={d} />)}
        {circles.map(([cx, cy, r], index) => <circle key={index} cx={cx} cy={cy} r={r} />)}
      </svg>
    );
  };

const IconFilm = makeIcon([
  'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  'M7 3v18', 'M3 8h4', 'M17 8h4', 'M3 16h4', 'M17 16h4', 'M7 12h10',
]);
const IconBook = makeIcon(['M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20']);
const IconPlus = makeIcon(['M12 5v14', 'M5 12h14']);
const IconImport = makeIcon([
  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
  'M7 10l5 5 5-5', 'M12 15V3',
]);
const IconCalendar = makeIcon([
  'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  'M8 2v4', 'M16 2v4', 'M3 10h18',
]);
const IconUsers = makeIcon([
  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
  'M22 21v-2a4 4 0 0 0-3-3.87',
  'M16 3.13a4 4 0 0 1 0 7.75',
], [[9, 7, 4]]);
const IconExternal = makeIcon([
  'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  'M15 3h6v6', 'M10 14 21 3',
]);
const IconMenu = makeIcon(['M4 6h16', 'M4 12h16', 'M4 18h16']);
const IconX = makeIcon(['M18 6 6 18', 'M6 6l12 12']);
const IconPulse = makeIcon(['M3 12h4l3-8 4 16 3-8h4']);
const IconBox = makeIcon([
  'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
  'M3.3 7l8.7 5 8.7-5', 'M12 22V12',
]);
const IconList = makeIcon([
  'M8 6h13', 'M8 12h13', 'M8 18h13',
  'M3 6h.01', 'M3 12h.01', 'M3 18h.01',
]);
const IconTranslate = makeIcon([
  'M5 8l6 6',
  'M4 14l6-6 2-3',
  'M2 5h12',
  'M7 2h1',
  'M22 22l-5-10-5 10',
  'M14 18h6',
]);
const IconCheckList = makeIcon(['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11']);
const IconUser = makeIcon(['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'], [[12, 7, 4]]);
const IconHome = makeIcon(['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6']);
const IconKey = makeIcon(['M21 2l-2 2', 'M15.5 7.5 19 4', 'M11.4 11.6 21 2'], [[7.5, 15.5, 5.5]]);
const IconBolt = makeIcon(['M13 2 3 14h9l-1 8 10-12h-9l1-8z']);
const IconRefresh = makeIcon(['M3 12a9 9 0 0 1 15-6.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15 6.7L3 16', 'M3 21v-5h5']);
const IconSearch = makeIcon(['M21 21l-4.3-4.3'], [[11, 11, 8]]);
const IconShield = makeIcon(['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z']);
const IconChat = makeIcon(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']);
const IconHeart = makeIcon(['M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z']);
const IconEdit = makeIcon(['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z']);
const IconClock = makeIcon(['M12 6v6l4 2'], [[12, 12, 10]]);
const IconSun = makeIcon(['M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'], [[12, 12, 4]]);
const IconMoon = makeIcon(['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z']);

/* Sidebar sections: group key = i18n key, items share the route title keys. */
// perm = the permission area needed to see the item (owner-only items use 'owner').
const NAV = [
  {
    group: 'navHome',
    items: [
      { to: '/admin', end: true, icon: IconHome, key: 'dashNav', perm: 'any' },
    ],
  },
  {
    group: 'navContent',
    items: [
      { to: '/admin/anime', icon: IconFilm, key: 'titles', perm: 'catalog' },
      { to: '/admin/manga', icon: IconBook, key: 'mangaNav', perm: 'catalog' },
    ],
  },
  {
    group: 'navOps',
    items: [
      { to: '/admin/new', icon: IconPlus, key: 'newAnime', perm: 'catalog' },
      { to: '/admin/quick-add', icon: IconBolt, key: 'quickNav', perm: 'import' },
      { to: '/admin/bulk-import', icon: IconImport, key: 'bulkNav', perm: 'import' },
      { to: '/admin/auto-import', icon: IconRefresh, key: 'autoNav', perm: 'import' },
      { to: '/admin/missing', icon: IconSearch, key: 'missNav', badge: 'missing', perm: 'community' },
      { to: '/admin/vpn', icon: IconShield, key: 'vpnNav', perm: 'system' },
      { to: '/admin/health', icon: IconPulse, key: 'hlNav', perm: 'system' },
      { to: '/admin/translate', end: true, icon: IconTranslate, key: 'translateNav', perm: 'translate' },
      { to: '/admin/translate/review', icon: IconCheckList, key: 'reviewNav', perm: 'translate' },
      { to: '/admin/schedule', icon: IconCalendar, key: 'scheduleNav', perm: 'catalog' },
      { to: '/admin/log', icon: IconClock, key: 'navLog', perm: 'system' },
    ],
  },
  {
    group: 'navPeople',
    items: [
      { to: '/admin/users', icon: IconUsers, key: 'siteUsers', perm: 'users' },
      { to: '/admin/reviews', icon: IconChat, key: 'rvNav', perm: 'community' },
      { to: '/admin/recs', icon: IconHeart, key: 'rcNav', perm: 'community' },
      { to: '/admin/suggestions', icon: IconEdit, key: 'sgNav', badge: 'suggestions', perm: 'community' },
    ],
  },
  {
    group: 'navAccess',
    items: [
      { to: '/admin/admins', icon: IconKey, key: 'adminsNav', perm: 'owner' },
    ],
  },
];

/* Topbar heading: derive the section label from the active route prefix. */
const titleFor = (pathname) => {
  if (pathname === '/admin' || pathname === '/admin/') return 'dashNav';
  if (pathname.startsWith('/admin/admins')) return 'adminsNav';
  if (pathname.startsWith('/admin/account')) return 'accountNav';
  if (pathname.startsWith('/admin/anime')) return 'titles';
  if (pathname.startsWith('/admin/log')) return 'navLog';
  if (pathname.startsWith('/admin/users')) return 'siteUsers';
  if (pathname.startsWith('/admin/reviews')) return 'rvNav';
  if (pathname.startsWith('/admin/recs')) return 'rcNav';
  if (pathname.startsWith('/admin/suggestions')) return 'sgNav';
  if (pathname.startsWith('/admin/schedule')) return 'scheduleNav';
  if (pathname.startsWith('/admin/bulk-import')) return 'bulkNav';
  if (pathname.startsWith('/admin/quick-add')) return 'quickNav';
  if (pathname.startsWith('/admin/auto-import')) return 'autoNav';
  if (pathname.startsWith('/admin/missing')) return 'missNav';
  if (pathname.startsWith('/admin/vpn')) return 'vpnNav';
  if (pathname.startsWith('/admin/health')) return 'hlNav';
  if (pathname.startsWith('/admin/translate/review')) return 'reviewNav';
  if (pathname.startsWith('/admin/translate')) return 'translateNav';
  if (pathname.startsWith('/admin/manga')) return 'mangaNav';
  if (pathname.startsWith('/admin/edit')) return 'editAnime';
  if (pathname.startsWith('/admin/new')) return 'newAnime';
  return 'dashNav';
};

export default function AdminApp({ theme, onThemeChange }) {
  const [lang, setLang] = useState(readLang);
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out
  const [me, setMe] = useState(null); // { username, owner, permissions }
  const [configured, setConfigured] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [overview, setOverview] = useState(null);
  const [dialog, setDialog] = useState(null); // { message, resolve }
  const [paletteOpen, setPaletteOpen] = useState(false);
  const t = useMemo(() => makeT(lang), [lang]);
  const location = useLocation();

  const toast = useCallback((message, kind = 'ok') => {
    const id = Date.now() + Math.random();
    // Identical messages collapse into one toast and at most 4 are stacked.
    setToasts((list) => [...list.filter((entry) => !(entry.message === message && entry.kind === kind)), { id, message, kind }].slice(-4));
    // Errors stay longer: they are the ones people need time to read.
    setTimeout(() => setToasts((list) => list.filter((entry) => entry.id !== id)), kind === 'error' ? 9000 : 5000);
  }, []);
  const dismissToast = (id) => setToasts((list) => list.filter((entry) => entry.id !== id));

  // Styled replacement for window.confirm: await confirm('...') -> true / false.
  // Optional second argument: { danger: true, okLabel: 'Delete' } for destructive prompts.
  const confirm = useCallback((message, options = {}) => new Promise((resolve) => setDialog({ message, options, resolve })), []);
  const answerDialog = useCallback((value) => setDialog((current) => { current?.resolve(value); return null; }), []);

  useEffect(() => {
    document.title = `${t(titleFor(location.pathname))} · ${t('adminTitle')} | Anitale`;
  }, [t, location.pathname]);

  useEffect(() => {
    api.me().then((result) => { setUser(result.user); setMe(result.admin || null); }).catch((err) => {
      setConfigured(err.data?.configured !== false);
      setUser(null);
    });
    const expired = () => { setUser(null); toast(t('sessionExpired'), 'error'); };
    const forbidden = () => toast(t('noPermissionToast'), 'error');
    window.addEventListener('admin-unauthorized', expired);
    window.addEventListener('admin-forbidden', forbidden);
    return () => { window.removeEventListener('admin-unauthorized', expired); window.removeEventListener('admin-forbidden', forbidden); };
  }, [t, toast]);

  // Route changes fold the mobile drawer away and move keyboard/screen-reader focus to the new page.
  useEffect(() => {
    setNavOpen(false);
    document.getElementById('adm-main')?.focus({ preventScroll: true });
  }, [location.pathname]);

  // Offline banner: writes would fail anyway, so say so instead of showing random red toasts.
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // The page behind the open mobile drawer must not scroll.
  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [navOpen]);

  // Esc closes the drawer.
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const switchLang = () => {
    const next = lang === 'fa' ? 'en' : 'fa';
    setLang(next);
    try { localStorage.setItem('adminLang', next); } catch { /* ignore */ }
  };

  const logout = async () => { try { await api.logout(); } finally { setUser(null); } };


  // Sidebar badges (pending suggestions / requested titles) refresh every minute.
  useEffect(() => {
    if (!user) { setOverview(null); return undefined; }
    let alive = true;
    const load = () => api.overview().then((result) => { if (alive) setOverview(result); }).catch(() => { /* badges are cosmetic */ });
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [user]);

  // Ctrl/Cmd+K opens the quick-jump palette; "/" focuses the page's search box.
  useEffect(() => {
    if (!user) return undefined;
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); return; }
      const tag = document.activeElement?.tagName;
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !document.activeElement?.isContentEditable) {
        const box = document.querySelector('.adm-main input[type="search"]');
        if (box) { event.preventDefault(); box.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user]);

  // can('catalog') = may view, can('catalog', 'edit') = may change. The owner can do everything.
  const can = useCallback((area, level = 'view') => {
    if (!me) return false;
    if (me.owner) return true;
    const rank = { view: 1, edit: 2 };
    return (rank[me.permissions?.[area]] || 0) >= rank[level];
  }, [me]);

  // Items the signed-in admin may open: 'any' = everyone, 'owner' = owner only, else a permission area.
  const allowed = useCallback((perm) => (perm === 'any' ? Boolean(me) : perm === 'owner' ? Boolean(me?.owner) : can(perm)), [me, can]);
  const visibleNav = useMemo(() => NAV.map((group) => ({ ...group, items: group.items.filter((item) => allowed(item.perm)) })).filter((group) => group.items.length > 0), [allowed]);
  const paletteItems = useMemo(() => [
    ...visibleNav.flatMap((group) => group.items.map((item) => ({ to: item.to, label: t(item.key), group: t(group.group) }))),
    ...(me ? [{ to: '/admin/account', label: t('accountNav'), group: t('navAccess') }] : []),
  ], [visibleNav, t, me]);
  // Route wrapper: the page itself, or a "no access" panel that names the missing area and offers a way out.
  const guard = (perm, element) => (allowed(perm) ? element : (
    <div className="adm-card adm-noaccess" role="alert">
      <div className="adm-noaccess-icon" aria-hidden="true"><IconShield /></div>
      <h2>{t('noAccessTitle')}</h2>
      <p className="adm-muted">{t('noAccessText')}</p>
      {perm !== 'any' && <p className="adm-muted">{t('noAccessNeeds', { area: perm === 'owner' ? t('adminsOwner') : t(`area${perm[0].toUpperCase()}${perm.slice(1)}`) })}</p>}
      <Link className="adm-btn adm-primary" to="/admin">{t('dashNav')}</Link>
    </div>
  ));

  const sidebar = user !== null && user !== undefined && (
    <aside className="adm-sidebar" id="adm-sidebar">
      <div className="adm-brand">
        <img className="brand-mark" src="/logo.svg" alt="" aria-hidden="true" width="38" height="38" />
        <span className="adm-brand-text">
          <strong>Anitale</strong>
          <small>{t('adminTitle')}</small>
        </span>
      </div>
      <nav className="adm-nav" aria-label={t('adminTitle')}>
        {visibleNav.map((group) => (
          <div className="adm-nav-group" key={group.group}>
            <span className="adm-nav-label">{t(group.group)}</span>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="adm-nav-link">
                <item.icon />
                <span>{t(item.key)}</span>
                {item.badge && overview?.badges?.[item.badge] > 0 && <span className="adm-badge" aria-label={String(overview.badges[item.badge])}>{overview.badges[item.badge]}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="adm-sidebar-foot">
        {me && (
          <NavLink className="adm-nav-link adm-nav-me" to="/admin/account">
            <IconUser />
            <span className="adm-nav-me-text"><strong dir="ltr">{me.username}</strong><small>{me.owner ? t('dashRoleOwner') : t('dashRoleAdmin')}</small></span>
          </NavLink>
        )}
        <Link className="adm-nav-link" to="/" target="_blank" rel="noopener">
          <IconExternal />
          <span>{t('viewSite')}</span>
        </Link>
      </div>
    </aside>
  );

  const tools = user && (
    <div className="adm-header-tools">
      <button className="adm-btn adm-palette-btn" type="button" onClick={() => setPaletteOpen(true)} title={t('shortcutSearch')}>
        <IconSearch /><span>{t('paletteHint')}</span>
      </button>
      <button className="adm-iconbtn" type="button" aria-label={t('theme')} title={t('theme')} onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
      <button className="adm-btn" type="button" onClick={switchLang} aria-label={t('langSwitch')} lang={lang === 'fa' ? 'en' : 'fa'}>{lang === 'fa' ? 'English' : 'فارسی'}</button>
      <Link className="adm-who" dir="ltr" to="/admin/account" title={t('accountNav')}>{typeof user === 'string' ? user : ''}</Link>
      <button className="adm-btn" type="button" onClick={logout}>{t('logout')}</button>
    </div>
  );


  return (
    <AdminContext.Provider value={{ t, lang, toast, confirm, overview, can, me }}>
      <div
        className={`admin-root${user ? '' : ' admin-guest'}`}
        data-nav-open={navOpen ? '' : undefined}
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
        lang={lang}
      >
        <a className="adm-skip" href="#adm-main">{t('skipToContent')}</a>
        {!online && <div className="adm-offline" role="alert">{t('offline')}</div>}
        {sidebar}
        {user && navOpen && (
          <div className="adm-overlay" onClick={() => setNavOpen(false)} aria-hidden="true" />
        )}
        {user ? (
          <div className="adm-content">
            <header className="adm-topbar">
              <button
                className="adm-iconbtn adm-menu-btn"
                type="button"
                aria-expanded={navOpen}
                aria-controls="adm-sidebar"
                aria-label={navOpen ? t('closeMenu') : t('menu')}
                onClick={() => setNavOpen((open) => !open)}
              >
                {navOpen ? <IconX /> : <IconMenu />}
              </button>
              <span className="adm-crumb">{t(titleFor(location.pathname))}</span>
              {tools}
            </header>
            <main className="adm-main" id="adm-main" tabIndex={-1}>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="anime" element={guard('catalog', <AnimeList />)} />
                <Route path="new" element={guard('catalog', <AnimeForm key="new" />)} />
                <Route path="edit/:slug" element={guard('catalog', <AnimeForm key="edit" />)} />
                <Route path="manga" element={guard('catalog', <MangaList />)} />
                <Route path="schedule" element={guard('catalog', <Schedule />)} />
                <Route path="quick-add" element={guard('import', <QuickAdd />)} />
                <Route path="bulk-import" element={guard('import', <BulkImport />)} />
                <Route path="auto-import" element={guard('import', <AutoImport />)} />
                <Route path="missing" element={guard('community', <MissingTitles />)} />
                <Route path="reviews" element={guard('community', <UserReviews />)} />
                <Route path="recs" element={guard('community', <UserRecs />)} />
                <Route path="suggestions" element={guard('community', <Suggestions />)} />
                <Route path="users" element={guard('users', <SiteUsers />)} />
                <Route path="translate" element={guard('translate', <Translation />)} />
                <Route path="translate/review" element={guard('translate', <ReviewQueue />)} />
                <Route path="health" element={guard('system', <HealthPage />)} />
                <Route path="vpn" element={guard('system', <VpnPage />)} />
                <Route path="log" element={guard('system', <ActivityLog />)} />
                <Route path="admins" element={guard('owner', <AdminsPage />)} />
                <Route path="account" element={<AccountPage />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </main>
          </div>
        ) : user === undefined ? (
          <main className="adm-main adm-guest-main"><p className="adm-empty">{t('loading')}</p></main>
        ) : (
          <main className="adm-main adm-guest-main">
            <div className="adm-login-wrap">
              <div className="adm-login-brand">
                <img className="brand-mark brand-mark-lg" src="/logo.svg" alt="" aria-hidden="true" width="54" height="54" />
              </div>
              <Login onLogin={setUser} configured={configured} />
            </div>
          </main>
        )}
        <div className="adm-toasts" aria-live="polite">
          {toasts.map((entry) => (
            <div key={entry.id} className={`adm-toast ${entry.kind}`} role={entry.kind === 'error' ? 'alert' : 'status'}>
              <span>{entry.message}</span>
              <button type="button" className="adm-toast-x" aria-label={t('toastClose')} onClick={() => dismissToast(entry.id)}>×</button>
            </div>
          ))}
        </div>
        {dialog && <ConfirmDialog message={dialog.message} options={dialog.options} t={t} onAnswer={answerDialog} />}
        {paletteOpen && user && <Palette items={paletteItems} t={t} onClose={() => setPaletteOpen(false)} />}
      </div>
    </AdminContext.Provider>
  );
}
