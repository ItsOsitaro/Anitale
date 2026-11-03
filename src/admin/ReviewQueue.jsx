import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { AdminContext } from './context.js';

const PAGE = 8;
const keyOf = (item) => `${item.table}/${item.slug}`;

function ReviewCard({ item, onApprove, onRetranslate, onSkip, busy, t }) {
  const [draft, setDraft] = useState(item.fa);
  const edited = draft.trim() !== item.fa.trim();
  const approve = () => onApprove(item, draft);

  // A new machine translation replaces the draft the admin was looking at.
  useEffect(() => { setDraft(item.fa); }, [item.fa]);

  return (
    <article className="adm-rv-card" aria-busy={busy}>
      <header className="adm-rv-head">
        <h3 className="adm-rv-title">{item.title}</h3>
        <span className="adm-chip">{item.table === 'manga' ? t('translateMediaManga') : t('translateMediaAnime')}</span>
        {edited && <span className="adm-chip adm-rv-edited">{t('reviewEdited')}</span>}
      </header>
      <div className="adm-rv-cols">
        <section>
          <h4 className="adm-label">{t('reviewEnglish')}</h4>
          <p className="adm-rv-en" dir="ltr" lang="en">{item.en}</p>
        </section>
        <section>
          <label className="adm-label" htmlFor={`rv-${keyOf(item)}`}>{t('reviewPersian')}</label>
          <textarea
            id={`rv-${keyOf(item)}`}
            className="adm-rv-fa"
            dir="rtl"
            lang="fa"
            rows={7}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && draft.trim()) {
                event.preventDefault();
                approve();
              }
            }}
          />
        </section>
      </div>
      <footer className="adm-rv-actions">
        <button type="button" className="adm-btn adm-primary" disabled={busy || !draft.trim()} onClick={approve} title={t('reviewShortcut')}>
          {edited ? t('reviewSaveApprove') : t('reviewApprove')}
        </button>
        <button type="button" className="adm-btn" disabled={busy} onClick={() => onRetranslate(item)}>{t('reviewRetranslate')}</button>
        <button type="button" className="adm-btn adm-rv-skip" disabled={busy} onClick={() => onSkip(item)}>{t('reviewSkip')}</button>
      </footer>
    </article>
  );
}

export default function ReviewQueue() {
  const { t, toast } = useContext(AdminContext);
  const [media, setMedia] = useState('both');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const skipped = useRef(new Set());
  const searchTimer = useRef(0);

  const load = useCallback(async (nextMedia, nextQuery, { append = false, offset = 0 } = {}) => {
    setLoading(true);
    try {
      const res = await api.reviewList({ media: nextMedia, q: nextQuery, limit: PAGE, offset });
      setTotal(res.total);
      setItems((prev) => {
        const known = new Set((append ? prev : []).map(keyOf));
        const fresh = res.items.filter((item) => !known.has(keyOf(item)));
        return append ? [...prev, ...fresh] : fresh;
      });
    } catch (error) {
      toast(error?.message || String(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    skipped.current = new Set();
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => load(media, query), query ? 250 : 0);
    return () => window.clearTimeout(searchTimer.current);
  }, [media, query, load]);

  const removeItem = (item) => {
    setItems((prev) => prev.filter((entry) => keyOf(entry) !== keyOf(item)));
    setTotal((count) => (count == null ? count : Math.max(0, count - 1)));
  };

  const act = async (item, body, onDone) => {
    setBusyKey(keyOf(item));
    try {
      const res = await api.reviewAct(item.table, item.slug, body);
      onDone(res);
    } catch (error) {
      toast(error?.status === 502 ? t('translateRunningNow') : (error?.message || String(error)), 'error');
    } finally {
      setBusyKey('');
    }
  };

  const approve = (item, fa) => act(item, { action: 'approve', fa }, () => {
    removeItem(item);
    toast(t('reviewApproved'), 'ok');
    // Refill once the visible batch runs low.
    if (items.length <= 2) load(media, query, { append: true, offset: skipped.current.size });
  });

  const retranslate = (item) => act(item, { action: 'retranslate' }, (res) => {
    setItems((prev) => prev.map((entry) => (keyOf(entry) === keyOf(item) ? { ...entry, fa: res.fa } : entry)));
    toast(t('reviewRetranslated'), 'ok');
  });

  const approveAll = async () => {
    if (items.length === 0 || busyKey) return;
    if (!window.confirm(t('reviewApproveAllConfirm', { count: items.length }))) return;
    setBusyKey('*');
    try {
      const res = await api.reviewBulk(items.map((item) => ({ media: item.table, slug: item.slug })));
      toast(t('reviewApprovedMany', { count: res.approved }), 'ok');
      await load(media, query);
    } catch (error) {
      toast(error?.message || String(error), 'error');
    } finally {
      setBusyKey('');
    }
  };

  const skip = (item) => {
    skipped.current.add(keyOf(item));
    setItems((prev) => [...prev.filter((entry) => keyOf(entry) !== keyOf(item)), item]);
  };

  return (
    <div className="adm-card">
      <header className="adm-card-head adm-rv-top">
        <div>
          <h2 className="adm-card-title">{t('reviewTitle')}</h2>
          <p className="adm-card-sub">{t('reviewSub')}</p>
        </div>
        {total != null && <span className="adm-chip" aria-live="polite">{t('reviewPending').replace('{count}', total)}</span>}
      </header>
      <div className="adm-card-body">
        <div className="adm-rv-filters">
          <label className="adm-field" style={{ maxWidth: 200 }}>
            <span className="adm-label">{t('translateMediaAll')}</span>
            <select value={media} onChange={(event) => setMedia(event.target.value)}>
              <option value="both">{t('translateMediaAll')}</option>
              <option value="anime">{t('translateMediaAnime')}</option>
              <option value="manga">{t('translateMediaManga')}</option>
            </select>
          </label>
          <label className="adm-field" style={{ flex: 1, minWidth: 180 }}>
            <span className="adm-label">{t('reviewSearch')}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('reviewSearch')} />
          </label>
        </div>

        {items.length > 1 && (
          <button type="button" className="adm-btn" disabled={Boolean(busyKey)} onClick={approveAll}>{t('reviewApproveAll')}</button>
        )}

        {total === 0 && !loading && <p className="adm-rv-empty">{t('reviewEmpty')}</p>}

        <div className="adm-rv-list">
          {items.map((item) => (
            <ReviewCard
              key={keyOf(item)}
              item={item}
              t={t}
              busy={busyKey === keyOf(item)}
              onApprove={approve}
              onRetranslate={retranslate}
              onSkip={skip}
            />
          ))}
        </div>

        {items.length > 0 && total != null && total > items.length && (
          <button
            type="button"
            className="adm-btn"
            disabled={loading}
            onClick={() => load(media, query, { append: true, offset: items.length })}
          >
            {t('reviewLoadMore')}
          </button>
        )}
      </div>
    </div>
  );
}
