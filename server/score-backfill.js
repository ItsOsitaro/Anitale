import './config.js';
import { db } from './db.js';
import { tenraiGetRaw, tenraiCircuitOpen } from './tenrai.js';

// Tenrai often leaves `score` empty for titles that MyAnimeList does score (it has the rank and the
// voter count, just not the number). The vote histogram from /statistics is complete, so the score is
// its weighted mean. Runs in the background, a few titles per tick, for titles with >= MIN_VOTERS voters.
db.exec(`
CREATE TABLE IF NOT EXISTS score_probe (
  mal_id INTEGER PRIMARY KEY,
  tried_at INTEGER NOT NULL
);
`);

const PER_TICK = 60;
const MIN_VOTERS = 50; // below this MyAnimeList itself shows N/A
const RETRY_MS = 30 * 24 * 3600 * 1000;
let running = false;

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
  if (running || tenraiCircuitOpen()) return 0;
  running = true;
  let done = 0;
  try {
    const rows = db.prepare(`
      SELECT a.mal_id, a.statistics FROM anime a LEFT JOIN score_probe p ON p.mal_id = a.mal_id
      WHERE a.mal_id IS NOT NULL AND a.score IS NULL AND (p.mal_id IS NULL OR p.tried_at < ?)
        AND CAST(REPLACE(COALESCE(json_extract(a.statistics, '$.scoredBy'), ''), ',', '') AS INTEGER) >= ?
      LIMIT ?`).all(Date.now() - RETRY_MS, MIN_VOTERS, PER_TICK);
    const mark = db.prepare('INSERT OR REPLACE INTO score_probe (mal_id, tried_at) VALUES (?, ?)');
    const apply = db.prepare('UPDATE anime SET score = ?, statistics = ? WHERE mal_id = ?');
    for (const row of rows) {
      let body;
      try { body = await tenraiGetRaw(`/anime/${row.mal_id}/statistics`); } catch (error) { if (error?.status === 404) { mark.run(row.mal_id, Date.now()); continue; } break; }
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
  } finally { running = false; }
  return done;
};

export const startScoreBackfill = () => {
  const tick = () => backfillScores().catch((error) => console.error(`[scores] ${error.message}`));
  setTimeout(tick, 120 * 1000).unref();
  setInterval(tick, 3 * 60 * 1000).unref();
};
