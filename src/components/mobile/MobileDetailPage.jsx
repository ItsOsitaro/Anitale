import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Plus, Share2, SlidersHorizontal, X } from 'lucide-react';
import { L, useSiteLang } from '@/i18n';
import PosterCard from './PosterCard';
import SectionHeader from './SectionHeader';
import Rail from './Rail';
import { cn } from 'cn';

const TAB_IDS = ['summary', 'info', 'team', 'related'];
const TAB_KEYS = { summary: 'mdSummary', info: 'information', team: 'staffSection', related: 'mdRelated' };

function FactGrid({ rows }) {
  const visible = rows.filter((row) => row.value);
  if (visible.length === 0) return null;
  return (
    <dl className="mobile-facts">
      {visible.map((row) => (
        <div key={row.label} className="mobile-facts__cell">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
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
  item, mediaType, related, informationRows, statisticsRows, alternativeTitles, romajiTitle,
  isSaved, currentStatus, listStatuses, onToggleSaved, onSetStatus, onShare, shareNote,
  reviews, newsItems, discussions,
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

  const score = item.statistics?.score ?? (item.sampleScore ? item.sampleScore.toFixed(1) : null);
  const stats = [
    { label: t('scoreLabel'), value: score },
    { label: t('rankedLabel'), value: item.statistics?.ranked },
    { label: t('popularity'), value: item.statistics?.popularity },
  ];
  const synonyms = alternativeTitles.synonyms?.join(lang === 'fa' ? '، ' : ', ');
  const hasAlt = synonyms || alternativeTitles.japanese || alternativeTitles.english;
  const longSynopsis = (item.synopsis || '').length > 220;

  return (
    <div className="mobile-detail">
      <header className="mobile-detail__hero">
        <div className="mobile-detail__backdrop" aria-hidden="true">
          <img src={item.image} alt="" />
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
          <img className="mobile-detail__cover" src={item.image} alt={item.title} />
          <div className="mobile-detail__titles">
            <h1 dir="auto">{item.title}</h1>
            {romajiTitle && romajiTitle !== item.title && (
              <p className="mobile-detail__romaji" dir="ltr" lang="ja-Latn">{romajiTitle}</p>
            )}
            <p className="mobile-detail__sub">
              {item.format && <span>{item.format}</span>}
              {item.format && item.year && <span aria-hidden="true">·</span>}
              {item.year && <span dir="ltr">{item.year}</span>}
            </p>
          </div>
        </div>
        {shareNote && <p className="mobile-detail__note" role="status">{shareNote}</p>}
      </header>

      <div className="mobile-detail__stats" aria-label={t('statistics')}>
        {stats.map((stat) => (
          <div key={stat.label} className="mobile-detail__stat">
            <strong dir="ltr">{stat.value || '—'}</strong>
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
            <section>
              <h2 className="mobile-detail__h">{t('synopsis')}</h2>
              <p className={cn('mobile-detail__synopsis', !expanded && longSynopsis && 'is-clamped')} dir="auto">{item.synopsis}</p>
              {longSynopsis && (
                <button type="button" className="mobile-detail__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? t('mdLess') : t('more')}
                </button>
              )}
            </section>
            {item.genres?.length > 0 && (
              <section>
                <h2 className="mobile-detail__h">{t('genresLabel')}</h2>
                <div className="mobile-detail__genres">
                  {item.genres.map((g) => <span key={g} className="mobile-detail__genre">{g}</span>)}
                </div>
              </section>
            )}
            {reviews.length > 0 && (
              <section>
                <h2 className="mobile-detail__h">{t('reviewsTitle')}</h2>
                {reviews.map((review) => (
                  <p className="mobile-detail__quote" key={L(review.title, lang)}>
                    <strong>{L(review.title, lang)}</strong> {L(review.body, lang)}
                  </p>
                ))}
                <Link to="/reviews" className="mobile-detail__link">{t('readMoreReviews')}</Link>
              </section>
            )}
            {newsItems.length > 0 && (
              <section>
                <h2 className="mobile-detail__h">{t('recentNews')}</h2>
                {newsItems.slice(0, 2).map((news) => (
                  <p className="mobile-detail__quote" key={L(news.title, lang)}>
                    <strong>{L(news.title, lang)}</strong> {L(news.body, lang)}
                  </p>
                ))}
                <Link to="/news" className="mobile-detail__link">{t('moreNews')}</Link>
              </section>
            )}
            {discussions.length > 0 && (
              <section>
                <h2 className="mobile-detail__h">{t('forumTalk')}</h2>
                {discussions.slice(0, 2).map((d) => (
                  <p className="mobile-detail__quote" key={L(d.title, lang)}>
                    <strong>{L(d.title, lang)}</strong> {L(d.body, lang)}
                  </p>
                ))}
                <Link to="/forums" className="mobile-detail__link">{t('openDiscussions')}</Link>
              </section>
            )}
          </>
        )}

        {tab === 'info' && (
          <>
            <section>
              <h2 className="mobile-detail__h">{t('information')}</h2>
              <FactGrid rows={informationRows} />
            </section>
            <section>
              <h2 className="mobile-detail__h">{t('statistics')}</h2>
              <FactGrid rows={statisticsRows} />
              {!item.statistics && <p className="mobile-detail__muted">{t('prototypeNote')}</p>}
            </section>
            {hasAlt && (
              <section>
                <h2 className="mobile-detail__h">{t('alternativeTitles')}</h2>
                <FactGrid rows={[
                  { label: t('synonyms'), value: synonyms },
                  { label: t('japaneseTitle'), value: alternativeTitles.japanese },
                  { label: t('englishTitle'), value: alternativeTitles.english },
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
            <section>
              <h2 className="mobile-detail__h">{t('charactersVA')}</h2>
              <p className="mobile-detail__muted">{t('detailCastNote')}</p>
              <Link to="/characters" className="mobile-detail__link">{t('characterDirectoryLink')}</Link>
            </section>
            <section>
              <h2 className="mobile-detail__h">{t('staffSection')}</h2>
              <p className="mobile-detail__muted">{t('detailStaffNote')}</p>
              <Link to="/staff" className="mobile-detail__link">{t('productionCredits')}</Link>
            </section>
            <section>
              <h2 className="mobile-detail__h">{t('openingTheme')}</h2>
              <p className="mobile-detail__muted">{t('detailThemeNote')}</p>
            </section>
            <section>
              <h2 className="mobile-detail__h">{t('endingTheme')}</h2>
              <p className="mobile-detail__muted">{t('detailEndingNote')}</p>
            </section>
          </>
        )}

        {tab === 'related' && (
          <>
            <section>
              <h2 className="mobile-detail__h">{t('relatedEntries')}</h2>
              <p className="mobile-detail__muted">{t('detailRelatedNote')}</p>
              <div className="mobile-detail__links">
                <Link to="/adapted" className="mobile-detail__link">{t('mangaAdaptations')}</Link>
                <Link to="/anime" className="mobile-detail__link">{t('relatedTitles')}</Link>
              </div>
            </section>
            {related.length > 0 && (
              <section className="mobile-detail__rail">
                <SectionHeader title={t('relatedAnime')} />
                <Rail>
                  {related.map((entry) => <PosterCard key={entry.slug} item={entry} mediaType="anime" />)}
                </Rail>
              </section>
            )}
            <section>
              <h2 className="mobile-detail__h">{t('recommendationsTitle')}</h2>
              <p className="mobile-detail__muted">{t('detailRecsNote')}</p>
              <Link to="/recommendations" className="mobile-detail__link">{t('browseRecs')}</Link>
            </section>
            <section>
              <h2 className="mobile-detail__h">{t('interestStacks')}</h2>
              <p className="mobile-detail__muted">{t('detailStacksNote')}</p>
              <Link to="/stacks" className="mobile-detail__link">{t('browseStacks')}</Link>
            </section>
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
          <span>{isSaved ? t('inList') : t('addToList')}</span>
        </button>
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
