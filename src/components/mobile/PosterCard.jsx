import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';

export default function PosterCard({ item, mediaType = 'anime' }) {
  const { lang } = useSiteLang();
  const title = displayTitle(item, lang);
  const href = mediaHref(item, mediaType);
  const showScore = item.sampleScore != null && item.sampleScore !== 0;
  return (
    <article className="mobile-poster-card">
      <Link className="mobile-poster-card__link" to={href} aria-label={title}>
        <img
          className="mobile-poster-card__image"
          src={item.image}
          alt={title}
          loading="lazy"
          decoding="async"
          width="124"
          height="178"
        />
        {showScore && (
          <span className="mobile-poster-card__badge">
            <Star width={11} height={11} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }} aria-hidden="true" />
            <span dir="ltr">{item.sampleScore}</span>
          </span>
        )}
      </Link>
      <div className="mobile-poster-card__body">
        <Link className="mobile-poster-card__title" to={href}>
          {title}
        </Link>
        <div className="mobile-poster-card__meta" aria-hidden="true">
          {item.category}
          <span aria-hidden="true">·</span>
          <span dir="ltr">{item.year}</span>
        </div>
      </div>
    </article>
  );
}

