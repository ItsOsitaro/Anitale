import fs from 'node:fs';
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
  recent.unshift({ at: new Date().toISOString(), level, text });
  if (recent.length > LOG_LIMIT) recent.length = LOG_LIMIT;
};
for (const level of ['error', 'warn']) {
  const original = console[level].bind(console);
  console[level] = (...args) => { try { remember(level, args); } catch { /* never break logging */ } original(...args); };
}

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const count = (sql) => safe(() => db.prepare(sql).get().n, 0);
const fileSize = (file) => safe(() => fs.statSync(file).size, 0);
const dirStats = (dir) => safe(() => {
  const names = fs.readdirSync(dir);
  let bytes = 0;
  for (const name of names.slice(0, 20000)) bytes += fileSize(path.join(dir, name));
  return { files: names.length, bytes };
}, { files: 0, bytes: 0 });

const meminfo = () => safe(() => {
  const text = fs.readFileSync('/proc/meminfo', 'utf8');
  const kb = (key) => Number((text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm')) || [])[1] || 0) * 1024;
  return { swapTotal: kb('SwapTotal'), swapFree: kb('SwapFree'), available: kb('MemAvailable') };
}, { swapTotal: 0, swapFree: 0, available: 0 });

export const healthSnapshot = () => {
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
      processRss: process.memoryUsage().rss, disk,
    },
    data: {
      dbBytes: fileSize(dbFile), walBytes: fileSize(`${dbFile}-wal`), covers: dirStats(COVERS_DIR), imageCache: dirStats(path.join(SERVER_DIR, 'xcache')),
      anime: count('SELECT COUNT(*) AS n FROM anime'), manga: count('SELECT COUNT(*) AS n FROM manga'), users: count('SELECT COUNT(*) AS n FROM users'),
      listEntries: count('SELECT COUNT(*) AS n FROM user_entries'), reviews: count('SELECT COUNT(*) AS n FROM reviews'),
      extrasCached: count('SELECT COUNT(*) AS n FROM title_extras'), peopleCached: count('SELECT COUNT(*) AS n FROM people_cache'), missingTitles: count('SELECT COUNT(*) AS n FROM missing_titles'),
    },
    sources: {
      tenraiPaused: tenraiCircuitOpen(), tenraiDisabled: String(process.env.TENRAI_DISABLED) === '1', provider: process.env.PROVIDER || '',
      proxy: Boolean(process.env.PROXY_URL), vpnActive: vpn.active || '', vpnRunning: Boolean(vpn.running), vpnError: vpn.error || '',
    },
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
  app.get('/api/admin/health', requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(healthSnapshot());
  });
  // Live check of the outside services the site depends on (goes through the VPN proxy when one is active).
  app.post('/api/admin/health/probe', requireAdmin, writeLimiter, async (_req, res) => {
    const [tenrai, anilist] = await Promise.all([
      timed(() => tenraiGetRaw('/seasons/now?limit=1')),
      timed(() => anilistSearch('one piece', 'anime')),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ tenrai, anilist });
  });
};
