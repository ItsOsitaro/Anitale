import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { mediaHref } from '@/catalog';
import { displayTitle, synopsisText } from '@/home-data';
import { useSiteLang } from '@/i18n';
import { cn } from 'cn';

export default function HeroCarousel({ items }) {
  const { lang } = useSiteLang();
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
    if (cards.length === 0) return;
    const center = node.scrollLeft + node.clientWidth / 2;
    let best = cards[0];
    for (const card of cards) {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const bestCenter = best.offsetLeft + best.clientWidth / 2;
      if (Math.abs(cardCenter - center) < Math.abs(bestCenter - center)) best = card;
    }
    setActive(Array.from(cards).indexOf(best));
  }, []);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className="mobile-hero">
      <div className="mobile-hero-carousel" ref={listRef} onScroll={onScroll}>
        {items.map((item, index) => {
          const href = mediaHref(item);
          const title = displayTitle(item, lang);
          return (
            <Link
              key={item.slug}
              to={href}
              className="mobile-hero-card"
              aria-label={title}
            >
              <div className="mobile-hero-card__media">
                <img
                  className="mobile-hero-card__image"
                  src={item.image}
                  alt={title}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </div>
              <div className="mobile-hero-card__content">
                <div className="mobile-hero-card__chips">
                  {item.sampleScore != null && item.sampleScore !== 0 && (
                    <span className="mobile-hero-card__chip mobile-hero-card__chip--score">
                      <Star width={12} height={12} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }} aria-hidden="true" />
                      <span dir="ltr">{item.sampleScore}</span>
                    </span>
                  )}
                  {item.category && <span className="mobile-hero-card__chip">{item.category}</span>}
                  {item.year && (
                    <span className="mobile-hero-card__chip" dir="ltr">
                      {item.year}
                    </span>
                  )}
                </div>
                <h1 className="mobile-hero-card__title">{title}</h1>
                <p className="mobile-hero-card__synopsis" dir="auto">
                  {synopsisText(item, lang)}
                </p>
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

