import React, { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import uniq from 'lodash/uniq.js';
import sortBy from 'lodash/sortBy.js';
import { A11y, Navigation } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import { loadAnimeCatalog, schedule } from './catalog.js';
import {
  communitySections,
  directoryContent,
  editorialContent,
  homeContent,
  mangaCatalog,
  primaryNavigation,
  sectionPages,
  sidebarSections,
} from './sectionData.js';

const CatalogContext = createContext([]);
const useCatalog = () => useContext(CatalogContext);

const loadSavedItems = (key) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

function SiteHeader({ theme, onThemeChange }) {
  const navigate = useNavigate();
  const animeCatalog = useCatalog();
  const [search, setSearch] = useState('');
  const [searchMessage, setSearchMessage] = useState('');

  const handleSearch = (event) => {
    event.preventDefault();
    const query = search.trim().toLocaleLowerCase();
    if (!query) return;

    const animeMatch = animeCatalog.find((anime) => anime.title.toLocaleLowerCase().includes(query));
    const mangaMatch = mangaCatalog.find((manga) => manga.title.toLocaleLowerCase().includes(query));
    const match = animeMatch || mangaMatch;

    if (match) {
      setSearchMessage('');
      setSearch('');
      navigate(animeMatch ? `/anime/${animeMatch.slug}` : `/manga/${mangaMatch.slug}`);
    } else {
      setSearchMessage('No matching title found in this catalog.');
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" aria-label="MAL Clone home">
          <span className="brand-mark">M</span>
          <span>MAL Clone</span>
        </Link>

        <nav className="nav-links" aria-label="Main navigation">
          {primaryNavigation.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
        </nav>

        <div className="search-wrap">
          <div className="theme-select-wrap">
            <label htmlFor="themeSelect">Theme</label>
            <select id="themeSelect" className="theme-select" value={theme} onChange={(event) => onThemeChange(event.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <form className="search-box" onSubmit={handleSearch} role="search">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              aria-label="Search anime and manga"
              type="search"
              placeholder="Search titles..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {searchMessage && <span className="search-message" role="status">{searchMessage}</span>}
          </form>
        </div>
      </div>
    </header>
  );
}

function SiteSidebar() {
  return (
    <aside className="sidebar panel">
      {sidebarSections.map((section) => (
        <div className="sidebar-section" key={section.title}>
          <div className="side-title">{section.title}</div>
          <ul className="side-list">
            {section.links.map((item) => <li key={item.to}><Link to={item.to}>{item.label}</Link></li>)}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function AnimeCard({ item, rank }) {
  const isManga = item.format === 'Manga';
  const href = `/${isManga ? 'manga' : 'anime'}/${item.slug}`;

  return (
    <article className="anime-card">
      {rank && <span className="card-rank">{String(rank).padStart(2, '0')}</span>}
      <Link className="anime-cover" to={href} aria-label={`View ${item.title} details`}>
        <img src={item.image} alt={`Original cover artwork for ${item.title}`} loading="lazy" />
      </Link>
      <div className="anime-info">
        <Link to={href} className="anime-title">{item.title}</Link>
        <div className="anime-meta">{item.category} • {item.year}</div>
        {item.sampleScore && <div className="sample-score">Sample score <strong>{item.sampleScore.toFixed(1)}</strong></div>}
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

function SectionHeading({ title, to, action = 'Browse' }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <Link to={to} className="section-link">{action}</Link>
    </div>
  );
}

function UserPanel() {
  return (
    <div className="panel user-box">
      <div className="user-top">
        <div className="avatar">A</div>
        <div>
          <div className="user-name">AnimeFan</div>
          <div className="user-status">Sample profile</div>
        </div>
      </div>
      <div className="stats">
        <div className="stat"><strong>24</strong><span>Watching</span></div>
        <div className="stat"><strong>97</strong><span>Completed</span></div>
        <div className="stat"><strong>31</strong><span>Plan</span></div>
      </div>
    </div>
  );
}

function FriendUpdates() {
  const animeCatalog = useCatalog();
  return (
    <div className="panel side-mini">
      <SectionHeading title="Friend Activity" to="/members" action="All activity" />
      <ul className="friend-updates">
        {homeContent.friendUpdates.map((update) => {
          const anime = animeCatalog.find((item) => item.slug === update.slug);
          return (
            <li key={update.name}>
              <span className="friend-avatar" aria-hidden="true">{update.name[0]}</span>
              <span className="friend-update-copy">
                <strong>{update.name}</strong>
                <span>{update.action}</span>
                {anime && <Link to={`/anime/${anime.slug}`}>{anime.title}</Link>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="sample-data-note">Sample member activity</p>
    </div>
  );
}

function ClubPanel() {
  return (
    <div className="panel side-mini">
      <SectionHeading title="Clubs" to="/clubs" action="All clubs" />
      <ul className="compact-link-list">
        {directoryContent.clubs.items.slice(0, 4).map((club) => <li key={club}><Link to="/clubs">{club}</Link></li>)}
      </ul>
    </div>
  );
}

function CompactRanking({ title, items, to }) {
  return (
    <div className="panel side-mini">
      <SectionHeading title={title} to={to} action="More" />
      <ol className="compact-ranking">
        {items.slice(0, 3).map((item, index) => (
          <li key={item.slug}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <Link to={`/${item.format === 'Manga' ? 'manga' : 'anime'}/${item.slug}`}>{item.title}</Link>
            {item.sampleScore && <strong>{item.sampleScore.toFixed(1)}</strong>}
          </li>
        ))}
      </ol>
      <p className="sample-data-note">Local sample rankings</p>
    </div>
  );
}

function EpisodeUpdates() {
  const animeCatalog = useCatalog();
  return (
    <div className="episode-update-list">
      {homeContent.episodeUpdates.map((update) => {
        const anime = animeCatalog.find((item) => item.slug === update.slug);
        if (!anime) return null;
        return (
          <article className="episode-update" key={update.slug}>
            <Link className="episode-update-cover" to={`/anime/${anime.slug}`}>
              <img src={anime.image} alt="" loading="lazy" />
            </Link>
            <div>
              <Link className="episode-update-title" to={`/anime/${anime.slug}`}>{anime.title}</Link>
              <span>{update.label} · {update.note}</span>
            </div>
            <Link className="episode-update-action" to="/episodes">Open</Link>
          </article>
        );
      })}
      <p className="media-note">Video playback is not hosted by this local prototype.</p>
    </div>
  );
}

function SchedulePanel() {
  const animeCatalog = useCatalog();
  return (
    <div className="panel side-mini">
      <SectionHeading title="Airing Schedule" to="/seasonal" action="Season" />
      <ul className="schedule-list">
        {schedule.map((entry) => {
          const anime = animeCatalog.find((item) => item.slug === entry.slug);
          if (!anime) return null;
          return (
            <li key={entry.slug}>
              <span className="schedule-title">
                <img className="schedule-cover" src={anime.image} alt="" loading="lazy" />
                <Link to={`/anime/${entry.slug}`}>{entry.title}</Link>
              </span>
              <span className="day-badge">{entry.day}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuickLinks() {
  return (
    <div className="panel side-mini">
      <SectionHeading title="Quick Links" to="/community" action="Explore" />
      <ul className="quick-list">
        <li><Link to="/seasonal"><span>Seasonal charts</span><span aria-hidden="true">→</span></Link></li>
        <li><Link to="/recommendations"><span>Recommendations</span><span aria-hidden="true">→</span></Link></li>
        <li><Link to="/forums"><span>Discussions</span><span aria-hidden="true">→</span></Link></li>
        <li><Link to="/top/manga"><span>Top manga</span><span aria-hidden="true">→</span></Link></li>
      </ul>
    </div>
  );
}

function StoryRows({ items, destination }) {
  return (
    <div className="story-list">
      {items.map((item) => (
        <article className="story-row" key={item.title}>
          <div>
            <span className="story-category">{item.category}</span>
            <h3>{item.title}</h3>
            <p>{item.body || item.description}</p>
          </div>
          <Link to={destination} aria-label={`Explore ${item.title}`}>Read</Link>
        </article>
      ))}
    </div>
  );
}

function HomePage({ theme, onThemeChange }) {
  const animeCatalog = useCatalog();
  // For a better experience, we'll pre-load some important featured items
  const featured = animeCatalog.find((anime) => anime.slug === 'attack-on-titan') || animeCatalog[0];
  const topAnime = sortBy(animeCatalog, (anime) => -anime.sampleScore).slice(0, 5);
  const trendingAnime = animeCatalog.slice(5, 10);
  const currentSeason = sortBy(animeCatalog, (anime) => -Number(anime.year)).slice(0, 5);
  const airingAnime = schedule.map((entry) => animeCatalog.find((anime) => anime.slug === entry.slug)).filter(Boolean);
  const mangaItems = mangaCatalog.map((manga) => ({
    ...manga,
    image: animeCatalog.find((anime) => anime.slug === manga.imageSlug)?.image,
  }));

  useEffect(() => {
    document.title = 'MAL Clone';
  }, []);

  return (
    <>
      <SiteHeader theme={theme} onThemeChange={onThemeChange} />
      <div className="page-shell">
        <div className="layout">
          <main className="main-column">
            {featured && (
              <section className="hero panel">
                <div className="hero-content">
                  <div className="eyebrow">Featured series</div>
                  <h1>{featured.title}</h1>
                  <p>{featured.synopsis}</p>
                  <Link className="hero-action" to={`/anime/${featured.slug}`}>View anime</Link>
                </div>
              </section>
            )}
            <section id="topAnimeGrid">
              <SectionHeading title="Top Anime" to="/top/anime" action="Full rankings" />
              <AnimeShelf items={topAnime} showRank />
            </section>
            <section id="trendingGrid">
              <SectionHeading title="Trending Now" to="/anime" action="Explore" />
              <AnimeShelf items={trendingAnime} />
            </section>
            <section>
              <SectionHeading title="Recent Anime Discussions" to="/forums" action="Open forums" />
              <StoryRows items={homeContent.discussions} destination="/forums" />
            </section>
            <section>
              <SectionHeading title="Latest Anime Reviews" to="/reviews" action="All reviews" />
              <StoryRows items={editorialContent.reviews.items} destination="/reviews" />
            </section>
            <section>
              <SectionHeading title="Latest Recommendations" to="/recommendations" action="Find a watch" />
              <StoryRows items={editorialContent.recommendations.items} destination="/recommendations" />
            </section>
            <section id="seasonalLineup">
              <SectionHeading title="Seasonal Lineup" to="/seasonal" action="Calendar" />
              <AnimeShelf items={currentSeason} />
            </section>
            <section>
              <SectionHeading title="Latest Episode Video Updates" to="/episodes" action="Episode hub" />
              <EpisodeUpdates />
            </section>
            <section>
              <SectionHeading title="Popular Anime Trailers" to="/videos" action="Browse videos" />
              <AnimeShelf items={sortBy(animeCatalog, (anime) => -anime.sampleScore).slice(0, 6)} />
              <p className="media-note">Trailer shelf preview; original local artwork is used in place of hosted video.</p>
            </section>
            <section>
              <SectionHeading title="Anime & Manga News" to="/news" action="All news" />
              <StoryRows items={editorialContent.news.items} destination="/news" />
            </section>
            <section>
              <SectionHeading title="Top Airing Anime" to="/top/anime" action="Full rankings" />
              <RankedList items={airingAnime} toPrefix="/anime" />
            </section>
            <section>
              <SectionHeading title="Top Upcoming Anime" to="/seasonal" action="Seasonal chart" />
              <AnimeShelf items={currentSeason.slice(0, 4)} />
            </section>
            <section>
              <SectionHeading title="Most Popular Anime" to="/top/anime" action="Full rankings" />
              <AnimeShelf items={sortBy(animeCatalog, (anime) => -anime.sampleScore).slice(0, 6)} />
            </section>
            <section>
              <SectionHeading title="Popular Manga Store Comics" to="/store" action="Reading shelf" />
              <AnimeShelf items={mangaItems.slice(0, 5)} />
            </section>
            <section>
              <SectionHeading title="Anime Suggestions" to="/recommendations" action="More ideas" />
              <AnimeShelf items={trendingAnime.slice(0, 4)} />
            </section>
            <section>
              <SectionHeading title="Manga Suggestions" to="/recommendations" action="More ideas" />
              <AnimeShelf items={mangaItems.slice(1, 5)} />
            </section>
            <section>
              <SectionHeading title="From the Editorial Desk" to="/news" action="All stories" />
              <StoryRows items={editorialContent.news.items.slice(0, 2)} destination="/articles" />
            </section>
          </main>
          <SiteSidebar />
          <aside className="right-column">
            <UserPanel />
            <FriendUpdates />
            <ClubPanel />
            <SchedulePanel />
            <CompactRanking title="Top Airing" items={airingAnime} to="/top/anime" />
            <CompactRanking title="Upcoming Ranking" items={currentSeason} to="/seasonal" />
            <CompactRanking title="Popular Ranking" items={sortBy(animeCatalog, (anime) => -anime.sampleScore)} to="/top/anime" />
            <QuickLinks />
          </aside>
        </div>
        <section className="home-directory">
          <SectionHeading title="Explore the community" to="/community" action="Community hub" />
          <div className="directory-grid">
            {communitySections.map((section) => (
              <Link className="directory-item" to={section.to} key={section.to}>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
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
  return (
    <div className="directory-grid">
      {directory.items.map((item, index) => (
        <article className="directory-item" key={item}>
          <span className="directory-index">{String(index + 1).padStart(2, '0')}</span>
          <h3>{item}</h3>
          <p>Explore related entries, recent activity, and community picks.</p>
        </article>
      ))}
    </div>
  );
}

function CommunityHub() {
  return (
    <div className="directory-grid">
      {communitySections.map((section) => (
        <Link className="directory-item" to={section.to} key={section.to}>
          <h3>{section.title}</h3>
          <p>{section.description}</p>
        </Link>
      ))}
    </div>
  );
}

function RankedList({ items, toPrefix }) {
  return (
    <ol className="rank-list">
      {items.map((item, index) => (
        <li className="rank-row" key={item.slug}>
          <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
          <Link className="rank-cover" to={`${toPrefix}/${item.slug}`}>
            <img src={item.image} alt="" loading="lazy" />
          </Link>
          <div className="rank-copy">
            <Link className="rank-title" to={`${toPrefix}/${item.slug}`}>{item.title}</Link>
            <span>{item.category} • {item.year}</span>
          </div>
          {item.sampleScore && <span className="rank-score">{item.sampleScore.toFixed(1)}<small>sample</small></span>}
        </li>
      ))}
    </ol>
  );
}

function CatalogControls({ query, onQueryChange, genre, onGenreChange, genres, count }) {
  return (
    <div className="catalog-controls">
      <label>
        <span>Filter titles</span>
        <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Title or keyword" />
      </label>
      <label>
        <span>Genre</span>
        <select value={genre} onChange={(event) => onGenreChange(event.target.value)}>
          <option value="All">All genres</option>
          {genres.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </label>
      <span className="catalog-count">{count} titles</span>
    </div>
  );
}

function SectionPage({ theme, onThemeChange }) {
  const { pathname } = useLocation();
  const animeCatalog = useCatalog();
  const page = sectionPages[pathname];
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All');

  useEffect(() => {
    setQuery('');
    setGenre('All');
  }, [pathname]);

  useEffect(() => {
    document.title = page ? `${page.title || editorialContent[page.storySet]?.title || directoryContent[page.directory]?.title} | MAL Clone` : 'Page Not Found | MAL Clone';
  }, [page]);

  if (!page) {
    return (
      <>
        <SiteHeader theme={theme} onThemeChange={onThemeChange} />
        <main className="anime-missing panel">
          <h1>Page not found</h1>
          <p>This section is not part of the local catalog.</p>
          <Link className="detail-back-link" to="/">Back to home</Link>
        </main>
      </>
    );
  }

  const mangaItems = mangaCatalog.map((manga) => ({
    ...manga,
    image: animeCatalog.find((anime) => anime.slug === manga.imageSlug)?.image,
  }));
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
  const filteredItems = items.filter((item) => {
    const matchesQuery = `${item.title} ${item.category} ${item.genres.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    const matchesGenre = genre === 'All' || item.genres.includes(genre);
    return matchesQuery && matchesGenre;
  });
  const editorial = editorialContent[page.storySet];
  const directory = directoryContent[page.directory];
  const title = page.title || editorial?.title || directory?.title;
  const description = page.description || editorial?.description || directory?.description;

  return (
    <>
      <SiteHeader theme={theme} onThemeChange={onThemeChange} />
      <div className="section-page-shell">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link><span aria-hidden="true">/</span><span>{page.eyebrow}</span><span aria-hidden="true">/</span><span>{title}</span>
        </nav>
        <header className="section-masthead">
          <div className="eyebrow">{page.eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <div className="section-page-layout">
          <main className="section-main">
            {isCatalogPage && (
              <CatalogControls query={query} onQueryChange={setQuery} genre={genre} onGenreChange={setGenre} genres={genres} count={filteredItems.length} />
            )}
            {page.kind === 'anime-ranking' && <div className="sample-data-note">Scores shown are sample data for this prototype.</div>}
            {page.kind === 'manga-ranking' && <div className="sample-data-note">This local ranking is a curated sample, not a live chart.</div>}
            {['anime', 'anime-ranking', 'manga', 'manga-ranking', 'seasonal', 'adapted'].includes(page.kind) && (
              page.kind.includes('ranking')
                ? <RankedList items={filteredItems} toPrefix={page.kind === 'manga-ranking' ? '/manga' : '/anime'} />
                : <AnimeGrid items={filteredItems} />
            )}
            {page.kind === 'community' && <CommunityHub />}
            {page.kind === 'directory' && directory && <DirectorySection directory={directory} />}
            {page.kind === 'editorial' && editorial && <EditorialSection section={editorial} />}
          </main>
          <aside className="section-rail panel">
            <h2>Explore sections</h2>
            {sidebarSections.map((section) => (
              <div className="rail-group" key={section.title}>
                <h3>{section.title}</h3>
                {section.links.map((item) => <Link to={item.to} key={item.to}>{item.label}</Link>)}
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
  const animeCatalog = useCatalog();
  const listKey = mediaType === 'manga' ? 'malMangaList' : 'malAnimeList';
  const [isSaved, setIsSaved] = useState(() => loadSavedItems(listKey).includes(item.slug));
  const related = animeCatalog
    .filter((entry) => entry.slug !== item.slug && entry.genres.some((entryGenre) => item.genres.includes(entryGenre)))
    .slice(0, 5);
  const alternativeTitles = item.alternativeTitles || {};
  const informationRows = item.information || [
    { label: 'Type', value: mediaType === 'manga' ? 'Manga' : item.format },
    { label: 'Category', value: item.category },
    { label: 'Year', value: item.year },
    { label: 'Genres', value: item.genres.join(', ') },
  ];
  const statisticsRows = item.statistics
    ? [
        { label: 'Score', value: item.statistics.score },
        { label: 'Scored by', value: item.statistics.scoredBy },
        { label: 'Ranked', value: item.statistics.ranked },
        { label: 'Popularity', value: item.statistics.popularity },
        { label: 'Members', value: item.statistics.members },
        { label: 'Favorites', value: item.statistics.favorites || 'Not listed' },
      ]
    : [
        { label: 'Score', value: item.sampleScore ? `${item.sampleScore.toFixed(1)} (sample)` : null },
        { label: 'Ranked', value: 'Not listed in local data' },
        { label: 'Members', value: 'Not listed in local data' },
      ];

  useEffect(() => {
    document.title = `${item.title} | MAL Clone`;
  }, [item.title]);

  const toggleSaved = () => {
    const saved = loadSavedItems(listKey);
    const updated = saved.includes(item.slug) ? saved.filter((slug) => slug !== item.slug) : [...saved, item.slug];
    localStorage.setItem(listKey, JSON.stringify(updated));
    setIsSaved(updated.includes(item.slug));
  };

  const reviews = editorialContent.reviews.items.slice(0, 2);

  return (
    <>
      <SiteHeader theme={theme} onThemeChange={onThemeChange} />
      <div className="anime-page-shell">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link><span aria-hidden="true">/</span>
          <Link to={mediaType === 'manga' ? '/manga' : '/anime'}>{mediaType === 'manga' ? 'Manga' : 'Anime'}</Link>
          <span aria-hidden="true">/</span><span>{item.title}</span>
        </nav>
        <main className="anime-detail-shell">
          <div className="anime-detail-layout">
            <aside className="detail-sidebar panel">
              <figure className="detail-cover"><img src={item.image} alt={`Original cover artwork for ${item.title}`} /></figure>
              <button className={`detail-list-button${isSaved ? ' is-saved' : ''}`} type="button" aria-pressed={isSaved} onClick={toggleSaved}>
                {isSaved ? 'In your list' : 'Add to list'}
              </button>
              <div className="detail-sidebar-sections">
                <DetailSection id="detailAlternativeTitles" title="Alternative Titles" className="detail-sidebar-section">
                  {alternativeTitles.synonyms?.length || alternativeTitles.japanese || alternativeTitles.english ? (
                    <SidebarDataList rows={[
                      { label: 'Synonyms', value: alternativeTitles.synonyms?.join(', ') },
                      { label: 'Japanese', value: alternativeTitles.japanese },
                      { label: 'English', value: alternativeTitles.english },
                    ]} />
                  ) : <p>No additional titles in this local entry.</p>}
                </DetailSection>
                <DetailSection id="detailInformation" title="Information" className="detail-sidebar-section">
                  <SidebarDataList rows={informationRows} />
                </DetailSection>
                <DetailSection id="detailStatistics" title="Statistics" className="detail-sidebar-section">
                  <SidebarDataList rows={statisticsRows} />
                  {!item.statistics && <p>Prototype data, not live community statistics.</p>}
                </DetailSection>
                <DetailSection id="detailAvailableAt" title="Available At" className="detail-sidebar-section">
                  {item.availableAt?.length ? (
                    <ul className="sidebar-link-list">
                      {item.availableAt.map((entry) => (
                        <li key={entry.label}>
                          <span className="sidebar-resource-icon" aria-hidden="true">{entry.icon || '↗'}</span>
                          {entry.href ? <a href={entry.href} target="_blank" rel="noreferrer">{entry.label}</a> : <span>{entry.label}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p>No availability details in this local entry.</p>}
                </DetailSection>
                <DetailSection id="detailResources" title="Resources" className="detail-sidebar-section">
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
                      <a className="section-link" href="#detailNews">More links</a>
                    </>
                  ) : <p>No resource links are listed for this title.</p>}
                </DetailSection>
                <DetailSection id="detailStreaming" title="Streaming Platforms" className="detail-sidebar-section">
                  {item.streamingPlatforms?.length ? (
                    <>
                      <ul className="streaming-platform-list">
                        {item.streamingPlatforms.map((platform) => (
                          <li key={platform}><span className="platform-mark" aria-hidden="true">{platform[0]}</span><span>{platform}</span></li>
                        ))}
                      </ul>
                      {item.streamingNotice && <p className="streaming-notice">{item.streamingNotice}</p>}
                    </>
                  ) : <p>No streaming platforms listed in this local entry.</p>}
                </DetailSection>
              </div>
            </aside>

            <div className="detail-main-column">
              <section className="anime-profile">
                <div className="detail-copy">
                  <div className="eyebrow detail-eyebrow">{mediaType === 'manga' ? 'Manga profile' : 'Series profile'}</div>
                  <h1>{item.title}</h1>
                  <p className="detail-subline">{item.category} • {item.year} <span>{mediaType === 'manga' ? 'Manga' : item.format}</span></p>
                </div>
              </section>

              <div className="detail-section-grid">
            <DetailSection id="detailSynopsis" title="Synopsis">
              <p className="detail-synopsis">{item.synopsis}</p>
            </DetailSection>
            <DetailSection id="detailBackground" title="Background">
              <p>Production notes and release history are not included in this local catalog entry.</p>
            </DetailSection>
            <DetailSection id="detailRelatedEntries" title="Related Entries">
              <p>Explore related anime and manga entries from the local catalog.</p>
              <div className="detail-link-row"><Link to="/adapted">Manga adaptations</Link><Link to="/anime">Related titles</Link></div>
            </DetailSection>
            <DetailSection id="detailCharacters" title="Characters & Voice Actors">
              <p>Cast and character records are not included in this local sample.</p>
              <Link to="/characters" className="section-link">Open character directory</Link>
            </DetailSection>
            <DetailSection id="detailStaff" title="Staff">
              <p>Browse creative roles, studios, and collaborators connected to anime and manga.</p>
              <Link to="/staff" className="section-link">Explore production credits</Link>
            </DetailSection>
            <DetailSection id="detailOpening" title="Opening Theme">
              <p>Opening theme credits are not included in this local entry.</p>
            </DetailSection>
            <DetailSection id="detailEnding" title="Ending Theme">
              <p>Ending theme credits are not included in this local entry.</p>
            </DetailSection>
            <DetailSection id="detailReviews" title="Reviews">
              {reviews.map((review) => <p className="detail-quote" key={review.title}><strong>{review.title}</strong> {review.body}</p>)}
              <Link to="/reviews" className="section-link">Read more reviews</Link>
            </DetailSection>
            <DetailSection id="detailStacks" title="Interest Stacks">
              <p>Collect this title with other entries in themed viewing and reading lists.</p>
              <Link to="/stacks" className="section-link">Browse interest stacks</Link>
            </DetailSection>
            <DetailSection id="detailRecommendations" title="Recommendations">
              <p>Find another story through shared genres and themes.</p>
              <Link to="/recommendations" className="section-link">Browse recommendations</Link>
            </DetailSection>
            <DetailSection id="detailNews" title="Recent News">
              {editorialContent.news.items.slice(0, 2).map((news) => <p className="detail-quote" key={news.title}><strong>{news.title}</strong> {news.body}</p>)}
              <Link to="/news" className="section-link">More news</Link>
            </DetailSection>
            <DetailSection id="detailForums" title="Recent Forum Discussion">
              {homeContent.discussions.slice(0, 2).map((discussion) => <p className="detail-quote" key={discussion.title}><strong>{discussion.title}</strong> {discussion.body}</p>)}
              <Link to="/forums" className="section-link">Open discussions</Link>
            </DetailSection>
          </div>
            </div>
          </div>

          <section className="related-section" aria-labelledby="relatedHeading">
            <SectionHeading title="Related anime" to={mediaType === 'manga' ? '/manga' : '/anime'} action="Browse all" />
            <AnimeGrid items={related} />
          </section>
        </main>
      </div>
    </>
  );
}

function AnimePage({ theme, onThemeChange, mediaType = 'anime' }) {
  const { slug } = useParams();
  const animeCatalog = useCatalog();
  const anime = mediaType === 'manga'
    ? mangaCatalog.find((item) => item.slug === slug)
    : animeCatalog.find((item) => item.slug === slug);
  const item = mediaType === 'manga'
    ? { ...anime, image: animeCatalog.find((entry) => entry.slug === anime?.imageSlug)?.image }
    : anime;

  return item ? <DetailPage key={`${mediaType}-${item.slug}`} item={item} mediaType={mediaType} theme={theme} onThemeChange={onThemeChange} /> : (
    <>
      <SiteHeader theme={theme} onThemeChange={onThemeChange} />
      <main className="anime-missing panel">
        <h1>Title not found</h1>
        <p>That title is not in this local catalog.</p>
        <Link className="detail-back-link" to={mediaType === 'manga' ? '/manga' : '/anime'}>Back to {mediaType} catalog</Link>
      </main>
    </>
  );
}

function AppRoutes({ theme, onThemeChange }) {
  return (
    <Routes>
      <Route path="/" element={<HomePage theme={theme} onThemeChange={onThemeChange} />} />
      <Route path="/anime/:slug" element={<AnimePage theme={theme} onThemeChange={onThemeChange} />} />
      <Route path="/manga/:slug" element={<AnimePage theme={theme} onThemeChange={onThemeChange} mediaType="manga" />} />
      <Route path="*" element={<SectionPage theme={theme} onThemeChange={onThemeChange} />} />
    </Routes>
  );
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('malTheme') || 'light');
  const [animeCatalog, setAnimeCatalog] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isActive = true;
    loadAnimeCatalog()
      .then((items) => {
        if (isActive) setAnimeCatalog(items);
      })
      .catch(() => {
        if (isActive) setLoadError(true);
      });
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('malTheme', theme);
  }, [theme]);

  if (!animeCatalog) {
    return <main className="app-state">{loadError ? 'The local catalog could not be loaded.' : 'Loading catalog...'}</main>;
  }

  return (
    <CatalogContext.Provider value={animeCatalog}>
      <BrowserRouter>
        <AppRoutes theme={theme} onThemeChange={setTheme} />
      </BrowserRouter>
    </CatalogContext.Provider>
  );
}

export default App;
