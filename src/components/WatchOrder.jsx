import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteLang } from '@/i18n';
import { useCatalog, useEnsureTitles, useMangaCatalog } from '@/catalog-context.jsx';
import { mediaHref } from '@/catalog.js';
import { formatNumber } from '@/lib/digits.js';

const LIMIT = 8;

// Watch / reading order of a franchise, built on demand from the title's relations.
export default function WatchOrder({ mediaType, malId, currentTitle }) {
  const { t, lang } = useSiteLang();
  const [all, setAll] = useState(false);
  const anime = useCatalog();
  const manga = useMangaCatalog();
  const catalog = mediaType === 'manga' ? manga : anime;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ status: 'idle', found: 0 });
  useEnsureTitles(mediaType, [], (state.items || []).map((entry) => entry.id));

  useEffect(() => { setOpen(false); setAll(false); setState({ status: 'idle', found: 0 }); }, [mediaType, malId]);

  useEffect(() => {
    if (!open || !malId) return undefined;
    let alive = true;
    let timer;
    const tick = async () => {
      try {
        const res = await fetch(`/api/franchise/${mediaType}/${malId}`);
        const body = res.ok ? await res.json() : { status: 'failed' };
        if (!alive) return;
        setState(body);
        if (body.status === 'building') timer = window.setTimeout(tick, 2500);
      } catch { if (alive) setState({ status: 'failed' }); }
    };
    setState({ status: 'building', found: 0 });
    tick();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [open, mediaType, malId]);

  if (!malId) return null;
  if (!open) {
    return <Button type="button" variant="outline" size="sm" className="watch-order__open" onClick={() => setOpen(true)}>{t(mediaType === 'manga' ? 'readOrderShow' : 'watchOrderShow')}</Button>;
  }
  if (state.status === 'building') return <p className="extras-muted" role="status">{t('watchOrderBuilding', { n: state.found || 0 })}</p>;
  if (state.status === 'failed') {
    return <p className="extras-muted" role="alert">{t('watchOrderFailed')} <button type="button" className="watch-order__retry" onClick={() => { setOpen(false); window.setTimeout(() => setOpen(true), 50); }}>{t('watchOrderRetry')}</button></p>;
  }
  const items = state.items || [];
  if (items.length <= 1) return <p className="extras-muted">{t('watchOrderSingle')}</p>;
  // Long franchises start folded to the first rows; the current title always stays visible.
  const visible = all || items.length <= LIMIT ? items : items.filter((entry, index) => index < LIMIT || entry.id === malId);
  return (
    <div className="watch-order">
      <h3>{t(mediaType === 'manga' ? 'readOrderTitle' : 'watchOrderTitle')}</h3>
      <ol>
        {visible.map((entry) => {
          const index = items.indexOf(entry);
          const local = catalog.find((item) => item.malId === entry.id);
          const here = entry.id === malId;
          const body = (
            <>
              <span className="watch-order__n" aria-hidden="true">{index + 1}</span>
              {entry.image ? <img src={entry.image} alt="" loading="lazy" decoding="async" /> : <span className="watch-order__noimg" aria-hidden="true" />}
              <span className="watch-order__text">
                <strong dir="auto">{entry.title}</strong>
                <small>{[entry.kind, entry.year, entry.count ? t(mediaType === 'manga' ? 'watchOrderChapters' : 'watchOrderEpisodes', { n: entry.count }) : ''].filter(Boolean).join(' · ')}</small>
              </span>
              {here && <span className="watch-order__here">{t('watchOrderHere')}</span>}
            </>
          );
          return (
            <li key={entry.id} className={here ? 'is-current' : ''} aria-current={here ? 'true' : undefined}>
              {local && !here ? <Link to={mediaHref(local, mediaType)}>{body}</Link> : <div className={local || here ? '' : 'is-plain'}>{body}</div>}
            </li>
          );
        })}
      </ol>
      {visible.length < items.length && (
        <Button type="button" variant="outline" size="sm" className="watch-order__open" onClick={() => setAll(true)}>{t('charShowAll', { n: formatNumber(items.length, lang) })}</Button>
      )}
      {state.truncated && <p className="extras-muted">{t('watchOrderTruncated')}</p>}
      <p className="extras-muted">{t('watchOrderNote')}</p>
    </div>
  );
}
