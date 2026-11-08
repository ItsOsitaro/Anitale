import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { getAutoImportState, setAutoImportEnabled } from './auto-import.js';
import { importAllState } from './import-all.js';
import { extrasConfig, saveExtrasConfig, rescheduleExtras, extrasStatus } from './extras-backfill.js';
import { scoreConfig, saveScoreConfig, rescheduleScores, scoreStatus } from './score-backfill.js';
import { alertConfig, saveAlertConfig } from './health-alerts.js';
import { clientErrorsLast } from './health.js';
import { saveRevision } from './revisions.js';
import { openReportCount } from './reports.js';
import { buildWeeklyReport, reportEnabled, setReportEnabled } from './weekly-report.js';
import { translateSynopsis } from './translate.js';

// Admin helpers added in the fifth admin round. Routes live under /api/admin/x/<area>/... so the permission gate
// (server/admin-accounts.js) applies: catalog = titles, users = members, system = growth / self-check / background jobs.
const like = (q) => `%${String(q).trim().replace(/[%_\\]/g, '\\$&')}%`;
const bad = (res, message, status = 400) => res.status(status).json({ error: message });

// Counts per day for the last N days (missing days are zero), from a table's created_at.
const perDay = (table, days) => {
  const rows = db.prepare(`SELECT date(created_at) AS d, COUNT(*) AS n FROM ${table} WHERE created_at >= date('now', ?) GROUP BY d`).all(`-${days - 1} days`);
  const byDay = new Map(rows.map((r) => [r.d, r.n]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ d, n: byDay.get(d) || 0 });
  }
  return out;
};

// The checks a deploy must not break, run against this very server (what scripts/regression.mjs does from outside).
const selfChecks = async (port) => {
  const base = `http://127.0.0.1:${port}`;
  const anime = db.prepare('SELECT slug FROM anime ORDER BY members DESC LIMIT 1').get();
  const paths = [
    ['Home page', '/'], ['Schedule', '/schedule'], ['Seasonal', '/seasonal'], ['Genres', '/genres'], ['Catalog API', '/api/anime?lite=1'],
    ['Search', '/api/search?q=a'], ['Full search', '/api/search/full?type=anime&sort=score&sfw=1'], ['Landing seasons', '/api/landing'],
    ['Community highlights', '/api/home/community'], ['Sitemap', '/sitemap.xml'], ['Web manifest', '/manifest.webmanifest'],
    ...(anime ? [['Title page', `/anime/${anime.slug}`]] : []),
  ];
  const results = [];
  for (const [name, path] of paths) {
    const started = Date.now();
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) });
      results.push({ name, ok: res.status === 200, detail: `HTTP ${res.status}`, ms: Date.now() - started });
    } catch (error) {
      results.push({ name, ok: false, detail: String(error.message || error).slice(0, 80), ms: Date.now() - started });
    }
  }
  const dbOk = (() => { try { return db.prepare('PRAGMA quick_check').get().quick_check === 'ok'; } catch { return false; } })();
  results.push({ name: 'Database integrity', ok: dbOk, detail: dbOk ? 'ok' : 'quick_check failed', ms: 0 });
  return results;
};

export const registerAdminTools = (app) => {
  // Palette search: titles (catalog area) and members (users area), a handful each.
  app.get('/api/admin/x/catalog/find', requireAdmin, (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) { res.json({ items: [] }); return; }
    const anime = db.prepare("SELECT slug, title FROM anime WHERE title LIKE ? ESCAPE '\\' ORDER BY members DESC LIMIT 6").all(like(q)).map((r) => ({ type: 'anime', ...r }));
    const manga = db.prepare("SELECT slug, title FROM manga WHERE title LIKE ? ESCAPE '\\' ORDER BY members DESC LIMIT 4").all(like(q)).map((r) => ({ type: 'manga', ...r }));
    res.json({ items: [...anime, ...manga] });
  });
  app.get('/api/admin/x/users/find', requireAdmin, (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) { res.json({ items: [] }); return; }
    res.json({ items: db.prepare("SELECT username FROM users WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 5").all(like(q), like(q)) });
  });

  // Catalog quality: counts of gaps with a few examples each.
  app.get('/api/admin/x/catalog/quality', requireAdmin, (_req, res) => {
    const checks = [
      ['noCover', 'anime', "cover = ''"], ['noPersian', 'anime', "synopsis NOT LIKE '%\"fa\":\"_%'"], ['noScore', 'anime', 'score IS NULL'],
      ['noGenres', 'anime', "genres IN ('', '[]')"], ['noYear', 'anime', "year IS NULL OR year = ''"], ['noMal', 'anime', 'mal_id IS NULL'],
      ['noCover', 'manga', "cover = ''"], ['noScore', 'manga', 'score IS NULL'], ['noGenres', 'manga', "genres IN ('', '[]')"],
    ];
    const groups = checks.map(([key, table, where]) => ({
      key, type: table,
      count: db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n,
      samples: db.prepare(`SELECT slug, title FROM ${table} WHERE ${where} ORDER BY members DESC LIMIT 8`).all(),
    }));
    const dupes = db.prepare('SELECT lower(title) AS t, COUNT(*) AS n, GROUP_CONCAT(slug) AS slugs FROM anime GROUP BY lower(title) HAVING n > 1 ORDER BY n DESC LIMIT 12').all()
      .map((r) => ({ title: r.t, n: r.n, slugs: r.slugs.split(',').slice(0, 5) }));
    const total = { anime: db.prepare('SELECT COUNT(*) AS n FROM anime').get().n, manga: db.prepare('SELECT COUNT(*) AS n FROM manga').get().n };
    res.json({ groups, dupes, total });
  });

  // Growth: new members, list additions, reviews and new titles per day.
  app.get('/api/admin/x/system/growth', requireAdmin, (req, res) => {
    const days = Math.min(90, Math.max(7, Number.parseInt(req.query.days, 10) || 30));
    const manga = perDay('manga', days);
    const series = {
      users: perDay('users', days), entries: perDay('user_entries', days), reviews: perDay('reviews', days),
      titles: perDay('anime', days).map((row, i) => ({ d: row.d, n: row.n + manga[i].n })),
    };
    const top = db.prepare("SELECT e.slug, COUNT(DISTINCT e.user_id) AS n FROM user_entries e WHERE e.media_type = 'anime' AND e.created_at >= date('now', ?) GROUP BY e.slug ORDER BY n DESC LIMIT 8").all(`-${days - 1} days`)
      .map((r) => ({ ...r, title: db.prepare('SELECT title FROM anime WHERE slug = ?').get(r.slug)?.title || r.slug }));
    const misses = db.prepare('SELECT q, n FROM search_misses ORDER BY n DESC LIMIT 8').all();
    res.json({ days, series, top, misses });
  });

  // Post-deploy self-check, run against this server.
  app.post('/api/admin/x/system/selfcheck', requireAdmin, async (_req, res) => {
    const results = await selfChecks(Number(process.env.PORT) || 3000);
    res.json({ ok: results.every((r) => r.ok), results, at: new Date().toISOString() });
  });

  // Background jobs on one screen.
  app.get('/api/admin/x/system/jobs', requireAdmin, (_req, res) => {
    const auto = getAutoImportState();
    const extras = extrasStatus();
    const scores = scoreStatus();
    res.json({
      jobs: [
        { id: 'autoimport', enabled: auto.enabled, running: auto.running, info: auto.last ? { at: auto.last.at } : null, next: auto.nextRunAt, link: '/admin/auto-import' },
        { id: 'extras', enabled: extrasConfig().enabled, running: Boolean(extras.running), info: { waiting: extras.waiting, cached: extras.cached, total: extras.total }, link: '/admin/auto-import' },
        { id: 'scores', enabled: scoreConfig().enabled, running: Boolean(scores.running), info: { waiting: scores.waiting }, link: '/admin/anime?filter=noScore' },
        { id: 'alerts', enabled: alertConfig().enabled, running: false, info: null, link: '/admin/health' },
        { id: 'weekly', enabled: reportEnabled(), running: false, info: null, link: '/admin/jobs' },
      ],
      importAll: { anime: importAllState('anime'), manga: importAllState('manga') },
    });
  });
  app.post('/api/admin/x/system/jobs/:id', requireAdmin, (req, res) => {
    const on = req.body?.enabled === true;
    switch (req.params.id) {
      case 'autoimport': setAutoImportEnabled(on); break;
      case 'extras': saveExtrasConfig({ enabled: on }); rescheduleExtras(); break;
      case 'scores': saveScoreConfig({ enabled: on }); rescheduleScores(); break;
      case 'alerts': saveAlertConfig({ enabled: on }); break;
      case 'weekly': setReportEnabled(on); break;
      default: return bad(res, 'Unknown job', 404);
    }
    return res.json({ ok: true });
  });

  // Bulk: add or remove one genre on up to 100 titles (only the genres column changes, as with edit suggestions).
  app.post('/api/admin/x/catalog/bulk-genre', requireAdmin, (req, res) => {
    const type = req.body?.type === 'manga' ? 'manga' : 'anime';
    const genre = String(req.body?.genre || '').trim().slice(0, 40);
    const add = req.body?.mode !== 'remove';
    const slugs = (Array.isArray(req.body?.slugs) ? req.body.slugs : []).map((s) => String(s).slice(0, 200)).slice(0, 100);
    if (!genre || !slugs.length) return bad(res, 'Genre and titles are required');
    let changed = 0;
    for (const slug of slugs) {
      const row = db.prepare(`SELECT * FROM ${type} WHERE slug = ?`).get(slug);
      if (!row) continue;
      let list = [];
      try { list = JSON.parse(row.genres) || []; } catch { list = []; }
      const has = list.some((g) => String(g).toLowerCase() === genre.toLowerCase());
      if ((add && has) || (!add && !has)) continue;
      saveRevision(req.admin?.username || '', type, row, 'genre');
      const next = add ? [...list, genre] : list.filter((g) => String(g).toLowerCase() !== genre.toLowerCase());
      db.prepare(`UPDATE ${type} SET genres = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(next), row.id);
      changed += 1;
    }
    return res.json({ ok: true, changed });
  });

  // Bulk: Persian synopsis for selected titles that have an English one and no Persian yet (a few per call; the page loops).
  app.post('/api/admin/x/translate/titles', requireAdmin, async (req, res) => {
    const type = req.body?.type === 'manga' ? 'manga' : 'anime';
    const slugs = (Array.isArray(req.body?.slugs) ? req.body.slugs : []).map((s) => String(s).slice(0, 200)).slice(0, 3);
    let translated = 0;
    let skipped = 0;
    let failed = 0;
    for (const slug of slugs) {
      const row = db.prepare(`SELECT * FROM ${type} WHERE slug = ?`).get(slug);
      let syn = {};
      try { syn = JSON.parse(row?.synopsis || '{}') || {}; } catch { syn = {}; }
      if (!row || !syn.en || syn.fa) { skipped += 1; continue; }
      try {
        const fa = await translateSynopsis(syn.en);
        if (!fa) throw new Error('empty');
        saveRevision(req.admin?.username || '', type, row, 'translate');
        db.prepare(`UPDATE ${type} SET synopsis = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify({ ...syn, fa, auto: true }), row.id);
        translated += 1;
      } catch { failed += 1; }
    }
    return res.json({ ok: true, translated, skipped, failed });
  });

  // Merge a duplicate title into the main one: members' list entries, reviews, stack items and favourites move over
  // (where the member has no entry for the main title yet), then the duplicate is deleted (and can be reverted as a row).
  app.post('/api/admin/x/catalog/merge', requireAdmin, (req, res) => {
    const type = req.body?.type === 'manga' ? 'manga' : 'anime';
    const from = String(req.body?.from || '').slice(0, 200);
    const into = String(req.body?.into || '').slice(0, 200);
    if (!from || !into || from === into) return bad(res, 'Two different titles are required');
    const a = db.prepare(`SELECT * FROM ${type} WHERE slug = ?`).get(from);
    const b = db.prepare(`SELECT * FROM ${type} WHERE slug = ?`).get(into);
    if (!a || !b) return bad(res, 'Title not found', 404);
    const moved = {};
    db.exec('BEGIN');
    try {
      moved.entries = db.prepare('UPDATE OR IGNORE user_entries SET slug = ? WHERE media_type = ? AND slug = ?').run(into, type, from).changes;
      db.prepare('DELETE FROM user_entries WHERE media_type = ? AND slug = ?').run(type, from);
      moved.reviews = db.prepare('UPDATE OR IGNORE reviews SET slug = ? WHERE media_type = ? AND slug = ?').run(into, type, from).changes;
      db.prepare('DELETE FROM reviews WHERE media_type = ? AND slug = ?').run(type, from);
      moved.stacks = db.prepare('UPDATE OR IGNORE stack_items SET slug = ? WHERE media_type = ? AND slug = ?').run(into, type, from).changes;
      db.prepare('DELETE FROM stack_items WHERE media_type = ? AND slug = ?').run(type, from);
      moved.favorites = db.prepare('UPDATE OR IGNORE favorites SET ref = ? WHERE kind = ? AND ref = ?').run(into, type, from).changes;
      db.prepare('DELETE FROM favorites WHERE kind = ? AND ref = ?').run(type, from);
      db.prepare('DELETE FROM recs WHERE media_type = ? AND (slug_a = ? OR slug_b = ?)').run(type, from, from); // pairs are ordered; simply dropped
      saveRevision(req.admin?.username || '', type, a, 'merge');
      db.prepare(`DELETE FROM ${type} WHERE id = ?`).run(a.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return res.json({ ok: true, moved });
  });

  // What the weekly owner report would say right now (the real one goes out Saturday morning).
  app.get('/api/admin/x/system/weekly-report', requireAdmin, (_req, res) => res.json({ text: buildWeeklyReport(), enabled: reportEnabled() }));

  // Extra queue counts for the dashboard (cheap).
  app.get('/api/admin/x/community/queues', requireAdmin, (_req, res) => {
    res.json({ searchMisses: db.prepare('SELECT COUNT(*) AS n FROM search_misses').get().n, clientErrors: clientErrorsLast(), reports: openReportCount() });
  });
};
