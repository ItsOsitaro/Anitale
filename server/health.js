import fs from 'node:fs';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { db, ROOT_DIR, SERVER_DIR, COVERS_DIR } from './db.js';
import { tenraiCircuitOpen, tenraiGetRaw } from './tenrai.js';
import { anilistSearch } from './anilist.js';
import { vpnStatus } from './vpn.js';
import { getAutoImportState } from './auto-import.js';

// Recent server errors/warnings, kept in memory so the admin health page can show them.
const LOG_LIMIT = 40;
const recent = [];
const remember = (level, args) => {
  const text = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ').slice(0, 600);
  // The same message repeating (a failing job loop) becomes one row with a counter instead of flooding the list.
  const same = recent.find((e) => e.level === level && e.text === text);
  if (same) { same.count = (same.count || 1) + 1; same.at = new Date().toISOString(); recent.splice(recent.indexOf(same), 1); recent.unshift(same); return; }
  recent.unshift({ at: new Date().toISOString(), level, text, count: 1 });
  if (recent.length > LOG_LIMIT) recent.length = LOG_LIMIT;
};
for (const level of ['error', 'warn']) {
  const original = console[level].bind(console);
  console[level] = (...args) => { try { remember(level, args); } catch { /* never break logging */ } original(...args); };
}

// Browser-side crashes reported by the site itself (POST /api/client-error): kept as a list of timestamps so the
// health alert can tell "one odd browser" from "the new release broke the page".
const clientHits = [];
export const clientErrorsLast = (ms = 600_000) => { const cut = Date.now() - ms; while (clientHits.length && clientHits[0] < cut) clientHits.shift(); return clientHits.length; };

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const count = (sql) => safe(() => db.prepare(sql).get().n, 0);
const fileSize = (file) => safe(() => fs.statSync(file).size, 0);
// Folder size scans are slow with 100k+ files, so each result is kept for 10 minutes.
const statsCache = new Map();
const dirStats = (dir) => {
  const hit = statsCache.get(dir);
  if (hit && Date.now() - hit.at < 600_000) return hit.value;
  const value = safe(() => {
    const names = fs.readdirSync(dir);
    let bytes = 0;
    for (const name of names.slice(0, 20000)) bytes += fileSize(path.join(dir, name));
    return { files: names.length, bytes };
  }, { files: 0, bytes: 0 });
  statsCache.set(dir, { at: Date.now(), value });
  return value;
};

const meminfo = () => safe(() => {
  const text = fs.readFileSync('/proc/meminfo', 'utf8');
  const kb = (key) => Number((text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm')) || [])[1] || 0) * 1024;
  return { swapTotal: kb('SwapTotal'), swapFree: kb('SwapFree'), available: kb('MemAvailable') };
}, { swapTotal: 0, swapFree: 0, available: 0 });

// Event-loop lag: how late a 1s timer fires. Rises when the site is overloaded, so it is a better "is it slow?" signal than load average.
let loopLag = 0;
let lagLast = Date.now();
setInterval(() => { const now = Date.now(); loopLag = Math.max(0, now - lagLast - 1000); lagLast = now; }, 1000).unref();

// Row counts hit big tables, so keep them for 30s; the whole snapshot is reused for 4s (several open tabs poll it).
let dataCache = { at: 0, value: null };
const dataCounts = () => {
  if (dataCache.value && Date.now() - dataCache.at < 30_000) return dataCache.value;
  const value = {
    anime: count('SELECT COUNT(*) AS n FROM anime'), manga: count('SELECT COUNT(*) AS n FROM manga'), users: count('SELECT COUNT(*) AS n FROM users'),
    listEntries: count('SELECT COUNT(*) AS n FROM user_entries'), reviews: count('SELECT COUNT(*) AS n FROM reviews'),
    extrasCached: count('SELECT COUNT(*) AS n FROM title_extras'), peopleCached: count('SELECT COUNT(*) AS n FROM people_cache'), missingTitles: count('SELECT COUNT(*) AS n FROM missing_titles'),
  };
  dataCache = { at: Date.now(), value };
  return value;
};
let snapCache = { at: 0, value: null };
export const healthSnapshot = () => {
  if (snapCache.value && Date.now() - snapCache.at < 4000) return snapCache.value;
  const value = buildSnapshot();
  snapCache = { at: Date.now(), value };
  return value;
};

const buildSnapshot = () => {
  const disk = safe(() => { const s = fs.statfsSync(ROOT_DIR); return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; }, { total: 0, free: 0 });
  const mem = meminfo();
  const dbFile = process.env.DB_FILE || path.join(SERVER_DIR, 'data.db');
  const vpn = safe(() => vpnStatus(), {});
  return {
    at: new Date().toISOString(),
    system: {
      node: process.version, platform: `${os.type()} ${os.release()}`, uptimeSec: Math.round(os.uptime()), processUptimeSec: Math.round(process.uptime()),
      load: os.loadavg().map((n) => Math.round(n * 100) / 100), cpus: os.cpus().length,
      memTotal: os.totalmem(), memAvailable: mem.available || os.freemem(), swapTotal: mem.swapTotal, swapUsed: mem.swapTotal - mem.swapFree,
      processRss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed, loopLagMs: loopLag, disk,
    },
    data: {
      dbBytes: fileSize(dbFile), walBytes: fileSize(`${dbFile}-wal`), covers: dirStats(COVERS_DIR), imageCache: dirStats(path.join(SERVER_DIR, 'xcache')),
      ...dataCounts(),
    },
    sources: {
      tenraiPaused: tenraiCircuitOpen(), tenraiDisabled: String(process.env.TENRAI_DISABLED) === '1', provider: process.env.PROVIDER || '',
      proxy: Boolean(process.env.PROXY_URL), vpnActive: vpn.active || '', vpnRunning: Boolean(vpn.running), vpnError: vpn.error || '',
    },
    clientErrors: clientErrorsLast(),
    autoImport: safe(() => getAutoImportState(), null),
    errors: recent.slice(0, 25),
  };
};

const timed = async (task) => {
  const started = Date.now();
  try {
    await Promise.race([task(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (20s)')), 20_000))]);
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: String(error?.message || error).slice(0, 200) };
  }
};

export const registerHealthRoutes = (app, { requireAdmin, writeLimiter }) => {
  // Public on purpose (visitors are not logged in), so it is tiny, strictly capped per IP and never trusted:
  // only short plain strings are kept, and nothing is stored in the database.
  const seen = new Map();
  // Browsers send CSP violation reports as application/csp-report; they land in the same recent-errors list, a few per minute.
  let cspSeen = { at: 0, n: 0 };
  app.post('/api/csp-report', express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '8kb' }), (req, res) => {
    res.status(204).end();
    const now = Date.now();
    if (now - cspSeen.at > 60_000) cspSeen = { at: now, n: 0 };
    if (++cspSeen.n > 10) return;
    const r = req.body?.['csp-report'] || {};
    console.warn(`[csp] ${String(r['violated-directive'] || '').slice(0, 60)} blocked ${String(r['blocked-uri'] || '').slice(0, 120)} on ${String(r['document-uri'] || '').slice(0, 80)}`);
  });
  app.post('/api/client-error', (req, res) => {
    res.status(204).end();
    const ip = req.ip || '';
    const now = Date.now();
    const mine = (seen.get(ip) || []).filter((t) => now - t < 60_000);
    if (mine.length >= 5 || seen.size > 5000) { if (seen.size > 5000) seen.clear(); return; }
    mine.push(now);
    seen.set(ip, mine);
    const clip = (v, n) => String(v ?? '').replace(/[^ -~؀-ۿ]+/g, ' ').slice(0, n);
    clientHits.push(now);
    console.warn(`[client] ${clip(req.body?.message, 200)} @ ${clip(req.body?.page, 80)} (${clip(req.body?.source, 60)})`);
  });
  app.get('/api/admin/health', requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(healthSnapshot());
  });
  // Live check of the outside services the site depends on (goes through the VPN proxy when one is active).
  // A probe already running (or finished <5s ago) is shared, so repeated clicks cannot hammer the outside services.
  let probeRun = null;
  let probeDone = { at: 0, value: null };
  // Clear the recent-errors list (it lives in memory only; a restart empties it anyway).
  app.delete('/api/admin/health/errors', requireAdmin, writeLimiter, (_req, res) => { recent.length = 0; snapCache = { at: 0, value: null }; res.json({ ok: true }); });
  app.post('/api/admin/health/probe', requireAdmin, writeLimiter, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (probeDone.value && Date.now() - probeDone.at < 5000) return res.json(probeDone.value);
    if (!probeRun) {
      probeRun = Promise.all([
        timed(() => tenraiGetRaw('/seasons/now?limit=1')),
        timed(() => anilistSearch('one piece', 'anime')),
      ]).then(([tenrai, anilist]) => { probeDone = { at: Date.now(), value: { tenrai, anilist, at: new Date().toISOString() } }; return probeDone.value; })
        .finally(() => { probeRun = null; });
    }
    try { return res.json(await probeRun); } catch (error) { return res.status(500).json({ error: String(error?.message || error).slice(0, 200) }); }
  });
};
