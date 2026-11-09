import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSiteLang } from '@/i18n';

// Account page block: a private calendar link (.ics) with the weekly episodes of the member's watching and planned anime.
const call = async (method, path) => {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

export default function CalendarLink() {
  const { t } = useSiteLang();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (method, path, doneNote = '') => {
    setBusy(true);
    setNote('');
    try { setUrl((await call(method, path)).url); setNote(doneNote); } catch { setNote(t('calError')); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setNote(t('calCopied')); } catch { setNote(t('calCopyFailed')); }
  };

  return (
    <section className="auth-card" aria-labelledby="calHeading">
      <h1 id="calHeading">{t('calHead')}</h1>
      <p className="auth-hint">{t('calHint')}</p>
      {!url ? (
        <Button type="button" size="sm" disabled={busy} onClick={() => run('GET', '/api/user/calendar')}>{t('calShow')}</Button>
      ) : (
        <div className="cal-link">
          <input type="text" readOnly dir="ltr" value={url} aria-label={t('calHead')} onFocus={(event) => event.target.select()} />
          <div className="chat-link__actions">
            <Button type="button" size="sm" onClick={copy}>{t('calCopy')}</Button>
            <a className="cal-link__open" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, 'webcal:'))}`} target="_blank" rel="noopener noreferrer">{t('calGoogle')}</a>
            <a className="cal-link__open" href={`${url}?download=1`} download="anitale.ics">{t('calDownload')}</a>
            <a className="cal-link__open" href={url.replace(/^https?:/, 'webcal:')}>{t('calOpen')}</a>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run('POST', '/api/user/calendar/reset', t('calReset'))}>{t('calNew')}</Button>
          </div>
          <p className="auth-hint">{t('calHelp')}</p>
          <p className="auth-hint">{t('calWarn')}</p>
        </div>
      )}
      {note && <p className="auth-hint" role="status">{note}</p>}
    </section>
  );
}
