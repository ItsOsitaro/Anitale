import { useEffect, useRef, useState } from 'react';
import { useSiteLang } from '@/i18n';
import { canvasToBlob, drawProfileCard, drawTitleCard } from '@/lib/share-card';

// Preview + download/share of a card made by lib/share-card.js. `kind` is 'title' or 'profile'; `data` feeds the drawer.
export default function ShareCardDialog({ kind, data, fileName, onClose }) {
  const { t } = useSiteLang();
  const [size, setSize] = useState('story');
  const [state, setState] = useState({ status: 'drawing', url: '', blob: null });
  const closeRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    setState({ status: 'drawing', url: '', blob: null });
    (async () => {
      try {
        const canvas = await (kind === 'profile' ? drawProfileCard(data, size) : drawTitleCard(data, size));
        const blob = await canvasToBlob(canvas);
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl, blob });
      } catch { if (alive) setState({ status: 'failed', url: '', blob: null }); }
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [kind, data, size]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const file = state.blob ? new File([state.blob], `${fileName}.png`, { type: 'image/png' }) : null;
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));
  const share = async () => {
    try { await navigator.share({ files: [file], title: data.title || data.name }); } catch { /* the visitor cancelled */ }
  };

  return (
    <div className="share-card__scrim" role="presentation" onClick={onClose}>
      <div className="share-card" role="dialog" aria-modal="true" aria-label={t('cardTitle')} onClick={(event) => event.stopPropagation()}>
        <header className="share-card__head">
          <h2>{t('cardTitle')}</h2>
          <button type="button" ref={closeRef} className="share-card__close" onClick={onClose} aria-label={t('cardClose')}>×</button>
        </header>
        <div className="share-card__sizes" role="group" aria-label={t('cardSize')}>
          <button type="button" aria-pressed={size === 'story'} onClick={() => setSize('story')}>{t('cardStory')}</button>
          <button type="button" aria-pressed={size === 'square'} onClick={() => setSize('square')}>{t('cardSquare')}</button>
        </div>
        <div className={`share-card__preview is-${size}`}>
          {state.status === 'ready' && <img src={state.url} alt={t('cardPreview')} />}
          {state.status === 'drawing' && <p role="status">{t('cardDrawing')}</p>}
          {state.status === 'failed' && <p role="alert">{t('cardFailed')}</p>}
        </div>
        <div className="share-card__actions">
          <a className={`share-card__btn is-primary${state.status === 'ready' ? '' : ' is-disabled'}`} href={state.url || undefined} download={`${fileName}.png`} aria-disabled={state.status !== 'ready'}>{t('cardDownload')}</a>
          {canShare && <button type="button" className="share-card__btn" onClick={share}>{t('cardShare')}</button>}
        </div>
      </div>
    </div>
  );
}
