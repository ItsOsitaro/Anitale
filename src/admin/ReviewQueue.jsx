import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';

const PAGE = 8;
const MAX_FA = 8000; // same limit the server enforces
const MAX_BULK = 50; // server takes at most 50 items per bulk call
const keyOf = (item) => `${item.table}/${item.slug}`;
const MEDIA = [['both', 'translateMediaAll'], ['anime', 'translateMediaAnime'], ['manga', 'translateMediaManga']];

const makeNum = (lang) => (value) => Number(value || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
const grow = (el) => { if (el) { el.style.blockSize = 'auto'; el.style.blockSize = `${Math.min(el.scrollHeight + 2, 420)}px`; } };

function ReviewCard({ item, draft, onDraft, onApprove, onRetranslate, onSkip, busy, readOnly, skipped, t, lang }) {
  const edited = draft.trim() !== item.fa.trim();
  const approve = () => { if (!readOnly && draft.trim()) onApprove(item, draft); };
  const num = makeNum(lang);
  const areaRef = useRef(null);
  useEffect(() => { grow(areaRef.current); }, [draft]);
  const ratio = item.en.length > 0 ? Math.round((draft.trim().length / item.en.length) * 100) : null;
  // Persian text is much shorter than the English source: probably cut off by the engine.
  const looksShort = item.en.length > 200 && draft.trim().length < item.en.length * 0.3;

  return (
    <article className="adm-rv-card" aria-busy={busy}>
      <header className="adm-rv-head">
        <h3 className="adm-rv-title" dir="auto">{item.title}</h3>
        <span className="adm-chip">{item.table === 'manga' ? t('translateMediaManga') : t('translateMediaAnime')}</span>
        {skipped && <span className="adm-chip">{t('rqSkipped')}</span>}
        {edited && <span className="adm-chip adm-rv-edited">{t('reviewEdited')}</span>}
        {looksShort && <span className="adm-chip is-bad">{t('rqShort')}</span>}
        {item.table === 'anime' && <Link className="adm-rv-open" to={`/admin/edit/${encodeURIComponent(item.slug)}`}>{t('rqEditTitle')}</Link>}
        <a className="adm-rv-open" href={`/${item.table}/${encodeURIComponent(item.slug)}`} target="_blank" rel="noreferrer">{t('rqViewPublic')}</a>
      </header>
      <div className="adm-rv-cols">
        <section>
          <h4 className="adm-label">{t('reviewEnglish')}</h4>
          <p className="adm-rv-en" dir="ltr" lang="en">{item.en || t('rqEnglishMissing')}</p>
        </section>
        <section>
          <label className="adm-label" htmlFor={`rv-${keyOf(item)}`}>{t('reviewPersian')}</label>
          <textarea
            ref={areaRef}
            id={`rv-${keyOf(item)}`}
            className="adm-rv-fa"
            dir="rtl"
            lang="fa"
            rows={5}
            maxLength={MAX_FA}
            value={draft}
            disabled={busy}
            readOnly={readOnly}
            onChange={(event) => onDraft(item, event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                approve();
              }
            }}
          />
          <p className="adm-muted adm-rv-count">
            <span>{t('rqChars', { n: num(draft.length), max: num(MAX_FA) })}</span>
            {ratio != null && <span title={t('rqRatioHint')}>{t('rqRatio', { n: num(ratio) })}</span>}
            {!readOnly && <span>{t('rqKeysHint')}</span>}
          </p>
        </section>
      </div>
      {!readOnly && (
        <footer className="adm-rv-actions">
          <button type="button" className="adm-btn adm-primary" disabled={busy || !draft.trim()} onClick={approve} title={t('reviewShortcut')}>
            {edited ? t('reviewSaveApprove') : t('reviewApprove')}
          </button>
          <button type="button" className="adm-btn" disabled={busy} onClick={() => onRetranslate(item, edited)}>{t('reviewRetranslate')}</button>
          <button type="button" className="adm-btn adm-rv-skip" disabled={busy} onClick={() => onSkip(item)}>{t('reviewSkip')}</button>
        </footer>
      )}
    </article>
  );
}

export default function ReviewQueue() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const readOnly = !can('translate', 'edit');
  const [media, setMedia] = useState('both');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('queue'); // queue | short
  const [items, setItems] = useState([]);
  const [drafts, setDrafts] = useState({}); // key -> text being edited (lifted so bulk approve can see edits)
  const [skipped, setSkipped] = useState(() => new Set());
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const searchTimer = useRef(0);
  const sortRef = useRef('queue');
  const requestId = useRef(0); // ignore responses of superseded requests (fast typing, filter switch)

  const draftOf = (item) => drafts[keyOf(item)] ?? item.fa;

  const load = useCallback(async (nextMedia, nextQuery, { append = false, offset = 0 } = {}) => {
    const sortNow = sortRef.current;
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError('');
    try {
      const res = await api.reviewList({ media: nextMedia, q: nextQuery, limit: PAGE, offset, ...(sortNow === 'short' ? { sort: 'short' } : {}) });
      if (id !== requestId.current) return;
      setTotal(res.total);
      setItems((prev) => {
        const known = new Set((append ? prev : []).map(keyOf));
        const fresh = res.items.filter((item) => !known.has(keyOf(item)));
        return append ? [...prev, ...fresh] : fresh;
      });
    } catch (err) {
      if (id === requestId.current) setError(err?.message || String(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    setDrafts({});
    setSkipped(new Set());
    load(media, query);
  }, [load, media, query]);

  useEffect(() => {
    sortRef.current = sort;
    setDrafts({});
    setSkipped(new Set());
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => load(media, query), query ? 250 : 0);
    return () => window.clearTimeout(searchTimer.current);
  }, [media, query, sort, load]);

  const dropItems = (keys) => {
    const gone = new Set(keys);
    setItems((prev) => prev.filter((entry) => !gone.has(keyOf(entry))));
    setTotal((count) => (count == null ? count : Math.max(0, count - gone.size)));
    setDrafts((prev) => { const next = { ...prev }; gone.forEach((k) => delete next[k]); return next; });
    setSkipped((prev) => { const next = new Set(prev); gone.forEach((k) => next.delete(k)); return next; });
  };

  // Keep the screen filled: fetch the next batch once the visible one runs low.
  const refill = (remainingVisible) => {
    if (remainingVisible <= 2) load(media, query, { append: true, offset: remainingVisible });
  };

  const act = async (item, body, onDone) => {
    setBusyKey(keyOf(item));
    try {
      onDone(await api.reviewAct(item.table, item.slug, body));
    } catch (err) {
      if (err?.status === 409) toast(t('rqHandWritten'), 'error');
      else toast(err?.status === 502 ? t('translateRunningNow') : (err?.message || String(err)), 'error');
    } finally {
      setBusyKey('');
    }
  };

  const approve = (item, fa) => act(item, { action: 'approve', fa }, () => {
    dropItems([keyOf(item)]);
    toast(t('reviewApproved'), 'ok');
    refill(items.length - 1);
  });

  const retranslate = async (item, edited) => {
    if (edited && !await confirm(t('rqDiscardConfirm'))) return;
    act(item, { action: 'retranslate' }, (res) => {
      setItems((prev) => prev.map((entry) => (keyOf(entry) === keyOf(item) ? { ...entry, fa: res.fa } : entry)));
      setDrafts((prev) => { const next = { ...prev }; delete next[keyOf(item)]; return next; });
      toast(t('reviewRetranslated'), 'ok');
    });
  };

  const skip = (item) => {
    setSkipped((prev) => new Set(prev).add(keyOf(item)));
    setItems((prev) => [...prev.filter((entry) => keyOf(entry) !== keyOf(item)), item]);
  };

  // Bulk approval only takes items the admin has not edited: edits live in drafts and would be lost.
  const untouched = items.filter((item) => draftOf(item).trim() === item.fa.trim()).slice(0, MAX_BULK);
  const editedCount = items.length - items.filter((item) => draftOf(item).trim() === item.fa.trim()).length;
  const approveAll = async () => {
    if (untouched.length === 0 || busyKey) return;
    if (!await confirm(t('reviewApproveAllConfirm', { count: untouched.length }))) return;
    setBusyKey('*');
    try {
      const res = await api.reviewBulk(untouched.map((item) => ({ media: item.table, slug: item.slug })));
      dropItems(untouched.map(keyOf));
      toast(t('reviewApprovedMany', { count: res.approved }), 'ok');
      if (editedCount > 0) toast(t('rqApproveEditedSkipped', { n: editedCount }), 'ok');
      refill(items.length - untouched.length);
    } catch (err) {
      toast(err?.message || String(err), 'error');
    } finally {
      setBusyKey('');
    }
  };

  const showSkeleton = loading && items.length === 0 && !error;
  const empty = total === 0 && !loading && !error;

  return (
    <div className="adm-card">
      <header className="adm-card-head adm-rv-top">
        <div>
          <h2 className="adm-card-title">{t('reviewTitle')}</h2>
          <p className="adm-card-sub">{t('reviewSub')}</p>
        </div>
        {total != null && <span className="adm-chip" aria-live="polite">{t('reviewPending', { count: makeNum(lang)(total) })}</span>}
      </header>
      <div className="adm-card-body">
        {readOnly && <p className="adm-tr-note" role="note">{t('rqReadOnly')}</p>}

        <div className="adm-rv-filters">
          <div className="adm-filters" role="group" aria-label={t('translateMediaAll')}>
            {MEDIA.map(([key, label]) => (
              <button key={key} type="button" className={`adm-fchip${media === key ? ' is-on' : ''}`} aria-pressed={media === key} onClick={() => setMedia(key)}>{t(label)}</button>
            ))}
          </div>
          <input className="adm-rv-search" type="search" dir="auto" value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)} placeholder={t('reviewSearch')} aria-label={t('reviewSearch')} />
          <label className="adm-sort">
            <span className="adm-muted">{t('cmSort')}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="queue">{t('rqSortQueue')}</option>
              <option value="short">{t('rqSortShort')}</option>
            </select>
          </label>
          <button type="button" className="adm-btn" disabled={loading} onClick={reload}>{t('rqRefresh')}</button>
        </div>

        {error && (
          <p className="adm-error" role="alert">
            {t('rqLoadError')} {error} <button type="button" className="adm-btn" onClick={reload}>{t('trRetry')}</button>
          </p>
        )}

        {!readOnly && untouched.length > 1 && (
          <div className="adm-rv-bulk">
            <button type="button" className="adm-btn" disabled={Boolean(busyKey)} onClick={approveAll}>{t('rqApproveAllShown', { n: makeNum(lang)(untouched.length) })}</button>
            {editedCount > 0 && <span className="adm-muted">{t('rqApproveEditedSkipped', { n: makeNum(lang)(editedCount) })}</span>}
          </div>
        )}

        {showSkeleton && <div className="adm-skeleton" aria-busy="true">{[0, 1, 2].map((i) => <i key={i} className="adm-rv-skel" />)}</div>}

        {empty && (
          <div className="adm-rv-empty">
            <p>{query ? t('rqEmptySearch', { q: query }) : t('reviewEmpty')}</p>
            {query && <button type="button" className="adm-btn" onClick={() => setQuery('')}>{t('rqClearSearch')}</button>}
          </div>
        )}

        <div className="adm-rv-list">
          {items.map((item) => (
            <ReviewCard
              key={keyOf(item)}
              item={item}
              draft={draftOf(item)}
              onDraft={(entry, text) => setDrafts((prev) => ({ ...prev, [keyOf(entry)]: text }))}
              t={t}
              lang={lang}
              readOnly={readOnly}
              skipped={skipped.has(keyOf(item))}
              busy={busyKey === keyOf(item) || busyKey === '*'}
              onApprove={approve}
              onRetranslate={retranslate}
              onSkip={skip}
            />
          ))}
        </div>

        {items.length > 0 && total != null && (
          <div className="adm-rv-more">
            <span className="adm-muted">{t('rqShowing', { shown: makeNum(lang)(items.length), total: makeNum(lang)(total) })}</span>
            {total > items.length && (
              <button type="button" className="adm-btn" disabled={loading} onClick={() => load(media, query, { append: true, offset: items.length })}>
                {loading ? t('loading') : t('reviewLoadMore')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
