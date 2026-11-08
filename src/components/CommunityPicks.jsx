import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { mediaHref } from '@/catalog';
import { coverUrl } from '@/lib/cover';
import { formatNumber } from '@/lib/digits.js';

// Home page: the most helpful recent review and the most liked public stacks. Renders nothing until the community has some.
export default function CommunityPicks() {
  const { t, lang } = useSiteLang();
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/home/community').then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {}); }, []);
  if (!data || (!data.review && !data.stacks?.length && !data.trending?.length)) return null;
  const { review, stacks, trending } = data;
  return (
    <section className="community-picks" aria-labelledby="cpTitle">
      <h2 id="cpTitle">{t('cpTitle')}</h2>
      {trending?.length > 0 && (
        <div className="cp-trending">
          <p className="cp-label">{t('cpTrending')}</p>
          <ul>
            {trending.map((media) => (
              <li key={media.slug}>
                <Link to={mediaHref({ slug: media.slug }, 'anime')}>
                  {media.image ? <img src={coverUrl(media.image, 240)} alt="" loading="lazy" decoding="async" /> : null}
                  <strong dir="auto">{media.title}</strong>
                  <small>{t('cpTrendingAdds', { n: formatNumber(media.adds, lang) })}</small>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="community-picks__grid">
        {review && (
          <article className="cp-review">
            <Link to={mediaHref({ slug: review.media.slug }, review.media.type)} className="cp-review__cover" aria-label={review.media.title}>
              {review.media.image ? <img src={coverUrl(review.media.image, 240)} alt="" loading="lazy" decoding="async" /> : null}
            </Link>
            <div>
              <p className="cp-label">{t('cpReview')}</p>
              <h3 dir="auto"><Link to={mediaHref({ slug: review.media.slug }, review.media.type)}>{review.media.title}</Link></h3>
              <p className="cp-body" dir="auto">{review.body}</p>
              <p className="cp-by">
                <Link to={`/user/${encodeURIComponent(review.username)}`}>{review.username}</Link>
                {review.rating != null && <span dir="ltr"> · {formatNumber(review.rating, lang)}/{formatNumber(10, lang)}</span>}
                {review.helpful > 0 && <span> · {t('cpHelpful', { n: formatNumber(review.helpful, lang) })}</span>}
              </p>
            </div>
          </article>
        )}
        {stacks?.length > 0 && (
          <div className="cp-stacks">
            <p className="cp-label">{t('cpStacks')}</p>
            <ul>
              {stacks.map((stack) => (
                <li key={stack.id}>
                  <Link to={`/stacks/${stack.id}`}>
                    <strong dir="auto">{stack.title}</strong>
                    <small>{t('cpStackMeta', { owner: stack.owner, n: formatNumber(stack.itemCount, lang), likes: formatNumber(stack.likes, lang) })}</small>
                  </Link>
                </li>
              ))}
            </ul>
            <Link className="section-link" to="/stacks">{t('stacksTitle')}</Link>
          </div>
        )}
      </div>
    </section>
  );
}
