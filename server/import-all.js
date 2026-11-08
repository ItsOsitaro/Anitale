// One-click import of the whole MyAnimeList anime or manga catalog (admin; one job per kind). Walks Tenrai's
// paged listing in MAL-id order, skips ids already saved and hands the rest to the
// same bulk-import handler the admin page uses (cover + Persian synopsis included).
// The next page is stored in settings so a stop or a restart resumes where it left off.
import { getSetting, setSetting } from './settings.js';
import { db } from './db.js';
import { tenraiGetRaw } from './tenrai.js';
import { exportData } from './export-data.js';

const KINDS = ['anime', 'manga'];
// Anime keeps its original setting names so a run paused before manga support still resumes.
const pageKey = (kind) => (kind === 'anime' ? 'importall.page' : `importall.${kind}.page`);
const lastKey = (kind) => (kind === 'anime' ? 'importall.last' : `importall.${kind}.last`);
const RETRY_WAIT_MS = 30000;
const MAX_RETRIES = 10;
const MAX_BAD_PAGES = 5; // consecutive pages whose save step failed -> give up instead of looping on a broken provider
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const blank = () => ({
  running: false, stop: false, imported: 0, failed: 0, missing: 0, skipped: 0, error: '', total: 0, pages: 0,
  pagesDone: 0, startedAt: 0, lastPageAt: 0, retrying: 0, completed: false,
});
const jobs = { anime: blank(), manga: blank() };

const readLast = (kind) => {
  try { return JSON.parse(getSetting(lastKey(kind), '')) || null; } catch { return null; }
};

// Rate and ETA come from this run only (pages walked since start), so a resumed run is not skewed by older pages.
export const importAllState = (kind = 'anime') => {
  const job = jobs[kind];
  const page = Number(getSetting(pageKey(kind), '1')) || 1;
  const elapsedSec = job.startedAt ? Math.max(1, Math.round(((job.running ? Date.now() : job.lastPageAt || Date.now()) - job.startedAt) / 1000)) : 0;
  const perMin = job.pagesDone > 0 && elapsedSec ? (job.pagesDone / elapsedSec) * 60 : 0;
  const left = job.pages ? Math.max(0, job.pages - page + 1) : 0;
  const etaSec = job.running && perMin > 0 && left > 0 ? Math.round((left / perMin) * 60) : null;
  // How much of MyAnimeList the catalog already holds (for the "x of y" line).
  let have = 0;
  try { have = db.prepare(`SELECT COUNT(*) AS n FROM ${kind} WHERE mal_id IS NOT NULL`).get().n; } catch { /* the line is optional */ }
  return { ...job, page, elapsedSec, perMin: Math.round(perMin * 10) / 10, etaSec, have, last: readLast(kind), kind };
};

const callBulk = async (bulk, body) => {
  let out = null;
  await bulk({ body }, { json: (value) => { out = value; } });
  return out;
};

// Waits, but wakes up every second so "Stop" is honoured during a long retry pause.
const pause = async (job, ms) => {
  for (let waited = 0; waited < ms && !job.stop; waited += 1000) await sleep(1000);
};

const fetchPage = async (job, kind, page) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const body = await tenraiGetRaw(`/${kind}?page=${page}&limit=25&order_by=mal_id&sort=asc&sfw=false`);
      job.retrying = 0;
      return body;
    } catch (error) {
      if (attempt >= MAX_RETRIES || job.stop) throw error;
      job.retrying = attempt + 1;
      await pause(job, RETRY_WAIT_MS);
    }
  }
};

const run = async (bulk, kind, startPage) => {
  const job = jobs[kind];
  let page = startPage;
  let badPages = 0;
  try {
    while (!job.stop) {
      const body = await fetchPage(job, kind, page);
      if (job.stop) break;
      const ids = (body?.data || []).map((row) => row?.mal_id).filter(Boolean);
      job.pages = body?.pagination?.last_visible_page || job.pages;
      job.total = body?.pagination?.items?.total || job.total;
      if (ids.length > 0) {
        const known = new Set(db.prepare(`SELECT mal_id FROM ${kind} WHERE mal_id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((r) => r.mal_id));
        const fresh = ids.filter((id) => !known.has(id));
        job.skipped += ids.length - fresh.length;
        if (fresh.length > 0) {
          try {
            // noExport: rewriting public/data after every page would be O(n²); done once at the end.
            const res = await callBulk(bulk, { mediaType: kind, ids: fresh, noExport: true });
            job.imported += res?.imported || 0;
            job.failed += res?.failed || 0;
            job.missing += res?.missing || 0;
            badPages = 0;
          } catch (error) {
            // One bad page must not end a multi-hour run: count it, remember why, move on.
            job.failed += fresh.length;
            job.error = `page ${page}: ${error.message || error}`;
            badPages += 1;
            if (badPages >= MAX_BAD_PAGES) throw new Error(`${MAX_BAD_PAGES} pages in a row failed (${job.error})`);
          }
        }
      }
      job.pagesDone += 1;
      job.lastPageAt = Date.now();
      page += 1;
      setSetting(pageKey(kind), page);
      if (!body?.pagination?.has_next_page) { setSetting(pageKey(kind), 1); job.completed = true; break; }
    }
  } catch (error) {
    // A failed fetch that only happened because the admin pressed Stop is not an error worth showing.
    if (!job.stop) job.error = error.message || String(error);
  } finally {
    if (job.imported > 0) { try { exportData(); } catch (error) { job.error = job.error || error.message; } }
    job.running = false;
    job.retrying = 0;
    try {
      setSetting(lastKey(kind), JSON.stringify({
        at: new Date().toISOString(), imported: job.imported, failed: job.failed, missing: job.missing, skipped: job.skipped,
        seconds: job.startedAt ? Math.round((Date.now() - job.startedAt) / 1000) : 0, stopped: job.stop, completed: job.completed, error: job.error,
      }));
    } catch { /* the summary is a nicety, never fail the run for it */ }
  }
};

export const startImportAll = (bulk, { restart = false, kind = 'anime' } = {}) => {
  if (!KINDS.includes(kind)) kind = 'anime';
  if (jobs[kind].running) return importAllState(kind);
  if (restart) setSetting(pageKey(kind), 1);
  jobs[kind] = { ...blank(), running: true, startedAt: Date.now() };
  run(bulk, kind, Number(getSetting(pageKey(kind), '1')) || 1);
  return importAllState(kind);
};

export const stopImportAll = (kind = 'anime') => { if (jobs[kind]?.running) jobs[kind].stop = true; return importAllState(KINDS.includes(kind) ? kind : 'anime'); };
