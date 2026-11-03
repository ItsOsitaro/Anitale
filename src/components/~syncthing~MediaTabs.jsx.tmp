import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useUser } from '@/user.jsx';
import { entryTotal } from '@/components/mobile/entry-utils';
import { formatNumber } from '@/lib/digits.js';

// Episodes / videos / pictures of a title. Each tab loads from /api/media only when it is opened.
const cache = new Map();

function useMedia(type, malId, kind, page = 1) {
  const key = `${type}:${malId}:${kind}:${page}`;
  const [state, setState] = useState(() => cache.get(key) || { status: 'loading' });
  useEffect(() => {
    if (cache.has(key)) { setState(cache.get(key)); return undefined; }
    let alive = true;
    setState({ status: 'loading' });
    fetch(`/api/media/${type}/${malId}/${kind}${kind === 'episodes' ? `?page=${page}` : ''}`)
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((body) => {
        const next = body?.ok ? { status: 'ready', data: body } : { status: 'error' };
        if (next.status === 'ready' && !body.stale) cache.set(key, next);
        if (alive) setState(next);
      })
      .catch(() => { if (alive) setState({ status: 'error' }); });
    return () => { alive = false; };
  }, [key, type, malId, kind, page]);
  return state;
}

function Episodes({ item, malId }) {
  const { t, lang } = useSiteLang();
  const user = useUser();
  const [pages, setPages] = useState(1);
  const entry = user.entries.anime.find((e) => e.slug === item.slug);
  const seen = entry?.progress ?? 0;
  const total = entryTotal(item, 'anime');
  const markEpisode = async (number) => {
    if (!entry) await user.toggle('anime', item.slug);
    const next = number === seen ? number - 1 : number;
    await user.setProgress('anime', item.slug, next);
    if (total && next >= total) await user.setStatus('anime', item.slug, 'completed');
  };
  const blocks = [];
  for (let p = 1; p <= pages; p += 1) blocks.push(<EpisodePage key={p} page={p} malId={malId} seen={seen} onMark={markEpisode} onMore={p === pages ? () => setPages(p + 1) : null} t={t} lang={lang} />);
  return <div className="media-episodes">{blocks}</div>;
}

function EpisodePage({ page, malId, seen, onMark, onMore, t, lang }) {
  const state = useMedia('anime', malId, 'episodes', page);
  if (state.status === 'loading') return <p className="extras-muted" role="status">{t('extrasLoading')}</p>;
  if (state.status === 'error') return <p className="extras-muted" role="status">{t('mediaError')}</p>;
  const { items, hasNext } = state.data;
  if (!items.length && page === 1) return <p className="extras-muted">{t('mediaNoEpisodes')}</p>;
  return (
    <>
      <ol className="media-ep-list" start={items[0]?.number}>
        {items.map((e) => {
          const done = e.number <= seen;
          return (
            <li key={e.number} className={done ? 'is-seen' : undefined}>
              <span className="media-ep-num">{formatNumber(e.number, lang)}</span>
              <span className="media-ep-title">
                <strong dir="auto">{e.title || `${t('mediaEpisode')} ${formatNumber(e.number, lang)}`}</strong>
                <small>
                  {e.aired && <time dir="ltr" dateTime={e.aired}>{e.aired}</time>}
                  {e.filler && <em>{t('mediaFiller')}</em>}
                  {e.recap && <em>{t('mediaRecap')}</em>}
                </small>
              </span>
              <button type="button" className="media-ep-seen" aria-pressed={done} aria-label={`${t('mediaSeen')} ${formatNumber(e.number, lang)}`} onClick={() => onMark(e.number)}>
                <Check width={16} height={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      {hasNext && onMore && <button type="button" className="media-more" onClick={onMore}>{t('mediaMoreEpisodes')}</button>}
    </>
  );
}

function Videos({ malId }) {
  const { t } = useSiteLang();
  const state = useMedia('anime', malId, 'videos');
  const [playing, setPlaying] = useState(null);
  if (state.status === 'loading') return <p className="extras-muted" role="status">{t('extrasLoading')}</p>;
  if (state.status === 'error') return <p className="extras-muted" role="status">{t('mediaError')}</p>;
  const { promo, music } = state.data;
  if (!promo.length && !music.length) return <p className="extras-muted">{t('mediaNoVideos')}</p>;
  const group = (title, list) => list.length > 0 && (
    <section className="media-video-group">
      <h3>{title}</h3>
      <ul>
        {list.map((v) => (
          <li key={v.youtubeId}>
            {playing === v.youtubeId ? (
              <div className="extras-trailer">
                <iframe title={v.title} src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}?autoplay=1&rel=0`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              </div>
            ) : (
              <button type="button" className="media-video-btn" onClick={() => setPlaying(v.youtubeId)}>
                <span className="extras-play" aria-hidden="true">▶</span>
                <span dir="auto">{v.title || t('playTrailer')}{v.by ? ` — ${v.by}` : ''}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
  return <div>{group(t('mediaPromo'), promo)}{group(t('mediaMusic'), music)}</div>;
}

function Viewer({ items, index, onClose, onMove }) {
  const { t } = useSiteLang();
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onMove(1);
      if (e.key === 'ArrowLeft') onMove(-1);
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose, onMove]);
  const cur = items[index];
  return createPortal(
    <div className="media-viewer" role="dialog" aria-modal="true" aria-label={t('mediaPictures')} onClick={onClose}>
      <button ref={closeRef} type="button" className="media-viewer__close" onClick={onClose} aria-label={t('mediaClose')}>×</button>
      <button type="button" className="media-viewer__nav is-prev" onClick={(e) => { e.stopPropagation(); onMove(-1); }} aria-label={t('topCharsPrev')}>‹</button>
      <img src={cur.full} alt="" onClick={(e) => e.stopPropagation()} onError={(e) => { if (e.currentTarget.src.indexOf(cur.thumb) === -1) e.currentTarget.src = cur.thumb; }} />
      <button type="button" className="media-viewer__nav is-next" onClick={(e) => { e.stopPropagation(); onMove(1); }} aria-label={t('topCharsNext')}>›</button>
    </div>,
    document.body,
  );
}

function Pictures({ mediaType, malId }) {
  const { t } = useSiteLang();
  const state = useMedia(mediaType, malId, 'pictures');
  const [open, setOpen] = useState(null);
  const items = state.data?.items || [];
  const close = useCallback(() => setOpen(null), []);
  const move = useCallback((d) => setOpen((i) => (i == null ? i : (i + d + items.length) % items.length)), [items.length]);
  if (state.status === 'loading') return <p className="extras-muted" role="status">{t('extrasLoading')}</p>;
  if (state.status === 'error') return <p className="extras-muted" role="status">{t('mediaError')}</p>;
  if (!items.length) return <p className="extras-muted">{t('mediaNoPictures')}</p>;
  return (
    <>
      <ul className="media-grid">
        {items.map((p, i) => (
          <li key={p.thumb}><button type="button" onClick={() => setOpen(i)} aria-label={`${t('mediaPictures')} ${i + 1}`}><img src={p.thumb} alt="" loading="lazy" decoding="async" /></button></li>
        ))}
      </ul>
      {open != null && <Viewer items={items} index={open} onClose={close} onMove={move} />}
    </>
  );
}

export default function MediaTabs({ item, mediaType, defaultTab }) {
  const { t } = useSiteLang();
  const tabs = mediaType === 'anime' ? ['episodes', 'videos', 'pictures'] : ['pictures'];
  const [tab, setTab] = useState(defaultTab && tabs.includes(defaultTab) ? defaultTab : tabs[0]);
  if (!item.malId) return null;
  const label = { episodes: t('mediaEpisodes'), videos: t('mediaVideos'), pictures: t('mediaPictures') };
  return (
    <div className="media-tabs">
      {tabs.length > 1 && (
        <div className="media-tabs__bar" role="tablist">
          {tabs.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : undefined} onClick={() => setTab(id)}>{label[id]}</button>
          ))}
        </div>
      )}
      <div role="tabpanel">
        {tab === 'episodes' && <Episodes item={item} malId={item.malId} />}
        {tab === 'videos' && <Videos malId={item.malId} />}
        {tab === 'pictures' && <Pictures mediaType={mediaType} malId={item.malId} />}
      </div>
    </div>
  );
}
