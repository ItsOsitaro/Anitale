import { Link } from 'react-router-dom';
import { displayTitle } from '@/home-data';
import { mediaHref } from '@/catalog';
import { useSiteLang } from '@/i18n';
import { STATUS_ORDER } from '@/lib/profile-insights';
import { coverUrl } from '@/lib/cover';

const statusLabel = (t, status, mediaType) => (status === 'watching' && mediaType === 'manga' ? t('status_reading') : t(`status_${status}`));

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

function TitleLink({ item, mediaType, slug, className, children }) {
  const { lang } = useSiteLang();
  return (
    <Link className={className} to={item ? mediaHref(item, mediaType) : '#'} aria-label={item ? displayTitle(item, lang) : slug}>
      {children}
    </Link>
  );
}

// Where the user's titles stand: a segmented bar, the numbers behind it, and the pages/episodes counted so far.
export function StatusBreakdown({ insights }) {
  const { t } = useSiteLang();
  if (insights.total === 0) return null;
  const shown = STATUS_ORDER.filter((status) => insights.statusCounts[status] > 0);
  return (
    <section className="pi-block" aria-labelledby="piStatusHead">
      <h2 id="piStatusHead" className="pi-head">{t('piStatusHead')}</h2>
      <div className="pi-bar" role="img" aria-label={shown.map((s) => `${t(`status_${s}`)}: ${insights.statusCounts[s]}`).join('، ')}>
        {shown.map((status) => (
          <span key={status} className={`pi-bar__seg status-${status}`} style={{ flexGrow: insights.statusCounts[status] }} />
        ))}
      </div>
      <ul className="pi-legend">
        {shown.map((status) => (
          <li key={status}><span className={`pi-dot status-${status}`} aria-hidden="true" />{t(`status_${status}`)} <strong dir="ltr">{insights.statusCounts[status]}</strong></li>
        ))}
      </ul>
      {(insights.episodes > 0 || insights.chapters > 0 || insights.daysWatched > 0) && (
        <p className="pi-totals">
          {insights.daysWatched > 0 && (
            <span title={insights.daysApprox ? t('piDaysApprox') : undefined}>
              {t('piDays', { n: `${insights.daysApprox ? '≈ ' : ''}${insights.daysWatched >= 10 ? Math.round(insights.daysWatched) : insights.daysWatched.toFixed(1)}` })}
            </span>
          )}
          {insights.episodes > 0 && <span>{t('piEpisodes', { n: insights.episodes })}</span>}
          {insights.chapters > 0 && <span>{t('piChapters', { n: insights.chapters })}</span>}
        </p>
      )}
    </section>
  );
}

export function FavoriteGenres({ insights }) {
  const { t } = useSiteLang();
  if (insights.topGenres.length === 0) return null;
  return (
    <section className="pi-block" aria-labelledby="piGenreHead">
      <h2 id="piGenreHead" className="pi-head">{t('piGenresHead')}</h2>
      <ul className="pi-genres">
        {insights.topGenres.map(({ genre, count }) => (
          <li key={genre}>{genre} <small dir="ltr">{count}</small></li>
        ))}
      </ul>
    </section>
  );
}

export function TopRated({ insights }) {
  const { t, lang } = useSiteLang();
  if (insights.topRated.length === 0) return null;
  return (
    <section className="pi-block" aria-labelledby="piTopHead">
      <h2 id="piTopHead" className="pi-head">{t('piTopHead')}</h2>
      <ul className="pi-covers">
        {insights.topRated.map(({ entry, mediaType, item }) => (
          <li key={`${mediaType}-${entry.slug}`}>
            <TitleLink item={item} mediaType={mediaType} slug={entry.slug} className="pi-cover">
              {item?.image ? <img src={coverUrl(item.image, 120)} alt="" loading="lazy" decoding="async" /> : <span>{entry.slug.slice(0, 2)}</span>}
              <span className="pi-cover__score" dir="ltr">{entry.rating}</span>
            </TitleLink>
            <span className="pi-cover__title" dir="auto">{item ? displayTitle(item, lang) : entry.slug}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecentActivity({ insights }) {
  const { t, lang } = useSiteLang();
  if (insights.recent.length === 0) return null;
  return (
    <section className="pi-block" aria-labelledby="piRecentHead">
      <h2 id="piRecentHead" className="pi-head">{t('piRecentHead')}</h2>
      <ul className="pi-recent">
        {insights.recent.map(({ entry, mediaType, item }) => {
          const date = parseDate(entry.updated || entry.added);
          return (
            <li key={`${mediaType}-${entry.slug}`}>
              <TitleLink item={item} mediaType={mediaType} slug={entry.slug} className="pi-recent__title">
                <span dir="auto">{item ? displayTitle(item, lang) : entry.slug}</span>
              </TitleLink>
              <span className={`entry-status status-${entry.status || 'watching'}`}>{statusLabel(t, entry.status || 'watching', mediaType)}</span>
              {entry.rating != null && <span className="pi-recent__score" dir="ltr">{entry.rating}/10</span>}
              {date && <time dateTime={date.toISOString()}>{date.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB', { month: 'short', day: 'numeric' })}</time>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ProfileReviews({ reviews, animeBySlug, mangaBySlug }) {
  const { t, lang } = useSiteLang();
  if (!reviews?.length) return null;
  return (
    <section className="pi-block" aria-labelledby="piReviewsHead">
      <h2 id="piReviewsHead" className="pi-head">{t('piReviewsHead', { n: reviews.length })}</h2>
      <ul className="pi-reviews">
        {reviews.map((review) => {
          const item = (review.mediaType === 'manga' ? mangaBySlug : animeBySlug).get(review.slug) || null;
          const date = parseDate(review.createdAt);
          return (
            <li key={`${review.mediaType}-${review.slug}`}>
              <header>
                <TitleLink item={item} mediaType={review.mediaType} slug={review.slug} className="pi-recent__title">
                  <span dir="auto">{item ? displayTitle(item, lang) : review.slug}</span>
                </TitleLink>
                {review.rating != null && <span className="pi-recent__score" dir="ltr">{review.rating}/10</span>}
                {date && <time dateTime={date.toISOString()}>{date.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}</time>}
              </header>
              {review.spoiler ? <p className="pi-reviews__spoiler">{t('piSpoilerNote')}</p> : <p dir="auto">{review.body}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
