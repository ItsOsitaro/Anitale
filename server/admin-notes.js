import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { getSetting, setSetting } from './settings.js';

// Notes only admins see (on a title or a member), and canned reasons for rejecting suggestions.
//   notes:  /api/admin/x/catalog/notes (titles, catalog area) and /api/admin/x/users/notes (members, users area)
//   canned: /api/admin/x/reviews/canned (reviews area): a short list of ready-made reasons, shared by all admins
db.exec(`
CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('anime', 'manga', 'user')),
  ref TEXT NOT NULL,
  body TEXT NOT NULL,
  admin TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_notes_ref ON admin_notes(kind, ref);
`);

const noteRoutes = (app, base, kinds, refOf) => {
  app.get(base, requireAdmin, (req, res) => {
    const { kind, ref } = refOf(req.query);
    if (!kinds.includes(kind) || !ref) { res.json({ items: [] }); return; }
    res.json({ items: db.prepare('SELECT id, body, admin, created_at AS createdAt FROM admin_notes WHERE kind = ? AND ref = ? ORDER BY id DESC LIMIT 50').all(kind, ref) });
  });
  app.post(base, requireAdmin, (req, res) => {
    const { kind, ref } = refOf(req.body || {});
    const body = String(req.body?.body || '').trim().slice(0, 1000);
    if (!kinds.includes(kind) || !ref || !body) { res.status(400).json({ error: 'Note text is required' }); return; }
    db.prepare('INSERT INTO admin_notes (kind, ref, body, admin) VALUES (?, ?, ?, ?)').run(kind, ref, body, req.admin?.username || '');
    res.json({ ok: true });
  });
  app.delete(`${base}/:id`, requireAdmin, (req, res) => {
    const row = db.prepare('SELECT kind FROM admin_notes WHERE id = ?').get(Number.parseInt(req.params.id, 10));
    if (!row || !kinds.includes(row.kind)) { res.status(404).json({ error: 'Not found' }); return; }
    db.prepare('DELETE FROM admin_notes WHERE id = ?').run(Number.parseInt(req.params.id, 10));
    res.json({ ok: true });
  });
};

const CANNED_DEFAULT = ['Duplicate of an existing suggestion', 'The current text is correct', 'Not enough detail to apply'];
const readCanned = () => { try { const list = JSON.parse(getSetting('admin.canned', '')); return Array.isArray(list) ? list : CANNED_DEFAULT; } catch { return CANNED_DEFAULT; } };

export const registerAdminNotes = (app) => {
  noteRoutes(app, '/api/admin/x/catalog/notes', ['anime', 'manga'], (src) => ({ kind: src.type === 'manga' ? 'manga' : 'anime', ref: String(src.slug || '').slice(0, 200) }));
  noteRoutes(app, '/api/admin/x/users/notes', ['user'], (src) => ({ kind: 'user', ref: String(src.username || '').toLowerCase().slice(0, 64) }));
  app.get('/api/admin/x/reviews/canned', requireAdmin, (_req, res) => res.json({ items: readCanned() }));
  app.put('/api/admin/x/reviews/canned', requireAdmin, (req, res) => {
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).map((s) => String(s).trim().slice(0, 300)).filter((s) => s.length >= 3).slice(0, 20);
    setSetting('admin.canned', JSON.stringify(items));
    res.json({ items });
  });
};
