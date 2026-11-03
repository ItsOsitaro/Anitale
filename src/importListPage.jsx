import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteLang } from './i18n.js';
import { useUser } from './user.jsx';
import { readExportFile, parseMalXml } from './lib/mal-xml.js';

const CHUNK = 1000;

const postChunk = async (items, overwrite) => {
  const response = await fetch('/api/user/import-mal', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items.map(({ type, malId, status, score, progress, title }) => ({ type, malId, status, score, progress, title })), overwrite }),
  });
  if (!response.ok) {
    const error = new Error('HTTP');
    error.status = response.status;
    throw error;
  }
  return response.json();
};

// Lets a signed-in member bring their MyAnimeList list over from the XML export.
export default function ImportListPage() {
  const { t, lang } = useSiteLang();
  const user = useUser();
  const [items, setItems] = useState(null);
  const [fileName, setFileName] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { document.title = `${t('importListTitle')} · ${t('siteName')}`; }, [t]);

  const counts = useMemo(() => (items ? {
    anime: items.filter((i) => i.type === 'anime').length,
    manga: items.filter((i) => i.type === 'manga').length,
  } : null), [items]);

  if (user.meLoaded && !user.me) return <Navigate to="/login" replace />;

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setItems(null); setResult(null); setPhase('idle'); setFileName(file.name);
    if (file.size > 30 * 1024 * 1024) { setError(t('importErrBig')); return; }
    try {
      setItems(parseMalXml(await readExportFile(file)));
    } catch (failure) {
      setError(failure.message === 'EMPTY' ? t('importErrEmpty') : failure.message === 'GZIP_UNSUPPORTED' ? t('importErrGzip') : t('importErrXml'));
    }
  };

  const run = async () => {
    if (!items || phase === 'running') return;
    setPhase('running'); setProgress(0); setError('');
    const total = { added: 0, updated: 0, skipped: 0, unmatched: [] };
    try {
      for (let i = 0; i < items.length; i += CHUNK) {
        const part = await postChunk(items.slice(i, i + CHUNK), overwrite);
        total.added += part.added; total.updated += part.updated; total.skipped += part.skipped;
        total.unmatched.push(...part.unmatched);
        setProgress(Math.min(items.length, i + CHUNK));
      }
      setResult(total);
      setPhase('done');
      user.refresh();
    } catch (failure) {
      setPhase('idle');
      setError(failure.status === 429 ? t('importErrLimit') : t('importErrServer'));
      if (total.added || total.updated) { setResult(total); user.refresh(); }
    }
  };

  const titleByKey = useMemo(() => new Map((items || []).map((i) => [`${i.type}${i.malId}`, i.title])), [items]);
  const missing = result?.unmatched || [];
  const copyMissing = async () => {
    const text = missing.map((m) => `${m.type}:${m.malId}`).join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <main className="dash-shell import-list">
      <section className="panel import-card">
        <h1>{t('importListTitle')}</h1>
        <p className="import-lead">{t('importListLead')}</p>
        <ol className="import-steps">
          <li>{t('importStep1')}</li>
          <li>{t('importStep2')}</li>
          <li>{t('importStep3')}</li>
        </ol>
        <label className="import-file">
          <input type="file" accept=".xml,.gz,.xml.gz,application/xml,text/xml,application/gzip" onChange={onFile} disabled={phase === 'running'} />
          <span>{fileName || t('importChoose')}</span>
        </label>
        {error && <p className="import-error" role="alert">{error}</p>}

        {items && phase !== 'done' && (
          <div className="import-preview">
            <p><strong>{t('importFound')}</strong> {t('importFoundCounts', { anime: counts.anime, manga: counts.manga })}</p>
            <label className="import-check">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              <span>{t('importOverwrite')}</span>
            </label>
            <Button type="button" onClick={run} disabled={phase === 'running'}>
              {phase === 'running' ? t('importRunning', { done: progress, total: items.length }) : t('importStart')}
            </Button>
          </div>
        )}

        {result && (
          <div className="import-result" role="status">
            <h2>{t('importDone')}</h2>
            <ul>
              <li>{t('importAdded', { n: result.added })}</li>
              <li>{t('importUpdated', { n: result.updated })}</li>
              <li>{t('importSkipped', { n: result.skipped })}</li>
              <li>{t('importMissing', { n: missing.length })}</li>
            </ul>
            <Link to="/dashboard">{t('importGoDashboard')}</Link>
            {missing.length > 0 && (
              <details className="import-missing">
                <summary>{t('importShowMissing')}</summary>
                <p className="extras-muted">{t('importMissingNote')}</p>
                <ul dir="auto">
                  {missing.slice(0, 200).map((m) => (
                    <li key={`${m.type}${m.malId}`}>{titleByKey.get(`${m.type}${m.malId}`) || m.malId} <small dir="ltr">({m.type} {m.malId})</small></li>
                  ))}
                </ul>
                {missing.length > 200 && <p className="extras-muted">{t('importMoreMissing', { n: missing.length - 200 })}</p>}
                <Button type="button" variant="outline" size="sm" onClick={copyMissing}>{copied ? t('importCopied') : t('importCopyIds')}</Button>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="panel import-card">
        <h2>{t('exportTitle')}</h2>
        <p className="import-lead">{t('exportLead')}</p>
        <div className="export-grid">
          {['anime', 'manga'].map((type) => (
            <div key={type} className="export-row">
              <strong>{t(type === 'anime' ? 'dashAnimeTab' : 'dashMangaTab')}</strong>
              {['xml', 'csv', 'json'].map((format) => (
                <a key={format} className="export-link" href={`/api/user/export?type=${type}&format=${format}`} download>{format.toUpperCase()}</a>
              ))}
            </div>
          ))}
        </div>
        <p className="extras-muted">{t('exportNote')}</p>
      </section>
    </main>
  );
}
