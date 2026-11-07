import { genreLabel, splitGenres } from '@/lib/genre-kinds';
import MediaTabs from '@/components/MediaTabs';
import SuggestEdit from '@/components/SuggestEdit';
import { FranchiseNav } from '../TitleExtras.jsx';
import { QuickEpisode } from '@/components/QuickEpisode';
import { FavoriteButton } from '../Favorites';
import WatchOrder from '../WatchOrder';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Plus, Share2, SlidersHorizontal, X } from 'lucide-react';
import { L, useSiteLang } from '@/i18n';
import PosterCard from './PosterCard';
import SectionHeader from './SectionHeader';
import Rail from './Rail';
import { cn } from 'cn';
import { coverUrl } from '@/lib/cover';
import { formatNumber, formatScore } from '@/lib/digits.js';
import { infoLabel, infoValue } from '@/lib/info-labels.js';
import CommunitySection from '../CommunitySection';
import { hasAny, ExtrasSkeleton, Characters, Relations, Recommendations, Trailer, Themes, Staff } from '../TitleExtras.jsx';

const TAB_IDS = ['summary', 'media', 'reviews', 'info', 'team', 'related'];
const TAB_KEYS = { summary: 'mdSummary', media: 'mediaSection', reviews: 'mdReviews', info: 'information', team: 'staffSection', related: 'mdRelated' };

function FactGrid({ rows }) {
  const { lang } = useSiteLang();
  const visible = rows.filter((row) => row.value);
  if (visible.length === 0) return null;
  return (
    <dl className="mobile-facts">
      {visible.map((row) => (
        <div key={row.label} className="mobile-facts__cell">
          <dt>{infoLabel(row.label, lang)}</dt>
          <dd>{row.links ? row.links.map((l, i) => <span key={l.to}>{i > 0 && ', '}<Link to={l.to} className="info-link">{l.text}</Link></span>) : infoValue(row.label, row.value, lang)}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusSheet({ open, onClose, statuses, current, onPick, onRemove }) {
  const { t } = useSiteLang();
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
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
  return createPortal(
    <div className="filter-sheet__scrim" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('listStatusAria')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="filter-sheet__grab"><div className="more-sheet__handle" aria-hidden="true" /></div>
        <div className="filter-sheet__head">
          <h2 className="filter-sheet__title">{t('listStatusAria')}</h2>
          <button type="button" className="filter-sheet__close" onClick={onClose} aria-label={t('mcClose')}>
            <X width={20} height={20} aria-hidden="true" />
          </button>
        </div>
        <div className="filter-sheet__body" role="radiogroup" aria-label={t('listStatusAria')}>
          <div className="mobile-status-list">
            {statuses.map((status) => (
              <button
                key={status.id}
                type="button"
                role="radio"
                aria-checked={current === status.id}
                className={cn('mobile-status-row', current === status.id && 'is-active')}
                onClick={() => { onPick(status.id); onClose(); }}
              >
                <span>{status.label}</span>
                {current === status.id && <Check width={18} height={18} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-sheet__footer">
          <button type="button" className="filter-sheet__clear mobile-status-remove" onClick={() => { onRemove(); onClose(); }}>
            {t('removeFromList')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function MobileDetailPage({
  item, mediaType, related, extras, informationRows, statisticsRows, alternativeTitles, romajiTitle,
  isSaved, currentStatus, progress, listStatuses, onToggleSaved, onSetStatus, onShare, shareNote,
}) {
  const { t, lang } = useSiteLang();
  const navigate = useNavigate();
  const [tab, setTab] = useState('summary');
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const tabRefs = useRef({});

  const onTabKey = (e) => {
    const index = TAB_IDS.indexOf(tab);
    // RTL: the first tab is on the right, so ArrowLeft moves forward.
    const rtl = document.dir === 'rtl' || document.documentElement.dir === 'rtl' || lang === 'fa';
    let next = null;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = TAB_IDS[(index + 1) % TAB_IDS.length];
    if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = TAB_IDS[(index - 1 + TAB_IDS.length) % TAB_IDS.length];
    if (next) {
      e.preventDefault();
      setTab(next);
      tabRefs.current[next]?.focus();
    }
  };

  const num = (raw) => {
    const digits = String(raw ?? '').replace(/[^\d.]/g, '');
    return digits ? Number(digits) : null;
  };
  const rankOf = (raw) => (num(raw) ? `#${formatNumber(num(raw), lang)}` : null);
  const scoreNum = num(item.statistics?.score) ?? (item.sampleScore > 0 ? item.sampleScore : null);
  const stats = [
    { label: t('scoreLabel'), value: scoreNum ? formatScore(scoreNum, lang) : null },
    { label: t('rankedLabel'), value: rankOf(item.rank || item.statistics?.ranked) },
    { label: t('popularity'), value: rankOf(item.statistics?.popularity) },
  ];
  const infoOf = (label) => (item.information || []).find((row) => String(row.label).toLowerCase() === label)?.value || '';
  const epsRaw = infoOf('episodes') || infoOf('chapters');
  const epsNum = num(epsRaw);
  const epsText = epsNum ? `${formatNumber(epsNum, lang)} ${mediaType === 'manga' ? t('chaptersUnit') : t('episodesUnit')}` : '';
  const statusLabel = listStatuses.find((entry) => entry.id === currentStatus)?.label || '';
  const synonyms = (alternativeTitles.synonyms || []).filter((name) => name.trim().toLowerCase() !== String(item.title).trim().toLowerCase()).join(lang === 'fa' ? '، ' : ', ');
  const hasAlt = synonyms || alternativeTitles.japanese || alternativeTitles.english || item.titleFa;
  const longSynopsis = (item.synopsis || '').length > 220;

  return (
    <div className="mobile-detail">
      <header className="mobile-detail__hero">
        <div className="mobile-detail__backdrop" aria-hidden="true">
          <img src={coverUrl(item.image, 480)} alt="" />
        </div>
        <div className="mobile-detail__actions">
          <button type="button" className="mobile-detail__glass" onClick={() => navigate(-1)} aria-label={t('mdBack')}>
            <ChevronRight width={20} height={20} aria-hidden="true" />
          </button>
          <button type="button" className="mobile-detail__glass" onClick={onShare} aria-label={t('shareTitle')}>
            <Share2 width={18} height={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mobile-detail__head">
          <img className="mobile-detail__cover" src={coverUrl(item.image, 480)} alt={item.title} />
          <div className="mobile-detail__titles">
            <h1 dir="auto">{item.title}</h1>
            {romajiTitle && romajiTitle !== item.title && (
              <p className="mobile-detail__romaji" dir="ltr" lang="ja-Latn">{romajiTitle}</p>
            )}
            <p className="mobile-detail__sub">
              {item.format && <span>{item.format}</span>}
              {item.format && item.year && <span aria-hidden="true">·</span>}
              {item.year && <span dir="ltr">{formatNumber(item.year, lang, { useGrouping: false })}</span>}
              {epsText && <><span aria-hidden="true">·</span><span>{epsText}</span></>}
            </p>
          </div>
        </div>
        {shareNote && <p className="mobile-detail__note" role="status">{shareNote}</p>}
      </header>

      {item.genres?.length > 0 && (
        <ul className="mobile-detail__chips" aria-label={t('genresLabel')}>
          {item.genres.map((genre) => (
            <li key={genre}><Link to={`/search?genre=${encodeURIComponent(genre)}`}>{genreLabel(genre, lang)}</Link></li>
          ))}
        </ul>
      )}

      <div className="mobile-detail__stats" aria-label={t('statistics')}>
        {stats.map((stat) => (
          <div key={stat.label} className="mobile-detail__stat">
            <strong dir="auto">{stat.value || '—'}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="mobile-tabs" role="tablist" aria-label={item.title} onKeyDown={onTabKey}>
        {TAB_IDS.map((id) => (
          <button
            key={id}
            ref={(node) => { tabRefs.current[id] = node; }}
            type="button"
            role="tab"
            id={`md-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`md-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={cn('mobile-tabs__tab', tab === id && 'is-active')}
            onClick={() => setTab(id)}
          >
            {t(TAB_KEYS[id])}
          </button>
        ))}
      </div>

      <div className="mobile-detail__panel" role="tabpanel" id={`md-panel-${tab}`} aria-labelledby={`md-tab-${tab}`} key={tab}>
        {tab === 'summary' && (
          <>
            {hasAny(extras, 'relations') && <FranchiseNav data={extras.data} mediaType={mediaType} />}
            <section>
              <h2 className="mobile-detail__h">{t('synopsis')}</h2>
              {item.detailLoading
                ? <div className="synopsis-skeleton" role="status" aria-label={t('extrasLoading')}><i /><i /><i /><i /></div>
                : <p className={cn('mobile-detail__synopsis', !expanded && longSynopsis && 'is-clamped')} dir="auto">{item.synopsis}</p>}
              {item.synopsisAuto && <p className="synopsis-auto">{t('synopsisAuto')}</p>}
              {longSynopsis && !item.detailLoading && (
                <button type="button" className="mobile-detail__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? t('mdLess') : t('more')}
                </button>
              )}
            </section>
            {item.genres?.length > 0 && Object.entries(splitGenres(item.genres)).filter(([kind, list]) => kind !== 'genre' && list.length).map(([kind, list]) => (
              <section key={kind}>
                <h2 className="mobile-detail__h">{t(kind === 'genre' ? 'genresLabel' : kind === 'theme' ? 'themesLabel' : 'demographicLabel')}</h2>
                <div className="mobile-detail__genres">
                  {list.map((g) => <span key={g} className="mobile-detail__genre">{genreLabel(g, lang)}</span>)}
                </div>
              </section>
            ))}
          </>
        )}

        {tab === 'reviews' && (
          <section>
            <CommunitySection mediaType={mediaType} slug={item.slug} />
          </section>
        )}
        {tab === 'info' && (
          <>
            <section>
              <h2 className="mobile-detail__h">{t('information')}</h2>
              <FactGrid rows={informationRows} />
              <SuggestEdit item={item} mediaType={mediaType} />
            </section>
            <section>
              <h2 className="mobile-detail__h">{t('statistics')}</h2>
              <FactGrid rows={statisticsRows} />
            </section>
            {hasAlt && (
              <section>
                <h2 className="mobile-detail__h">{t('alternativeTitles')}</h2>
                <FactGrid rows={[
                  { label: t('synonyms'), value: synonyms },
                  { label: t('japaneseTitle'), value: alternativeTitles.japanese },
                  { label: t('englishTitle'), value: alternativeTitles.english },
                  { label: t('persianTitle'), value: item.titleFa },
                ]} />
              </section>
            )}
            <section>
              <h2 className="mobile-detail__h">{t('availableAt')}</h2>
              {item.availableAt?.length ? (
                <ul className="mobile-detail__list">
                  {item.availableAt.map((entry) => (
                    <li key={entry.label}>
                      {entry.href ? <a href={entry.href} target="_blank" rel="noreferrer">{entry.label}</a> : <span>{entry.label}</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="mobile-detail__muted">{t('emptyLocalEntry')}</p>}
            </section>
            <section>
              <h2 className="mobile-detail__h">{t('streaming')}</h2>
              {item.streamingPlatforms?.length ? (
                <>
                  <ul className="mobile-detail__list">
                    {item.streamingPlatforms.map((p) => <li key={p}><span dir="ltr">{p}</span></li>)}
                  </ul>
                  {item.streamingNotice && <p className="mobile-detail__muted">{item.streamingNotice}</p>}
                </>
              ) : <p className="mobile-detail__muted">{t('emptyLocalEntry')}</p>}
            </section>
            {item.resources?.length > 0 && (
              <section>
                <h2 className="mobile-detail__h">{t('resources')}</h2>
                <ul className="mobile-detail__list">
                  {item.resources.map((r) => <li key={r.label}><span>{r.label}</span></li>)}
                </ul>
              </section>
            )}
          </>
        )}

        {tab === 'team' && (
          <>
            {extras.status === 'loading' && <ExtrasSkeleton />}
            {hasAny(extras, 'trailer') && (
              <section>
                <h2 className="mobile-detail__h">{t('trailerTitle')}</h2>
                <Trailer data={extras.data} />
              </section>
            )}
            {hasAny(extras, 'characters') && (
              <section>
                <h2 className="mobile-detail__h">{t('charactersVA')}</h2>
                <Characters data={extras.data} />
              </section>
            )}
            {hasAny(extras, 'staff') && (
              <section>
                <h2 className="mobile-detail__h">{t('staffSection')}</h2>
                <Staff data={extras.data} />
              </section>
            )}
            {mediaType === 'anime' && hasAny(extras, 'openings') && (
              <section>
                <h2 className="mobile-detail__h">{t('openingTheme')}</h2>
                <Themes data={extras.data} kind="op" />
              </section>
            )}
            {mediaType === 'anime' && hasAny(extras, 'endings') && (
              <section>
                <h2 className="mobile-detail__h">{t('endingTheme')}</h2>
                <Themes data={extras.data} kind="ed" />
              </section>
            )}
            {extras.status === 'none' && <p className="mobile-detail__muted">{t('extrasNone')}</p>}
          </>
        )}

        {tab === 'media' && <MediaTabs item={item} mediaType={mediaType} />}
        {tab === 'related' && (
          <>
            {hasAny(extras, 'relations') && (
              <section>
                <h2 className="mobile-detail__h">{t('relatedEntries')}</h2>
                <Relations data={extras.data} />
                <WatchOrder mediaType={mediaType} malId={item.malId} />
              </section>
            )}
            {related.length > 0 && (
              <section className="mobile-detail__rail">
                <SectionHeader title={t('relatedAnime')} />
                <Rail>
                  {related.map((entry) => <PosterCard key={entry.slug} item={entry} mediaType="anime" />)}
                </Rail>
              </section>
            )}
            {hasAny(extras, 'recommendations') && (
              <section>
                <h2 className="mobile-detail__h">{t('recommendationsTitle')}</h2>
                <Recommendations data={extras.data} mediaType={mediaType} />
              </section>
            )}
          </>
        )}
      </div>

      <div className="mobile-actionbar">
        <button
          type="button"
          className={cn('mobile-actionbar__main', isSaved && 'is-saved')}
          aria-pressed={isSaved}
          onClick={onToggleSaved}
        >
          {isSaved ? <Check width={20} height={20} aria-hidden="true" /> : <Plus width={20} height={20} aria-hidden="true" />}
          <span className="mobile-actionbar__label">
            {isSaved ? t('inList') : t('addToList')}
            {isSaved && statusLabel && <small>{statusLabel}{epsNum && Number(progress) > 0 ? ` · ${formatNumber(Math.min(Number(progress), epsNum), lang)}/${formatNumber(epsNum, lang)}` : ''}</small>}
          </span>
        </button>
        <QuickEpisode mediaType={mediaType} item={item} compact className="mobile-actionbar__quick" />
        <FavoriteButton kind={mediaType} refId={item.slug} compact className="mobile-actionbar__fav" />
        {isSaved && (
          <button
            type="button"
            className="mobile-actionbar__square"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-label={t('listStatusAria')}
          >
            <SlidersHorizontal width={20} height={20} aria-hidden="true" />
          </button>
        )}
      </div>

      <StatusSheet
        open={sheetOpen}
        onClose={closeSheet}
        statuses={listStatuses}
        current={currentStatus}
        onPick={onSetStatus}
        onRemove={onToggleSaved}
      />
    </div>
  );
}
