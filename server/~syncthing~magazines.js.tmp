import './config.js';
import { db } from './db.js';
import { tenraiGetRaw, tenraiCircuitOpen } from './tenrai.js';

// Manga magazines («مجله»): the catalog table has no serialization column, so the names live in a small
// side table, filled in the background from Tenrai (a few titles per tick, politely) and joined into /api/manga.
db.exec(`
CREATE TABLE IF NOT EXISTS manga_serial (
  mal_id INTEGER PRIMARY KEY,
  magazines TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
`);

const PER_TICK = 25;
const REFRESH_MS = 30 * 24 * 3600 * 1000;
let running = false;

export const backfillMagazines = async () => {
  if (running || tenraiCircuitOpen()) return 0;
  running = true;
  let done = 0;
  try {
    const rows = db.prepare(`
      SELECT m.mal_id FROM manga m LEFT JOIN manga_serial s ON s.mal_id = m.mal_id
      WHERE m.mal_id IS NOT NULL AND (s.mal_id IS NULL OR s.fetched_at < ?)
      ORDER BY s.fetched_at IS NOT NULL, s.fetched_at LIMIT ?`).all(Date.now() - REFRESH_MS, PER_TICK);
    for (const { mal_id: id } of rows) {
      let body;
      try { body = await tenraiGetRaw(`/manga/${id}`); } catch (error) { if (error?.status === 404) body = { data: { serializations: [] } }; else break; }
      const list = (Array.isArray(body?.data?.serializations) ? body.data.serializations : [])
        .map((s) => String(s?.name || '').trim().slice(0, 80)).filter(Boolean).slice(0, 4);
      db.prepare('INSERT OR REPLACE INTO manga_serial (mal_id, magazines, fetched_at) VALUES (?, ?, ?)').run(id, JSON.stringify(list), Date.now());
      done += 1;
    }
  } finally { running = false; }
  return done;
};

export const startMagazineBackfill = () => {
  const tick = () => backfillMagazines().catch((error) => console.error(`[magazines] ${error.message}`));
  setTimeout(tick, 90 * 1000).unref();
  setInterval(tick, 20 * 60 * 1000).unref();
};
