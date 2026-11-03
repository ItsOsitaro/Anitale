import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { foldTitle, mediaHref } from '@/catalog';
import { useCatalog, useMangaCatalog, withMangaImages } from '@/catalog-context';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';

const RECENT_KEY = 'anitaleRecentSearches';
const MAX_RECENT = 6;

const readRecent = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};
const writeRecent = (list) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href]';

export default function MobileSearchOverlay({ open, onClose }) {
  const { t, lang } = useSiteLang();
  const anime = useCatalog();
  const manga = useMangaCatalog();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);

  const entries = useMemo(() => {
    const mangaItems = withMangaImages(manga, anime);
    return [
      ...anime.map((item) => ({ item, mediaType: 'anime' })),
      ...mangaItems.map((item) => ({ item, mediaType: 'manga' })),
    ];
  }, [anime, manga]);

  const trimmed = query.trim();
  const results = useMemo(() => {
    if (!trimmed) return [];
    const needle = foldTitle(trimmed);
    return entries
      .filter(({ item }) => foldTitle(`${item.title} ${item.titleFa || ''} ${item.category || ''} ${(item.genres || []).join(' ')}`).includes(needle))
      .slice(0, 40);
  }, [entries, trimmed]);

  const popular = useMemo(
    () => [...anime].sort((a, b) => (b.sampleScore ?? 0) - (a.sampleScore ?? 0)).slice(0, 5).map((item) => ({ item, mediaType: 'anime' })),
    [anime],
  );

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setRecent(readRecent());
    const prev = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const remember = () => {
    if (!trimmed) return;
    const next = [trimmed, ...recent.filter((entry) => entry !== trimmed)].slice(0, MAX_RECENT);
    setRecent(next);
    writeRecent(next);
  };
  const clearRecent = () => {
    setRecent([]);
    writeRecent([]);
  };

  const row = ({ item, mediaType }) => {
    const title = displayTitle(item, lang);
    return (
      <li key={`${mediaType}-${item.slug}`}>
        <Link className="mobile-search__row" to={mediaHref(item, mediaType)} onClick={() => { remember(); onClose(); }}>
          <img src={item.image} alt="" width="40" height="56" loading="lazy" decoding="async" />
          <span className="mobile-search__row-copy">
            <span className="mobile-search__row-title">{title}</span>
            <span className="mobile-search__row-meta">
              {mediaType === 'manga' ? t('breadcrumbManga') : t('breadcrumbAnime')}
              {item.year ? <><span aria-hidden="true"> · </span><span dir="ltr">{item.year}</span></> : null}
            </span>
          </span>
          {item.sampleScore ? <span className="mobile-rank-row__score" dir="ltr">{item.sampleScore}</span> : null}
        </Link>
      </li>
    );
  };

  return createPortal(
    <div ref={dialogRef} className="mobile-search" role="dialog" aria-modal="true" aria-label={t('searchAria')}>
      <div className="mobile-search__bar">
        <div className="mobile-catalog__search">
          <Search width={18} height={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') remember(); }}
            placeholder={t('titleOrKeyword')}
            aria-label={t('titleOrKeyword')}
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="mobile-catalog__search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label={t('mcClear')}>
              <X width={16} height={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <button type="button" className="mobile-search__close" onClick={onClose}>{t('mcClose')}</button>
      </div>

      <div className="mobile-search__body">
        {!trimmed ? (
          <>
            {recent.length > 0 && (
              <section className="mobile-search__section">
                <div className="mobile-search__section-head">
                  <h2>{t('mcRecent')}</h2>
                  <button type="button" onClick={clearRecent}>{t('mcClear')}</button>
                </div>
                <div className="mobile-search__chips">
                  {recent.map((entry) => (
                    <button key={entry} type="button" className="mobile-chip" onClick={() => setQuery(entry)}>{entry}</button>
                  ))}
                </div>
              </section>
            )}
            {popular.length > 0 && (
              <section className="mobile-search__section">
                <div className="mobile-search__section-head"><h2>{t('mcPopular')}</h2></div>
                <ul className="mobile-search__list">{popular.map(row)}</ul>
              </section>
            )}
          </>
        ) : results.length === 0 ? (
          <div className="mobile-catalog__empty" role="status">
            <Search width={36} height={36} aria-hidden="true" />
            <h2>{t('mcNoResults')}</h2>
            <p>{t('mcSearchEmpty')}</p>
          </div>
        ) : (
          <ul className="mobile-search__list" aria-live="polite">{results.map(row)}</ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
