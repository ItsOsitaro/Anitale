import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteLang } from '@/i18n';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import { coverUrl } from '@/lib/cover';
import { genreLabel } from '@/lib/genre-kinds';
import { useShowSensitive } from '@/lib/catalog-rules';
import { formatNumber, formatScore } from '@/lib/digits.js';
import { genreFromSlug, landingGenres, slugOfGenre, validSeason, premieredKey, SEASON_FA, SEASON_EN } from '@/lib/landing';

const seasonName = (season, lang) => (lang === 'fa' ? SEASON_FA[season] : SEASON_EN[season]);

// Best anime of one genre, or everything that aired in one season: a plain list over /api/search/full.
export function BrowsePage({ kind }) {
  const { t, lang } = useSiteLang();
  const { slug, year, season } = useParams();
  const showSensitive = useShowSensitive();
  const genre = kind === 'genre' ? genreFromSlug(slug) : null;
  const valid = kind === 'genre' ? Boolean(genre) : validSeason(year, season);
  const [state, setState] = useState({ items: [], total: 0, page: 0, pages: 1, status: 'loading' });

  const heading = !valid ? '' : kind === 'genre'
    ? t('landBestGenre', { genre: genreLabel(genre, lang) })
    : t('landSeasonTitle', { season: seasonName(season, lang), year: formatNumber(year, lang, { useGrouping: false }) });
  const query = kind === 'genre' ? `genre=${encodeURIComponent(genre || '')}&sort=score` : `premiered=${encodeURIComponent(premieredKey(year, season))}&sort=pop`;

  const load = async (page) => {
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const res = await fetch(`/api/search/full?type=anime&${query}&page=${page}${showSensitive ? '' : '&sfw=1'}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setState((current) => ({ items: page === 1 ? data.items : [...current.items, ...data.items], total: data.total, page: data.page, pages: data.pages, status: 'ready' }));
    } catch { setState((current) => ({ ...current, status: 'failed' })); }
  };
  useEffect(() => { if (valid) { setState({ items: [], total: 0, page: 0, pages: 1, status: 'loading' }); load(1); } }, [kind, slug, year, season, showSensitive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = `${valid ? heading : t('landNotFound')} · ${t('siteName')}`; }, [heading, valid, t]);

  if (!valid) return <main className="landing"><h1>{t('landNotFound')}</h1><p><Link to="/genres">{t('landAllLink')}</Link></p></main>;
  return (
    <main className="landing">
      <nav className="landing__crumb" aria-label="breadcrumb"><Link to="/genres">{t('landIndexTitle')}</Link></nav>
      <h1>{heading}</h1>
      {state.status === 'ready' && <p className="landing__intro">{t(kind === 'genre' ? 'landIntroGenre' : 'landIntroSeason', { n: formatNumber(state.total, lang) })}</p>}
      {state.status === 'failed' && <p role="alert">{t('authGenericError')}</p>}
      <ul className="search-grid">
        {state.items.map((item) => (
          <li key={item.slug}>
            <Link to={mediaHref(item, 'anime')} className="search-card">
              <span className="search-card__cover">
                {item.image ? <img src={coverUrl(item.image, 240)} alt="" loading="lazy" decoding="async" /> : null}
                {item.score ? <span className="search-card__score" dir="ltr">{formatScore(item.score, lang)}</span> : null}
              </span>
              <span className="search-card__title" dir="auto">{displayTitle(item, lang)}</span>
              <span className="search-card__meta">{item.year ? <span dir="ltr">{formatNumber(item.year, lang, { useGrouping: false })}</span> : null}</span>
            </Link>
          </li>
        ))}
      </ul>
      {state.status === 'ready' && state.page < state.pages && <div className="landing__more"><Button type="button" variant="outline" onClick={() => load(state.page + 1)}>{t('landMore')}</Button></div>}
      {state.status === 'loading' && <p className="media-note" role="status">{t('loading')}</p>}
    </main>
  );
}

// Every genre and every season that has titles, as plain links: the way crawlers and visitors find the pages above.
export function GenresIndex() {
  const { t, lang } = useSiteLang();
  const [seasons, setSeasons] = useState([]);
  useEffect(() => { document.title = `${t('landIndexTitle')} · ${t('siteName')}`; }, [t]);
  useEffect(() => { fetch('/api/landing').then((r) => (r.ok ? r.json() : null)).then((d) => setSeasons(d?.seasons || [])).catch(() => {}); }, []);
  return (
    <main className="landing">
      <h1>{t('landIndexTitle')}</h1>
      <p className="landing__intro">{t('landIndexIntro')}</p>
      <section aria-labelledby="landGenres"><h2 id="landGenres">{t('landGenres')}</h2>
        <ul className="landing__chips">{landingGenres().map((key) => <li key={key}><Link to={`/genre/${slugOfGenre(key)}`}>{genreLabel(key, lang)}</Link></li>)}</ul>
      </section>
      {seasons.length > 0 && (
        <section aria-labelledby="landSeasons"><h2 id="landSeasons">{t('landSeasons')}</h2>
          <ul className="landing__chips">{seasons.map(({ year, season }) => <li key={`${year}${season}`}><Link to={`/season/${year}/${season}`}>{seasonName(season, lang)} {formatNumber(year, lang, { useGrouping: false })}</Link></li>)}</ul>
        </section>
      )}
    </main>
  );
}
