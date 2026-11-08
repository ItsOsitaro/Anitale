import React, { useCallback, useEffect, useState } from 'react';
import { useAdmin } from './context.js';

const URL = '/api/admin/x/system/chat';
const ALERTS = '/api/admin/x/system/alerts';

const post = async (path, body) => {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// Telegram / Bale bot settings for the new-episode alerts, saved in the database (no server/.env editing).
// The token is write-only: the server never sends it back, only whether one is set and its last four characters.
function BotRow({ bot, canEdit, onSaved }) {
  const { t, toast } = useAdmin();
  const [token, setToken] = useState('');
  const [username, setUsername] = useState(bot.username);
  const [busy, setBusy] = useState('');
  useEffect(() => { setUsername(bot.username); }, [bot.username]);

  const run = async (kind, fn, okKey) => {
    setBusy(kind);
    try { await fn(); if (okKey) toast(t(okKey)); } catch (error) { toast(error.message, 'error'); } finally { setBusy(''); }
  };
  const save = () => run('save', async () => {
    const data = await post(URL, { provider: bot.id, token: token || undefined, username });
    setToken('');
    onSaved(data.providers);
  }, 'chbSaved');
  const test = () => run('test', async () => {
    const data = await post(`${URL}/test`, { provider: bot.id });
    onSaved(data.providers);
    toast(t('chbTestOk', { name: data.username ? `@${data.username}` : '' }));
  });
  const clear = () => run('clear', async () => { onSaved((await post(URL, { provider: bot.id, clear: true })).providers); }, 'chbCleared');
  const dirty = token.trim() !== '' || username !== bot.username;

  return (
    <div className="chb-row">
      <div className="chb-head">
        <strong>{bot.id === 'telegram' ? t('chbTelegram') : t('chbBale')}</strong>
        <span className={`adm-chip ${bot.tokenSet ? 'is-ok' : ''}`}>
          {bot.tokenSet ? t('chbTokenSet', { hint: bot.tokenHint }) : t('chbTokenMissing')}
        </span>
        {bot.source === 'env' && <small className="adm-muted">{t('chbFromEnv')}</small>}
      </div>
      {canEdit && (
        <>
          <div className="imp-fields">
            <label className="adm-field"><span>{t('chbToken')}</span>
              <input type="password" dir="ltr" autoComplete="off" value={token} placeholder={bot.tokenSet ? t('chbTokenKeep') : '123456:ABC…'} onChange={(e) => setToken(e.target.value)} /></label>
            <label className="adm-field"><span>{t('chbUsername')}</span>
              <input type="text" dir="ltr" autoComplete="off" value={username} placeholder="my_anitale_bot" onChange={(e) => setUsername(e.target.value)} /></label>
          </div>
          {bot.needsProxy && <p className="adm-muted">{t('chbProxyNote')}</p>}
          <div className="adm-actions">
            <button type="button" className="adm-btn adm-primary" disabled={!!busy || !dirty} onClick={save}>{t('chbSave')}</button>
            <button type="button" className="adm-btn" disabled={!!busy || !bot.tokenSet} onClick={test}>{t('chbTest')}</button>
            <button type="button" className="adm-btn" disabled={!!busy || bot.source !== 'panel'} onClick={clear}>{t('chbClear')}</button>
          </div>
        </>
      )}
    </div>
  );
}


// Health alerts to the owner: link a chat once (code + /start), choose when to be told, send a test.
function OwnerAlerts({ canEdit }) {
  const { t, toast } = useAdmin();
  const [state, setState] = useState(null);
  const [codes, setCodes] = useState({});
  const [disk, setDisk] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try { const res = await fetch(ALERTS); if (res.ok) { const data = await res.json(); setState(data); setDisk((current) => (current === '' ? String(data.diskPct) : current)); } } catch { /* shown as loading */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!Object.keys(codes).length) return undefined;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [codes, load]);
  useEffect(() => {
    if (!state) return;
    setCodes((current) => {
      const next = { ...current };
      for (const target of state.targets) if (target.linked) delete next[target.id];
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [state]);

  const run = async (kind, fn, okKey) => {
    setBusy(kind);
    try { await fn(); if (okKey) toast(t(okKey)); } catch (error) { toast(error.message, 'error'); } finally { setBusy(''); }
  };
  const targets = (state?.targets || []).filter((target) => target.configured);

  return (
    <section className="adm-card" aria-labelledby="oal-title">
      <header className="adm-card-head"><div><h2 className="adm-card-title" id="oal-title">{t('oalTitle')}</h2><p className="adm-card-sub">{t('oalSub')}</p></div></header>
      <div className="adm-card-body">
        {!state ? <p className="adm-muted">{t('loading')}</p> : targets.length === 0 ? <p className="adm-muted">{t('oalNeedBot')}</p> : (
          <>
            {targets.map((target) => (
              <div className="chb-row" key={target.id}>
                <div className="chb-head">
                  <strong>{target.id === 'telegram' ? t('chbTelegram') : t('chbBale')}</strong>
                  <span className={`adm-chip ${target.linked ? 'is-ok' : ''}`}>{target.linked ? t('oalLinked') : t('oalNotLinked')}</span>
                </div>
                {canEdit && (target.linked ? (
                  <div className="adm-actions">
                    <button type="button" className="adm-btn" disabled={!!busy} onClick={() => run('test', async () => { await post(`${ALERTS}/test`, {}); }, 'oalTestSent')}>{t('oalTest')}</button>
                    <button type="button" className="adm-btn" disabled={!!busy} onClick={() => run('off', async () => { const res = await fetch(`${ALERTS}/${target.id}`, { method: 'DELETE' }); setState(await res.json()); })}>{t('oalUnlink')}</button>
                  </div>
                ) : codes[target.id] ? (
                  <div>
                    <p className="adm-muted">{t('oalStep')}</p>
                    {codes[target.id].url && <p><a className="adm-btn adm-primary" href={codes[target.id].url} target="_blank" rel="noreferrer">{t('oalOpenBot')}</a></p>}
                    <p className="adm-muted">{t('chbManual')} <code dir="ltr">/start {codes[target.id].code}</code></p>
                  </div>
                ) : (
                  <div className="adm-actions">
                    <button type="button" className="adm-btn adm-primary" disabled={!!busy} onClick={() => run('code', async () => { const made = await post(`${ALERTS}/code`, { provider: target.id }); setCodes((c) => ({ ...c, [target.id]: made })); })}>{t('oalLink')}</button>
                  </div>
                ))}
              </div>
            ))}
            {canEdit && (
              <>
                <label className="sys-switch"><input type="checkbox" checked={state.enabled} disabled={!!busy} onChange={(ev) => run('on', async () => { setState({ ...(await post(ALERTS, { enabled: ev.target.checked })) }); })} />{t('oalEnable')}</label>
                <div className="imp-fields">
                  <label className="adm-field"><span>{t('oalDisk')}</span>
                    <input type="number" min="1" max="50" dir="ltr" value={disk} onChange={(ev) => setDisk(ev.target.value)} /></label>
                </div>
                <div className="adm-actions">
                  <button type="button" className="adm-btn adm-primary" disabled={!!busy || String(state.diskPct) === String(disk)} onClick={() => run('save', async () => { setState(await post(ALERTS, { diskPct: Number(disk) })); }, 'chbSaved')}>{t('chbSave')}</button>
                </div>
                <p className="adm-muted">{t('oalWhen')}</p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default function ChatBotSettings() {
  const { t, can } = useAdmin();
  const [bots, setBots] = useState(null);
  const load = useCallback(async () => {
    try { const res = await fetch(URL); if (res.ok) setBots((await res.json()).providers); } catch { /* shown as loading */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
    <section className="adm-card" aria-labelledby="chb-title">
      <header className="adm-card-head"><div><h2 className="adm-card-title" id="chb-title">{t('chbTitle')}</h2><p className="adm-card-sub">{t('chbSub')}</p></div></header>
      <div className="adm-card-body">
        {!bots ? <p className="adm-muted">{t('loading')}</p> : bots.map((bot) => <BotRow key={bot.id} bot={bot} canEdit={can('system', 'edit')} onSaved={setBots} />)}
      </div>
    </section>
    <OwnerAlerts canEdit={can('system', 'edit')} />
    </>
  );
}
