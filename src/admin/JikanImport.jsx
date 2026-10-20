import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const parseMalId = (text) => {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = trimmed.match(/myanimelist\.net\/anime\/(\d+)/i);
  return match ? Number(match[1]) : null;
};

export default function JikanImport({ onImported, mode = 'create', currentSlug = '', initialQuery = '' }) {
  const { t, toast } = useAdmin();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const importId = async (malId) => {
    setBusy(`import-${malId}`);
    setError('');
    try {
      const { draft, tempCover, coverWarning } = await api.jikanImport(malId, currentSlug);
      onImported(draft, tempCover);
      toast(t('imported', { title: draft.title }));
      if (coverWarning) toast(t('coverWarning', { msg: coverWarning }), 'error');
      setResults(null);
      // In edit mode keep the MAL link in the box so a single click re-runs the update next time.
      setQuery(mode === 'edit' && draft.malId ? `https://myanimelist.net/anime/${draft.malId}` : '');
    } catch (err) {
      setError(t('importFailed', { msg: err.status === 404 ? t('notFound') : errText(err, t) }));
    } finally {
      setBusy('');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const malId = parseMalId(query);
    if (malId) return importId(malId);
    if (query.trim().length < 2) return null;
    setBusy('search');
    try {
      setResults(await api.jikanSearch(query.trim()));
    } catch (err) {
      setError(errText(err, t));
    } finally {
      setBusy('');
    }
    return null;
  };

  return (
    <div className="adm-card adm-import">
      <h2>{t('importTitle')}</h2>
      <p className="adm-muted">{t(mode === 'edit' ? 'importUpdateHint' : 'importHint')}</p>
      <form className="adm-inline" onSubmit={submit}>
        <input dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('importPlaceholder')} aria-label={t('importTitle')} />
        <button className="adm-btn adm-primary" type="submit" disabled={Boolean(busy)}>{busy === 'search' ? t('searching') : t('search')}</button>
      </form>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {results && (
        results.length === 0 ? <p className="adm-muted">{t('noResults')}</p> : (
          <ul className="adm-results">
            {results.map((item) => (
              <li key={item.malId}>
                {item.imageUrl ? <img className="adm-thumb" src={item.imageUrl} alt="" referrerPolicy="no-referrer" /> : <span className="adm-thumb adm-thumb-empty" />}
                <span className="adm-grow"><strong dir="auto">{item.title}</strong><br /><span className="adm-muted">{[item.type, item.year].filter(Boolean).join(' • ')} • MAL #{item.malId}</span></span>
                {item.existingSlug && item.existingSlug !== currentSlug
                  ? <><span className="adm-muted">{t('alreadyAdded')}</span><Link className="adm-btn" to={`/admin/edit/${item.existingSlug}`}>{t('openExisting')}</Link></>
                  : <button className="adm-btn adm-primary" type="button" disabled={Boolean(busy)} onClick={() => importId(item.malId)}>{busy === `import-${item.malId}` ? t('importing') : t(mode === 'edit' ? 'updateBtn' : 'importBtn')}</button>}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
