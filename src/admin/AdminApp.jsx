import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
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

export default function AdminApp({ theme, onThemeChange }) {
  const [lang, setLang] = useState(readLang);
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out
  const [configured, setConfigured] = useState(true);
  const [stats, setStats] = useState(null);
  const [toasts, setToasts] = useState([]);
  const t = useMemo(() => makeT(lang), [lang]);

  const toast = useCallback((message, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((entry) => entry.id !== id)), 5000);
  }, []);

  useEffect(() => {
    document.title = `${t('adminTitle')} | MAL Clone`;
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

  return (
    <AdminContext.Provider value={{ t, lang, toast }}>
      <div className="admin-root" dir={lang === 'fa' ? 'rtl' : 'ltr'} lang={lang}>
        <header className="adm-header">
          <Link className="adm-brand" to="/admin"><span className="brand-mark">M</span> {t('adminTitle')}</Link>
          {user && (
            <nav className="adm-nav" aria-label="Admin">
              <NavLink to="/admin" end>{t('titles')}</NavLink>
              <NavLink to="/admin/new">{t('newAnime')}</NavLink>
              <NavLink to="/admin/users">{t('siteUsers')}</NavLink>
              <NavLink to="/admin/schedule">{t('scheduleNav')}</NavLink>
              <NavLink to="/admin/bulk-import">{t('bulkNav')}</NavLink>
              <NavLink to="/admin/manga">{t('mangaNav')}</NavLink>
              <Link to="/" target="_blank">{t('viewSite')}</Link>
            </nav>
          )}
          <div className="adm-header-tools">
            <select aria-label={t('theme')} value={theme} onChange={(e) => onThemeChange(e.target.value)}>
              <option value="light">{t('light')}</option>
              <option value="dark">{t('dark')}</option>
            </select>
            <button className="adm-btn" type="button" onClick={switchLang} aria-label="Language">{lang === 'fa' ? 'English' : 'فارسی'}</button>
            {user && <button className="adm-btn" type="button" onClick={logout}>{t('logout')}</button>}
          </div>
        </header>
        <main className="adm-main">
          {user === undefined ? <p className="adm-empty">{t('loading')}</p> : user === null ? <Login onLogin={setUser} configured={configured} /> : (
            <>
              {stats && (
                <div className="adm-stats" role="list">
                  <div className="adm-stat" role="listitem"><strong>{stats.titles}</strong><span>{t('statsTitles')}</span></div>
                  <div className="adm-stat" role="listitem"><strong>{stats.users}</strong><span>{t('statsUsers')}</span></div>
                  <div className="adm-stat" role="listitem"><strong>{stats.listEntries}</strong><span>{t('statsEntries')}</span></div>
                  <div className="adm-stat" role="listitem">
                    <strong dir="ltr">{stats.lastUser?.username || '—'}</strong><span>{t('statsLastUser')}</span>
                  </div>
                </div>
              )}
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
            </>
          )}
        </main>
        <div className="adm-toasts" aria-live="polite">
          {toasts.map((entry) => <div key={entry.id} className={`adm-toast ${entry.kind}`}>{entry.message}</div>)}
        </div>
      </div>
    </AdminContext.Provider>
  );
}
