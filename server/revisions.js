import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { exportData } from './export-data.js';

// Undo for admin edits. Before an admin changes or deletes a title (edit form, refresh, delete, bulk genre) the whole
// row is stored here; "Revert" puts that row back. Covers are files and are not part of it: a revert restores the data
// (and the cover file name it pointed to), not a deleted image. Only the newest KEEP revisions are kept.
db.exec(`
CREATE TABLE IF NOT EXISTS admin_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  admin TEXT NOT NULL DEFAULT '',
  tbl TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  data TEXT NOT NULL,
  reverted INTEGER NOT NULL DEFAULT 0
);
`);

const KEEP = 400;
const TABLES = ['anime', 'manga'];
const insert = db.prepare('INSERT INTO admin_revisions (admin, tbl, row_id, slug, title, action, data) VALUES (?, ?, ?, ?, ?, ?, ?)');

export const saveRevision = (admin, tbl, row, action) => {
  if (!TABLES.includes(tbl) || !row) return;
  insert.run(admin || '', tbl, row.id, row.slug, String(row.title || '').slice(0, 200), action, JSON.stringify(row));
  if (Math.random() < 0.05) db.prepare('DELETE FROM admin_revisions WHERE id <= (SELECT MAX(id) FROM admin_revisions) - ?').run(KEEP);
};

const ROUTE = /^\/api\/(?:admin\/)?(anime|manga)\/([^/]+?)(?:\/(airing-day|refresh))?$/;

// Middleware: remember the row as it is before a write route runs, and keep it once the write succeeded.
export const captureRevisions = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const match = ROUTE.exec(req.path);
  if (!match || match[2] === 'refresh-all') return next();
  const [, tbl, slug, suffix] = match;
  let before = null;
  try { before = db.prepare(`SELECT * FROM ${tbl} WHERE slug = ?`).get(decodeURIComponent(slug)); } catch { /* unreadable: no revision */ }
  if (!before) return next();
  const action = req.method === 'DELETE' ? 'delete' : suffix === 'refresh' ? 'refresh' : 'edit';
  res.on('finish', () => {
    try {
      if (res.statusCode < 400) saveRevision(req.admin?.username || '', tbl, before, action);
    } catch { /* never break a request */ }
  });
  return next();
};

export const revertRevision = (id) => {
  const rev = db.prepare('SELECT * FROM admin_revisions WHERE id = ?').get(id);
  if (!rev || rev.reverted) return null;
  const row = JSON.parse(rev.data);
  const cols = Object.keys(row).filter((c) => c !== 'id');
  db.exec('BEGIN');
  try {
    const exists = db.prepare(`SELECT 1 FROM ${rev.tbl} WHERE id = ?`).get(rev.row_id);
    if (exists) db.prepare(`UPDATE ${rev.tbl} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => row[c]), rev.row_id);
    else db.prepare(`INSERT INTO ${rev.tbl} (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`).run(rev.row_id, ...cols.map((c) => row[c]));
    db.prepare('UPDATE admin_revisions SET reverted = 1 WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  try { exportData(); } catch { /* the static fallback is refreshed on the next edit anyway */ }
  return { slug: rev.slug, tbl: rev.tbl, action: rev.action };
};

export const registerRevisionRoutes = (app) => {
  app.get('/api/admin/x/system/revisions', requireAdmin, (req, res) => {
    // ?q= finds one title's whole history by (part of) its name or slug.
    const q = String(req.query.q || '').trim().slice(0, 80).replace(/[%_\\]/g, '\\$&');
    const like = `%${q}%`;
    const rows = q
      ? db.prepare("SELECT id, at, admin, tbl, slug, title, action, reverted FROM admin_revisions WHERE title LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 200").all(like, like)
      : db.prepare('SELECT id, at, admin, tbl, slug, title, action, reverted FROM admin_revisions ORDER BY id DESC LIMIT 100').all();
    res.json({ items: rows });
  });
  app.post('/api/admin/x/system/revisions/:id/revert', requireAdmin, (req, res) => {
    const done = revertRevision(Number.parseInt(req.params.id, 10));
    if (!done) { res.status(404).json({ error: 'Nothing to revert' }); return; }
    res.json({ ok: true, ...done });
  });
};
