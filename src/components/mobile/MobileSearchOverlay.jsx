import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { mediaHref, rowToCard } from '@/catalog';
import { useVisibleCatalog } from '@/catalog-context';
import { useShowSensitive } from '@/lib/catalog-rules';
import { displayTitle } from '@/home-data';
import { useSiteLang } from '@/i18n';
import { coverUrl } from '@/lib/cover';

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
  const anime = useVisibleCatalog();
  const showSensitive = useShowSensitive();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const inputRef = useRef(null);

  const trimmed = query.trim();
  // The server searches every title; the browser only holds the popular core.
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (!trimmed) { setResults([]); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`/api/search/full?q=${encodeURIComponent(trimmed)}&limit=40${showSensitive ? '' : '&sfw=1'}`)
        .then((r) => r.json())
        .then((data) => { if (alive) setResults((data.items || []).map((r) => ({ item: rowToCard(r), mediaType: r.kind }))); })
        .catch(() => { if (alive) setResults([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [trimmed, showSensitive]);

  const popular = useMemo(
    () => [...anime].sort((a, b) => (b.weightedScore ?? b.sampleScore ?? 0) - (a.weightedScore ?? a.sampleScore ?? 0)).slice(0, 5).map((item) => ({ item, mediaType: 'anime' })),
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
          <img src={coverUrl(item.image, 120)} alt="" width="40" height="56" loading="lazy" decoding="async" />
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
            onKeyDown={(e) => { if (e.key === 'Enter' && trimmed) { remember(); onClose(); navigate(`/search?q=${encodeURIComponent(trimmed)}`); } }}
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
            <Link className="mobile-search__all" to={`/search?q=${encodeURIComponent(trimmed)}`} onClick={() => { remember(); onClose(); }}>{t('searchAllResults', { q: trimmed })}</Link>
          </div>
        ) : (
          <>
            <ul className="mobile-search__list" aria-live="polite">{results.map(row)}</ul>
            <Link className="mobile-search__all" to={`/search?q=${encodeURIComponent(trimmed)}`} onClick={() => { remember(); onClose(); }}>{t('searchAllResults', { q: trimmed })}</Link>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
