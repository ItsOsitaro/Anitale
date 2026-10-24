import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { L, useSiteLang } from '@/i18n';
import PosterCard from './PosterCard';
import FilterSheet from './FilterSheet';
import { cn } from 'cn';

const PAGE_SIZE = 24;
const SORT_ORDER = ['score', 'new', 'old', 'az'];
const SORT_KEYS = { score: 'sortScore', new: 'sortNew', old: 'sortOld', az: 'sortAz' };

export default function MobileCatalogPage({
  title, items, mediaType = 'anime',
  query, onQueryChange,
  genre, onGenreChange, genres,
  format, onFormatChange, formats,
  year, onYearChange, years,
  sort, onSortChange,
}) {
  const { t, lang } = useSiteLang();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const activeCount = [genre, format, year].filter((v) => v !== 'All').length;

  // Start from the first page whenever the result set definition changes.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, genre, format, year, sort, mediaType]);

  const shown = items.slice(0, visible);
  const hasMore = visible < items.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible((n) => n + PAGE_SIZE);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, visible]);

  const clearFilters = () => {
    onGenreChange('All');
    onFormatChange('All');
    onYearChange('All');
  };
  const clearAll = () => {
    clearFilters();
    onQueryChange('');
  };
  const nextSort = () => {
    const index = SORT_ORDER.indexOf(sort);
    onSortChange(SORT_ORDER[(index + 1) % SORT_ORDER.length]);
  };

  return (
    <div className="mobile-catalog">
      <h1 className="mobile-catalog__title">{L(title, lang)}</h1>

      <div className="mobile-catalog__search">
        <Search width={18} height={18} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('titleOrKeyword')}
          aria-label={t('titleOrKeyword')}
          enterKeyHint="search"
        />
        {query && (
          <button type="button" className="mobile-catalog__search-clear" onClick={() => onQueryChange('')} aria-label={t('mcClose')}>
            <X width={16} height={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mobile-catalog__chips" role="group" aria-label={t('genreLabel')}>
        <button
          type="button"
          className={cn('mobile-chip mobile-catalog__filter-btn', activeCount > 0 && 'is-active')}
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
        >
          <SlidersHorizontal width={16} height={16} aria-hidden="true" />
          <span>{t('mcFilters')}</span>
          {activeCount > 0 && <span className="mobile-catalog__badge">{activeCount}</span>}
        </button>
        <button
          type="button"
          className={cn('mobile-chip', genre === 'All' && 'is-active')}
          aria-pressed={genre === 'All'}
          onClick={() => onGenreChange('All')}
        >
          {t('mcAll')}
        </button>
        {genres.map((g) => (
          <button
            key={g}
            type="button"
            className={cn('mobile-chip', genre === g && 'is-active')}
            aria-pressed={genre === g}
            onClick={() => onGenreChange(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mobile-catalog__count-row">
        <span className="mobile-catalog__count" aria-live="polite">{t('titlesCount', { n: items.length })}</span>
        <button type="button" className="mobile-catalog__sort" onClick={nextSort} aria-label={t('sortLabel')}>
          <ArrowUpDown width={15} height={15} aria-hidden="true" />
          <span>{t(SORT_KEYS[sort] || 'sortScore')}</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mobile-catalog__empty" role="status">
          <Search width={36} height={36} aria-hidden="true" />
          <h2>{t('mcNoResults')}</h2>
          <p>{t('mcNoResultsHint')}</p>
          <button type="button" className="mobile-catalog__empty-btn" onClick={clearAll}>{t('mcClearAll')}</button>
        </div>
      ) : (
        <>
          <div className="mobile-catalog-grid">
            {shown.map((item) => (
              <PosterCard key={item.slug} item={item} mediaType={mediaType} />
            ))}
          </div>
          {hasMore && (
            <>
              <div ref={sentinelRef} className="mobile-catalog__sentinel" aria-hidden="true" />
              <button
                type="button"
                className="mobile-catalog__more"
                onClick={() => setVisible((n) => n + PAGE_SIZE)}
              >
                {t('mcLoadMore')}
              </button>
            </>
          )}
        </>
      )}

      <FilterSheet
        open={sheetOpen}
        onClose={closeSheet}
        resultCount={items.length}
        genre={genre} onGenreChange={onGenreChange} genres={genres}
        format={format} onFormatChange={onFormatChange} formats={formats}
        year={year} onYearChange={onYearChange} years={years}
        sort={sort} onSortChange={onSortChange}
        onClear={clearFilters}
        activeCount={activeCount}
      />
    </div>
  );
}
