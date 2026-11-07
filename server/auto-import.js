// Daily auto-import of fresh titles: this season's anime and recently started
// manga are pulled from AniList and saved through the same bulk-import handler
// the admin page uses (cover download + Persian synopsis included).
// Off by default; the admin switches it on in /admin/auto-import. Settings are
// kept in the SQLite settings table so no restart is needed.
import { db } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { anilistSeasonal } from './anilist.js';
import { seasonalAnimeIds } from './tenrai.js';

// Tenrai first for anime (same source as the importer), AniList as the fallback and for manga.
const idsFor = async (mediaType) => {
  if (mediaType === 'anime' && !/anilist/i.test(String(process.env.PROVIDER || ''))) {
    try {
      const ids = await seasonalAnimeIds();
      if (ids.length > 0) return ids;
    } catch (error) {
      console.log(`[auto-import] Tenrai season list unavailable (${error.message}); using AniList`);
    }
  }
  return anilistSeasonal({ mediaType });
};

const MAX_NEW_PER_TABLE = 15; // keeps one run short and polite to the providers
const CHUNK = 5;
const RUN_EVERY_MS = 22 * 3600 * 1000;
let running = false;

const HISTORY_KEEP = 8;
const readJson = (key, fallback) => {
  try { return JSON.parse(getSetting(key, '') || 'null') ?? fallback; } catch { return fallback; }
};

export const getAutoImportState = () => {
  const last = readJson('autoimport.last', null);
  const enabled = getSetting('autoimport.enabled', '0') === '1';
  // When the hourly scheduler will next start a run (only meaningful while switched on).
  const nextRunAt = enabled && !running ? new Date(Math.max(Date.now(), (last?.at ? Date.parse(last.at) : 0) + RUN_EVERY_MS)).toISOString() : null;
  return { enabled, running, last, history: readJson('autoimport.history', []), nextRunAt, maxPerRun: MAX_NEW_PER_TABLE };
};

export const setAutoImportEnabled = (on) => setSetting('autoimport.enabled', on ? '1' : '0');

// The bulk handler only needs req.body and res.json — call it directly.
const callBulk = async (bulk, body) => {
  let out = null;
  await bulk({ body }, { json: (value) => { out = value; } });
  return out;
};

export const runAutoImport = async (bulk) => {
  if (running) return getAutoImportState().last;
  running = true;
  const startedMs = Date.now();
  const report = { at: new Date().toISOString(), anime: 0, manga: 0, failed: 0, seen: 0, error: '', seconds: 0 };
  try {
    for (const mediaType of ['anime', 'manga']) {
      const ids = await idsFor(mediaType);
      const known = new Set(db.prepare(`SELECT mal_id FROM ${mediaType} WHERE mal_id IS NOT NULL`).all().map((r) => r.mal_id));
      report.seen += ids.length;
      const fresh = ids.filter((id) => !known.has(id)).slice(0, MAX_NEW_PER_TABLE);
      for (let i = 0; i < fresh.length; i += CHUNK) {
        try {
          const res = await callBulk(bulk, { mediaType, ids: fresh.slice(i, i + CHUNK) });
          report[mediaType] += res?.imported || 0;
          report.failed += res?.failed || 0;
        } catch (error) {
          report.failed += 1;
          report.error = error.message;
          console.error(`[auto-import] ${mediaType}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    report.error = error.message;
    console.error(`[auto-import] ${error.message}`);
  } finally {
    running = false;
    report.seconds = Math.round((Date.now() - startedMs) / 1000);
    try {
      setSetting('autoimport.last', JSON.stringify(report));
      setSetting('autoimport.history', JSON.stringify([report, ...readJson('autoimport.history', [])].slice(0, HISTORY_KEEP)));
    } catch (error) { console.error(`[auto-import] could not save the report: ${error.message}`); }
  }
  console.log(`[auto-import] anime +${report.anime}, manga +${report.manga}, failed ${report.failed}`);
  return report;
};

export const startAutoImportScheduler = (bulk) => {
  const tick = () => {
    const state = getAutoImportState();
    if (!state.enabled || state.running) return;
    const lastAt = state.last?.at ? Date.parse(state.last.at) : 0;
    if (Date.now() - lastAt < RUN_EVERY_MS) return;
    runAutoImport(bulk).catch((error) => console.error(`[auto-import] ${error.message}`));
  };
  setTimeout(tick, 2 * 60 * 1000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
};
