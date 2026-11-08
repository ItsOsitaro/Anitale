import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSiteLang } from '@/i18n';

// Account page block: connect Telegram / Bale to get a message when a watched anime airs a new episode.
// Hidden when the server has no bot token, so the page never shows a feature that cannot work.
const call = async (method, path) => {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
};

export default function MessengerLinks() {
  const { t } = useSiteLang();
  const [providers, setProviders] = useState(null);
  const [codes, setCodes] = useState({}); // provider -> { code, url }
  const [note, setNote] = useState({});   // provider -> status text
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try { setProviders((await call('GET', '/api/user/chat')).providers); } catch { setProviders([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // While a code is shown, look every few seconds for the member finishing the link in the messenger.
  useEffect(() => {
    if (!Object.keys(codes).length) return undefined;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [codes, load]);
  useEffect(() => {
    if (!providers) return;
    setCodes((current) => {
      const next = { ...current };
      for (const p of providers) if (p.linked) delete next[p.id];
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [providers]);

  const run = async (id, action, fn) => {
    setBusy(`${id}:${action}`);
    setNote((n) => ({ ...n, [id]: '' }));
    try { await fn(); } catch { setNote((n) => ({ ...n, [id]: t('chatError') })); } finally { setBusy(''); }
  };

  const shown = (providers || []).filter((p) => p.configured);
  if (!shown.length) return null;

  return (
    <section className="auth-card" aria-labelledby="chHeading">
      <h1 id="chHeading">{t('chatHead')}</h1>
      <p className="auth-hint">{t('chatHint')}</p>
      {shown.map((p) => (
        <div className="chat-link" key={p.id}>
          <div className="chat-link__row">
            <strong>{p.id === 'telegram' ? t('chatTelegram') : t('chatBale')}</strong>
            <span className={`chat-link__state${p.linked ? ' is-on' : ''}`}>{p.linked ? t('chatLinked') : t('chatNotLinked')}</span>
          </div>
          {p.linked ? (
            <div className="chat-link__actions">
              <Button type="button" variant="outline" size="sm" disabled={busy === `${p.id}:test`} onClick={() => run(p.id, 'test', async () => { await call('POST', `/api/user/chat/${p.id}/test`); setNote((n) => ({ ...n, [p.id]: t('chatTestSent') })); })}>{t('chatTest')}</Button>
              <Button type="button" variant="outline" size="sm" disabled={busy === `${p.id}:off`} onClick={() => run(p.id, 'off', async () => { await call('DELETE', `/api/user/chat/${p.id}`); await load(); })}>{t('chatDisconnect')}</Button>
            </div>
          ) : codes[p.id] ? (
            <div className="chat-link__code">
              <p>{t('chatStep')}</p>
              {codes[p.id].url && <a className="chat-link__open" href={codes[p.id].url} target="_blank" rel="noreferrer">{t('chatOpenBot', { name: p.username ? `@${p.username}` : '' })}</a>}
              <p className="chat-link__manual">{t('chatManual')} <code dir="ltr">/start {codes[p.id].code}</code></p>
              <p className="auth-hint">{t('chatWaiting')}</p>
            </div>
          ) : (
            <div className="chat-link__actions">
              <Button type="button" size="sm" disabled={busy === `${p.id}:code`} onClick={() => run(p.id, 'code', async () => { const made = await call('POST', `/api/user/chat/${p.id}/code`); setCodes((c) => ({ ...c, [p.id]: made })); })}>{t('chatConnect')}</Button>
            </div>
          )}
          {note[p.id] && <p className="auth-hint" role="status">{note[p.id]}</p>}
        </div>
      ))}
    </section>
  );
}
