import './config.js';
import { db } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { tenraiCircuitOpen } from './tenrai.js';
import { warmExtras, EXTRAS_VER } from './extras.js';

// Pre-caches the "extras" (relations, characters, staff, themes, recommendations, trailer) of every anime in
// SQLite, most-followed titles first, so a visitor never waits for Tenrai on a title page. Runs in the
// background, one title at a time (Tenrai's queue is serial, so a visitor's own request waits for one slot at most).
// Controlled from the admin "Auto import" page (settings keys extras.*, endpoints in admin-import.js).
db.exec(`
CREATE TABLE IF NOT EXISTS extras_probe (
  mal_id INTEGER PRIMARY KEY,
  tried_at INTEGER NOT NULL
);
`);

const DEFAULTS = { enabled: 1, perTick: 100, intervalMin: 1, refreshDays: 30, retryDays: 3 };
const LIMITS = { perTick: [5, 500], intervalMin: [1, 1440], refreshDays: [7, 365], retryDays: [1, 30] };
const clamp = (key, value) => {
  const [lo, hi] = LIMITS[key];
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[key];
};

export const extrasConfig = () => ({
  enabled: getSetting('extras.enabled', '1') !== '0',
  perTick: clamp('perTick', getSetting('extras.perTick', DEFAULTS.perTick)),
  intervalMin: clamp('intervalMin', getSetting('extras.intervalMin', DEFAULTS.intervalMin)),
  refreshDays: clamp('refreshDays', getSetting('extras.refreshDays', DEFAULTS.refreshDays)),
  retryDays: clamp('retryDays', getSetting('extras.retryDays', DEFAULTS.retryDays)),
});

export const saveExtrasConfig = (input = {}) => {
  if (typeof input.enabled === 'boolean') setSetting('extras.enabled', input.enabled ? '1' : '0');
  for (const key of Object.keys(LIMITS)) if (input[key] != null) setSetting(`extras.${key}`, clamp(key, input[key]));
  return extrasConfig();
};

const state = { running: false, lastAt: 0, lastFilled: 0, filledTotal: 0, error: '' };
let timer = null;
const DAY = 86400000;
const SECONDS_PER_TITLE = 4; // six Tenrai calls, ~0.6 s apart

// Titles that still need work: never cached, older than refreshDays, or stored in an old shape; not tried-and-failed lately.
const WAITING = `
  FROM anime a
  LEFT JOIN title_extras e ON e.type = 'anime' AND e.mal_id = a.mal_id
  LEFT JOIN extras_probe p ON p.mal_id = a.mal_id
  WHERE a.mal_id IS NOT NULL
    AND (e.mal_id IS NULL OR e.fetched_at < ? OR CAST(json_extract(e.data, '$.v') AS INTEGER) != ?)
    AND (p.mal_id IS NULL OR p.tried_at < ?)`;

export const extrasStatus = () => {
  const cfg = extrasConfig();
  const now = Date.now();
  const total = db.prepare('SELECT COUNT(*) AS n FROM anime WHERE mal_id IS NOT NULL').get().n;
  const cached = db.prepare("SELECT COUNT(*) AS n FROM title_extras WHERE type = 'anime'").get().n;
  const waiting = db.prepare(`SELECT COUNT(*) AS n ${WAITING}`).get(now - cfg.refreshDays * DAY, EXTRAS_VER, now - cfg.retryDays * DAY).n;
  const perHour = (cfg.perTick * 3600) / (cfg.perTick * SECONDS_PER_TITLE + cfg.intervalMin * 60);
  return { ...cfg, ...state, total, cached, waiting, etaHours: waiting > 0 && cfg.enabled ? Math.round((waiting / perHour) * 10) / 10 : 0, breakerOpen: tenraiCircuitOpen() };
};

export const backfillExtras = async () => {
  if (state.running || tenraiCircuitOpen()) return 0;
  state.running = true;
  state.error = '';
  let done = 0;
  try {
    const cfg = extrasConfig();
    const now = Date.now();
    const rows = db.prepare(`SELECT a.mal_id ${WAITING} ORDER BY a.members DESC LIMIT ?`)
      .all(now - cfg.refreshDays * DAY, EXTRAS_VER, now - cfg.retryDays * DAY, cfg.perTick);
    const mark = db.prepare('INSERT OR REPLACE INTO extras_probe (mal_id, tried_at) VALUES (?, ?)');
    for (const { mal_id: id } of rows) {
      if (tenraiCircuitOpen()) break;
      try {
        await warmExtras('anime', id);
        done += 1;
      } catch (error) {
        if (error?.network) { state.error = error.message || String(error); break; }
        mark.run(id, Date.now()); // Tenrai has nothing for this title: skip it for a few days instead of looping on it
      }
    }
  } catch (error) {
    state.error = error.message || String(error);
  } finally {
    state.running = false;
    state.lastAt = Date.now();
    state.lastFilled = done;
    state.filledTotal += done;
  }
  return done;
};

// Forget earlier failures and refresh everything on the next runs.
export const resetExtras = () => {
  db.prepare('DELETE FROM extras_probe').run();
  return db.prepare("UPDATE title_extras SET fetched_at = 0 WHERE type = 'anime'").run().changes;
};

// Self-rescheduling so a changed interval or the on/off switch applies without a restart.
const schedule = (delayMs) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (extrasConfig().enabled) await backfillExtras().catch((error) => { state.error = error.message; });
    schedule(extrasConfig().intervalMin * 60000);
  }, delayMs);
  timer.unref();
};

export const rescheduleExtras = () => schedule(extrasConfig().intervalMin * 60000);
export const startExtrasBackfill = () => schedule(180 * 1000);
