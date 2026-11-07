import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { cn } from 'cn';
import { mediaHref } from '@/catalog';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';
import { coverUrl } from '@/lib/cover';
import { formatNumber, formatScore } from '@/lib/digits.js';

export default function RankRow({ item, rank, mediaType = 'anime' }) {
  const { lang } = useSiteLang();
  const title = displayTitle(item, lang);
  const href = mediaHref(item, mediaType);
  const isTop = rank <= 3;
  const showScore = item.sampleScore != null && item.sampleScore !== 0;
  return (
    <Link
      to={href}
      className={cn('mobile-rank-row')}
    >
      <span className={cn('mobile-rank-row__num', isTop && 'is-top')}>{formatNumber(rank, lang)}</span>
      <span className="mobile-rank-row__cover">
        <img src={coverUrl(item.image, 120)} alt="" loading="lazy" decoding="async" width="48" height="66" />
      </span>
      <div className="mobile-rank-row__copy">
        <span className="mobile-rank-row__title" dir="auto">{title}</span>
        <div className="mobile-rank-row__meta" aria-hidden="true">
          {item.category}
          <span aria-hidden="true">·</span>
          <span dir="ltr">{formatNumber(item.year, lang, { useGrouping: false })}</span>
        </div>
      </div>
      {showScore && (
        <span className="mobile-rank-row__score">
          <Star width={11} height={11} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--secondary-foreground)' }} aria-hidden="true" />
          <span dir="ltr">{formatScore(item.sampleScore, lang)}</span>
        </span>
      )}
    </Link>
  );
}

