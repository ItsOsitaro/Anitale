import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const STEP = 20; // titles per request (the server accepts up to 50)
const keyOf = (item) => `${item.type}:${item.malId}`;

// Titles members asked for through the MyAnimeList list import, ready to add in one go.
export default function MissingTitles() {
  const { t, toast } = useAdmin();
  const [items, setItems] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.missingTitles();
      setItems(data.items);
      setPicked((current) => new Set([...current].filter((key) => data.items.some((item) => keyOf(item) === key))));
    } catch (err) { setError(errText(err, t)); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const chosen = (items || []).filter((item) => picked.has(keyOf(item)));
  const toggle = (item) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(keyOf(item))) next.delete(keyOf(item)); else next.add(keyOf(item));
    return next;
  });
  const allPicked = items?.length > 0 && chosen.length === items.length;

  const addSelected = async () => {
    if (!chosen.length || busy) return;
    setError('');
    let ok = 0; let bad = 0; let done = 0;
    for (const mediaType of ['anime', 'manga']) {
      const ofType = chosen.filter((item) => item.type === mediaType);
      for (let i = 0; i < ofType.length; i += STEP) {
        const part = ofType.slice(i, i + STEP);
        setBusy(t('missWorking', { done, total: chosen.length }));
        try {
          const res = await api.bulkImport({ ids: part.map((item) => item.malId), mediaType });
          const results = res.results || [];
          ok += results.filter((r) => r.status === 'imported' || r.status === 'exists').length;
          bad += part.length - results.filter((r) => r.status === 'imported' || r.status === 'exists').length;
        } catch (err) {
          bad += part.length;
          setError(errText(err, t));
        }
        done += part.length;
      }
    }
    setBusy('');
    toast(t('missDone', { ok, bad }));
    await load();
  };

  const dismiss = async () => {
    if (!chosen.length || busy) return;
    setBusy('…');
    try {
      await api.missingDismiss(chosen.map(({ type, malId }) => ({ type, malId })));
      setPicked(new Set());
      await load();
    } catch (err) { setError(errText(err, t)); }
    setBusy('');
  };

  return (
    <div className="adm-card adm-import">
      <h2>{t('missTitle')}</h2>
      <p className="adm-muted">{t('missHint')}</p>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {items && items.length === 0 && <p className="adm-muted">{t('missEmpty')}</p>}
      {items && items.length > 0 && (
        <>
          <div className="adm-inline">
            <label><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(items.map(keyOf)))} /> {t('missSelectAll')}</label>
            <button className="adm-btn adm-primary" type="button" disabled={!chosen.length || Boolean(busy)} onClick={addSelected}>{busy || t('missImport')}</button>
            <button className="adm-btn" type="button" disabled={!chosen.length || Boolean(busy)} onClick={dismiss}>{t('missDismiss')}</button>
          </div>
          <ul className="adm-results">
            {items.map((item) => (
              <li key={keyOf(item)}>
                <input type="checkbox" checked={picked.has(keyOf(item))} onChange={() => toggle(item)} aria-label={item.title || String(item.malId)} />
                <span className="adm-grow"><strong dir="auto">{item.title || `MAL #${item.malId}`}</strong><br /><span className="adm-muted">{item.type} • MAL #{item.malId} • {t('missRequests', { n: item.requests })}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
