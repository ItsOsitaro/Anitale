import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const KINDS = ['v2ray', 'wireguard'];
const MAX_CHARS = 20000;
const SLOW_MS = 5000;

// Quick client-side check so obvious mistakes never reach the server (the server checks again).
const problemOf = (kind, text) => {
  const value = text.trim();
  if (!value) return '';
  if (value.length > MAX_CHARS) return 'vpnTooLong';
  if (kind === 'v2ray' && !/^(vless|vmess|trojan):\/\//i.test(value)) return 'vpnBadV2ray';
  if (kind === 'wireguard' && !/\[Interface\]/i.test(value)) return 'vpnBadWg';
  return '';
};

export default function VpnPage() {
  const { t, lang, toast, confirm, can } = useAdmin();
  const canEdit = can('system', 'edit');
  const [state, setState] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [kind, setKind] = useState('v2ray');
  const [config, setConfig] = useState('');
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testedAt, setTestedAt] = useState(null);
  const kindSet = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await api.vpnGet();
      setState(res);
      setLoadFailed(false);
      if (res.active && !kindSet.current) { setKind(res.active); kindSet.current = true; }
    } catch (err) { setLoadFailed(true); toast(errText(err, t), 'error'); }
  }, [t, toast]);
  useEffect(() => { load(); }, [load]);

  // Keep the running/stopped badge honest (Xray can crash and restart by itself) without hammering the server.
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden && !busy) api.vpnGet().then(setState).catch(() => {}); }, 20000);
    return () => clearInterval(timer);
  }, [busy]);

  const locale = lang === 'fa' ? 'fa-IR' : 'en-GB';
  const name = (k) => t(k === 'wireguard' ? 'vpnKindWg' : 'vpnKindV2ray');
  const guard = async (what, work) => {
    setBusy(what);
    try { await work(); } catch (err) { toast(errText(err, t), 'error'); } finally { setBusy(''); }
  };
  const remember = (result) => { setTestResult(result || null); setTestedAt(result ? new Date() : null); };

  const problem = problemOf(kind, config);
  const isActive = state?.active === kind;
  const profile = state?.profiles?.[kind];
  const meta = profile?.meta;
  const locked = Boolean(busy) || !canEdit;

  const switchKind = async (k) => {
    if (k === kind) return;
    if (config.trim() && !await confirm(t('vpnUnsavedConfirm'))) return;
    setKind(k); kindSet.current = true; setConfig('');
  };

  const apply = async (event) => {
    event?.preventDefault();
    if (!canEdit || busy || !config.trim() || problem) return;
    if (state?.running && state?.active && !await confirm(t('vpnReplaceConfirm', { name: name(kind) }))) return;
    guard('apply', async () => {
      const res = await api.vpnApply(kind, config.trim());
      setState(res);
      remember(res.test);
      setConfig(''); // the secret leaves the page as soon as it is saved
      toast(t('vpnApplied'));
    });
  };

  const use = async (k) => {
    if (state?.running && state?.active && state.active !== k && !await confirm(t('vpnSwitchConfirm', { name: name(k) }))) return;
    guard(`use-${k}`, async () => {
      const res = await api.vpnActivate(k);
      setState(res);
      remember(res.test);
      toast(t('vpnSwitched', { name: name(k) }));
    });
  };

  const test = () => guard('test', async () => remember(await api.vpnTest()));

  const turnOff = async () => {
    if (!await confirm(t('vpnRemoveConfirm'))) return;
    guard('off', async () => { setState(await api.vpnTurnOff()); remember(null); toast(t('vpnRemoved')); });
  };

  const deleteProfile = async () => {
    if (!await confirm(t('vpnDeleteConfirm', { name: name(kind) }))) return;
    guard('delete', async () => { setState(await api.vpnDeleteProfile(kind)); remember(null); });
  };

  const paste = async () => {
    try { setConfig((await navigator.clipboard.readText()).slice(0, MAX_CHARS + 1)); } catch { toast(t('vpnPasteFail'), 'error'); }
  };

  const onKey = (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') apply(event); };

  if (!state) {
    return (
      <div className="adm-card">
        {loadFailed
          ? <div className="adm-card-body sys-error-box" role="alert"><p className="adm-error">{t('vpnStatusLoadFail')}</p><button className="adm-btn" type="button" onClick={load}>{t('vpnRetry')}</button></div>
          : <div className="adm-skeleton" aria-label={t('loading')}>{[0, 1, 2].map((i) => <i key={i} />)}</div>}
      </div>
    );
  }

  const label = state.running && state.active ? `${t('vpnStateRunning')} — ${name(state.active)}` : t('vpnStateStopped');

  return (
    <div className="adm-card">
      <header className="adm-card-head">
        <div>
          <h2 className="adm-card-title">{t('vpnTitle')}</h2>
          <p className="adm-card-sub">{t('vpnSubBoth')}</p>
        </div>
        <span className="sys-vpn-status" aria-live="polite">
          <span className={`adm-dot ${state.running && state.active ? 'ok' : 'off'}`} aria-hidden="true" />
          <span className={`adm-chip ${state.running && state.active ? 'is-ok' : ''}`}>{label}</span>
        </span>
      </header>
      <div className="adm-card-body">
        {!canEdit && <p className="adm-muted" role="note">{t('vpnNoEdit')}</p>}
        {!state.installed && <p className="adm-error" role="alert">{t('vpnNotInstalled')}</p>}
        {state.error && <p className="adm-error">{t('vpnLastError', { msg: state.error })}</p>}
        <p className="sys-steps">{t('vpnSteps')}</p>

        <div className="adm-row" role="tablist" aria-label={t('vpnProfiles')} style={{ gap: 8, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`adm-btn ${kind === k ? 'adm-primary' : ''}`}
              disabled={Boolean(busy)}
              onClick={() => switchKind(k)}
            >
              {name(k)}{state.active === k ? ` ✓ ${t('vpnActive')}` : state.profiles?.[k]?.configured ? ` · ${t('vpnSaved')}` : ''}
            </button>
          ))}
        </div>

        <div className="adm-panel" style={{ marginTop: 12 }}>
          {profile?.configured && meta ? (
            <dl className="sys-vpn-meta">
              <div><dt>{t('vpnServerMasked')}</dt><dd dir="ltr">{meta.protocol}://{meta.address}:{meta.port} ({meta.network}/{meta.security})</dd></div>
              <div><dt>{t('vpnSince')}</dt><dd>{new Date(meta.at).toLocaleString(locale)}</dd></div>
            </dl>
          ) : <p className="adm-muted">{profile?.configured ? t('vpnNoProfile') : t('vpnNothingSaved')}</p>}
          <div className="adm-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="adm-btn adm-primary" type="button" disabled={locked || !state.installed || !profile?.configured || (isActive && state.running)} onClick={() => use(kind)}>
              {busy === `use-${kind}` ? t('vpnApplying') : isActive && state.running ? t('vpnActive') : t('vpnUse')}
            </button>
            <button className="adm-btn" type="button" disabled={locked || !profile?.configured} onClick={deleteProfile}>{t('vpnDeleteProfile')}</button>
          </div>
        </div>

        <form onSubmit={apply} style={{ marginTop: 12 }}>
          <div className="adm-field sys-vpn-area">
            <label htmlFor="vpn-config" className="adm-label">{t(kind === 'wireguard' ? 'vpnConfigWg' : 'vpnConfigV2ray')}{kind === 'v2ray' && <span className="sys-proto" dir="ltr">vless:// · vmess:// · trojan://</span>}</label>
            <textarea
              id="vpn-config"
              className={hidden ? 'is-hidden' : ''}
              dir="ltr"
              rows={kind === 'wireguard' ? 9 : 3}
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              onKeyDown={onKey}
              readOnly={!canEdit}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={Boolean(problem)}
              aria-describedby="vpn-config-hint"
              placeholder={kind === 'wireguard' ? '[Interface]\nPrivateKey = …\nAddress = …\n\n[Peer]\nPublicKey = …\nEndpoint = host:port' : 'vless://…'}
            />
            <p id="vpn-config-hint" className={`sys-hint${problem ? ' is-bad' : ''}`} role={problem ? 'alert' : undefined}>
              {problem ? t(problem) : `${t('vpnSecret')} ${config ? `· ${t('vpnCount', { n: config.length.toLocaleString(locale) })} ` : ''}· ${t('vpnShortcut')}`}
            </p>
          </div>
          <div className="adm-row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="adm-btn adm-primary" type="submit" disabled={locked || !config.trim() || Boolean(problem) || !state.installed}>
              {busy === 'apply' ? t('vpnApplying') : t('vpnApply')}
            </button>
            <button className="adm-btn" type="button" disabled={locked} onClick={paste}>{t('vpnPaste')}</button>
            <button className="adm-btn" type="button" onClick={() => setHidden((v) => !v)} aria-pressed={!hidden}>{hidden ? t('vpnShow') : t('vpnHide')}</button>
            {config && <button className="adm-btn" type="button" disabled={Boolean(busy)} onClick={() => setConfig('')}>{t('vpnClear')}</button>}
            <button className="adm-btn" type="button" disabled={locked || !state.installed || !state.running} onClick={test}>
              {busy === 'test' ? t('vpnTesting') : t('vpnTestBtn')}
            </button>
            <button className="adm-btn" type="button" disabled={locked || !state.active} onClick={turnOff}>{t('vpnRemoveBtn')}</button>
          </div>
          {(busy === 'apply' || busy.startsWith('use-')) && <p className="sys-hint" role="status">{t('vpnBusyNote')}</p>}
        </form>

        {testResult && (
          <div role="status" style={{ marginTop: 12 }}>
            <p className={testResult.ok ? 'sys-okline' : 'adm-error'}>
              {t(testResult.ok ? 'vpnTestOk' : 'vpnTestBad')} · {t('vpnReach', { ok: (testResult.targets || []).filter((r) => r.ok).length.toLocaleString(locale), n: (testResult.targets || []).length.toLocaleString(locale) })}{testedAt ? ` (${t('vpnTestedAt', { time: testedAt.toLocaleTimeString(locale) })})` : ''}
            </p>
            <ul className="sys-vpn-results" dir="ltr" aria-label={t('vpnTargets')}>
              {(testResult.targets || []).map((r) => (
                <li key={r.name}>
                  <span className={`adm-dot ${r.ok ? 'ok' : 'bad'}`} aria-hidden="true" />
                  {r.name}: {r.ok ? `${r.ms} ms` : (r.error || `HTTP ${r.status}`)}
                  {r.ok && r.ms > SLOW_MS && <span className="adm-chip">{t('vpnSlow')}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
