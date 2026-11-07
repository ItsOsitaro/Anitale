import { splitGenres, splitInfoRows } from '@/lib/genre-kinds';
import { FavoriteButton } from '@/components/Favorites';
import WatchOrder from '@/components/WatchOrder';
import React, { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import uniq from 'lodash/uniq.js';
import sortBy from 'lodash/sortBy.js';
import { A11y, Navigation } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import NumberTicker from '@/components/tarhak/NumberTicker.jsx';
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
import { loadAnimeCatalog, loadMangaCatalog, buildSchedule, mediaHref, foldTitle, currentWeekday, WEEKDAY_ORDER } from './catalog.js';
import { CatalogContext, MangaCatalogContext, useCatalog, useMangaCatalog, useVisibleCatalog, useVisibleMangaCatalog, withMangaImages } from './catalog-context.jsx';
import { getShowSensitive, isSensitive, rankKey, setShowSensitive, useShowSensitive } from './lib/catalog-rules.js';
import { useUser, UserProvider } from './user.jsx';
import { useTitleExtras, hasAny, ExtrasSkeleton, Characters, Relations, Recommendations, Trailer, Themes, Staff } from './components/TitleExtras.jsx';
import { synopsisText, selectHomePicks, getCurrentSeasonInfo, getItemSeasonInfo } from './home-data.js';
import { ThemeProvider, useTheme } from './theme-context.jsx';
import { AuthPage, UserDashboard, UserPublicProfile } from './userPages.jsx';
import { DEFAULT_LANG, L, SiteLangContext, makeSiteT, useSiteLang } from './i18n.js';
import {
  primaryNavigation,
  sectionPages,
  sidebarSections,
} from './sectionData.js';
import { useIsMobile } from '@/hooks/use-is-mobile';
import SearchPage from './searchPage.jsx';
import NotificationsSheet from '@/components/NotificationsSheet';
import { useNotifications } from '@/hooks/use-notifications';
import { useAiringAlerts } from '@/hooks/use-airing-alerts';
import CommunitySection from '@/components/CommunitySection';
import ImportListPage from './importListPage.jsx';
import PeoplePage from './peoplePages.jsx';
import MediaTabs from './components/MediaTabs.jsx';
import SuggestEdit from './components/SuggestEdit.jsx';
import DevelopersPage from './developersPage.jsx';
import MySuggestions from './suggestionsPage.jsx';
import { StacksBrowse, StackView } from './stacksPages.jsx';
import CompanyPage, { companyHref, companyNames } from './companyPage.jsx';
import { QuickEpisode } from './components/QuickEpisode.jsx';
import IntroStrip from './components/IntroStrip.jsx';
import { formatNumber, formatScore, toPersianDigits } from '@/lib/digits.js';
import TopCharactersPage from './topCharactersPage.jsx';
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage, AccountSecurityPage } from './accountPages.jsx';
import { useScrollMemory } from '@/hooks/use-scroll-memory';
import MobileShell from '@/components/mobile/MobileShell';
import MobileHomePage from '@/components/mobile/MobileHomePage';
import MobileCatalogPage from '@/components/mobile/MobileCatalogPage';
import MobileRankingPage from '@/components/mobile/MobileRankingPage';
import MobileSeasonalPage from '@/components/mobile/MobileSeasonalPage';
import MobileDetailPage from '@/components/mobile/MobileDetailPage';
import { coverUrl } from '@/lib/cover';

const dayMessages = { Mon: 'dayMon', Tue: 'dayTue', Wed: 'dayWed', Thu: 'dayThu', Fri: 'dayFri', Sat: 'daySat', Sun: 'daySun' };

function ThemeSwitch() {
  const { isDark, toggle } = useTheme();
  const { t } = useSiteLang();
  return (
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? t('themeOn') : t('themeOff')}
      onClick={toggle}
    >
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-knob">
          <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
          </svg>
          <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.5 14.2A8.8 8.8 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z" />
          </svg>
        </span>
      </span>
    </button>
  );
}

// Bold matching characters inside the suggestion title.
const highlightMatch = (title, query) => {
  const text = String(title || '');
  const q = String(query || '').trim();
  if (!q) return text;
  const index = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (index < 0) return text;
  return [text.slice(0, index), <b key="hit">{text.slice(index, index + q.length)}</b>, text.slice(index + q.length)];
};

function HeaderBell() {
  const { t } = useSiteLang();
  const user = useUser();
  const alerts = useAiringAlerts();
  const notifications = useNotifications(Boolean(user.me));
  const [open, setOpen] = useState(false);
  if (!user.me) return null;
  const count = (alerts.unread || 0) + (notifications.unread || 0);
  return (
    <>
      <button type="button" className="header-bell" onClick={() => setOpen(true)} aria-label={count ? t('notifAria', { n: count }) : t('notifTitle')}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && <span className="header-bell__badge" aria-hidden="true">{count}</span>}
      </button>
      <NotificationsSheet open={open} onClose={() => setOpen(false)} alerts={alerts} notifications={notifications} />
    </>
  );
}

function SiteHeader() {
  const navigate = useNavigate();
  const { lang, setLang, t } = useSiteLang();
  const [search, setSearch] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const fetchRef = useRef(null);
  const debounceRef = useRef(null);

  // Live (AJAX) search: debounce the keystrokes, cancel the previous request.
  const loadSuggestions = useCallback((value) => {
    const query = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (fetchRef.current) fetchRef.current.abort();
    if (!query) {
      setSuggestions([]);
      setSuggestOpen(false);
      setActiveIndex(-1);
      fetchRef.current = null;
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      fetchRef.current = controller;
      try {
        const data = await fetch(`/api/search?q=${encodeURIComponent(query)}${getShowSensitive() ? '' : '&sfw=1'}`, { signal: controller.signal }).then((res) => res.json());
        fetchRef.current = null;
        const items = Array.isArray(data.items) ? data.items : [];
        const users = (Array.isArray(data.users) ? data.users : [])
          .slice(0, 4)
          .map((user) => ({ ...user, kind: 'user', title: user.username, bioShort: String(user.bio || '').slice(0, 60) }));
        setSuggestions([...items, ...users]);
        setActiveIndex(-1);
        setSuggestOpen(true);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          fetchRef.current = null;
          setSuggestions([]);
          setSuggestOpen(false);
        }
      }
    }, 220);
  }, []);

  // Abort pending requests when the header unmounts.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (fetchRef.current) fetchRef.current.abort();
  }, []);

  const resetSearch = useCallback(() => {
    setSearch('');
    setSuggestions([]);
    setSuggestOpen(false);
    setActiveIndex(-1);
    setSearchMessage('');
  }, []);  const go = useCallback((entry) => {
    if (!entry) return;
    resetSearch();
    if (entry.kind === 'user') { navigate(`/user/${encodeURIComponent(entry.username)}`); return; }
    navigate(mediaHref(entry, entry.kind === 'manga' ? 'manga' : 'anime'));
  }, [navigate, resetSearch]);

  const handleSearch = (event) => {
    event.preventDefault();
    if (!search.trim()) return;
    // Enter opens a highlighted option; otherwise it shows every result.
    if (activeIndex >= 0 && suggestions[activeIndex]) { go(suggestions[activeIndex]); return; }
    const text = search.trim();
    resetSearch();
    navigate(`/search?q=${encodeURIComponent(text)}`);
  };

  const handleSearchKeys = (event) => {
    if (!suggestOpen || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Escape') {
      setSuggestOpen(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/">
          <img className="brand-mark" src="/logo.svg" alt="" aria-hidden="true" width="40" height="40" />
          <span className="brand-copy">
            <strong>{t('siteName')}</strong>
            <small>{t('siteTagline')}</small>
          </span>
        </Link>

        <nav className="nav-links" aria-label={lang === 'fa' ? 'ناوبری اصلی' : 'Main navigation'}>
          {primaryNavigation.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
              {L(item.label, lang)}
            </NavLink>
          ))}
        </nav>

        <div className="search-wrap">
          <Button
            variant="outline"
            size="sm"
            className="lang-button"
            onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
            aria-label={lang === 'fa' ? 'Switch to English' : 'تغییر به فارسی'}
          >
            {t('langButton')}
          </Button>
          <ThemeSwitch />
          <HeaderBell />
          <form
            className="search-box"
            onSubmit={handleSearch}
            role="search"
            onBlur={(event) => {
              // Close the popup only when focus leaves the whole search box.
              if (!event.currentTarget.contains(event.relatedTarget)) setSuggestOpen(false);
            }}
          >
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <Input
              aria-label={t('searchAria')}
              type="search"
              role="combobox"
              aria-expanded={suggestOpen}
              aria-controls="search-suggest"
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? `search-opt-${activeIndex}` : undefined}
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchMessage('');
                loadSuggestions(event.target.value);
              }}
              onKeyDown={handleSearchKeys}
              className="search-input"
            />
            {suggestOpen && suggestions.length > 0 && (
              <ul
                id="search-suggest"
                className="search-suggest"
                role="listbox"
                aria-label={t('searchAria')}
                // Prevents the input from blurring before the option click lands.
                onMouseDown={(event) => event.preventDefault()}
              >
                {suggestions.map((entry, index) => (
                  <li
                    key={entry.kind === 'user' ? `user-${entry.username}` : `${entry.kind}-${entry.slug}`}
                    role="option"
                    id={`search-opt-${index}`}
                    aria-selected={index === activeIndex}
                    className={`search-opt${index === activeIndex ? ' is-active' : ''}${entry.kind === 'user' ? ' is-user' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {entry.kind === 'user' ? (
                      <Link
                        to={`/user/${encodeURIComponent(entry.username)}`}
                        onClick={() => resetSearch()}
                      >
                        <span className="search-opt-avatar" style={{ '--bloom': entry.bloom ?? 12 }} aria-hidden="true">
                          {String(entry.username).charAt(0).toUpperCase()}
                        </span>
                        <span className="search-opt-copy">
                          <span className="search-opt-title" dir="auto">{highlightMatch(entry.title, search)}</span>
                          {entry.bioShort && <span className="search-opt-meta" style={{ textAlign: 'start', textOverflow: 'ellipsis' }} dir="auto">{entry.bioShort}</span>}
                        </span>
                        <span className="search-opt-kind kind-user">{t('userKind')}</span>
                      </Link>
                    ) : (
                      <Link
                        to={mediaHref(entry, entry.kind === 'manga' ? 'manga' : 'anime')}
                        onClick={() => resetSearch()}
                      >
                        {entry.image
                          ? <img src={coverUrl(entry.image, 240)} alt="" loading="lazy" />
                          : <span className="search-opt-blank" aria-hidden="true" />}
                        <span className="search-opt-copy">
                          <span className="search-opt-title" dir="auto">{highlightMatch(entry.title, search)}</span>
                          <span className="search-opt-meta" dir="ltr">{[entry.year, entry.format].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className={`search-opt-kind kind-${entry.kind}`}>
                          {entry.kind === 'manga' ? t('breadcrumbManga') : t('breadcrumbAnime')}
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
                <li role="presentation" className="search-all">
                  <Link to={`/search?q=${encodeURIComponent(search.trim())}`} onClick={() => resetSearch()}>{t('searchAllResults', { q: search.trim() })}</Link>
                </li>
              </ul>
            )}
            {suggestOpen && search.trim() && suggestions.length === 0 && (
              <div id="search-suggest" className="search-suggest search-suggest-empty">
                <span role="status">{t('noMatch')}</span>
                <Link className="search-all-link" to={`/search?q=${encodeURIComponent(search.trim())}`} onClick={() => resetSearch()}>{t('searchAllResults', { q: search.trim() })}</Link>
              </div>
            )}
            {searchMessage && !suggestOpen && <span className="search-message" role="status">{searchMessage}</span>}
          </form>
        </div>
      </div>
    </header>
  );
}

// The header already links to the main catalog pages, so the sidebar lists only the destinations it does not.
const HEADER_TARGETS = new Set(primaryNavigation.map((item) => item.to));

function SiteSidebar() {
  const { lang } = useSiteLang();
  return (
    <aside className="sidebar panel">
      {sidebarSections.map((section) => (
        <div className="sidebar-section" key={section.to ?? L(section.title, lang)}>
          <div className="side-title">{L(section.title, lang)}</div>
          <ul className="side-list">
            {section.links.filter((item) => !HEADER_TARGETS.has(item.to)).map((item) => <li key={item.to}><Link to={item.to}>{L(item.label, lang)}</Link></li>)}
          </ul>
        </div>
      ))}
    </aside>
  );
}

// Rank badges are zero-padded ("01"); keep the padding but follow the UI language for digits.
const padRank = (value, lang) => {
  const padded = String(value).padStart(2, '0');
  return lang === 'fa' ? toPersianDigits(padded) : padded;
};
const yearText = (year, lang) => (year ? formatNumber(year, lang, { useGrouping: false }) : year);

function AnimeCard({ item, rank }) {
  const { lang, t } = useSiteLang();
  const isManga = item.format === 'Manga';
  const href = mediaHref(item, isManga ? 'manga' : 'anime');
  // Titles stay in their original (English) form on every language; the Persian
  // title only appears under alternative titles and in search matching.
  const title = typeof item.title === 'string' ? item.title : L(item.title, lang);

  return (
    <article className="anime-card">
      {rank && <span className="card-rank">{padRank(rank, lang)}</span>}
      <Link className="anime-cover" to={href} aria-label={`${t(isManga ? 'breadcrumbManga' : 'breadcrumbAnime')}: ${title}`}>
        <img src={coverUrl(item.image, 360)} alt={title} loading="lazy" />
      </Link>
      <div className="anime-info">
        <Link to={href} className="anime-title">{title}</Link>
        <div className="anime-meta">
          <span>{item.category}</span>
          <span aria-hidden="true">·</span>
          <span dir="ltr">{yearText(item.year, lang)}</span>
        </div>
        {item.sampleScore > 0 && (
          <div className="sample-score">
            <span>{item.malId ? t('sourceScoreLabel') : t('sampleScoreLabel')}</span>
            <NumberTicker value={item.sampleScore} decimalPlaces={1} className="sample-score-value" />
          </div>
        )}
        {isManga && (item.publicationStatus || item.chapters != null) && (
          <div className="manga-extra">
            {item.publicationStatus === 'Publishing' && <span className="manga-status-chip is-live">{t('publishingLabel')}</span>}
            {item.publicationStatus === 'Finished' && <span className="manga-status-chip">{t('finishedLabel')}</span>}
            {item.chapters != null && <span className="manga-chapters">{t('mangaChaptersBadge', { n: item.chapters })}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

export function AnimeGrid({ items, showRank = false }) {
  return (
    <div className="card-grid">
      {items.map((item, index) => <AnimeCard key={`${item.format}-${item.slug}`} item={item} rank={showRank ? index + 1 : null} />)}
    </div>
  );
}

function AnimeShelf({ items, showRank = false }) {
  return (
    <Swiper className="anime-shelf" modules={[Navigation, A11y]} navigation slidesPerView="auto" spaceBetween={14}>
      {items.map((item, index) => (
        <SwiperSlide key={`${item.format}-${item.slug}`}>
          <AnimeCard item={item} rank={showRank ? index + 1 : null} />
        </SwiperSlide>
      ))}
    </Swiper>
  );
}

function SectionHeading({ title, to, action = 'more', children }) {
  const { t } = useSiteLang();
  return (
    <div className="section-head">
      {children}
      {!children && <h2>{title}</h2>}
      {to && <Link to={to} className="section-link">{t(action)}</Link>}
    </div>
  );
}

function UserPanel() {
  const { lang, t } = useSiteLang();
  const user = useUser();

  // Signed-in: the visitor's own account card (list counts are client-side from live entries).
  const counts = { watching: 0, completed: 0, planned: 0 };
  if (user.me) {
    for (const mediaType of ['anime', 'manga']) {
      for (const entry of user.entries[mediaType]) {
        const status = entry.status || 'watching';
        counts[status] = (counts[status] || 0) + 1;
      }
    }
  }

  // Signed-out visitors get the single sign-up prompt in the home IntroStrip, so no second card here.
  if (user.meLoaded && !user.me) return null;

  return (
    <div className="panel user-box">
      {!user.meLoaded && (
        <div className="user-top" aria-busy="true">
          <span className="user-avatar md" aria-hidden="true" />
          <div className="user-skeleton-lines">
            <Skeleton className="skeleton-line" />
            <Skeleton className="skeleton-line short" />
          </div>
        </div>
      )}

      {user.me && (
        <>
          <div className="user-top">
            <Link
              className="user-avatar md"
              to={`/user/${encodeURIComponent(user.me.username)}`}
              style={{ '--bloom': user.me.bloom ?? 12 }}
              aria-label={`${t('profileOf')} — ${user.me.username}`}
            >
              <span aria-hidden="true">{user.me.username.charAt(0).toUpperCase()}</span>
            </Link>
            <div>
              <Link className="user-name" to={`/user/${encodeURIComponent(user.me.username)}`}>{user.me.username}</Link>
              <div className="user-status">
                <time dateTime={user.me.joinedAt}>
                  {t('dashJoined', { date: new Date(user.me.joinedAt).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB') })}
                </time>
              </div>
            </div>
          </div>
          <div className="stats">
            <div className="stat"><strong><NumberTicker value={counts.watching} /></strong><span>{t('statWatching')}</span></div>
            <div className="stat"><strong><NumberTicker value={counts.completed} /></strong><span>{t('statCompleted')}</span></div>
            <div className="stat"><strong><NumberTicker value={counts.planned} /></strong><span>{t('statPlan')}</span></div>
          </div>
          <div className="user-links">
            <Link to="/dashboard">{t('dashTitle')}</Link>
            <Link to="/suggestions">{t('sugMine')}</Link>
            <button type="button" onClick={user.logout}>{t('dashLogout')}</button>
          </div>
        </>
      )}
    </div>
  );
}

function SchedulePanel() {
  const { t } = useSiteLang();
  const animeCatalog = useVisibleCatalog();
  const today = useMemo(() => currentWeekday(), []);
  // Sidebar glance: today's shows first, then the next ones; the full week lives on /schedule.
  const entries = useMemo(() => {
    const all = buildSchedule(animeCatalog);
    return [...all.filter((e) => e.day === today), ...all.filter((e) => e.day !== today)].slice(0, 8);
  }, [animeCatalog, today]);
  return (
    <div className="panel side-mini">
      <SectionHeading title={t('airingSchedule')} to="/schedule" action="seasonAction" />
      <ul className="schedule-list">
        {entries.map((entry) => {
          const anime = animeCatalog.find((item) => item.slug === entry.slug);
          if (!anime) return null;
          return (
            <li key={entry.slug} className={entry.day === today ? 'is-today' : undefined}>
              <span className="schedule-title">
                <img className="schedule-cover" src={coverUrl(anime.image, 240)} alt="" loading="lazy" />
                <Link to={mediaHref(anime)} dir="auto">{entry.title}</Link>
              </span>
              <span className="day-badge">
                {t(dayMessages[entry.day])}
                {entry.day === today && <strong className="today-chip">{t('todayBadge')}</strong>}
              </span>
            </li>
          );
        })}
        {entries.length === 0 && (
          <li><span className="media-note">{t('scheduleEmpty')}</span></li>
        )}
      </ul>
    </div>
  );
}

// Full week, one block per weekday, today highlighted; titles without a day go last.
function WeeklySchedule({ items }) {
  const { t } = useSiteLang();
  const today = useMemo(() => currentWeekday(), []);
  const days = useMemo(() => WEEKDAY_ORDER.map((day) => ({ day, list: items.filter((item) => item.airingDay === day) })), [items]);
  if (days.every((d) => d.list.length === 0)) return <div className="sample-data-note">{t('scheduleEmpty')}</div>;
  return (
    <div className="week-schedule">
      {days.map(({ day, list }) => (
        <section key={day} className={`week-day${day === today ? ' is-today' : ''}`} aria-labelledby={`wd-${day}`}>
          <h2 id={`wd-${day}`}>{t(dayMessages[day])}{day === today && <strong className="today-chip">{t('todayBadge')}</strong>}</h2>
          {list.length === 0 ? <p className="media-note">{t('nothingToday')}</p> : (
            <ul>
              {list.map((item) => (
                <li key={item.slug}>
                  <Link className="airing-today-item" to={mediaHref(item)} dir="auto">
                    <img src={coverUrl(item.image, 240)} alt="" loading="lazy" />
                    <span>{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// Weekly schedule strip for the seasonal page: the titles that air on the
// viewer's current weekday, or nothing when the day has no premieres.
function AiringToday() {
  const { t } = useSiteLang();
  const animeCatalog = useVisibleCatalog();
  const today = useMemo(() => currentWeekday(), []);
  const items = useMemo(() => animeCatalog.filter((item) => item.airingDay === today), [animeCatalog, today]);
  if (items.length === 0) return null;
  return (
    <div className="airing-today" role="note" aria-label={t('airingToday')}>
      <span className="airing-today-label">
        <strong>{t('airingToday')}</strong>
        <span className="airing-today-day" dir="auto">{t(dayMessages[today])}</span>
      </span>
      <ul>
        {items.map((item) => (
          <li key={item.slug}>
            <Link className="airing-today-item" to={mediaHref(item)} dir="auto">
              <img src={coverUrl(item.image, 240)} alt="" loading="lazy" />
              <span>{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HomePage() {
  const { lang, t } = useSiteLang();
  const isMobile = useIsMobile();
  const animeCatalog = useVisibleCatalog();
  const mangaCatalog = useVisibleMangaCatalog();
  const picks = selectHomePicks({ animeCatalog, mangaCatalog });
  const { topAnime, currentSeason, topAiring, mangaItems, freshManga, popularAnime, upcomingAnime } = picks;
  // «پیشنهادی»: a fully random pick from the catalog — re-rolled on every
  // visit, and manually re-rollable with the dice action in the hero.
  // Seen picks this session never repeat (when the catalog is exhausted, the
  // memory resets so rerolling keeps working).
  const [featuredSlug, setFeaturedSlug] = useState(null);
  const seenRef = useRef(new Set());
  useEffect(() => {
    if (animeCatalog.length && !featuredSlug) {
      const slug = animeCatalog[Math.floor(Math.random() * animeCatalog.length)].slug;
      seenRef.current.add(slug);
      setFeaturedSlug(slug);
    }
  }, [animeCatalog.length, featuredSlug]);
  const suggestAnother = () => {
    let pool = animeCatalog.filter((anime) => !seenRef.current.has(anime.slug) && anime.slug !== featuredSlug);
    if (pool.length === 0) {
      // Everything has been shown this session — start the cycle over.
      seenRef.current = new Set();
      pool = animeCatalog.filter((anime) => anime.slug !== featuredSlug);
    }
    const next = pool[Math.floor(Math.random() * pool.length)].slug;
    seenRef.current.add(next);
    setFeaturedSlug(next);
  };
  const featured = useMemo(
    () => animeCatalog.find((anime) => anime.slug === featuredSlug) || null,
    [animeCatalog, featuredSlug],
  );

  useEffect(() => {
    document.title = t('pageTitles').home;
  }, [t]);

  if (isMobile) {
    return <MobileHomePage lang={lang} t={t} picks={{ ...picks, animeCatalog }} />;
  }

  return (
    <>
      {!isMobile && <SiteHeader />}
      <div className="page-shell">
        <div className="layout">
          <main className="main-column">
            <IntroStrip />
            {featured && (
              <section className="hero panel" style={{ '--hero-image': `url("${featured.image}")` }}>
                <div className="hero-poster" aria-hidden="true">
                  <img src={coverUrl(featured.image, 480)} alt="" loading="lazy" />
                </div>
                <div className="hero-content">
                  <Badge variant="secondary" className="hero-eyebrow">{t('featuredLabel')}</Badge>
                  <h1>{featured.title}</h1>
                  <p className="hero-meta">
                    {featured.category && <span>{featured.category}</span>}
                    {featured.year && <span dir="ltr">{yearText(featured.year, lang)}</span>}
                    {featured.sampleScore > 0 && <span dir="ltr">★ {formatScore(featured.sampleScore, lang)}</span>}
                  </p>
                  <p dir="auto">{synopsisText(featured, lang)}</p>
                  <div className="hero-action-row">
                    <Link className="hero-action" to={mediaHref(featured)}>{t('viewAnime')}</Link>
                    <button className="hero-action reroll" type="button" onClick={suggestAnother} aria-label={t('suggestAnother')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                        <path d="M21 3v6h-6" />
                      </svg>
                      {t('suggestAnother')}
                    </button>
                  </div>
                </div>
              </section>
            )}
            <section id="topAnimeGrid">
              <SectionHeading title={t('topAnime')} to="/top/anime" action="fullRanking" />
              <AnimeShelf items={topAnime} showRank />
            </section>
            <section id="seasonalLineup">
              <SectionHeading title={t('seasonalLineup')} to="/seasonal" action="calendar" />
              <AnimeShelf items={currentSeason} />
            </section>
            <section>
              <SectionHeading title={t('topAiring')} to="/top/anime" action="fullRanking" />
              <RankedList items={topAiring} toPrefix="/anime" />
            </section>
            {upcomingAnime.length > 0 && (
              <section id="upcomingSoon">
                <SectionHeading title={t('topUpcoming')} to="/seasonal" action="calendar" />
                <AnimeShelf items={upcomingAnime} />
              </section>
            )}
            <section id="mostPopular">
              <SectionHeading title={t('mostPopular')} to="/anime" action="browseAll" />
              <AnimeShelf items={popularAnime} />
            </section>
            {freshManga.length > 0 && (
              <section id="freshManga">
                <SectionHeading title={t('freshManga')} to="/manga" action="browseAll" />
                <AnimeShelf items={freshManga} />
              </section>
            )}
          </main>
          <SiteSidebar />
          <aside className="right-column">
            <UserPanel />
            <SchedulePanel />
          </aside>
        </div>
        <footer className="site-footer">
          <p>{t('footerCopyright')}</p>
        </footer>
      </div>
    </>
  );
}

function RankedList({ items, toPrefix }) {
  const { lang, t } = useSiteLang();
  const mediaType = toPrefix === '/manga' ? 'manga' : 'anime';
  return (
    <ol className="rank-list">
      {items.map((item, index) => (
        <li className="rank-row" key={item.slug}>
          <span className="rank-number">{padRank(index + 1, lang)}</span>
          <Link className="rank-cover" to={mediaHref(item, mediaType)} aria-label={item.title}>
            <img src={coverUrl(item.image, 360)} alt={item.title} loading="lazy" />
          </Link>
          <div className="rank-copy">
            <Link className="rank-title" to={mediaHref(item, mediaType)} dir="auto">{item.title}</Link>
            <span><span>{item.category}</span><span aria-hidden="true">·</span><span dir="ltr">{yearText(item.year, lang)}</span></span>
          </div>
          {item.sampleScore > 0 && (
            <span className="rank-score">
              <NumberTicker value={item.sampleScore} decimalPlaces={1} />
              <small>{item.malId ? t('sourceScoreSuffix') : t('scoreLabel')}</small>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function CatalogControls({ query, onQueryChange, genre, onGenreChange, genres, count, format, onFormatChange, formats, year, onYearChange, years, sort, onSortChange }) {
  const { t, lang } = useSiteLang();
  return (
    <div className="catalog-controls">
      <label className="catalog-search">
        <span>{t('filterTitles')}</span>
        <Input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t('titleOrKeyword')} />
      </label>
      <label>
        <span>{t('genreLabel')}</span>
        <select value={genre} onChange={(event) => onGenreChange(event.target.value)}>
          <option value="All">{t('allGenres')}</option>
          {(() => {
            const groups = splitGenres(genres);
            const labelOf = { genre: t('genresLabel'), theme: t('themesLabel'), demographic: t('demographicLabel') };
            const filled = Object.entries(groups).filter(([, list]) => list.length);
            if (filled.length <= 1) return genres.map((item) => <option value={item} key={item}>{item}</option>);
            return filled.map(([kind, list]) => (
              <optgroup key={kind} label={labelOf[kind]}>
                {list.map((item) => <option value={item} key={item}>{item}</option>)}
              </optgroup>
            ));
          })()}
        </select>
      </label>
      {(formats?.length ?? 0) > 1 && (
        <label>
          <span>{t('formatLabel')}</span>
          <select value={format} onChange={(event) => onFormatChange(event.target.value)}>
            <option value="All">{t('allFormats')}</option>
            {formats.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      )}
      {(years?.length ?? 0) > 1 && (
        <label>
          <span>{t('yearLabel')}</span>
          <select value={year} onChange={(event) => onYearChange(event.target.value)}>
            <option value="All">{t('allYears')}</option>
            {years.map((item) => <option value={item} key={item}>{formatNumber(item, lang, { useGrouping: false })}</option>)}
          </select>
        </label>
      )}
      <label>
        <span>{t('sortLabel')}</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
          <option value="score">{t('sortScore')}</option>
          <option value="new">{t('sortNew')}</option>
          <option value="old">{t('sortOld')}</option>
          <option value="az">{t('sortAz')}</option>
        </select>
      </label>
      <span className="catalog-count">{t('titlesCount', { n: count })}</span>
    </div>
  );
}

function NotFoundPanel({ children }) {
  return <main className="anime-missing panel">{children}</main>;
}

function CatalogLoadingFallback() {
  const { t } = useSiteLang();
  return <main className="app-state">{t('loadingCatalog')}</main>;
}

function PageBreadcrumb({ trail }) {
  const { lang } = useSiteLang();
  return (
    <Breadcrumb className="detail-breadcrumb">
      <BreadcrumbList>
        {trail.map((entry, index) => {
          const last = index === trail.length - 1;
          return (
            <React.Fragment key={index}>
              <BreadcrumbItem>
                {last
                  ? <BreadcrumbPage>{entry.label}</BreadcrumbPage>
                  : (
                    <BreadcrumbLink render={<Link to={entry.to} />}>
                      {entry.label}
                    </BreadcrumbLink>
                  )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator aria-hidden="true">/</BreadcrumbSeparator>}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function SectionPage({ theme, onThemeChange }) {
  const { lang, t } = useSiteLang();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const animeCatalog = useVisibleCatalog();
  const mangaCatalog = useVisibleMangaCatalog();
  const page = sectionPages[pathname];  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All');
  const [format, setFormat] = useState('All');
  const [year, setYear] = useState('All');
  const [sort, setSort] = useState('score');

  useEffect(() => {
    setQuery('');
    setGenre('All');
    setFormat('All');
    setYear('All');
    setSort('score');
  }, [pathname]);

  useEffect(() => {
    document.title = page
      ? `${L(page.title, lang)} ${t('pageTitles').suffix}`
      : t('pageTitles').notFoundTitle;
  }, [page, lang, t]);

  if (!page) {
    return (
      <>
        {!isMobile && <SiteHeader theme={theme} onThemeChange={onThemeChange} />}
        <NotFoundPanel>
          <p className="not-found-code" aria-hidden="true">404</p>
          <h1>{t('pageNotFound')}</h1>
          <p>{t('notCatalog')}</p>
          <div className="not-found-actions">
            <Link className="detail-back-link" to="/">{t('backHome')}</Link>
            <Link className="detail-back-link" to="/search">{t('notFoundSearch')}</Link>
          </div>
        </NotFoundPanel>
      </>
    );
  }

  const mangaItems = withMangaImages(mangaCatalog, animeCatalog);
  const { season: nowSeason, year: nowYear } = getCurrentSeasonInfo();
  const seasonItems = animeCatalog.filter((item) => {
    const info = getItemSeasonInfo(item);
    const itemYear = info.year || parseInt(item.year, 10);
    return info.season === nowSeason && itemYear === nowYear;
  });
  let items = [];
  if (['anime', 'anime-ranking', 'seasonal', 'adapted'].includes(page.kind)) {
    items = page.kind === 'anime-ranking'
      ? sortBy(animeCatalog, rankKey)
      : page.kind === 'adapted'
        ? animeCatalog.filter((anime) => mangaCatalog.some((manga) => manga.slug === anime.slug))
        : page.kind === 'seasonal'
          ? (seasonItems.length ? seasonItems : animeCatalog)
          : animeCatalog;
  } else if (['manga', 'manga-ranking'].includes(page.kind)) {
    items = page.kind === 'manga-ranking' ? sortBy(mangaItems, rankKey) : mangaItems;
  }

  const isCatalogPage = ['anime', 'manga', 'adapted'].includes(page.kind);
  const genres = uniq(items.flatMap((item) => item.genres)).sort((first, second) => first.localeCompare(second));
  // Queue 22: format / year facets + selectable ordering (catalog pages only).
  const formats = uniq(items.map((item) => item.format).filter(Boolean)).sort();
  const years = uniq(items.map((item) => String(item.year || '')).filter(Boolean)).sort().reverse();
  const filteredItems = items.filter((item) => {
    const matchesQuery = foldTitle(`${item.title} ${item.titleFa || ''} ${item.category} ${item.genres.join(' ')}`).includes(foldTitle(query));
    const matchesGenre = genre === 'All' || item.genres.includes(genre);
    const matchesFormat = format === 'All' || item.format === format;
    const matchesYear = year === 'All' || String(item.year || '') === year;
    return matchesQuery && matchesGenre && matchesFormat && matchesYear;
  });
  const displayedItems = isCatalogPage
    ? [...filteredItems].sort((first, second) => {
        if (sort === 'new' || sort === 'old') {
          const delta = (Number(second.year) || 0) - (Number(first.year) || 0);
          return sort === 'new' ? delta : -delta;
        }
        if (sort === 'az') {
          return first.title.localeCompare(second.title, 'en', { sensitivity: 'base' });
        }
        return (second.weightedScore ?? second.sampleScore ?? 0) - (first.weightedScore ?? first.sampleScore ?? 0);
      })
    : filteredItems;
  const title = page.title;
  const description = page.description;

  if (isCatalogPage && isMobile) {
    return (
      <MobileCatalogPage
        title={title}
        items={displayedItems}
        mediaType={page.kind === 'manga' ? 'manga' : 'anime'}
        query={query} onQueryChange={setQuery}
        genre={genre} onGenreChange={setGenre} genres={genres}
        format={format} onFormatChange={setFormat} formats={formats}
        year={year} onYearChange={setYear} years={years}
        sort={sort} onSortChange={setSort}
      />
    );
  }

  if (isMobile && page.kind.includes('ranking')) {
    return (
      <MobileRankingPage
        title={title}
        items={filteredItems}
        mediaType={page.kind === 'manga-ranking' ? 'manga' : 'anime'}
        note={page.kind === 'manga-ranking' ? t('mangaRankingNote') : t('animeRankingNote')}
      />
    );
  }

  if (isMobile && page.kind === 'seasonal') {
    return (
      <MobileSeasonalPage title={title} items={seasonItems.length ? seasonItems : filteredItems}>
        <AiringToday />
      </MobileSeasonalPage>
    );
  }

  return (
    <>
      {!isMobile && <SiteHeader theme={theme} onThemeChange={onThemeChange} />}
      <div className="section-page-shell">
        <PageBreadcrumb trail={[
          { to: '/', label: t('breadcrumbHome') },
          { to: pathname, label: L(page.eyebrow, lang) },
          { label: L(title, lang) },
        ]} />
        <header className="section-masthead">
          <h1>{L(title, lang)}</h1>
          <p>{L(description, lang)}</p>
        </header>
        <div className={`section-page-layout${page.kind === 'schedule' ? ' is-wide' : ''}`}>
          <main className="section-main">
            {isCatalogPage && (
              <CatalogControls query={query} onQueryChange={setQuery} genre={genre} onGenreChange={setGenre} genres={genres} count={displayedItems.length} format={format} onFormatChange={setFormat} formats={formats} year={year} onYearChange={setYear} years={years} sort={sort} onSortChange={setSort} />
            )}
            {page.kind === 'seasonal' && seasonItems.length === 0 && <div className="sample-data-note">{t('seasonEmpty')}</div>}
            {page.kind === 'seasonal' && <AiringToday />}
            {page.kind === 'schedule' && <WeeklySchedule items={animeCatalog} />}
            {page.kind === 'anime-ranking' && <div className="sample-data-note">{t('animeRankingNote')}</div>}
            {page.kind === 'manga-ranking' && <div className="sample-data-note">{t('mangaRankingNote')}</div>}
            {['anime', 'anime-ranking', 'manga', 'manga-ranking', 'seasonal', 'adapted'].includes(page.kind) && (
              page.kind.includes('ranking')
                ? <RankedList items={filteredItems} toPrefix={page.kind === 'manga-ranking' ? '/manga' : '/anime'} />
                : <AnimeGrid items={displayedItems} />
            )}
          </main>
          {page.kind !== 'schedule' && <aside className="section-rail panel">
            <h2>{t('exploreSections')}</h2>
            {sidebarSections.map((section) => (
              <div className="rail-group" key={L(section.title, lang)}>
                <h3>{L(section.title, lang)}</h3>
                {section.links.map((item) => <Link to={item.to} key={item.to}>{L(item.label, lang)}</Link>)}
              </div>
            ))}
          </aside>}
        </div>
      </div>
    </>
  );
}

function DetailSection({ id, title, children, className = 'detail-content-section' }) {
  return (
    <section className={className} id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function SidebarDataList({ rows }) {
  return (
    <dl className="sidebar-data-list">
      {rows.filter((row) => row.value).map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.links ? row.links.map((l, i) => <span key={l.to}>{i > 0 && ', '}<Link to={l.to} className="info-link">{l.text}</Link></span>) : row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailPage({ item, mediaType, theme, onThemeChange }) {
  const { lang, t } = useSiteLang();
  const isMobile = useIsMobile();
  const animeCatalog = useVisibleCatalog();
  const user = useUser();
  const me = user.me;
  const isSaved = user.entries[mediaType].some((entry) => entry.slug === item.slug);
  const savedEntry = user.entries[mediaType].find((entry) => entry.slug === item.slug) || null;
  const related = animeCatalog
    .map((entry) => ({ entry, shared: entry.slug === item.slug ? 0 : entry.genres.filter((entryGenre) => item.genres.includes(entryGenre)).length }))
    .filter((row) => row.shared > 0)
    .sort((a, b) => b.shared - a.shared || (b.entry.sampleScore || 0) - (a.entry.sampleScore || 0))
    .slice(0, 6)
    .map((row) => row.entry);
  const extras = useTitleExtras(mediaType, item.malId);
  const alternativeTitles = item.alternativeTitles || {};
  const romajiTitle = alternativeTitles.romaji || '';
  // Share / copy link for this title (Web Share API when available, clipboard
  // fallback otherwise). The note clears itself after a beat.
  const [shareNote, setShareNote] = useState('');
  const noteTimer = useRef(null);
  const shareTitle = async () => {
    clearTimeout(noteTimer.current);
    const url = window.location.href;
    const flash = (text) => {
      setShareNote(text);
      noteTimer.current = setTimeout(() => setShareNote(''), 2600);
    };
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      flash(t('shareCopied'));
    } catch (error) {
      if (error?.name === 'AbortError') return;
      // Last resort: the legacy textarea + select + copy trick.
      const helper = document.createElement('textarea');
      helper.value = url;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand ? document.execCommand('copy') : false;
      helper.remove();
      flash(copied ? t('shareCopied') : t('shareFailed'));
    }
  };
  const linkRows = (rows) => rows.map((row) => {
    const label = String(row.label).toLowerCase();
    const kind = label === 'studios' ? 'studio' : label === 'producers' ? 'producer' : label === 'serialization' ? 'magazine' : null;
    if (!kind || !row.value) return row;
    return { ...row, links: String(row.value).split(',').map((n) => n.trim()).filter(Boolean).map((n) => ({ text: n, to: companyHref(kind, n) })) };
  });
  const informationRows = linkRows(splitInfoRows(item.information || [
    { label: t('typeLabel'), value: mediaType === 'manga' ? (lang === 'fa' ? 'مانگا' : 'Manga') : item.format },
    { label: t('categoryLabel'), value: item.category },
    { label: t('yearLabel'), value: item.year },
    { label: t('genresLabel'), value: item.genres.join(lang === 'fa' ? '، ' : ', ') },
    ...(mediaType === 'manga' && item.serialization?.length ? [{ label: 'Serialization', value: item.serialization.join(', ') }] : []),
  ]));
  const statisticsRows = item.statistics
    ? [
        { label: t('scoreLabel'), value: item.statistics.score },
        { label: t('scoredBy'), value: item.statistics.scoredBy },
        { label: t('rankedLabel'), value: item.rank ? `#${item.rank}` : item.statistics.ranked },
        { label: t('popularity'), value: item.statistics.popularity },
        { label: t('membersLabel'), value: item.statistics.members },
        { label: t('favoritesLabel'), value: item.statistics.favorites || t('notListed') },
      ]
    : [
        { label: t('scoreLabel'), value: item.sampleScore ? `${item.sampleScore.toFixed(1)}${item.malId ? ` (${t('sourceScoreSuffix')})` : ` (${t('scoreLabel')})`}` : null },
        { label: t('rankedLabel'), value: item.rank ? `#${item.rank}` : t('notListed') },
        { label: t('membersLabel'), value: t('notListed') },
      ];

  useEffect(() => {
    document.title = `${item.title} ${t('pageTitles').suffix}`;
  }, [item.title, t]);

  // Hero summary: the facts and numbers people scan first (type, year, status,
  // score, rank) used to be buried in the sidebar below the fold.
  const infoValue = (label) => (item.information || []).find((row) => String(row.label).toLowerCase() === label)?.value || '';
  const numericOf = (raw) => {
    const digits = String(raw ?? '').replace(/[^\d.]/g, '');
    return digits ? Number(digits) : null;
  };
  const rankText = (raw) => {
    const n = numericOf(raw);
    return n ? `#${formatNumber(n, lang)}` : null;
  };
  const statusText = (raw) => {
    if (!raw) return null;
    if (lang !== 'fa') return raw;
    const map = { 'finished airing': 'پایان‌یافته', 'currently airing': 'در حال پخش', 'not yet aired': 'هنوز پخش نشده', finished: 'پایان‌یافته', publishing: 'در حال انتشار', 'on hiatus': 'متوقف‌شده', discontinued: 'متوقف‌شده' };
    return map[String(raw).toLowerCase()] || raw;
  };
  const episodesRaw = infoValue('episodes') || infoValue('chapters');
  const heroFacts = [
    mediaType === 'manga' ? (lang === 'fa' ? 'مانگا' : 'Manga') : (infoValue('type') || item.format),
    item.year ? yearText(item.year, lang) : null,
    episodesRaw && episodesRaw !== 'Unknown'
      ? `${formatNumber(numericOf(episodesRaw) ?? episodesRaw, lang)} ${mediaType === 'manga' ? t('chaptersUnit') : t('episodesUnit')}`
      : null,
    statusText(infoValue('status')),
  ].filter(Boolean);
  const scoreValue = numericOf(item.statistics?.score) ?? (item.sampleScore > 0 ? item.sampleScore : null);
  const heroStats = [
    scoreValue ? {
      label: t('scoreLabel'),
      value: formatScore(scoreValue, lang),
      note: numericOf(item.statistics?.scoredBy) ? `${formatNumber(numericOf(item.statistics.scoredBy), lang)} ${t('votesUnit')}` : null,
      primary: true,
    } : null,
    rankText(item.rank || item.statistics?.ranked) ? { label: t('rankedLabel'), value: rankText(item.rank || item.statistics?.ranked) } : null,
    rankText(item.statistics?.popularity) ? { label: t('popularity'), value: rankText(item.statistics.popularity) } : null,
    numericOf(item.statistics?.members) ? { label: t('membersLabel'), value: formatNumber(numericOf(item.statistics.members), lang) } : null,
    numericOf(item.statistics?.favorites) ? { label: t('favoritesLabel'), value: formatNumber(numericOf(item.statistics.favorites), lang) } : null,
  ].filter(Boolean);

  const sectionNav = [
    { id: 'detailSynopsis', label: t('synopsis'), show: true },
    { id: 'detailCharacters', label: t('charactersVA'), show: hasAny(extras, 'characters') },
    { id: 'detailMedia', label: t('mediaSection'), show: Boolean(item.malId) },
    { id: 'detailRelatedEntries', label: t('relatedEntries'), show: hasAny(extras, 'relations') },
    { id: 'detailReviews', label: t('reviewsTitle'), show: true },
    { id: 'relatedHeading', label: t('relatedAnime'), show: related.length > 0 },
  ].filter((entry) => entry.show);

  const toggleSaved = () => {
    user.toggle(mediaType, item.slug);
  };

  // Five MAL-style list statuses; the watching label reads for manga too.
  const listStatuses = [
    { id: 'watching', label: t(mediaType === 'manga' ? 'status_reading' : 'status_watching') },
    { id: 'completed', label: t('status_completed') },
    { id: 'on_hold', label: t('status_on_hold') },
    { id: 'dropped', label: t('status_dropped') },
    { id: 'planned', label: t('status_planned') },
  ];


  if (isMobile) {
    return (
      <MobileDetailPage
        item={item}
        mediaType={mediaType}
        related={related}
        extras={extras}
        informationRows={informationRows}
        statisticsRows={statisticsRows}
        alternativeTitles={alternativeTitles}
        romajiTitle={romajiTitle}
        isSaved={isSaved}
        currentStatus={savedEntry?.status || 'watching'}
        listStatuses={listStatuses}
        onToggleSaved={toggleSaved}
        onSetStatus={(statusId) => user.setStatus(mediaType, item.slug, statusId)}
        onShare={shareTitle}
        shareNote={shareNote}
      />
    );
  }

  return (
    <>
      {!isMobile && <SiteHeader theme={theme} onThemeChange={onThemeChange} />}
      <div className="anime-page-shell">
        <PageBreadcrumb trail={[
          { to: '/', label: t('breadcrumbHome') },
          { to: mediaType === 'manga' ? '/manga' : '/anime', label: mediaType === 'manga' ? t('breadcrumbManga') : t('breadcrumbAnime') },
          { label: item.title },
        ]} />
        <main className="anime-detail-shell">
          <div className="anime-detail-layout">
            <aside className="detail-sidebar panel">
              <figure className="detail-cover"><img src={coverUrl(item.image, 720)} alt={item.title} /></figure>
              <SuggestEdit item={item} mediaType={mediaType} />
              <div className="detail-sidebar-sections">
                {(alternativeTitles.synonyms?.length || alternativeTitles.japanese || alternativeTitles.english || item.titleFa) && (
                  <DetailSection id="detailAlternativeTitles" title={t('alternativeTitles')} className="detail-sidebar-section">
                    <SidebarDataList rows={[
                      { label: t('synonyms'), value: alternativeTitles.synonyms?.join(lang === 'fa' ? '، ' : ', ') },
                      { label: t('japaneseTitle'), value: alternativeTitles.japanese },
                      { label: t('englishTitle'), value: alternativeTitles.english },
                      { label: t('persianTitle'), value: item.titleFa },
                    ]} />
                  </DetailSection>
                )}
                <DetailSection id="detailInformation" title={t('information')} className="detail-sidebar-section">
                  <SidebarDataList rows={informationRows} />
                </DetailSection>
                {item.availableAt?.length > 0 && (
                  <DetailSection id="detailAvailableAt" title={t('availableAt')} className="detail-sidebar-section">
                    <ul className="sidebar-link-list">
                      {item.availableAt.map((entry) => (
                        <li key={entry.label}>
                          <span className="sidebar-resource-icon" aria-hidden="true">{entry.icon || '↗'}</span>
                          {entry.href ? <a href={entry.href} target="_blank" rel="noreferrer">{entry.label}</a> : <span>{entry.label}</span>}
                        </li>
                      ))}
                    </ul>
                  </DetailSection>
                )}
                {item.resources?.length > 0 && (
                  <DetailSection id="detailResources" title={t('resources')} className="detail-sidebar-section">
                    <ul className="sidebar-link-list">
                      {item.resources.map((resource) => (
                        <li key={resource.label}>
                          <span className="sidebar-resource-icon" aria-hidden="true">{resource.icon}</span>
                          <span>{resource.label}</span>
                        </li>
                      ))}
                    </ul>
                  </DetailSection>
                )}
                {item.streamingPlatforms?.length > 0 && (
                  <DetailSection id="detailStreaming" title={t('streaming')} className="detail-sidebar-section">
                    <ul className="streaming-platform-list">
                      {item.streamingPlatforms.map((platform) => (
                        <li key={platform}><span className="platform-mark" aria-hidden="true">{platform[0]}</span><span dir="ltr">{platform}</span></li>
                      ))}
                    </ul>
                    {item.streamingNotice && <p className="streaming-notice">{item.streamingNotice}</p>}
                  </DetailSection>
                )}
              </div>
            </aside>

            <div className="detail-main-column">
              <section className="anime-profile">
                <div className="detail-hero-backdrop" aria-hidden="true"><img src={coverUrl(item.image, 480)} alt="" /></div>
                <div className="detail-copy">
                  <h1 dir="auto">{item.title}</h1>
                  {romajiTitle && romajiTitle !== item.title && (
                    <p className="detail-romaji" dir="ltr" lang="ja-Latn">{romajiTitle}</p>
                  )}
                  {heroFacts.length > 0 && (
                    <p className="detail-facts-line">
                      {heroFacts.map((fact) => <span key={fact}>{fact}</span>)}
                    </p>
                  )}
                  {item.genres?.length > 0 && (
                    <ul className="detail-genre-chips" aria-label={t('genresLabel')}>
                      {item.genres.map((genre) => (
                        <li key={genre}><Link to={`/search?genre=${encodeURIComponent(genre)}`}>{genre}</Link></li>
                      ))}
                    </ul>
                  )}
<div className="detail-hero-actions">
              <Button
                className={`detail-list-button${isSaved ? ' is-saved' : ''}`}
                type="button"
                aria-pressed={isSaved}
                onClick={toggleSaved}
              >
                {isSaved ? t('inList') : t('addToList')}
              </Button>
              <FavoriteButton kind={mediaType} refId={item.slug} className="detail-fav" />
              <QuickEpisode mediaType={mediaType} item={item} className="detail-quick-ep" />
              {isSaved && (
                <div className="detail-status-picker" role="radiogroup" aria-label={t('listStatusAria')}>
                  {listStatuses.map((status) => (
                    <button
                      key={status.id}
                      type="button"
                      role="radio"
                      aria-checked={(savedEntry?.status || 'watching') === status.id}
                      className={`status-pill${(savedEntry?.status || 'watching') === status.id ? ' is-active' : ''}`}
                      onClick={() => user.setStatus(mediaType, item.slug, status.id)}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="detail-share-row">
                <Button className="detail-share-button" variant="outline" size="sm" type="button" onClick={shareTitle}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                    <path d="m8.6 13.4 6.8 4M15.4 6.6l-6.8 4" />
                  </svg>
                  {t('shareTitle')}
                </Button>
                {shareNote && <span className="detail-share-note" role="status">{shareNote}</span>}
              </div>
                </div>
                  {heroStats.length > 0 && (
                    <dl className="detail-stat-strip">
                      {heroStats.map((stat) => (
                        <div key={stat.label} className={stat.primary ? 'is-primary' : undefined}>
                          <dt>{stat.label}</dt>
                          <dd>{stat.value}{stat.note && <small>{stat.note}</small>}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </section>

              <nav className="detail-section-nav" aria-label={t('detailSectionsNav')}>
                {sectionNav.map((entry) => <a key={entry.id} href={`#${entry.id}`}>{entry.label}</a>)}
              </nav>

              <div className="detail-section-grid">
                <DetailSection id="detailSynopsis" title={t('synopsis')}>
                  <p className="detail-synopsis" dir="auto">{item.synopsis}</p>
                  {item.synopsisAuto && <p className="synopsis-auto">{t('synopsisAuto')}</p>}
                </DetailSection>
                {hasAny(extras, 'characters') && (
                  <DetailSection id="detailCharacters" title={t('charactersVA')}><Characters data={extras.data} /></DetailSection>
                )}
                {hasAny(extras, 'trailer') && (
                  <DetailSection id="detailTrailer" title={t('trailerTitle')}><Trailer data={extras.data} /></DetailSection>
                )}
                {item.malId && (
                  <DetailSection id="detailMedia" title={t('mediaSection')}><MediaTabs item={item} mediaType={mediaType} /></DetailSection>
                )}
                {extras.status === 'loading' && <p className="extras-muted" role="status">{t('extrasLoading')}</p>}
                {hasAny(extras, 'relations') && (
                  <DetailSection id="detailRelatedEntries" title={t('relatedEntries')}><Relations data={extras.data} /><WatchOrder mediaType={mediaType} malId={item.malId} /></DetailSection>
                )}
                {hasAny(extras, 'staff') && (
                  <DetailSection id="detailStaff" title={t('staffSection')}><Staff data={extras.data} /></DetailSection>
                )}
                {mediaType === 'anime' && hasAny(extras, 'openings') && (
                  <DetailSection id="detailOpening" title={t('openingTheme')}><Themes data={extras.data} kind="op" /></DetailSection>
                )}
                {mediaType === 'anime' && hasAny(extras, 'endings') && (
                  <DetailSection id="detailEnding" title={t('endingTheme')}><Themes data={extras.data} kind="ed" /></DetailSection>
                )}
                <DetailSection id="detailReviews" title={t('reviewsTitle')} className="detail-content-section detail-community">
                  <CommunitySection mediaType={mediaType} slug={item.slug} />
                </DetailSection>
                {hasAny(extras, 'recommendations') && (
                  <DetailSection id="detailRecommendations" title={t('recommendationsTitle')}><Recommendations data={extras.data} mediaType={mediaType} /></DetailSection>
                )}
              </div>
            </div>
          </div>

          <section className="related-section" aria-labelledby="relatedHeading">
            <h2 id="relatedHeading">{t('relatedAnime')}</h2>
            <AnimeGrid items={related} />
          </section>
        </main>
      </div>
    </>
  );
}

// Shown in place of a sensitive title while the filter is on.
function SensitiveGate({ mediaType, theme, onThemeChange }) {
  const isMobile = useIsMobile();
  const { t } = useSiteLang();
  return (
    <>
      {!isMobile && <SiteHeader theme={theme} onThemeChange={onThemeChange} />}
      <NotFoundPanel>
        <h1>{t('sensitiveGateTitle')}</h1>
        <p>{t('sensitiveGateText')}</p>
        <div className="sensitive-gate__actions">
          <button type="button" className="detail-back-link" onClick={() => setShowSensitive(true)}>{t('sensitiveGateShow')}</button>
          <Link className="detail-back-link" to={mediaType === 'manga' ? '/manga' : '/anime'}>
            {mediaType === 'manga' ? t('backToMangaCatalog') : t('backToAnimeCatalog')}
          </Link>
        </div>
      </NotFoundPanel>
    </>
  );
}

function AnimePage({ theme, onThemeChange, mediaType = 'anime' }) {
  const isMobile = useIsMobile();
  const { lang, t } = useSiteLang();
  const { idOrSlug } = useParams();
  const animeCatalog = useCatalog();
  const mangaCatalog = useMangaCatalog();
  const catalog = mediaType === 'manga' ? mangaCatalog : animeCatalog;
  const visibleAnime = useVisibleCatalog();
  const visibleManga = useVisibleMangaCatalog();
  const showSensitive = useShowSensitive();
  // MAL-style /anime/136/Hunter_x_Hunter resolves by MyAnimeList id; plain /anime/{slug}
  // (legacy links and entries without an id) resolves by slug.
  const idMatch = /^(\d+)$/.exec(idOrSlug || '');
  let item = null;
  if (idMatch) item = catalog.find((entry) => String(entry.malId) === idMatch[1]) || null;
  if (!item) item = catalog.find((entry) => entry.slug === idOrSlug) || null;
  const resolved = item;
  // The catalog list is lite (no links / alternative titles / full synopsis);
  // anime detail pages pull those from /api/anime/:slug and merge them in.
  const [full, setFull] = useState(null);
  const resolvedSlug = resolved?.slug;
  useEffect(() => {
    setFull(null);
    if (!resolvedSlug || mediaType !== 'anime') return undefined;
    let cancelled = false;
    fetch(`/api/anime/${encodeURIComponent(resolvedSlug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.slug === resolvedSlug) setFull(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [resolvedSlug, mediaType]);
  if (item && full) {
    item = { ...item, synopsis: full.synopsis, availableAt: full.availableAt, alternativeTitles: full.alternativeTitles, streamingPlatforms: full.streamingPlatforms };
  }
  const detailSource = item;
  // Rank among the titles the visitor can see (weighted score, see lib/catalog-rules.js).
  const ranked = resolved ? (mediaType === 'manga' ? visibleManga : visibleAnime).find((entry) => entry.slug === resolved.slug) : null;
  item = {
    ...item,
    ...(ranked ? { rank: ranked.rank, weightedScore: ranked.weightedScore } : {}),
    // Both media types share the same synopsis contract: a legacy plain string
    // or bilingual { fa, en } — resolve it to the viewer's language (manga's
    // seeded rows carry both; anime shows Persian once one is stored).
    synopsis: synopsisText(detailSource, lang),
    // Persian text that is still an unreviewed machine translation gets a small note.
    synopsisAuto: lang === 'fa' && Boolean(detailSource?.synopsis?.auto && detailSource.synopsis.fa),
    ...(mediaType === 'manga'
      ? { image: item ? withMangaImages(mangaCatalog, animeCatalog).find((entry) => entry.slug === item.slug)?.image : item }
      : {}),
  };

  if (resolved && isSensitive(resolved) && !showSensitive) {
    return <SensitiveGate mediaType={mediaType} theme={theme} onThemeChange={onThemeChange} />;
  }

  return resolved ? <DetailPage key={`${mediaType}-${resolved.slug}`} item={item} mediaType={mediaType} theme={theme} onThemeChange={onThemeChange} /> : (
    <>
      {!isMobile && <SiteHeader theme={theme} onThemeChange={onThemeChange} />}
      <NotFoundPanel>
        <h1>{t('titleNotFound')}</h1>
        <p>{t('notLocal')}</p>
        <Link className="detail-back-link" to={mediaType === 'manga' ? '/manga' : '/anime'}>
          {mediaType === 'manga' ? t('backToMangaCatalog') : t('backToAnimeCatalog')}
        </Link>
      </NotFoundPanel>
    </>
  );
}

// Pages that don't render the topbar themselves get it wrapped on the route level.
function WithHeader({ theme, onThemeChange, children }) {
  const isMobile = useIsMobile();
  return (
    <>
      {!isMobile && <SiteHeader theme={theme} onThemeChange={onThemeChange} />}
      {children}
    </>
  );
}

function AppRoutes({ theme, onThemeChange }) {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  useScrollMemory(pathname, { skip: pathname.startsWith('/admin') });
  const routes = (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin/*" element={<Suspense fallback={<CatalogLoadingFallback />}><AdminApp theme={theme} onThemeChange={onThemeChange} /></Suspense>} />
      <Route path="/anime/:idOrSlug/:title?" element={<AnimePage theme={theme} onThemeChange={onThemeChange} />} />
      <Route path="/manga/:idOrSlug/:title?" element={<AnimePage theme={theme} onThemeChange={onThemeChange} mediaType="manga" />} />
      <Route path="/search" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><SearchPage /></WithHeader>} />
      <Route path="/login" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><AuthPage mode="login" /></WithHeader>} />
      <Route path="/register" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><AuthPage mode="register" /></WithHeader>} />
      <Route path="/forgot" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><ForgotPasswordPage /></WithHeader>} />
      <Route path="/reset-password" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><ResetPasswordPage /></WithHeader>} />
      <Route path="/verify-email" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><VerifyEmailPage /></WithHeader>} />
      <Route path="/account" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><AccountSecurityPage /></WithHeader>} />
      <Route path="/developers" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><DevelopersPage /></WithHeader>} />
      <Route path="/suggestions" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><MySuggestions /></WithHeader>} />
      <Route path="/stacks" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><StacksBrowse /></WithHeader>} />
      <Route path="/stacks/:id" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><StackView /></WithHeader>} />
      <Route path="/studio/:name" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><CompanyPage kind="studio" /></WithHeader>} />
      <Route path="/producer/:name" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><CompanyPage kind="producer" /></WithHeader>} />
      <Route path="/magazine/:name" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><CompanyPage kind="magazine" /></WithHeader>} />
      <Route path="/top/characters" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><TopCharactersPage /></WithHeader>} />
      <Route path="/character/:id" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><PeoplePage kind="character" /></WithHeader>} />
      <Route path="/person/:id" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><PeoplePage kind="person" /></WithHeader>} />
      <Route path="/import-list" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><ImportListPage /></WithHeader>} />
      <Route path="/dashboard" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><UserDashboard /></WithHeader>} />
      <Route path="/user/:username" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><UserPublicProfile /></WithHeader>} />
      <Route path="*" element={<SectionPage theme={theme} onThemeChange={onThemeChange} />} />
    </Routes>
  );
  if (isMobile && !pathname.startsWith('/admin')) {
    return <MobileShell>{routes}</MobileShell>;
  }
  return routes;
}

function CatalogSkeleton() {
  return (
    <main className="app-loading" aria-busy="true">
      <img className="loading-brand" src="/logo.svg" alt="" aria-hidden="true" width="66" height="66" />
      <div className="loading-grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="loading-card" />
        ))}
      </div>
    </main>
  );
}

function AppRoot() {
  const { theme, setTheme } = useTheme();
  const [lang, setLangState] = useState(() => {
    try {
      const stored = localStorage.getItem('siteLang');
      return stored === 'en' ? 'en' : DEFAULT_LANG;
    } catch {
      return DEFAULT_LANG;
    }
  });
  const [animeCatalog, setAnimeCatalog] = useState(null);
  const [mangaCatalog, setMangaCatalog] = useState([]);
  const [loadError, setLoadError] = useState(false);

  const t = useMemo(() => makeSiteT(lang), [lang]);

  const setLang = (next) => {
    setLangState(next);
    try { localStorage.setItem('siteLang', next); } catch { /* ignore */ }
  };

  useEffect(() => {
    let isActive = true;
    loadAnimeCatalog()
      .then((items) => {
        if (isActive) setAnimeCatalog(items);
      })
      .catch(() => {
        if (isActive) setLoadError(true);
      });
    loadMangaCatalog().then((items) => {
      if (isActive && Array.isArray(items)) setMangaCatalog(items);
    }).catch(() => { /* manga stays empty */ });
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [lang]);

  const langContext = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  if (!animeCatalog) {
    return <CatalogSkeleton />;
  }
  return (
    <UserProvider>
      <SiteLangContext.Provider value={langContext}>
        <MangaCatalogContext.Provider value={mangaCatalog}>
        <CatalogContext.Provider value={animeCatalog}>
          <BrowserRouter>
            {loadError && !animeCatalog.length
              ? <main className="app-state">{t('loadError')}</main>
              : <AppRoutes theme={theme} onThemeChange={setTheme} />}
          </BrowserRouter>
        </CatalogContext.Provider>
        </MangaCatalogContext.Provider>
      </SiteLangContext.Provider>
    </UserProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppRoot />
    </ThemeProvider>
  );
}
