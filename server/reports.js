import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { notifyReportResult } from './notifications.js';
import { eventAlert } from './event-alerts.js';
import { siteUrl } from './mailer.js';

// "Report" button on reviews, suggestions (recs) and profiles. A member reports with a short reason; the owner sees an
// open queue in the admin panel and marks each as handled or dismissed. Reporting never hides anything by itself.
db.exec(`
CREATE TABLE IF NOT EXISTS content_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('review', 'rec', 'user')),
  ref TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status, id);
`);
// What the owner told the reporter when closing the report (shown in the member's notifications).
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('content_reports') WHERE name = 'note'").get().n) {
  db.exec("ALTER TABLE content_reports ADD COLUMN note TEXT NOT NULL DEFAULT ''");
}

export const openReportCount = () => db.prepare("SELECT COUNT(*) AS n FROM content_reports WHERE status = 'open'").get().n;

// What was reported, as text for the admin (empty when the content is gone).
const subjectOf = (kind, ref) => {
  if (kind === 'review') {
    const r = db.prepare('SELECT r.body, r.media_type, r.slug, u.username FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?').get(Number(ref));
    return r ? { by: r.username, text: r.body.slice(0, 300), where: `${r.media_type}/${r.slug}` } : null;
  }
  if (kind === 'rec') {
    const r = db.prepare('SELECT r.body, r.media_type, r.slug_a, r.slug_b, u.username FROM recs r JOIN users u ON u.id = r.user_id WHERE r.id = ?').get(Number(ref));
    return r ? { by: r.username, text: r.body.slice(0, 300), where: `${r.media_type}/${r.slug_a} ↔ ${r.slug_b}` } : null;
  }
  const u = db.prepare('SELECT username, bio FROM users WHERE username = ? COLLATE NOCASE').get(String(ref));
  return u ? { by: u.username, text: String(u.bio || '').slice(0, 300), where: `/user/${u.username}` } : null;
};

export const registerReportRoutes = (app, { requireSiteUser, userIdOf }) => {
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many reports. Try again later.' } });
  app.post('/api/user/reports', requireSiteUser, limiter, (req, res) => {
    const kind = ['review', 'rec', 'user'].includes(req.body?.kind) ? req.body.kind : '';
    const ref = String(req.body?.ref ?? '').trim().slice(0, 80);
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!kind || !ref) { res.status(400).json({ error: 'Nothing to report' }); return; }
    if (!subjectOf(kind, ref)) { res.status(404).json({ error: 'Not found' }); return; }
    const added = db.prepare('INSERT OR IGNORE INTO content_reports (user_id, kind, ref, reason) VALUES (?, ?, ?, ?)').run(userIdOf(req), kind, ref, reason).changes;
    if (added) eventAlert('report', `🚩 گزارش تازه از یک عضو (${kind}). منتظر رسیدگی: ${openReportCount()}. ${siteUrl()}/admin/reports`);
    res.json({ ok: true });
  });

  app.get('/api/admin/x/reports', requireAdmin, (req, res) => {
    const status = ['open', 'done', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    const rows = db.prepare(`
      SELECT c.id, c.kind, c.ref, c.reason, c.note, c.status, c.created_at AS createdAt, u.username AS reporter,
        (SELECT COUNT(*) FROM content_reports x WHERE x.kind = c.kind AND x.ref = c.ref) AS times
      FROM content_reports c JOIN users u ON u.id = c.user_id WHERE c.status = ? ORDER BY c.id DESC LIMIT 100`).all(status);
    res.json({ items: rows.map((row) => ({ ...row, subject: subjectOf(row.kind, row.ref) })), open: openReportCount() });
  });
  app.post('/api/admin/x/reports/:id', requireAdmin, (req, res) => {
    const status = req.body?.status === 'dismissed' ? 'dismissed' : 'done';
    const id = Number.parseInt(req.params.id, 10);
    const note = String(req.body?.note || '').trim().slice(0, 300);
    const { changes } = db.prepare("UPDATE content_reports SET status = ?, note = ? WHERE id = ? AND status = 'open'").run(status, note, id);
    if (!changes) { res.status(404).json({ error: 'Not found' }); return; }
    const reporter = db.prepare('SELECT user_id FROM content_reports WHERE id = ?').get(id);
    if (reporter) notifyReportResult(reporter.user_id, id);
    res.json({ ok: true });
  });
};
