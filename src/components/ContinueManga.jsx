import { Link } from 'react-router-dom';
import { useSiteLang } from '@/i18n';
import { mediaHref } from '@/catalog';
import { coverUrl } from '@/lib/cover';
import { useContinueSeries } from '@/hooks/use-continue-series';

// Home: next volumes/sequels of the manga a member finished. Renders nothing when there are none.
export default function ContinueManga() {
  const { t } = useSiteLang();
  const items = useContinueSeries('manga');
  if (!items.length) return null;
  return (
    <section className="cp-trending continue-manga" aria-labelledby="cmTitle">
      <h2 id="cmTitle">{t('continueManga')}</h2>
      <ul>
        {items.slice(0, 8).map((item) => (
          <li key={item.slug}>
            <Link to={mediaHref({ slug: item.slug }, 'manga')}>
              {item.image ? <img src={coverUrl(item.image, 240)} alt="" loading="lazy" decoding="async" /> : null}
              <strong dir="auto">{item.title}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
