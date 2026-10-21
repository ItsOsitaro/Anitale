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
import { loadAnimeCatalog, loadMangaCatalog, buildSchedule, mediaHref, foldTitle, currentWeekday } from './catalog.js';
import { CatalogContext, MangaCatalogContext, useCatalog, useMangaCatalog, withMangaImages } from './catalog-context.jsx';
import { useUser, UserProvider } from './user.jsx';
import { ThemeProvider, useTheme } from './theme-context.jsx';
import { AuthPage, UserDashboard, UserPublicProfile } from './userPages.jsx';
import { DEFAULT_LANG, L, SiteLangContext, makeSiteT, useSiteLang } from './i18n.js';
import {
  communitySections,
  directoryContent,
  editorialContent,
  homeContent,
  primaryNavigation,
  sectionPages,
  sidebarSections,
} from './sectionData.js';

const dayMessages = { Mon: 'dayMon', Tue: 'dayTue', Wed: 'dayWed', Thu: 'dayThu', Fri: 'dayFri', Sat: 'daySat', Sun: 'daySun' };

// خورشید/ماه site-native light/dark switch — knob slides, icons crossfade,
// colors live on the site's own tokens. Context-driven: works on every page.
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
        const data = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((res) => res.json());
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
    // Enter picks the highlighted option, or the first one otherwise.
    const picked = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
    if (picked) { go(picked); return; }
    setSearchMessage(t('noMatch'));
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
          <span className="brand-mark" aria-hidden="true">{lang === 'fa' ? 'پ' : 'P'}</span>
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
                          ? <img src={entry.image} alt="" loading="lazy" />
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
              </ul>
            )}
            {suggestOpen && search.trim() && suggestions.length === 0 && (
              <div id="search-suggest" className="search-suggest search-suggest-empty">
                <span role="status">{t('noMatch')}</span>
              </div>
            )}
            {searchMessage && !suggestOpen && <span className="search-message" role="status">{searchMessage}</span>}
          </form>
        </div>
      </div>
    </header>
  );
}

function SiteSidebar() {
  const { lang } = useSiteLang();
  return (
    <aside className="sidebar panel">
      {sidebarSections.map((section) => (
        <div className="sidebar-section" key={section.to ?? L(section.title, lang)}>
          <div className="side-title">{L(section.title, lang)}</div>
          <ul className="side-list">
            {section.links.map((item) => <li key={item.to}><Link to={item.to}>{L(item.label, lang)}</Link></li>)}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function AnimeCard({ item, rank }) {
  const { lang, t } = useSiteLang();
  const isManga = item.format === 'Manga';
  const href = mediaHref(item, isManga ? 'manga' : 'anime');
  // Queue 19: manga rows can carry a Persian display title (titleFa).
  const title = typeof item.title === 'string'
    ? (lang === 'fa' && item.titleFa ? item.titleFa : item.title)
    : L(item.title, lang);

  return (
    <article className="anime-card">
      {rank && <span className="card-rank">{String(rank).padStart(2, '0')}</span>}
      <Link className="anime-cover" to={href} aria-label={`${t(isManga ? 'breadcrumbManga' : 'breadcrumbAnime')}: ${title}`}>
        <img src={item.image} alt={title} loading="lazy" />
      </Link>
      <div className="anime-info">
        <Link to={href} className="anime-title">{title}</Link>
        <div className="anime-meta">
          <span>{item.category}</span>
          <span aria-hidden="true">·</span>
          <span dir="ltr">{item.year}</span>
        </div>
        {item.sampleScore && (
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

function AnimeGrid({ items, showRank = false }) {
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

      {!user.me && user.meLoaded && (
        <>
          <p className="user-cta-title"><strong>{t('panelJoinTitle')}</strong></p>
          <p className="user-cta-text">{t('panelJoinText')}</p>
          <Button asChild size="sm" className="user-cta-btn">
            <Link to="/login">{t('navAuth')}</Link>
          </Button>
        </>
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
            <button type="button" onClick={user.logout}>{t('dashLogout')}</button>
          </div>
        </>
      )}
    </div>
  );
}

function FriendUpdates() {
  const { lang, t } = useSiteLang();
  const animeCatalog = useCatalog();
  return (
    <div className="panel side-mini">
      <SectionHeading title={t('friendActivity')} to="/members" action="allActivity" />
      <ul className="friend-updates">
        {homeContent.friendUpdates.map((update) => {
          const anime = animeCatalog.find((item) => item.slug === update.slug);
          return (
            <li key={update.name}>
              <span className="friend-avatar" aria-hidden="true">{update.name[0]}</span>
              <span className="friend-update-copy">
                <strong>{update.name}</strong>
                <span>{L(update.action, lang)}</span>
                {anime && <Link to={mediaHref(anime)}>{typeof anime.title === 'string' ? anime.title : L(anime.title, lang)}</Link>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="sample-data-note">{t('friendNote')}</p>
    </div>
  );
}

function ClubPanel() {
  const { lang, t } = useSiteLang();
  const clubs = directoryContent.clubs;
  return (
    <div className="panel side-mini">
      <SectionHeading title={t('clubs')} to="/clubs" action="allClubs" />
      <ul className="compact-link-list">
        {clubs.items.slice(0, 4).map((club) => <li key={L(club, lang)}><Link to="/clubs">{L(club, lang)}</Link></li>)}
      </ul>
    </div>
  );
}

function CompactRanking({ title, items, to }) {
  const { lang, t } = useSiteLang();
  return (
    <div className="panel side-mini">
      <SectionHeading title={title} to={to} action="fullList" />
      <ol className="compact-ranking">
        {items.slice(0, 3).map((item, index) => (
          <li key={item.slug}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <Link to={mediaHref(item, item.format === 'Manga' ? 'manga' : 'anime')}>
              {typeof item.title === 'string' ? item.title : L(item.title, lang)}
            </Link>
            {item.sampleScore && <strong dir="ltr">{item.sampleScore.toFixed(1)}</strong>}
          </li>
        ))}
      </ol>
      <p className="sample-data-note">{t('rankingNote')}</p>
    </div>
  );
}

function EpisodeUpdates() {
  const { lang, t } = useSiteLang();
  const animeCatalog = useCatalog();
  return (
    <div className="episode-update-list">
      {homeContent.episodeUpdates.map((update) => {
        const anime = animeCatalog.find((item) => item.slug === update.slug);
        if (!anime) return null;
        return (
          <article className="episode-update" key={update.slug}>
            <Link className="episode-update-cover" to={mediaHref(anime)} aria-label={anime.title}>
              <img src={anime.image} alt={anime.title} loading="lazy" />
            </Link>
            <div>
              <Link className="episode-update-title" to={mediaHref(anime)}>{anime.title}</Link>
              <span>{L(update.label, lang)} · {L(update.note, lang)}</span>
            </div>
            <Link className="episode-update-action" to="/episodes">{t('open')}</Link>
          </article>
        );
      })}
      <p className="media-note">{t('mediaNote')}</p>
    </div>
  );
}

function SchedulePanel() {
  const { t } = useSiteLang();
  const animeCatalog = useCatalog();
  const entries = useMemo(() => buildSchedule(animeCatalog), [animeCatalog]);
  const today = useMemo(() => currentWeekday(), []);
  return (
    <div className="panel side-mini">
      <SectionHeading title={t('airingSchedule')} to="/seasonal" action="seasonAction" />
      <ul className="schedule-list">
        {entries.map((entry) => {
          const anime = animeCatalog.find((item) => item.slug === entry.slug);
          if (!anime) return null;
          return (
            <li key={entry.slug} className={entry.day === today ? 'is-today' : undefined}>
              <span className="schedule-title">
                <img className="schedule-cover" src={anime.image} alt="" loading="lazy" />
                <Link to={mediaHref(anime)}>{entry.title}</Link>
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

// Weekly schedule strip for the seasonal page: the titles that air on the
// viewer's current weekday, or nothing when the day has no premieres.
function AiringToday() {
  const { t } = useSiteLang();
  const animeCatalog = useCatalog();
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
              <img src={item.image} alt="" loading="lazy" />
              <span>{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickLinks() {
  const { t } = useSiteLang();
  return (
    <div className="panel side-mini">
      <SectionHeading title={t('quickLinks')} to="/community" action="explore" />
      <ul className="quick-list">
        <li><Link to="/seasonal"><span>{t('quickSeasonalCharts')}</span><span className="quick-arrow" aria-hidden="true">←</span></Link></li>
        <li><Link to="/recommendations"><span>{t('quickRecommendations')}</span><span className="quick-arrow" aria-hidden="true">←</span></Link></li>
        <li><Link to="/forums"><span>{t('quickDiscussions')}</span><span className="quick-arrow" aria-hidden="true">←</span></Link></li>
        <li><Link to="/top/manga"><span>{t('quickTopManga')}</span><span className="quick-arrow" aria-hidden="true">←</span></Link></li>
      </ul>
    </div>
  );
}

function StoryRows({ items, destination }) {
  const { lang, t } = useSiteLang();
  return (
    <div className="story-list">
      {items.map((item) => (
        <article className="story-row" key={item.to ?? L(item.title, lang)}>
          <div>
            <span className="story-category">{L(item.category, lang)}</span>
            <h3>{L(item.title, lang)}</h3>
            <p>{L(item.body || item.description, lang)}</p>
          </div>
          {destination && <Link to={destination}>{t('read')}</Link>}
        </article>
      ))}
    </div>
  );
}

function HomePage() {
  const { lang, t } = useSiteLang();
  const animeCatalog = useCatalog();
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
  const topAnime = sortBy(animeCatalog, (anime) => -anime.sampleScore).slice(0, 5);
  const trendingAnime = animeCatalog.slice(5, 10);
  const currentSeason = sortBy(animeCatalog, (anime) => -Number(anime.year)).slice(0, 5);
  const airingAnime = buildSchedule(animeCatalog)
    .map((entry) => animeCatalog.find((anime) => anime.slug === entry.slug))
    .filter(Boolean);
  const mangaItems = withMangaImages(useMangaCatalog(), animeCatalog);
  // Queue 20: currently-publishing manga, most chapters first (hidden when none).
  const freshManga = sortBy(
    mangaItems.filter((manga) => manga.publicationStatus === 'Publishing'),
    (manga) => (manga.chapters ?? 0),
  ).reverse().slice(0, 5);

  useEffect(() => {
    document.title = t('pageTitles').home;
  }, [t]);

  return (
    <>
      <SiteHeader />
      <div className="page-shell">
        <div className="layout">
          <main className="main-column">
            {featured && (
              <section className="hero panel" style={{ '--hero-image': `url("${featured.image}")` }}>
                <div className="hero-poster" aria-hidden="true">
                  <img src={featured.image} alt="" loading="lazy" />
                </div>
                <div className="hero-content">
                  <Badge variant="secondary" className="hero-eyebrow">{t('featuredLabel')}</Badge>
                  <h1>{featured.title}</h1>
                  <p>{featured.synopsis}</p>
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
            <section id="featuredSeries">
              <SectionHeading title={t('featuredSeries')} to="/anime" action="browseAll" />
              <div className="featured-series-grid">
                {topAnime.slice(0, 3).map((item) => (
                  <div key={item.slug} className="featured-series-card">
                    <Link to={mediaHref(item)} aria-label={item.title}>
                      <img src={item.image} alt={item.title} loading="lazy" />
                    </Link>
                    <div className="featured-series-info">
                      <h3><Link to={mediaHref(item)}>{item.title}</Link></h3>
                      <div className="featured-series-meta">
                        <span>{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr">{item.year}</span>
                      </div>
                      <div className="featured-series-score">
                        <span>{t('scoreLabel')}</span>
                        <strong><NumberTicker value={item.sampleScore} decimalPlaces={1} /></strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section id="topAnimeGrid">
              <SectionHeading title={t('topAnime')} to="/top/anime" action="fullRanking" />
              <AnimeShelf items={topAnime} showRank />
            </section>
            <section id="trendingGrid">
              <SectionHeading title={t('trendingNow')} to="/anime" action="explore" />
              <AnimeShelf items={trendingAnime} />
            </section>
            <section>
              <SectionHeading title={t('homeDiscussions')} to="/forums" action="openForums" />
              <StoryRows items={homeContent.discussions} destination="/forums" />
            </section>
            <section>
              <SectionHeading title={t('latestReviews')} to="/reviews" action="allReviews" />
              <StoryRows items={editorialContent.reviews.items} destination="/reviews" />
            </section>
            <section>
              <SectionHeading title={t('latestRecs')} to="/recommendations" action="findAWatch" />
              <StoryRows items={editorialContent.recommendations.items} destination="/recommendations" />
            </section>
            <section id="seasonalLineup">
              <SectionHeading title={t('seasonalLineup')} to="/seasonal" action="calendar" />
              <AnimeShelf items={currentSeason} />
            </section>
            <section>
              <SectionHeading title={t('episodeUpdates')} to="/episodes" action="episodeHub" />
              <EpisodeUpdates />
            </section>
            <section>
              <SectionHeading title={t('popularTrailers')} to="/videos" action="browseVideos" />
              <AnimeShelf items={sortBy(animeCatalog, (anime) => -anime.sampleScore).slice(0, 6)} />
              <p className="media-note">{t('trailerNote')}</p>
            </section>
            <section>
              <SectionHeading title={t('animeMangaNews')} to="/news" action="allNews" />
              <StoryRows items={editorialContent.news.items} destination="/news" />
            </section>
            <section>
              <SectionHeading title={t('topAiring')} to="/top/anime" action="fullRanking" />
              <RankedList items={airingAnime} toPrefix="/anime" />
            </section>
            <section>
              <SectionHeading title={t('topUpcoming')} to="/seasonal" action="calendar" />
              <AnimeShelf items={currentSeason.slice(0, 4)} />
            </section>
            <section>
              <SectionHeading title={t('mostPopular')} to="/top/anime" action="fullRanking" />
              <AnimeShelf items={sortBy(animeCatalog, (anime) => -anime.sampleScore).slice(0, 6)} />
            </section>
            <section>
              <SectionHeading title={t('mangaStoreShelf')} to="/store" action="readingShelf" />
              <AnimeShelf items={mangaItems.slice(0, 5)} />
            </section>
            {freshManga.length > 0 && (
              <section id="freshManga">
                <SectionHeading title={t('freshManga')} to="/manga" action="browseAll" />
                <AnimeShelf items={freshManga} />
              </section>
            )}
            <section>
              <SectionHeading title={t('animeSuggestions')} to="/recommendations" action="browseRecs" />
              <AnimeShelf items={trendingAnime.slice(0, 4)} />
            </section>
            <section>
              <SectionHeading title={t('mangaSuggestions')} to="/recommendations" action="browseRecs" />
              <AnimeShelf items={mangaItems.slice(1, 5)} />
            </section>
            <section>
              <SectionHeading title={t('editorialDesk')} to="/news" action="allStories" />
              <StoryRows items={editorialContent.news.items.slice(0, 2)} destination="/articles" />
            </section>
          </main>
          <SiteSidebar />
          <aside className="right-column">
            <UserPanel />
            <FriendUpdates />
            <ClubPanel />
            <SchedulePanel />
            <CompactRanking title={t('topAiring')} items={airingAnime} to="/top/anime" />
            <CompactRanking title={t('upcomingRanking')} items={currentSeason} to="/seasonal" />
            <CompactRanking title={t('popularRanking')} items={sortBy(animeCatalog, (anime) => -anime.sampleScore)} to="/top/anime" />
            <QuickLinks />
          </aside>
        </div>
        <section className="home-directory">
          <SectionHeading title={t('exploreCommunity')} to="/community" action="communityHub" />
          <div className="directory-grid">
            {communitySections.map((section) => (
              <Link className="directory-item" to={section.to} key={section.to}>
                <h3>{L(section.title, lang)}</h3>
                <p>{L(section.description, lang)}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function EditorialSection({ section }) {
  return <StoryRows items={section.items} destination="/community" />;
}

function DirectorySection({ directory }) {
  const { lang, t } = useSiteLang();
  const genericDirectoryNote = lang === 'fa'
    ? 'مدخل‌های مرتبط، فعالیت تازه و انتخاب‌های اجتماع را ببینید.'
    : 'Explore related entries, recent activity, and community picks.';
  return (
    <div className="directory-grid">
      {directory.items.map((item) => (
        <article className="directory-item" key={L(item, lang)}>
          <h3>{L(item, lang)}</h3>
          <p>{genericDirectoryNote}</p>
        </article>
      ))}
    </div>
  );
}

function CommunityHub() {
  const { lang } = useSiteLang();
  return (
    <div className="directory-grid">
      {communitySections.map((section) => (
        <Link className="directory-item" to={section.to} key={section.to}>
          <h3>{L(section.title, lang)}</h3>
          <p>{L(section.description, lang)}</p>
        </Link>
      ))}
    </div>
  );
}

function RankedList({ items, toPrefix }) {
  const { lang, t } = useSiteLang();
  const mediaType = toPrefix === '/manga' ? 'manga' : 'anime';
  return (
    <ol className="rank-list">
      {items.map((item, index) => (
        <li className="rank-row" key={item.slug}>
          <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
          <Link className="rank-cover" to={mediaHref(item, mediaType)} aria-label={item.title}>
            <img src={item.image} alt={item.title} loading="lazy" />
          </Link>
          <div className="rank-copy">
            <Link className="rank-title" to={mediaHref(item, mediaType)}>{item.title}</Link>
            <span><span>{item.category}</span><span aria-hidden="true">·</span><span dir="ltr">{item.year}</span></span>
          </div>
          {item.sampleScore && (
            <span className="rank-score">
              <NumberTicker value={item.sampleScore} decimalPlaces={1} />
              <small>{item.malId ? t('sourceScoreSuffix') : t('sampleSuffix')}</small>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function CatalogControls({ query, onQueryChange, genre, onGenreChange, genres, count, format, onFormatChange, formats, year, onYearChange, years, sort, onSortChange }) {
  const { t } = useSiteLang();
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
          {genres.map((item) => <option value={item} key={item}>{item}</option>)}
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
            {years.map((item) => <option value={item} key={item}>{item}</option>)}
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
  const animeCatalog = useCatalog();
  const mangaCatalog = useMangaCatalog();
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
      ? `${L(page.title || editorialContent[page.storySet]?.title || directoryContent[page.directory]?.title, lang)} ${t('pageTitles').suffix}`
      : t('pageTitles').notFoundTitle;
  }, [page, lang, t]);

  if (!page) {
    return (
      <>
        <SiteHeader theme={theme} onThemeChange={onThemeChange} />
        <NotFoundPanel>
          <h1>{t('pageNotFound')}</h1>
          <p>{t('notCatalog')}</p>
          <Link className="detail-back-link" to="/">{t('backHome')}</Link>
        </NotFoundPanel>
      </>
    );
  }

  const mangaItems = withMangaImages(mangaCatalog, animeCatalog);
  let items = [];
  if (['anime', 'anime-ranking', 'seasonal', 'adapted'].includes(page.kind)) {
    items = page.kind === 'anime-ranking'
      ? sortBy(animeCatalog, (anime) => -anime.sampleScore)
      : page.kind === 'adapted'
        ? animeCatalog.filter((anime) => mangaCatalog.some((manga) => manga.slug === anime.slug))
        : animeCatalog;
  } else if (['manga', 'manga-ranking'].includes(page.kind)) {
    items = page.kind === 'manga-ranking' ? sortBy(mangaItems, 'title') : mangaItems;
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
          const firstTitle = lang === 'fa' && first.titleFa ? first.titleFa : first.title;
          const secondTitle = lang === 'fa' && second.titleFa ? second.titleFa : second.title;
          return firstTitle.localeCompare(secondTitle, 'fa', { sensitivity: 'base' });
        }
        return (second.sampleScore ?? 0) - (first.sampleScore ?? 0);
      })
    : filteredItems;
  const editorial = editorialContent[page.storySet];
  const directory = directoryContent[page.directory];
  const title = page.title || editorial?.title || directory?.title;
  const description = page.description || editorial?.description || directory?.description;

  return (
    <>
      <SiteHeader theme={theme} onThemeChange={onThemeChange} />
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
        <div className="section-page-layout">
          <main className="section-main">
            {isCatalogPage && (
              <CatalogControls query={query} onQueryChange={setQuery} genre={genre} onGenreChange={setGenre} genres={genres} count={displayedItems.length} format={format} onFormatChange={setFormat} formats={formats} year={year} onYearChange={setYear} years={years} sort={sort} onSortChange={setSort} />
            )}
            {page.kind === 'seasonal' && <AiringToday />}
            {page.kind === 'anime-ranking' && <div className="sample-data-note">{t('animeRankingNote')}</div>}
            {page.kind === 'manga-ranking' && <div className="sample-data-note">{t('mangaRankingNote')}</div>}
            {['anime', 'anime-ranking', 'manga', 'manga-ranking', 'seasonal', 'adapted'].includes(page.kind) && (
              page.kind.includes('ranking')
                ? <RankedList items={filteredItems} toPrefix={page.kind === 'manga-ranking' ? '/manga' : '/anime'} />
                : <AnimeGrid items={displayedItems} />
            )}
            {page.kind === 'community' && <CommunityHub />}
            {page.kind === 'directory' && directory && <DirectorySection directory={directory} />}
            {page.kind === 'editorial' && editorial && <EditorialSection section={editorial} />}
          </main>
          <aside className="section-rail panel">
            <h2>{t('exploreSections')}</h2>
            {sidebarSections.map((section) => (
              <div className="rail-group" key={L(section.title, lang)}>
                <h3>{L(section.title, lang)}</h3>
                {section.links.map((item) => <Link to={item.to} key={item.to}>{L(item.label, lang)}</Link>)}
              </div>
            ))}
          </aside>
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
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailPage({ item, mediaType, theme, onThemeChange }) {
  const { lang, t } = useSiteLang();
  const animeCatalog = useCatalog();
  const user = useUser();
  const me = user.me;
  const isSaved = user.entries[mediaType].some((entry) => entry.slug === item.slug);
  const savedEntry = user.entries[mediaType].find((entry) => entry.slug === item.slug) || null;
  const related = animeCatalog
    .filter((entry) => entry.slug !== item.slug && entry.genres.some((entryGenre) => item.genres.includes(entryGenre)))
    .slice(0, 5);
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
  const informationRows = item.information || [
    { label: t('typeLabel'), value: mediaType === 'manga' ? (lang === 'fa' ? 'مانگا' : 'Manga') : item.format },
    { label: t('categoryLabel'), value: item.category },
    { label: t('yearLabel'), value: item.year },
    { label: t('genresLabel'), value: item.genres.join(lang === 'fa' ? '، ' : ', ') },
  ];
  const statisticsRows = item.statistics
    ? [
        { label: t('scoreLabel'), value: item.statistics.score },
        { label: t('scoredBy'), value: item.statistics.scoredBy },
        { label: t('rankedLabel'), value: item.statistics.ranked },
        { label: t('popularity'), value: item.statistics.popularity },
        { label: t('membersLabel'), value: item.statistics.members },
        { label: t('favoritesLabel'), value: item.statistics.favorites || t('notListed') },
      ]
    : [
        { label: t('scoreLabel'), value: item.sampleScore ? `${item.sampleScore.toFixed(1)}${item.malId ? ` (${t('sourceScoreSuffix')})` : ` (${t('sampleSuffix')})`}` : null },
        { label: t('rankedLabel'), value: t('notListed') },
        { label: t('membersLabel'), value: t('notListed') },
      ];

  useEffect(() => {
    document.title = `${item.title} ${t('pageTitles').suffix}`;
  }, [item.title, t]);

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

  const reviews = editorialContent.reviews.items.slice(0, 2);
  const homeDiscussions = homeContent.discussions;
  const newsItems = editorialContent.news.items;

  return (
    <>
      <SiteHeader theme={theme} onThemeChange={onThemeChange} />
      <div className="anime-page-shell">
        <PageBreadcrumb trail={[
          { to: '/', label: t('breadcrumbHome') },
          { to: mediaType === 'manga' ? '/manga' : '/anime', label: mediaType === 'manga' ? t('breadcrumbManga') : t('breadcrumbAnime') },
          { label: item.title },
        ]} />
        <main className="anime-detail-shell">
          <div className="anime-detail-layout">
            <aside className="detail-sidebar panel">
              <figure className="detail-cover"><img src={item.image} alt={item.title} /></figure>
              <Button
                className={`detail-list-button${isSaved ? ' is-saved' : ''}`}
                type="button"
                aria-pressed={isSaved}
                onClick={toggleSaved}
              >
                {isSaved ? t('inList') : t('addToList')}
              </Button>
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
              <div className="detail-sidebar-sections">
                {(alternativeTitles.synonyms?.length || alternativeTitles.japanese || alternativeTitles.english) && (
                  <DetailSection id="detailAlternativeTitles" title={t('alternativeTitles')} className="detail-sidebar-section">
                    <SidebarDataList rows={[
                      { label: t('synonyms'), value: alternativeTitles.synonyms?.join(lang === 'fa' ? '، ' : ', ') },
                      { label: t('japaneseTitle'), value: alternativeTitles.japanese },
                      { label: t('englishTitle'), value: alternativeTitles.english },
                    ]} />
                  </DetailSection>
                )}
                <DetailSection id="detailInformation" title={t('information')} className="detail-sidebar-section">
                  <SidebarDataList rows={informationRows} />
                </DetailSection>
                <DetailSection id="detailStatistics" title={t('statistics')} className="detail-sidebar-section">
                  <SidebarDataList rows={statisticsRows} />
                  {!item.statistics && <p>{t('prototypeNote')}</p>}
                </DetailSection>
                <DetailSection id="detailAvailableAt" title={t('availableAt')} className="detail-sidebar-section">
                  {item.availableAt?.length ? (
                    <ul className="sidebar-link-list">
                      {item.availableAt.map((entry) => (
                        <li key={entry.label}>
                          <span className="sidebar-resource-icon" aria-hidden="true">{entry.icon || '↗'}</span>
                          {entry.href ? <a href={entry.href} target="_blank" rel="noreferrer">{entry.label}</a> : <span>{entry.label}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p>{t('emptyLocalEntry')}</p>}
                </DetailSection>
                <DetailSection id="detailResources" title={t('resources')} className="detail-sidebar-section">
                  {item.resources?.length ? (
                    <>
                      <ul className="sidebar-link-list">
                        {item.resources.map((resource) => (
                          <li key={resource.label}>
                            <span className="sidebar-resource-icon" aria-hidden="true">{resource.icon}</span>
                            <span>{resource.label}</span>
                          </li>
                        ))}
                      </ul>
                      <a className="section-link" href="#detailNews">{t('moreLinks')}</a>
                    </>
                  ) : <p>{t('emptyLocalEntry')}</p>}
                </DetailSection>
                <DetailSection id="detailStreaming" title={t('streaming')} className="detail-sidebar-section">
                  {item.streamingPlatforms?.length ? (
                    <>
                      <ul className="streaming-platform-list">
                        {item.streamingPlatforms.map((platform) => (
                          <li key={platform}><span className="platform-mark" aria-hidden="true">{platform[0]}</span><span dir="ltr">{platform}</span></li>
                        ))}
                      </ul>
                      {item.streamingNotice && <p className="streaming-notice">{item.streamingNotice}</p>}
                    </>
                  ) : <p>{t('emptyLocalEntry')}</p>}
                </DetailSection>
              </div>
            </aside>

            <div className="detail-main-column">
              <section className="anime-profile">
                <div className="detail-copy">
                  <h1 dir="auto">{item.title}</h1>
                  {romajiTitle && romajiTitle !== item.title && (
                    <p className="detail-romaji" dir="ltr" lang="ja-Latn">{romajiTitle}</p>
                  )}
                </div>
              </section>

              <div className="detail-section-grid">
                <DetailSection id="detailSynopsis" title={t('synopsis')}>
                  <p className="detail-synopsis" dir="auto">{item.synopsis}</p>
                </DetailSection>
                <DetailSection id="detailBackground" title={t('background')}>
                  <p>{t('detailSynopsisNote')}</p>
                </DetailSection>
                <DetailSection id="detailRelatedEntries" title={t('relatedEntries')}>
                  <p>{t('detailRelatedNote')}</p>
                  <div className="detail-link-row"><Link to="/adapted">{t('mangaAdaptations')}</Link><Link to="/anime">{t('relatedTitles')}</Link></div>
                </DetailSection>
                <DetailSection id="detailCharacters" title={t('charactersVA')}>
                  <p>{t('detailCastNote')}</p>
                  <Link to="/characters" className="section-link">{t('characterDirectoryLink')}</Link>
                </DetailSection>
                <DetailSection id="detailStaff" title={t('staffSection')}>
                  <p>{t('detailStaffNote')}</p>
                  <Link to="/staff" className="section-link">{t('productionCredits')}</Link>
                </DetailSection>
                <DetailSection id="detailOpening" title={t('openingTheme')}>
                  <p>{t('detailThemeNote')}</p>
                </DetailSection>
                <DetailSection id="detailEnding" title={t('endingTheme')}>
                  <p>{t('detailEndingNote')}</p>
                </DetailSection>
                <DetailSection id="detailReviews" title={t('reviewsTitle')}>
                  {reviews.map((review) => (
                    <p className="detail-quote" key={L(review.title, lang)}>
                      <strong>{L(review.title, lang)}</strong> {L(review.body, lang)}
                    </p>
                  ))}
                  <Link to="/reviews" className="section-link">{t('readMoreReviews')}</Link>
                </DetailSection>
                <DetailSection id="detailStacks" title={t('interestStacks')}>
                  <p>{t('detailStacksNote')}</p>
                  <Link to="/stacks" className="section-link">{t('browseStacks')}</Link>
                </DetailSection>
                <DetailSection id="detailRecommendations" title={t('recommendationsTitle')}>
                  <p>{t('detailRecsNote')}</p>
                  <Link to="/recommendations" className="section-link">{t('browseRecs')}</Link>
                </DetailSection>
                <DetailSection id="detailNews" title={t('recentNews')}>
                  {newsItems.slice(0, 2).map((news) => (
                    <p className="detail-quote" key={L(news.title, lang)}>
                      <strong>{L(news.title, lang)}</strong> {L(news.body, lang)}
                    </p>
                  ))}
                  <Link to="/news" className="section-link">{t('moreNews')}</Link>
                </DetailSection>
                <DetailSection id="detailForums" title={t('forumTalk')}>
                  {homeDiscussions.slice(0, 2).map((discussion) => (
                    <p className="detail-quote" key={L(discussion.title, lang)}>
                      <strong>{L(discussion.title, lang)}</strong> {L(discussion.body, lang)}
                    </p>
                  ))}
                  <Link to="/forums" className="section-link">{t('openDiscussions')}</Link>
                </DetailSection>
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

function AnimePage({ theme, onThemeChange, mediaType = 'anime' }) {
  const { lang, t } = useSiteLang();
  const { idOrSlug } = useParams();
  const animeCatalog = useCatalog();
  const mangaCatalog = useMangaCatalog();
  const catalog = mediaType === 'manga' ? mangaCatalog : animeCatalog;
  // MAL-style /anime/136/Hunter_x_Hunter resolves by MyAnimeList id; plain /anime/{slug}
  // (legacy links and entries without an id) resolves by slug.
  const idMatch = /^(\d+)$/.exec(idOrSlug || '');
  let item = null;
  if (idMatch) item = catalog.find((entry) => String(entry.malId) === idMatch[1]) || null;
  if (!item) item = catalog.find((entry) => entry.slug === idOrSlug) || null;
  const resolved = item;
  item = mediaType === 'manga'
    ? { ...item, synopsis: item ? (typeof item.synopsis === 'string' ? item.synopsis : L(item.synopsis, lang)) : item, image: item ? withMangaImages(mangaCatalog, animeCatalog).find((entry) => entry.slug === item.slug)?.image : item }
    : item;
  // Queue 19: the fa storefront shows the Persian title when manga rows carry one.
  if (mediaType === 'manga' && item && lang === 'fa' && item.titleFa) item = { ...item, title: item.titleFa };

  return resolved ? <DetailPage key={`${mediaType}-${resolved.slug}`} item={item} mediaType={mediaType} theme={theme} onThemeChange={onThemeChange} /> : (
    <>
      <SiteHeader theme={theme} onThemeChange={onThemeChange} />
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
  return (
    <>
      <SiteHeader theme={theme} onThemeChange={onThemeChange} />
      {children}
    </>
  );
}

function AppRoutes({ theme, onThemeChange }) {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin/*" element={<Suspense fallback={<CatalogLoadingFallback />}><AdminApp theme={theme} onThemeChange={onThemeChange} /></Suspense>} />
      <Route path="/anime/:idOrSlug/:title?" element={<AnimePage theme={theme} onThemeChange={onThemeChange} />} />
      <Route path="/manga/:idOrSlug/:title?" element={<AnimePage theme={theme} onThemeChange={onThemeChange} mediaType="manga" />} />
      <Route path="/login" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><AuthPage mode="login" /></WithHeader>} />
      <Route path="/register" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><AuthPage mode="register" /></WithHeader>} />
      <Route path="/dashboard" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><UserDashboard /></WithHeader>} />
      <Route path="/user/:username" element={<WithHeader theme={theme} onThemeChange={onThemeChange}><UserPublicProfile /></WithHeader>} />
      <Route path="*" element={<SectionPage theme={theme} onThemeChange={onThemeChange} />} />
    </Routes>
  );
}

function CatalogSkeleton() {
  return (
    <main className="app-loading" aria-busy="true">
      <div className="loading-brand" aria-hidden="true" />
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
