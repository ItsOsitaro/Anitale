import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

// What visitors searched for without finding anything, and the aliases that fix it.
export default function SearchMisses() {
  const { t, toast, confirm, can } = useAdmin();
  const canEdit = can('community', 'edit');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [alias, setAlias] = useState('');
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState('anime');

  const load = useCallback(async () => {
    try { setData(await api.searchMisses()); setError(''); } catch (err) { setError(errText(err, t)); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const add = async (event) => {
    event.preventDefault();
    try {
      await api.searchAliasAdd({ alias, slug, kind });
      toast(t('smAdded'));
      setAlias(''); setSlug('');
      load();
    } catch (err) { toast(errText(err, t), 'error'); }
  };
  const run = async (task) => { try { await task(); load(); } catch (err) { toast(errText(err, t), 'error'); } };

  return (
    <div className="adm-card">
      <h2>{t('smTitle')}</h2>
      <p className="adm-muted">{t('smHint')}</p>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {canEdit && (
        <form className="sm-form" onSubmit={add}>
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={t('smUseQuery')} required minLength={2} maxLength={60} />
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('smPlaceholder')} aria-label={t('smPick')} required />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('smKind')}>
            <option value="anime">{t('smAnime')}</option>
            <option value="manga">{t('smManga')}</option>
          </select>
          <button type="submit" className="adm-btn">{t('smAdd')}</button>
        </form>
      )}
      {data && data.misses.length === 0 && <p className="adm-empty">{t('smEmpty')}</p>}
      {data?.misses.length > 0 && (
        <>
          <ul className="sm-list">
            {data.misses.map((row) => (
              <li key={row.q}>
                <button type="button" className="sm-phrase" onClick={() => setAlias(row.q)}>{row.q}</button>
                <span className="adm-muted">{t('smCount', { n: row.n })}</span>
                {canEdit && row.suggestion && (
                  <button type="button" className="adm-btn" dir="auto" onClick={() => run(() => api.searchAliasAdd({ alias: row.q, kind: row.suggestion.kind, slug: row.suggestion.slug }))}>{t('smAccept', { title: row.suggestion.title })}</button>
                )}
                {canEdit && <button type="button" className="adm-btn" onClick={() => run(() => api.searchMissDelete(row.q))} aria-label="×">×</button>}
              </li>
            ))}
          </ul>
          {canEdit && <button type="button" className="adm-btn" onClick={async () => { if (await confirm(t('smClear'), { danger: true })) run(() => api.searchMissDelete()); }}>{t('smClear')}</button>}
        </>
      )}
      <h3>{t('smAliases')}</h3>
      {data && data.aliases.length === 0 && <p className="adm-empty">{t('smNoAliases')}</p>}
      <ul className="sm-list">
        {(data?.aliases || []).map((row) => (
          <li key={row.alias}>
            <strong>{row.alias}</strong>
            <span className="adm-muted">→ {row.slug} ({row.kind})</span>
            {canEdit && <button type="button" className="adm-btn" onClick={() => run(() => api.searchAliasDelete(row.alias))} aria-label="×">×</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
