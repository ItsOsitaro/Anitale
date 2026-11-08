import './config.js';
import { db } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { tenraiGetRaw, tenraiCircuitOpen } from './tenrai.js';

// Tenrai often leaves `score` empty for titles that MyAnimeList does score (it has the rank and the
// voter count, just not the number). The vote histogram from /statistics is complete, so the score is
// its weighted mean. Runs in the background, a few titles per tick, for titles with enough voters.
// Controlled from the admin "Auto import" page (settings keys scores.*, endpoints in admin-import.js).
db.exec(`
CREATE TABLE IF NOT EXISTS score_probe (
  mal_id INTEGER PRIMARY KEY,
  tried_at INTEGER NOT NULL
);
`);

const DEFAULTS = { enabled: 1, perTick: 60, intervalMin: 3, minVoters: 50, retryDays: 30 };
const LIMITS = { perTick: [5, 300], intervalMin: [1, 1440], minVoters: [1, 5000], retryDays: [1, 365] };
const clamp = (key, value) => {
  const [lo, hi] = LIMITS[key];
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[key];
};

export const scoreConfig = () => ({
  enabled: getSetting('scores.enabled', '1') !== '0',
  perTick: clamp('perTick', getSetting('scores.perTick', DEFAULTS.perTick)),
  intervalMin: clamp('intervalMin', getSetting('scores.intervalMin', DEFAULTS.intervalMin)),
  minVoters: clamp('minVoters', getSetting('scores.minVoters', DEFAULTS.minVoters)),
  retryDays: clamp('retryDays', getSetting('scores.retryDays', DEFAULTS.retryDays)),
});

export const saveScoreConfig = (input = {}) => {
  if (typeof input.enabled === 'boolean') setSetting('scores.enabled', input.enabled ? '1' : '0');
  for (const key of Object.keys(LIMITS)) if (input[key] != null) setSetting(`scores.${key}`, clamp(key, input[key]));
  return scoreConfig();
};

const state = { running: false, lastAt: 0, lastFilled: 0, filledTotal: 0, error: '' };
let timer = null;

const VOTERS = "CAST(REPLACE(COALESCE(json_extract(a.statistics, '$.scoredBy'), ''), ',', '') AS INTEGER)";

export const scoreStatus = () => {
  const cfg = scoreConfig();
  const unscored = db.prepare('SELECT COUNT(*) AS n FROM anime WHERE score IS NULL').get().n;
  const eligible = db.prepare(`SELECT COUNT(*) AS n FROM anime a WHERE a.mal_id IS NOT NULL AND a.score IS NULL AND ${VOTERS} >= ?`).get(cfg.minVoters).n;
  const waiting = db.prepare(`
    SELECT COUNT(*) AS n FROM anime a LEFT JOIN score_probe p ON p.mal_id = a.mal_id
    WHERE a.mal_id IS NOT NULL AND a.score IS NULL AND (p.mal_id IS NULL OR p.tried_at < ?) AND ${VOTERS} >= ?`)
    .get(Date.now() - cfg.retryDays * 86400000, cfg.minVoters).n;
  return { ...cfg, ...state, unscored, eligible, waiting, breakerOpen: tenraiCircuitOpen() };
};

export const meanScore = (histogram) => {
  let votes = 0;
  let sum = 0;
  for (const bucket of Array.isArray(histogram) ? histogram : []) {
    const v = Number(bucket?.votes) || 0;
    const s = Number(bucket?.score) || 0;
    if (v > 0 && s >= 1 && s <= 10) { votes += v; sum += v * s; }
  }
  return votes > 0 ? { votes, score: Math.round((sum / votes) * 100) / 100 } : null;
};

export const backfillScores = async () => {
  if (state.running || tenraiCircuitOpen()) return 0;
  state.running = true;
  state.error = '';
  let done = 0;
  try {
    const cfg = scoreConfig();
    const rows = db.prepare(`
      SELECT a.mal_id, a.statistics FROM anime a LEFT JOIN score_probe p ON p.mal_id = a.mal_id
      WHERE a.mal_id IS NOT NULL AND a.score IS NULL AND (p.mal_id IS NULL OR p.tried_at < ?) AND ${VOTERS} >= ?
      LIMIT ?`).all(Date.now() - cfg.retryDays * 86400000, cfg.minVoters, cfg.perTick);
    const mark = db.prepare('INSERT OR REPLACE INTO score_probe (mal_id, tried_at) VALUES (?, ?)');
    const apply = db.prepare('UPDATE anime SET score = ?, statistics = ? WHERE mal_id = ?');
    for (const row of rows) {
      let body;
      try { body = await tenraiGetRaw(`/anime/${row.mal_id}/statistics`); } catch (error) {
        if (error?.status === 404) { mark.run(row.mal_id, Date.now()); continue; }
        state.error = error.message || String(error);
        break;
      }
      const result = meanScore(body?.data?.scores);
      if (result) {
        let stats = {};
        try { stats = JSON.parse(row.statistics) || {}; } catch { /* rebuilt below */ }
        stats.score = result.score.toFixed(2);
        apply.run(result.score, JSON.stringify(stats), row.mal_id);
        done += 1;
      }
      mark.run(row.mal_id, Date.now());
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

// "Forget" earlier attempts so every still-unscored title is tried again on the next tick.
export const resetScoreProbe = () => db.prepare('DELETE FROM score_probe').run().changes;

// Self-rescheduling so a changed interval or the on/off switch applies without a restart.
const schedule = (delayMs) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (scoreConfig().enabled) await backfillScores().catch((error) => { state.error = error.message; });
    schedule(scoreConfig().intervalMin * 60000);
  }, delayMs);
  timer.unref();
};

export const rescheduleScores = () => schedule(scoreConfig().intervalMin * 60000);
export const startScoreBackfill = () => schedule(120 * 1000);
