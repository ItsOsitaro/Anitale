import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import { apiGet, fmtNum, friendly, parseMalRef, pushRecent, store } from './pages/import-util.js';

const TYPE_KEY = 'adm.quickadd.type';
const RECENT_KEY = 'adm.quickadd.recent';
const MIN_CHARS = 2;
const DEBOUNCE_MS = 450;
const without = (map, key) => { const { [key]: _drop, ...rest } = map; return rest; };

// Search by name, add with one click. The save goes through the same bulk
// importer as the "bulk add" page (cover + Persian synopsis included).
export default function QuickAdd() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('import', 'edit');
  const [mediaType, setMediaType] = useState(() => (store.get(TYPE_KEY, 'anime') === 'manga' ? 'manga' : 'anime'));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(''); // 'search' | 'all' | `add-${malId}`
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState({}); // malId -> message
  const [added, setAdded] = useState({}); // malId -> slug
  const [recent, setRecent] = useState(() => { const v = store.get(RECENT_KEY, []); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; });
  const ticket = useRef(0); // ignores answers of searches that were replaced by a newer one
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { store.set(TYPE_KEY, mediaType); }, [mediaType]);

  const runSearch = async (text, type) => {
    const mine = ++ticket.current;
    setError('');
    const ref = parseMalRef(text);
    if (ref) {
      // A pasted link/id: no provider search needed, only a look at what the catalog already has.
      const kind = ref.type || type;
      if (kind !== type) setMediaType(kind);
      setBusy('search');
      let known = null;
      try { known = (await apiGet(`/api/admin/x/import/known?type=${kind}&ids=${ref.id}`)).items?.[String(ref.id)]; } catch { /* the add itself still works */ }
      if (mine !== ticket.current) return;
      setResults([{ malId: ref.id, title: known?.title || `MAL #${ref.id}`, type: '', year: '', imageUrl: '', existingSlug: known?.slug ?? null }]);
      setBusy('');
      return;
    }
    if (text.trim().length < MIN_CHARS) { setResults(null); setBusy(''); return; }
    setBusy('search');
    try {
      const found = await api.catalogSearch(text.trim(), type);
      if (mine === ticket.current) {
        setResults(found);
        if (found.length) setRecent((list) => { const next = pushRecent(list, text.trim()); store.set(RECENT_KEY, next); return next; });
      }
    } catch (err) {
      if (mine === ticket.current) setError(friendly(errText(err, t), t));
    } finally {
      if (mine === ticket.current) setBusy('');
    }
  };

  // Live search while typing (debounced); Enter searches immediately.
  useEffect(() => {
    if (query.trim().length < MIN_CHARS && !parseMalRef(query)) {
      ticket.current += 1;
      setResults(null);
      setBusy((b) => (b === 'search' ? '' : b));
      return undefined;
    }
    const timer = setTimeout(() => runSearch(query, mediaType), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mediaType]);

  const submit = (event) => { event.preventDefault(); runSearch(query, mediaType); };

  const markDone = (item, row) => {
    setAdded((map) => ({ ...map, [item.malId]: row?.slug || item.existingSlug || '' }));
    setRowError((map) => without(map, item.malId));
  };

  const addOne = async (item) => {
    setBusy(`add-${item.malId}`);
    setRowError((map) => without(map, item.malId));
    try {
      const res = await api.bulkImport({ ids: [item.malId], mediaType });
      const row = res.results?.[0];
      if (row?.status === 'exists' || row?.status === 'imported') {
        markDone(item, row);
        toast(t('quickAdded', { title: item.title }));
      } else {
        const why = row?.status === 'missing' ? t('bulkMissing') : (row?.error || row?.status || '?');
        setRowError((map) => ({ ...map, [item.malId]: t('quickFailed', { msg: why }) }));
      }
    } catch (err) {
      setRowError((map) => ({ ...map, [item.malId]: t('quickFailed', { msg: friendly(errText(err, t), t) }) }));
    } finally {
      setBusy('');
    }
  };

  const pending = (results || []).filter((item) => (added[item.malId] ?? item.existingSlug) == null);
  const addAll = async () => {
    if (pending.length < 2 || !await confirm(t('quickAddAllConfirm', { n: pending.length }))) return;
    setBusy('all');
    try {
      const res = await api.bulkImport({ ids: pending.map((item) => item.malId), mediaType });
      const byId = new Map((res.results || []).map((row) => [row.malId, row]));
      let ok = 0;
      for (const item of pending) {
        const row = byId.get(item.malId);
        if (row?.status === 'imported' || row?.status === 'exists') { markDone(item, row); ok += 1; }
        else setRowError((map) => ({ ...map, [item.malId]: t('quickFailed', { msg: row?.error || row?.status || '?' }) }));
      }
      toast(t('missDone', { ok, bad: pending.length - ok }), ok ? 'ok' : 'error');
    } catch (err) {
      setError(friendly(errText(err, t), t));
    } finally {
      setBusy('');
    }
  };

  const openPath = (slug) => (mediaType === 'manga' ? `/manga/${slug}` : `/admin/edit/${slug}`);
  const doneCount = Object.keys(added).length;

  return (
    <div className="adm-card adm-import">
      <div className="imp-head">
        <h2>{t('quickTitle')}</h2>
        {doneCount > 0 && <span className="adm-chip is-ok" aria-live="polite">{t('quickSession', { n: fmtNum(doneCount, lang) })}</span>}
      </div>
      <p className="adm-muted">{t('quickHint')}</p>
      {!canEdit && <p className="imp-readonly">{t('impReadOnly')}</p>}
      <form className="imp-tools" onSubmit={submit} role="search">
        <select value={mediaType} onChange={(e) => { setMediaType(e.target.value); setResults(null); setAdded({}); setRowError({}); }} aria-label={t('type')}>
          <option value="anime">{t('quickAnime')}</option>
          <option value="manga">{t('quickManga')}</option>
        </select>
        <div className="imp-search">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setResults(null); } }}
            placeholder={t('quickPh')}
            aria-label={t('quickTitle')}
          />
          {query && <button type="button" className="imp-clear" aria-label={t('impClear')} onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }}>×</button>}
        </div>
        <button className="adm-btn adm-primary" type="submit" disabled={busy === 'search' || busy === 'all'}>{busy === 'search' ? t('searching') : t('search')}</button>
      </form>
      {recent.length > 0 && !query && (
        <div className="imp-recent">
          <span className="adm-muted">{t('impRecent')}</span>
          {recent.map((text) => <button key={text} type="button" dir="auto" onClick={() => setQuery(text)}>{text}</button>)}
          <button type="button" className="imp-recent-clear" aria-label={t('quickRecentClear')} title={t('quickRecentClear')} onClick={() => { setRecent([]); store.set(RECENT_KEY, []); }}>×</button>
        </div>
      )}
      {error && <p className="adm-error" role="alert" dir="auto">{error} <button type="button" className="adm-btn" onClick={() => runSearch(query, mediaType)}>{t('impRetry')}</button></p>}
      {!results && !error && busy !== 'search' && <p className="adm-muted">{t('quickIdle')}</p>}
      {busy === 'search' && !results && <div className="imp-skel is-rows" aria-busy="true" aria-label={t('searching')}>{[0, 1, 2].map((i) => <i key={i} />)}</div>}
      {results && (
        results.length === 0 ? <p className="adm-empty">{t('noResults')}</p> : (
          <>
            <div className="imp-head">
              <p className="imp-count" aria-live="polite">{t('impResultCount', { n: fmtNum(results.length, lang) })}</p>
              {canEdit && pending.length > 1 && <button className="adm-btn" type="button" disabled={Boolean(busy)} onClick={addAll}>{busy === 'all' ? t('quickAdding') : t('quickAddAll', { n: fmtNum(pending.length, lang) })}</button>}
            </div>
            <ul className={`adm-results imp-results${busy === 'search' ? ' is-stale' : ''}`} aria-busy={busy === 'search'}>
              {results.map((item) => {
                const slug = added[item.malId] ?? item.existingSlug;
                const done = slug !== undefined && slug !== null;
                return (
                  <li key={item.malId} className={done ? 'is-done' : ''}>
                    {item.imageUrl ? <img className="adm-thumb" src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="adm-thumb adm-thumb-empty" title={t('quickNoCover')} aria-hidden="true">?</span>}
                    <span className="adm-grow">
                      <strong className="imp-title" dir="auto">{item.title}</strong>
                      <span className="imp-meta" dir="ltr">
                        {item.type && <span className="adm-chip">{item.type}</span>}
                        {item.year && <span>{item.year}</span>}
                        <span>MAL #{item.malId}</span>
                      </span>
                      {rowError[item.malId] && <span className="imp-rowerr" role="alert" dir="auto">{rowError[item.malId]}</span>}
                    </span>
                    <span className="imp-acts">
                      {done ? (
                        <>
                          <span className="adm-chip is-ok">{t('alreadyAdded')}</span>
                          {slug && <Link className="adm-btn" to={openPath(slug)}>{t('quickOpen')}</Link>}
                        </>
                      ) : (
                        <button className="adm-btn adm-primary" type="button" disabled={!canEdit || Boolean(busy)} onClick={() => addOne(item)}>
                          {busy === `add-${item.malId}` ? t('quickAdding') : t(rowError[item.malId] ? 'impRetry' : 'quickAdd')}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )
      )}
    </div>
  );
}
