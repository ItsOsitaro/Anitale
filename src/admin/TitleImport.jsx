import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';
import { parseMalRef, store } from './pages/import-util.js';

const RECENT_KEY = 'adm.titleimport.recent';
const MIN_CHARS = 2;
const DEBOUNCE_MS = 450;

// Import box inside the anime form: search by name or paste a MyAnimeList link, then fill the form.
export default function TitleImport({ onImported, mode = 'create', currentSlug = '', initialQuery = '' }) {
  const { t, lang, toast, confirm, can } = useAdmin();
  const input = useRef(null);
  const num = (n) => Number(n || 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
  const canEdit = can('import', 'edit');
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(''); // slug of a 409 "already in the catalog" answer
  const [recent, setRecent] = useState(() => store.get(RECENT_KEY, []));
  const ticket = useRef(0);
  const first = useRef(true);

  const remember = (text) => {
    const clean = text.trim();
    if (clean.length < MIN_CHARS || parseMalRef(clean)) return;
    const next = [clean, ...recent.filter((entry) => entry !== clean)].slice(0, 5);
    setRecent(next);
    store.set(RECENT_KEY, next);
  };

  const clearRecent = () => { setRecent([]); store.set(RECENT_KEY, []); };

  // A pasted manga link or a non-MAL web address must not be imported as an anime id.
  const badLink = (text) => {
    const ref = parseMalRef(text);
    if (ref && ref.type === 'manga') return t('impNotAnime');
    if (!ref && /^https?:\/\//i.test(text.trim())) return t('impNotMal');
    return '';
  };

  const importId = async (malId) => {
    // Updating overwrites what is typed in the form, so ask first.
    if (mode === 'edit' && !await confirm(t('importOverwriteConfirm'))) return;
    setBusy(`import-${malId}`);
    setError('');
    setExisting('');
    try {
      const { draft, tempCover, coverWarning } = await api.catalogImport(malId, currentSlug);
      onImported(draft, tempCover);
      toast(t('imported', { title: draft.title }));
      if (coverWarning) toast(t('coverWarning', { msg: coverWarning }), 'error');
      setResults(null);
      // In edit mode keep the MAL link in the box so a single click re-runs the update next time.
      setQuery(mode === 'edit' && draft.malId ? `https://myanimelist.net/anime/${draft.malId}` : '');
    } catch (err) {
      if (err.status === 409 && err.data?.existingSlug) setExisting(err.data.existingSlug);
      setError(t('importFailed', { msg: err.status === 404 ? t('notFound') : errText(err, t) }));
    } finally {
      setBusy('');
    }
  };

  const search = async (text) => {
    const mine = ++ticket.current;
    setError('');
    setExisting('');
    setBusy('search');
    try {
      const found = await api.catalogSearch(text.trim());
      if (mine !== ticket.current) return;
      setResults(found);
      remember(text);
    } catch (err) {
      if (mine === ticket.current) setError(errText(err, t));
    } finally {
      if (mine === ticket.current) setBusy('');
    }
  };

  // Live search while typing; a pasted link or id is only imported on submit (never by accident).
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    if (parseMalRef(query) || /^https?:\/\//i.test(query.trim()) || query.trim().length < MIN_CHARS) { ticket.current += 1; setBusy((b) => (b === 'search' ? '' : b)); if (!query.trim()) setResults(null); return undefined; }
    const timer = setTimeout(() => search(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const submit = (event) => {
    event.preventDefault();
    if (!canEdit) return;
    const problem = badLink(query);
    if (problem) { setError(problem); return; }
    const ref = parseMalRef(query);
    if (ref) { importId(ref.id); return; }
    if (query.trim().length >= MIN_CHARS) search(query);
  };

  const clear = () => { ticket.current += 1; setQuery(''); setResults(null); setError(''); setExisting(''); input.current?.focus(); };

  return (
    <div className="adm-card adm-import">
      <h2>{t('importTitle')}</h2>
      <p className="adm-muted">{t(mode === 'edit' ? 'importUpdateHint' : 'importHint')}</p>
      {!canEdit && <p className="imp-readonly">{t('impReadOnly')}</p>}
      <form className="imp-tools" onSubmit={submit} role="search">
        <div className="imp-search">
          <input
            ref={input}
            dir="auto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') clear(); }}
            placeholder={t('importPlaceholder')}
            aria-label={t('importTitle')}
            disabled={!canEdit}
          />
          {query && <button type="button" className="imp-clear" aria-label={t('impClear')} title={t('impClear')} onClick={clear}>×</button>}
        </div>
        <button className="adm-btn adm-primary" type="submit" disabled={!canEdit || Boolean(busy) || !query.trim()}>
          {busy === 'search' ? t('searching') : t(parseMalRef(query) ? (mode === 'edit' ? 'updateBtn' : 'importBtn') : 'search')}
        </button>
      </form>
      {!query && recent.length > 0 && canEdit && (
        <div className="imp-recent">
          <span className="adm-muted">{t('impRecent')}</span>
          {recent.map((entry) => <button key={entry} type="button" dir="auto" onClick={() => setQuery(entry)}>{entry}</button>)}
          <button type="button" className="imp-recent-clear" onClick={clearRecent}>{t('impForget')}</button>
        </div>
      )}
      {error && (
        <p className="adm-error" role="alert">
          {error}{' '}
          {existing && <Link className="adm-btn" to={`/admin/edit/${existing}`}>{t('openExisting')}</Link>}
          {!existing && query.trim().length >= MIN_CHARS && !badLink(query) && <button className="adm-btn" type="button" disabled={Boolean(busy)} onClick={() => (parseMalRef(query) ? importId(parseMalRef(query).id) : search(query))}>{t('mangaRetry')}</button>}
        </p>
      )}
      {busy.startsWith('import-') && <p className="imp-note" role="status">{t('impWait')}</p>}
      {busy === 'search' && !results && <div className="imp-skel" aria-busy="true">{[0, 1, 2].map((i) => <i key={i} />)}</div>}
      {results && (
        results.length === 0 ? <p className="adm-empty">{t('noResults')}</p> : (
          <>
            <p className="imp-count" aria-live="polite">{t('impResultCount', { n: num(results.length) })}</p>
            <ul className="adm-results imp-results" aria-label={t('impResultsLabel')} aria-busy={busy === 'search'}>
              {results.map((item) => {
                const taken = item.existingSlug && item.existingSlug !== currentSlug;
                return (
                  <li key={item.malId} className={taken ? 'is-done' : ''}>
                    {item.imageUrl ? <img className="adm-thumb" src={item.imageUrl} alt="" width="42" height="58" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="adm-thumb adm-thumb-empty" />}
                    <span className="adm-grow"><strong dir="auto">{item.title}</strong><br /><span className="adm-muted">{[item.type, item.year, `MAL #${item.malId}`].filter(Boolean).join(' • ')}</span>{' '}<a className="imp-link" href={`https://myanimelist.net/anime/${item.malId}`} target="_blank" rel="noopener noreferrer">{t('impOpenMal')}</a></span>
                    <span className="imp-acts">
                      {taken
                        ? <><span className="adm-chip is-ok">{t('alreadyAdded')}</span><Link className="adm-btn" to={`/admin/edit/${item.existingSlug}`}>{t('openExisting')}</Link></>
                        : <button className="adm-btn adm-primary" type="button" disabled={!canEdit || Boolean(busy)} onClick={() => importId(item.malId)}>{busy === `import-${item.malId}` ? t('importing') : t(mode === 'edit' ? 'updateBtn' : 'importBtn')}</button>}
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
