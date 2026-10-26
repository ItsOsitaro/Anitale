import { NavLink } from 'react-router-dom';
import { L, useSiteLang } from '@/i18n';
import { useInfiniteSlice } from '@/hooks/use-infinite-slice';
import RankRow from './RankRow';

export default function MobileRankingPage({ title, items, mediaType = 'anime', note }) {
  const { t, lang } = useSiteLang();
  const { visible, hasMore, sentinelRef, loadMore } = useInfiniteSlice(items.length, mediaType);
  const shown = items.slice(0, visible);

  return (
    <div className="mobile-catalog">
      <h1 className="mobile-catalog__title">{L(title, lang)}</h1>
      <nav className="mobile-tabs mobile-rank-tabs" aria-label={t('mcRankingsAria')}>
        <NavLink to="/top/anime" className={({ isActive }) => `mobile-tabs__tab${isActive ? ' is-active' : ''}`}>
          {t('breadcrumbAnime')}
        </NavLink>
        <NavLink to="/top/manga" className={({ isActive }) => `mobile-tabs__tab${isActive ? ' is-active' : ''}`}>
          {t('breadcrumbManga')}
        </NavLink>
      </nav>
      {note && <p className="mobile-catalog__note">{note}</p>}
      {items.length === 0 && (
        <div className="mobile-catalog__empty" role="status">
          <h2>{t('mcNoResults')}</h2>
        </div>
      )}
      <div className="mobile-rank-list">
        {shown.map((item, index) => (
          <RankRow key={item.slug} item={item} rank={index + 1} mediaType={mediaType} />
        ))}
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
