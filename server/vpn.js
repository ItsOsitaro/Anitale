// Manages a local Xray (v2ray) client from the admin panel. Xray runs as a child
// process of the site and only exposes 127.0.0.1:10809 — nothing else on the
// server uses it. The site's own outgoing requests (Tenrai, AniList, covers,
// translation) pick it up through PROXY_URL (see proxy.js).
//
// Applying a new link: stop Xray, write the config, start it, test through the
// proxy, and put the old config back if anything fails.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fetch, ProxyAgent } from 'undici';
import { SERVER_DIR } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { buildWireguardConfig, buildXrayConfig, PROXY_HTTP_PORT } from './xray-config.js';

const BIN = () => process.env.XRAY_BIN || '/usr/local/bin/xray';
const DIR = path.join(SERVER_DIR, 'xray');
const CONF = path.join(DIR, 'config.json'); // what Xray runs right now
const KINDS = ['v2ray', 'wireguard'];
const profilePath = (kind) => path.join(DIR, `${kind}.json`);
const PROXY_URL = `http://127.0.0.1:${PROXY_HTTP_PORT}`;

let child = null;
let wantRunning = false;
let restartTimer = null;
let lastError = '';
let logTail = '';
let envWasSetByUs = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message, status) => Object.assign(new Error(message), { status });
const installed = () => fs.existsSync(BIN());

const spawnXray = () => {
  let stderr = '';
  const proc = spawn(BIN(), ['run', '-c', CONF], { stdio: ['ignore', 'pipe', 'pipe'] });
  child = proc;
  const keep = (chunk) => { stderr = (stderr + chunk).slice(-500); logTail = (logTail + chunk).slice(-1500); };
  proc.stderr.on('data', keep);
  proc.stdout.on('data', keep);
  proc.on('error', (error) => { lastError = error.code === 'ENOENT' ? 'Xray program not found' : error.message; if (child === proc) child = null; wantRunning = false; });
  proc.on('exit', () => {
    if (child === proc) child = null;
    lastError = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
    if (wantRunning) { clearTimeout(restartTimer); restartTimer = setTimeout(() => { if (wantRunning && !child) spawnXray(); }, 5000); restartTimer.unref?.(); }
  });
};

const startXray = () => {
  wantRunning = true;
  if (!process.env.PROXY_URL) envWasSetByUs = true;
  if (!process.env.PROXY_URL || envWasSetByUs) process.env.PROXY_URL = PROXY_URL;
  if (!child) spawnXray();
};

const stopXray = async () => {
  wantRunning = false;
  clearTimeout(restartTimer);
  const proc = child;
  if (!proc) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 3000);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
    proc.kill('SIGTERM');
  });
  child = null;
};

const releaseEnv = () => { if (envWasSetByUs) { delete process.env.PROXY_URL; envWasSetByUs = false; } };

// The VPN counts as working when ANY of the sites the importer needs answers
// through it (some exit IPs are blocked by one provider but fine for the others).
const targets = () => (process.env.VPN_CHECK_URL
  ? [{ name: 'Test', url: process.env.VPN_CHECK_URL }]
  : [
    { name: 'AniList', url: 'https://graphql.anilist.co/' },
    { name: 'Tenrai', url: 'https://api.tenrai.org/v1/anime/1' },
    { name: 'Translate', url: 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q=hi' },
  ]);

export const testVpn = async () => {
  const agent = new ProxyAgent({ uri: PROXY_URL, connectTimeout: 30_000 });
  const results = await Promise.all(targets().map(async ({ name, url }) => {
    const started = Date.now();
    try {
      const response = await fetch(url, { dispatcher: agent, signal: AbortSignal.timeout(30_000) });
      await response.arrayBuffer().catch(() => {});
      // Any real HTTP answer proves the tunnel carries traffic (a 4xx still came from the site).
      return { name, ok: response.status < 500, status: response.status, ms: Date.now() - started };
    } catch (error) {
      return { name, ok: false, error: error?.cause?.message || error.message, ms: Date.now() - started };
    }
  }));
  agent.close().catch(() => {});
  const good = results.filter((r) => r.ok);
  return { ok: good.length > 0, targets: results, ms: good.length ? Math.min(...good.map((r) => r.ms)) : 0 };
};

const metaOf = (kind) => { try { return JSON.parse(getSetting(`vpn.meta.${kind}`, '') || 'null'); } catch { return null; } };
const activeKind = () => { const kind = getSetting('vpn.active', ''); return KINDS.includes(kind) ? kind : ''; };

// Older versions kept a single v2ray config in config.json: adopt it as the v2ray profile.
const migrate = () => {
  if (fs.existsSync(CONF) && !fs.existsSync(profilePath('v2ray')) && !fs.existsSync(profilePath('wireguard'))) {
    fs.copyFileSync(CONF, profilePath('v2ray'));
    fs.chmodSync(profilePath('v2ray'), 0o600);
    try { const old = JSON.parse(getSetting('vpn.meta', '') || 'null'); if (old) setSetting('vpn.meta.v2ray', JSON.stringify(old)); } catch { /* ignore */ }
    setSetting('vpn.active', 'v2ray');
  }
};

export const vpnStatus = () => {
  migrate();
  const profiles = {};
  for (const kind of KINDS) profiles[kind] = { configured: fs.existsSync(profilePath(kind)), meta: metaOf(kind) };
  return { installed: installed(), running: Boolean(child), active: activeKind(), profiles, error: child ? '' : lastError };
};

// Put `previous` (raw config text or null) back after a failed attempt.
const restoreBackup = async (previous) => {
  await stopXray();
  if (previous) { fs.writeFileSync(CONF, previous, { mode: 0o600 }); startXray(); } else { fs.rmSync(CONF, { force: true }); releaseEnv(); }
};

// Run `configText` as the live config, test it, and roll back on any failure.
// On success the profile is (optionally) saved and becomes the active one.
const runConfig = async (kind, configText, info, { save }) => {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const previous = fs.existsSync(CONF) ? fs.readFileSync(CONF, 'utf8') : null;
  await stopXray();
  fs.writeFileSync(CONF, configText, { mode: 0o600 });
  lastError = '';
  startXray();
  await sleep(2000);
  if (!child) {
    const why = lastError || 'unknown reason';
    await restoreBackup(previous);
    throw fail(`Xray did not start (${why}). If another Xray runs on this server, stop it: systemctl disable --now xray`, 422);
  }
  logTail = '';
  const result = await testVpn();
  if (!result.ok) {
    await sleep(1000); // let Xray print why the outbound failed
    const xrayLog = logTail.trim().split('\n').filter(Boolean).slice(-4).join(' | ').slice(-450);
    await restoreBackup(previous);
    throw fail(`The new VPN did not work (${result.targets.map((r) => `${r.name}: ${r.error || `HTTP ${r.status}`}`).join('; ')}).${xrayLog ? ` Xray says: ${xrayLog}.` : ''} The previous one was restored.`, 422);
  }
  if (save) {
    fs.writeFileSync(profilePath(kind), configText, { mode: 0o600 });
    setSetting(`vpn.meta.${kind}`, JSON.stringify({ ...info, at: new Date().toISOString() }));
  }
  setSetting('vpn.active', kind);
  return { ...vpnStatus(), test: result };
};

const assertKind = (kind) => { if (!KINDS.includes(kind)) throw fail('Unknown VPN type.', 400); };

// Save a new/changed config for `kind` ('v2ray' link or 'wireguard' .conf text) and switch to it.
export const applyVpn = async (kind, input) => {
  assertKind(kind);
  migrate();
  if (!installed()) throw fail(`Xray is not installed at ${BIN()}.`, 400);
  let built;
  try { built = kind === 'wireguard' ? buildWireguardConfig(input) : buildXrayConfig(input); } catch (error) { throw fail(error.message, 400); }
  return runConfig(kind, JSON.stringify(built.config, null, 2), built.info, { save: true });
};

// Switch to an already-saved profile (fast path between v2ray and WireGuard).
export const activateVpn = async (kind) => {
  assertKind(kind);
  migrate();
  if (!installed()) throw fail(`Xray is not installed at ${BIN()}.`, 400);
  if (!fs.existsSync(profilePath(kind))) throw fail('Nothing is saved for this VPN type yet.', 400);
  return runConfig(kind, fs.readFileSync(profilePath(kind), 'utf8'), metaOf(kind) || {}, { save: false });
};

// Stop the proxy but keep the saved profiles.
export const turnOffVpn = async () => {
  await stopXray();
  fs.rmSync(CONF, { force: true });
  setSetting('vpn.active', '');
  releaseEnv();
  return vpnStatus();
};

// Forget one saved profile (turns the VPN off if it was the active one).
export const deleteVpnProfile = async (kind) => {
  assertKind(kind);
  if (activeKind() === kind) await turnOffVpn();
  fs.rmSync(profilePath(kind), { force: true });
  setSetting(`vpn.meta.${kind}`, '');
  return vpnStatus();
};

// Called once at startup: bring the proxy back if one was active before.
export const initVpn = () => {
  process.on('exit', () => { try { child?.kill('SIGTERM'); } catch { /* already gone */ } });
  migrate();
  if (installed() && activeKind() && fs.existsSync(CONF)) startXray();
};
