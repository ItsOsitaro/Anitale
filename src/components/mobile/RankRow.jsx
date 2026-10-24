import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { cn } from 'cn';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';

export default function RankRow({ item, rank, mediaType = 'anime' }) {
  const { lang } = useSiteLang();
  const title = displayTitle(item, lang);
  const href = mediaHref(item, mediaType);
  const isTop = rank <= 3;
  return (
    <Link
      to={href}
      className={cn('mobile-rank-row')}
      aria-label={title}
    >
      <span className={cn('mobile-rank-row__num', isTop && 'is-top')}>{rank}</span>
      <span className="mobile-rank-row__cover">
        <img src={item.image} alt={title} loading="lazy" decoding="async" width="48" height="66" />
      </span>
      <div className="mobile-rank-row__copy">
        <span className="mobile-rank-row__title">{title}</span>
        <div className="mobile-rank-row__meta" aria-hidden="true">
          {item.category}
          <span aria-hidden="true">·</span>
          <span dir="ltr">{item.year}</span>
        </div>
      </div>
      {item.sampleScore != null && (
        <span className="mobile-rank-row__score">
          <Star width={11} height={11} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--secondary-foreground)' }} aria-hidden="true" />
          <span dir="ltr">{item.sampleScore}</span>
        </span>
      )}
    </Link>
  );
}
