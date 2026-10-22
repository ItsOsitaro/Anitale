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
import './admin.css';

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
const IconBox = makeIcon([
  'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
  'M3.3 7l8.7 5 8.7-5', 'M12 22V12',
]);
const IconList = makeIcon([
  'M8 6h13', 'M8 12h13', 'M8 18h13',
  'M3 6h.01', 'M3 12h.01', 'M3 18h.01',
]);
const IconUser = makeIcon(['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'], [[12, 7, 4]]);

/* Sidebar sections: group key = i18n key, items share the route title keys. */
const NAV = [
  {
    group: 'navContent',
    items: [
      { to: '/admin', end: true, icon: IconFilm, key: 'titles' },
      { to: '/admin/manga', icon: IconBook, key: 'mangaNav' },
    ],
  },
  {
    group: 'navOps',
    items: [
      { to: '/admin/new', icon: IconPlus, key: 'newAnime' },
      { to: '/admin/bulk-import', icon: IconImport, key: 'bulkNav' },
      { to: '/admin/schedule', icon: IconCalendar, key: 'scheduleNav' },
    ],
  },
  {
    group: 'navPeople',
    items: [
      { to: '/admin/users', icon: IconUsers, key: 'siteUsers' },
    ],
  },
];

/* Topbar heading: derive the section label from the active route prefix. */
const titleFor = (pathname) => {
  if (pathname.startsWith('/admin/users')) return 'siteUsers';
  if (pathname.startsWith('/admin/schedule')) return 'scheduleNav';
  if (pathname.startsWith('/admin/bulk-import')) return 'bulkNav';
  if (pathname.startsWith('/admin/manga')) return 'mangaNav';
  if (pathname.startsWith('/admin/new') || pathname.startsWith('/admin/edit')) return 'newAnime';
  return 'titles';
};

export default function AdminApp({ theme, onThemeChange }) {
  const [lang, setLang] = useState(readLang);
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out
  const [configured, setConfigured] = useState(true);
  const [stats, setStats] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const t = useMemo(() => makeT(lang), [lang]);
  const location = useLocation();

  const toast = useCallback((message, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((entry) => entry.id !== id)), 5000);
  }, []);

  useEffect(() => {
    document.title = `${t('adminTitle')} | Anitale`;
  }, [t]);

  useEffect(() => {
    api.me().then((result) => setUser(result.user)).catch((err) => {
      setConfigured(err.data?.configured !== false);
      setUser(null);
    });
    const expired = () => { setUser(null); toast(t('sessionExpired'), 'error'); };
    window.addEventListener('admin-unauthorized', expired);
    return () => window.removeEventListener('admin-unauthorized', expired);
  }, [t, toast]);

  // Route changes always fold the mobile drawer away.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

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

  // Header overview stats (titles / users / list entries).
  useEffect(() => {
    if (!user) { setStats(null); return; }
    let alive = true;
    api.stats().then((result) => { if (alive) setStats(result); }).catch(() => { /* stats are cosmetic */ });
    return () => { alive = false; };
  }, [user]);

  const sidebar = user !== null && user !== undefined && (
    <aside className="adm-sidebar" id="adm-sidebar">
      <div className="adm-brand">
        <img className="brand-mark" src="/logo.svg" alt="" aria-hidden="true" width="38" height="38" />
        <span className="adm-brand-text">
          <strong>Anitale</strong>
          <small>{t('adminTitle')}</small>
        </span>
      </div>
      <nav className="adm-nav" aria-label="Admin">
        {NAV.map((group) => (
          <div className="adm-nav-group" key={group.group}>
            <span className="adm-nav-label">{t(group.group)}</span>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="adm-nav-link">
                <item.icon />
                <span>{t(item.key)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="adm-sidebar-foot">
        <Link className="adm-nav-link" to="/" target="_blank">
          <IconExternal />
          <span>{t('viewSite')}</span>
        </Link>
      </div>
    </aside>
  );

  const tools = user && (
    <div className="adm-header-tools">
      <select aria-label={t('theme')} value={theme} onChange={(e) => onThemeChange(e.target.value)}>
        <option value="light">{t('light')}</option>
        <option value="dark">{t('dark')}</option>
      </select>
      <button className="adm-btn" type="button" onClick={switchLang} aria-label="Language">{lang === 'fa' ? 'English' : 'فارسی'}</button>
      <button className="adm-btn" type="button" onClick={logout}>{t('logout')}</button>
    </div>
  );

  const statsBar = stats && (
    <div className="adm-stats" role="list">
      <div className="adm-stat" role="listitem"><IconBox /><strong>{stats.titles}</strong><span>{t('statsTitles')}</span></div>
      <div className="adm-stat" role="listitem"><IconUsers /><strong>{stats.users}</strong><span>{t('statsUsers')}</span></div>
      <div className="adm-stat" role="listitem"><IconList /><strong>{stats.listEntries}</strong><span>{t('statsEntries')}</span></div>
      <div className="adm-stat" role="listitem">
        <IconUser /><strong dir="ltr">{stats.lastUser?.username || '—'}</strong><span>{t('statsLastUser')}</span>
      </div>
    </div>
  );

  return (
    <AdminContext.Provider value={{ t, lang, toast }}>
      <div
        className={`admin-root${user ? '' : ' admin-guest'}`}
        data-nav-open={navOpen ? '' : undefined}
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
        lang={lang}
      >
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
            <main className="adm-main">
              {statsBar}
              <Routes>
                <Route index element={<AnimeList />} />
                <Route path="new" element={<AnimeForm key="new" />} />
                <Route path="edit/:slug" element={<AnimeForm key="edit" />} />
                <Route path="users" element={<SiteUsers />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="bulk-import" element={<BulkImport />} />
                <Route path="manga" element={<MangaList />} />
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
          {toasts.map((entry) => <div key={entry.id} className={`adm-toast ${entry.kind}`}>{entry.message}</div>)}
        </div>
      </div>
    </AdminContext.Provider>
  );
}
