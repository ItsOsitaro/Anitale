import { L, useSiteLang } from '@/i18n';
import { useInfiniteSlice } from '@/hooks/use-infinite-slice';
import PosterCard from './PosterCard';

export default function MobileSeasonalPage({ title, items, children }) {
  const { t, lang } = useSiteLang();
  const { visible, hasMore, sentinelRef, loadMore } = useInfiniteSlice(items.length, items.length);
  const shown = items.slice(0, visible);

  return (
    <div className="mobile-catalog">
      <h1 className="mobile-catalog__title">{L(title, lang)}</h1>
      {children}
      <div className="mobile-catalog__count-row">
        <span className="mobile-catalog__count">{t('titlesCount', { n: items.length })}</span>
      </div>
      <div className="mobile-catalog-grid">
        {shown.map((item) => <PosterCard key={item.slug} item={item} mediaType="anime" />)}
      </div>
      {hasMore && (
        <>
          <div ref={sentinelRef} className="mobile-catalog__sentinel" aria-hidden="true" />
          <button type="button" className="mobile-catalog__more" onClick={loadMore}>{t('mcLoadMore')}</button>
        </>
      )}
    </div>
  );
}
