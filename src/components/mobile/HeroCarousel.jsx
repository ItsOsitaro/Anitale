import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Share2 } from 'lucide-react';
import { mediaHref } from '@/catalog';
import { displayTitle, synopsisText } from '@/home-data';
import { useUser } from '@/user.jsx';
import { useSiteLang } from '@/i18n';
import { cn } from 'cn';

export default function HeroCarousel({ items }) {
  const { lang, t } = useSiteLang();
  const user = useUser();
  const listRef = useRef(null);
  const [active, setActive] = useState(0);

  const scrollTo = useCallback(
    (index) => {
      setActive(index);
      const card = listRef.current?.querySelectorAll('.mobile-hero-card')[index];
      if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    },
    [],
  );

  const onScroll = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    const cards = node.querySelectorAll('.mobile-hero-card');
    const center = node.scrollLeft + node.clientWidth / 2;
    let best = cards[0];
    for (const card of cards) {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const bestCenter = best.offsetLeft + best.clientWidth / 2;
      if (Math.abs(cardCenter - center) < Math.abs(bestCenter - center)) best = card;
    }
    setActive(Array.from(cards).indexOf(best));
  }, []);

  const isSaved = (slug) => user.entries.anime.some((entry) => entry.slug === slug);

  const share = useCallback(() => {
    const item = items[active];
    const url = window.location.href;
    const title = displayTitle(item, lang);
    try {
      if (navigator.share) {
        navigator.share({ title, url });
        return;
      }
      navigator.clipboard.writeText(url);
    } catch { /* sharing unavailable */ }
  }, [items, active, lang]);

  return (
    <section className="mobile-hero">
      <div className="mobile-hero-carousel" ref={listRef} onScroll={onScroll}>
        {items.map((item, index) => {
          const href = mediaHref(item);
          const title = displayTitle(item, lang);
          const saved = isSaved(item.slug);
          return (
            <Link
              key={item.slug}
              to={href}
              className="mobile-hero-card"
              aria-label={title}
              onClick={(event) => {
                if (event.target.closest('button')) event.stopPropagation();
              }}
            >
              <div className="mobile-hero-card__media">
                <img
                  className="mobile-hero-card__image"
                  src={item.image}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="mobile-hero-card__content">
                <div className="mobile-hero-card__chips">
                  {item.sampleScore != null && (
                    <span className="mobile-hero-card__chip mobile-hero-card__chip--score">
                      <Star width={12} height={12} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }} aria-hidden="true" />
                      <span dir="ltr">{item.sampleScore}</span>
                    </span>
                  )}
                  <span className="mobile-hero-card__chip">{item.category}</span>
                  <span className="mobile-hero-card__chip" dir="ltr">
                    {item.year}
                  </span>
                </div>
                <h1 className="mobile-hero-card__title">{title}</h1>
                <p className="mobile-hero-card__synopsis" dir="auto">
                  {synopsisText(item, lang)}
                </p>
                <div className="mobile-hero-card__actions">
                  <button
                    type="button"
                    className="mobile-hero-card__btn-add"
                    onClick={(event) => {
                      event.stopPropagation();
                      user.toggle('anime', item.slug);
                    }}
                  >
                    {saved ? t('inList') : t('addToList')}
                  </button>
                  <button
                    type="button"
                    className="mobile-hero-card__btn-share"
                    onClick={(event) => {
                      event.stopPropagation();
                      share();
                    }}
                    aria-label={t('shareTitle')}
                  >
                    <Share2 width={20} height={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="mobile-hero-dots">
        {items.map((_item, index) => (
          <button
            key={index}
            type="button"
            className={cn('mobile-hero-dot', active === index && 'is-active')}
            onClick={() => scrollTo(index)}
            aria-label={`${index + 1} از ${items.length}`}
            aria-current={active === index ? 'true' : undefined}
          />
        ))}
      </div>
    </section>
  );
}
