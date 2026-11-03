import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAdmin } from './context.js';
import { errText } from './util.js';

const KINDS = ['v2ray', 'wireguard'];

export default function VpnPage() {
  const { t, toast } = useAdmin();
  const [state, setState] = useState(null);
  const [kind, setKind] = useState('v2ray');
  const [config, setConfig] = useState('');
  const [busy, setBusy] = useState('');
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.vpnGet();
      setState(res);
      if (res.active) setKind(res.active);
    } catch (err) { toast(errText(err, t), 'error'); }
  }, [t, toast]);
  useEffect(() => { load(); }, [load]);

  const name = (k) => t(k === 'wireguard' ? 'vpnKindWg' : 'vpnKindV2ray');
  const guard = async (what, work) => {
    setBusy(what);
    try { await work(); } catch (err) { toast(errText(err, t), 'error'); } finally { setBusy(''); }
  };

  const apply = (event) => {
    event.preventDefault();
    if (!config.trim()) return;
    guard('apply', async () => {
      const res = await api.vpnApply(kind, config.trim());
      setState(res);
      setTestResult(res.test || null);
      setConfig('');
      toast(t('vpnApplied'));
    });
  };

  const use = (k) => guard(`use-${k}`, async () => {
    const res = await api.vpnActivate(k);
    setState(res);
    setTestResult(res.test || null);
    toast(t('vpnSwitched', { name: name(k) }));
  });

  const test = () => guard('test', async () => setTestResult(await api.vpnTest()));

  const turnOff = () => {
    if (!window.confirm(t('vpnRemoveConfirm'))) return;
    guard('off', async () => { setState(await api.vpnTurnOff()); setTestResult(null); toast(t('vpnRemoved')); });
  };

  const deleteProfile = () => {
    if (!window.confirm(t('vpnDeleteConfirm', { name: name(kind) }))) return;
    guard('delete', async () => { setState(await api.vpnDeleteProfile(kind)); setTestResult(null); });
  };

  const profile = state?.profiles?.[kind];
  const meta = profile?.meta;
  const isActive = state?.active === kind;
  const label = !state ? '' : state.running && state.active ? `${t('vpnStateRunning')} — ${name(state.active)}` : t('vpnStateStopped');

  return (
    <div className="adm-card">
      <header className="adm-card-head">
        <div>
          <h2 className="adm-card-title">{t('vpnTitle')}</h2>
          <p className="adm-card-sub">{t('vpnSubBoth')}</p>
        </div>
        {state && <span className="adm-chip" aria-live="polite">{label}</span>}
      </header>
      <div className="adm-card-body">
        {state && !state.installed && <p className="adm-error" role="alert">{t('vpnNotInstalled')}</p>}
        {state?.error && <p className="adm-error">{t('vpnLastError', { msg: state.error })}</p>}

        <div className="adm-row" role="tablist" style={{ gap: 8, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`adm-btn ${kind === k ? 'adm-primary' : ''}`}
              onClick={() => { setKind(k); setConfig(''); }}
            >
              {name(k)}{state?.active === k ? ` ✓ ${t('vpnActive')}` : state?.profiles?.[k]?.configured ? ` · ${t('vpnSaved')}` : ''}
            </button>
          ))}
        </div>

        <div className="adm-panel" style={{ marginTop: 12 }}>
          {profile?.configured && meta ? (
            <p className="adm-muted" dir="ltr" style={{ textAlign: 'start' }}>
              {meta.protocol}://{meta.address}:{meta.port} ({meta.network}/{meta.security}) · {t('vpnSince')}: {new Date(meta.at).toLocaleString(undefined)}
            </p>
          ) : <p className="adm-muted">{t('vpnNothingSaved')}</p>}
          <div className="adm-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="adm-btn adm-primary" type="button" disabled={Boolean(busy) || !profile?.configured || (isActive && state?.running)} onClick={() => use(kind)}>
              {busy === `use-${kind}` ? t('vpnApplying') : isActive && state?.running ? t('vpnActive') : t('vpnUse')}
            </button>
            <button className="adm-btn" type="button" disabled={Boolean(busy) || !profile?.configured} onClick={deleteProfile}>{t('vpnDeleteProfile')}</button>
          </div>
        </div>

        <form onSubmit={apply} style={{ marginTop: 12 }}>
          <label className="adm-field">
            <span className="adm-label">{t(kind === 'wireguard' ? 'vpnConfigWg' : 'vpnConfigV2ray')}</span>
            <textarea dir="ltr" rows={kind === 'wireguard' ? 9 : 3} value={config} onChange={(e) => setConfig(e.target.value)} autoComplete="off" spellCheck={false} placeholder={kind === 'wireguard' ? '[Interface]\nPrivateKey = …\nAddress = …\n\n[Peer]\nPublicKey = …\nEndpoint = host:port' : 'vless://…'} />
          </label>
          <p className="adm-muted">{t('vpnSecret')}</p>
          <div className="adm-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="adm-btn adm-primary" type="submit" disabled={Boolean(busy) || !config.trim() || (state && !state.installed)}>
              {busy === 'apply' ? t('vpnApplying') : t('vpnApply')}
            </button>
            <button className="adm-btn" type="button" disabled={Boolean(busy) || !state?.running} onClick={test}>
              {busy === 'test' ? t('vpnTesting') : t('vpnTestBtn')}
            </button>
            <button className="adm-btn" type="button" disabled={Boolean(busy) || !state?.active} onClick={turnOff}>{t('vpnRemoveBtn')}</button>
          </div>
        </form>

        {testResult && (
          <div role="status" style={{ marginTop: 12 }}>
            <p className={testResult.ok ? 'adm-muted' : 'adm-error'}>{t(testResult.ok ? 'vpnTestOk' : 'vpnTestBad')}</p>
            <ul className="adm-muted" dir="ltr" style={{ textAlign: 'start', margin: 0, paddingInlineStart: 18 }}>
              {(testResult.targets || []).map((r) => (
                <li key={r.name}>{r.ok ? '✓' : '✗'} {r.name}: {r.ok ? `${r.ms} ms` : (r.error || `HTTP ${r.status}`)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
