import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const parseMalId = (text) => {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = trimmed.match(/myanimelist\.net\/(?:anime|manga)\/(\d+)/i);
  return match ? Number(match[1]) : null;
};

// Search by name, add with one click. The save goes through the same bulk
// importer as the "bulk add" page (cover + Persian synopsis included).
export default function QuickAdd() {
  const { t, toast } = useAdmin();
  const [mediaType, setMediaType] = useState('anime');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState({}); // malId -> slug

  const add = async (item) => {
    setBusy(`add-${item.malId}`);
    setError('');
    try {
      const res = await api.bulkImport({ ids: [item.malId], mediaType });
      const row = res.results?.[0];
      if (row?.status === 'exists' || row?.status === 'imported' || res.imported > 0) {
        setAdded((map) => ({ ...map, [item.malId]: row?.slug || item.existingSlug || '' }));
        toast(t('quickAdded', { title: item.title }));
      } else {
        setError(t('quickFailed', { msg: row?.error || row?.status || '?' }));
      }
    } catch (err) {
      setError(t('quickFailed', { msg: errText(err, t) }));
    } finally {
      setBusy('');
    }
  };

  const search = async (event) => {
    event.preventDefault();
    setError('');
    const malId = parseMalId(query);
    if (malId) {
      setResults([{ malId, title: `MAL #${malId}`, type: '', year: '', imageUrl: '', existingSlug: null }]);
      return;
    }
    if (query.trim().length < 2) return;
    setBusy('search');
    try {
      setResults(await api.catalogSearch(query.trim(), mediaType));
    } catch (err) {
      setError(errText(err, t));
    } finally {
      setBusy('');
    }
  };

  const openPath = (item, slug) => (mediaType === 'manga' ? `/manga/${slug}` : `/admin/edit/${slug}`);

  return (
    <div className="adm-card adm-import">
      <h2>{t('quickTitle')}</h2>
      <p className="adm-muted">{t('quickHint')}</p>
      <form className="adm-inline" onSubmit={search}>
        <select value={mediaType} onChange={(e) => { setMediaType(e.target.value); setResults(null); }} aria-label={t('type')}>
          <option value="anime">{t('quickAnime')}</option>
          <option value="manga">{t('quickManga')}</option>
        </select>
        <input dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('quickPlaceholder')} aria-label={t('quickTitle')} />
        <button className="adm-btn adm-primary" type="submit" disabled={Boolean(busy)}>{busy === 'search' ? t('searching') : t('search')}</button>
      </form>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {results && (
        results.length === 0 ? <p className="adm-muted">{t('noResults')}</p> : (
          <ul className="adm-results">
            {results.map((item) => {
              const slug = added[item.malId] ?? item.existingSlug;
              const done = slug !== undefined && slug !== null;
              return (
                <li key={item.malId}>
                  {item.imageUrl ? <img className="adm-thumb" src={item.imageUrl} alt="" referrerPolicy="no-referrer" /> : <span className="adm-thumb adm-thumb-empty" />}
                  <span className="adm-grow"><strong dir="auto">{item.title}</strong><br /><span className="adm-muted">{[item.type, item.year].filter(Boolean).join(' • ')} • MAL #{item.malId}</span></span>
                  {done ? (
                    <>
                      <span className="adm-muted">{t('alreadyAdded')}</span>
                      {slug && <Link className="adm-btn" to={openPath(item, slug)}>{t('quickOpen')}</Link>}
                    </>
                  ) : (
                    <button className="adm-btn adm-primary" type="button" disabled={Boolean(busy)} onClick={() => add(item)}>
                      {busy === `add-${item.malId}` ? t('quickAdding') : t('quickAdd')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
