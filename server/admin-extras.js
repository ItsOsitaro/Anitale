// Admin panel extras: permission gate, an activity log of every change made through the admin
// API (with who did it), the dashboard overview, sorted/filtered title lists, and the hook points
// where each admin page group can add its own endpoints (server/admin-<group>.js).
import os from 'node:os';
import fs from 'node:fs';
import { db, ROOT_DIR } from './db.js';
import { requireAdmin, currentAdmin } from './auth.js';
import { adminGate, registerAdminAccountRoutes } from './admin-accounts.js';
import { importAllState } from './import-all.js';
import { getAutoImportState } from './auto-import.js';
import { register as registerCatalog } from './admin-catalog.js';
import { register as registerImport } from './admin-import.js';
import { register as registerTranslate } from './admin-translate.js';
import { register as registerCommunity } from './admin-community.js';
import { registerAliasRoutes } from './search-aliases.js';
import { registerAdminTools } from './admin-tools.js';
import { register as registerSystem } from './admin-system.js';

db.exec(`
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  ms INTEGER NOT NULL DEFAULT 0
);
`);
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('admin_log') WHERE name = 'admin'").get().n) {
  db.exec("ALTER TABLE admin_log ADD COLUMN admin TEXT NOT NULL DEFAULT ''");
}

const KEEP_ROWS = 3000;
const insertLog = db.prepare('INSERT INTO admin_log (method, path, status, ms, admin) VALUES (?, ?, ?, ?, ?)');
let writes = 0;

// Only changes made by an admin session count: writes under /api/admin and the title CRUD routes.
const isAdminWrite = (req) => !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  && (req.path.startsWith('/api/admin/') || /^\/api\/(anime|manga)(\/|$)/.test(req.path));

export const registerAdminExtras = (app) => {
  // The log goes first so refused attempts (403) are recorded too; unauthenticated 401s are skipped (bot noise).
  app.use((req, res, next) => {
    if (!isAdminWrite(req)) return next();
    const started = Date.now();
    res.on('finish', () => {
      try {
        if (res.statusCode === 401) return;
        insertLog.run(req.method, req.path.slice(0, 200), res.statusCode, Date.now() - started, req.admin?.username || currentAdmin(req)?.username || '');
        writes += 1;
        if (writes % 200 === 0) db.prepare('DELETE FROM admin_log WHERE id <= (SELECT MAX(id) FROM admin_log) - ?').run(KEEP_ROWS);
      } catch { /* logging must never break a request */ }
    });
    return next();
  });
  app.use(adminGate);

  registerAdminAccountRoutes(app);

  // Numbers for the sidebar badges and the dashboard.
  app.get('/api/admin/overview', requireAdmin, (req, res) => {
    const n = (sql, ...args) => db.prepare(sql).get(...args).n;
    const week = "datetime('now', '-7 days')";
    let disk = null;
    try {
      const s = fs.statfsSync(ROOT_DIR);
      disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
    } catch { /* not available everywhere */ }
    res.json({
      badges: {
        suggestions: n("SELECT COUNT(*) AS n FROM edit_suggestions WHERE status = 'pending'"),
        missing: n('SELECT COUNT(*) AS n FROM missing_titles'),
      },
      attention: {
        noCover: n("SELECT COUNT(*) AS n FROM anime WHERE cover = ''"),
        noPersian: n("SELECT COUNT(*) AS n FROM anime WHERE synopsis NOT LIKE '%\"fa\":\"_%'"),
        noScore: n('SELECT COUNT(*) AS n FROM anime WHERE score IS NULL'),
        noMal: n('SELECT COUNT(*) AS n FROM anime WHERE mal_id IS NULL'),
      },
      counts: {
        anime: n('SELECT COUNT(*) AS n FROM anime'),
        manga: n('SELECT COUNT(*) AS n FROM manga'),
        users: n('SELECT COUNT(*) AS n FROM users'),
        entries: n('SELECT COUNT(*) AS n FROM user_entries'),
        admins: n('SELECT COUNT(*) AS n FROM admins') + (process.env.ADMIN_USER ? 1 : 0),
      },
      week: {
        users: n(`SELECT COUNT(*) AS n FROM users WHERE created_at >= ${week}`),
        reviews: n(`SELECT COUNT(*) AS n FROM reviews WHERE created_at >= ${week}`),
        titles: n(`SELECT COUNT(*) AS n FROM anime WHERE created_at >= ${week}`) + n(`SELECT COUNT(*) AS n FROM manga WHERE created_at >= ${week}`),
      },
      recent: db.prepare('SELECT id, at, method, path, status, admin FROM admin_log ORDER BY id DESC LIMIT 8').all(),
      importAll: importAllState(),
      autoImport: getAutoImportState(),
      system: { rss: process.memoryUsage().rss, uptimeSec: Math.round(process.uptime()), load: os.loadavg()[0], totalMem: os.totalmem(), disk },
    });
  });

  // Activity log: filters (admin, ok/fail, method, date range, path text), paging and CSV export.
  app.get('/api/admin/log', requireAdmin, (req, res) => {
    const q = req.query;
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 300);
    const offset = Math.min(Math.max(Number(q.offset) || 0, 0), 100000);
    const where = [];
    const args = [];
    const who = String(q.admin || '').slice(0, 40);
    if (who) { where.push('admin = ?'); args.push(who); }
    if (q.status === 'ok') where.push('status < 400');
    else if (q.status === 'fail') where.push('status >= 400');
    const method = String(q.method || '').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) { where.push('method = ?'); args.push(method); }
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
    if (date(q.from)) { where.push('at >= ?'); args.push(`${date(q.from)} 00:00:00`); }
    if (date(q.to)) { where.push('at <= ?'); args.push(`${date(q.to)} 23:59:59`); }
    const text = String(q.q || '').trim().slice(0, 80);
    if (text) { where.push("path LIKE ? ESCAPE '!'"); args.push(`%${text.replace(/[!%_]/g, '!$&')}%`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    if (q.format === 'csv') {
      const all = db.prepare(`SELECT at, admin, method, path, status, ms FROM admin_log ${clause} ORDER BY id DESC LIMIT 3000`).all(...args);
      // Prefix risky cells so spreadsheets never run them as formulas.
      const cell = (v) => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
      const lines = all.map((r) => [r.at, r.admin, r.method, r.path, r.status, r.ms].map(cell).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="admin-log.csv"');
      res.send(['﻿at,admin,method,path,status,ms', ...lines].join('\r\n'));
      return;
    }
    const total = db.prepare(`SELECT COUNT(*) AS n FROM admin_log ${clause}`).get(...args).n;
    const items = db.prepare(`SELECT id, at, method, path, status, ms, admin FROM admin_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    const admins = db.prepare("SELECT DISTINCT admin FROM admin_log WHERE admin <> '' ORDER BY admin").all().map((r) => r.admin);
    // Failed count for the same filters (except the result filter), so the page can show "N failed".
    const failClause = clause ? `${clause} AND status >= 400` : 'WHERE status >= 400';
    const failed = q.status === 'ok' ? 0 : q.status === 'fail' ? total : db.prepare(`SELECT COUNT(*) AS n FROM admin_log ${failClause}`).get(...args).n;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items, total, admins, failed });
  });

  // One module per page group; each adds its own endpoints under /api/admin/x/<area>/...
  registerCatalog(app);
  registerImport(app);
  registerTranslate(app);
  registerCommunity(app);
  registerAliasRoutes(app);
  registerAdminTools(app);
  registerSystem(app);
};

// Sort + filter for the admin title list (all values are whitelisted, never pasted from the query).
export const ANIME_SORTS = {
  updated: 'updated_at DESC, id DESC',
  title: 'title COLLATE NOCASE ASC',
  score: 'score DESC NULLS LAST, id DESC',
  year: 'year DESC, id DESC',
  members: 'members DESC, id DESC',
};
export const ANIME_FILTERS = {
  noCover: "cover = ''",
  noPersian: "synopsis NOT LIKE '%\"fa\":\"_%'",
  noScore: 'score IS NULL',
  noMal: 'mal_id IS NULL',
};
