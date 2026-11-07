// One-click import of the whole MyAnimeList anime catalog (admin). Walks Tenrai's
// paged listing in MAL-id order, skips ids already saved and hands the rest to the
// same bulk-import handler the admin page uses (cover + Persian synopsis included).
// The next page is stored in settings so a stop or a restart resumes where it left off.
import { getSetting, setSetting } from './settings.js';
import { db } from './db.js';
import { tenraiGetRaw } from './tenrai.js';
import { exportData } from './export-data.js';

const PAGE_KEY = 'importall.page';
const RETRY_WAIT_MS = 30000;
const MAX_RETRIES = 10;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let job = { running: false, stop: false, imported: 0, failed: 0, missing: 0, skipped: 0, error: '', total: 0, pages: 0 };

export const importAllState = () => ({ ...job, page: Number(getSetting(PAGE_KEY, '1')) || 1 });

const callBulk = async (bulk, body) => {
  let out = null;
  await bulk({ body }, { json: (value) => { out = value; } });
  return out;
};

const fetchPage = async (page) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await tenraiGetRaw(`/anime?page=${page}&limit=25&order_by=mal_id&sort=asc&sfw=false`);
    } catch (error) {
      if (attempt >= MAX_RETRIES || job.stop) throw error;
      await sleep(RETRY_WAIT_MS);
    }
  }
};

const run = async (bulk, startPage) => {
  let page = startPage;
  try {
    while (!job.stop) {
      const body = await fetchPage(page);
      const ids = (body?.data || []).map((row) => row?.mal_id).filter(Boolean);
      job.pages = body?.pagination?.last_visible_page || job.pages;
      job.total = body?.pagination?.items?.total || job.total;
      if (ids.length > 0) {
        const known = new Set(db.prepare(`SELECT mal_id FROM anime WHERE mal_id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((r) => r.mal_id));
        const fresh = ids.filter((id) => !known.has(id));
        job.skipped += ids.length - fresh.length;
        if (fresh.length > 0) {
          // noExport: rewriting public/data after every page would be O(n²); done once at the end.
          const res = await callBulk(bulk, { mediaType: 'anime', ids: fresh, noExport: true });
          job.imported += res?.imported || 0;
          job.failed += res?.failed || 0;
          job.missing += res?.missing || 0;
        }
      }
      page += 1;
      setSetting(PAGE_KEY, page);
      if (!body?.pagination?.has_next_page) { setSetting(PAGE_KEY, 1); break; }
    }
  } catch (error) {
    job.error = error.message || String(error);
  } finally {
    if (job.imported > 0) { try { exportData(); } catch (error) { job.error = job.error || error.message; } }
    job.running = false;
  }
};

export const startImportAll = (bulk, { restart = false } = {}) => {
  if (job.running) return importAllState();
  if (restart) setSetting(PAGE_KEY, 1);
  job = { running: true, stop: false, imported: 0, failed: 0, missing: 0, skipped: 0, error: '', total: 0, pages: 0 };
  run(bulk, Number(getSetting(PAGE_KEY, '1')) || 1);
  return importAllState();
};

export const stopImportAll = () => { job.stop = true; return importAllState(); };
