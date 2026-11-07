// Admin accounts with per-area permissions.
//
// The owner is the account from server/.env (ADMIN_USER): always full access, cannot be
// edited or deleted here. Other admins live in the `admins` table with a permission map
// { area: 'view' | 'edit' }. Every /api/admin/* request (and every title write under
// /api/anime and /api/manga) passes through `adminGate`, which maps the path to an area:
//   GET/HEAD  needs 'view' on the area,  any other method needs 'edit'.
// Unknown admin paths are owner-only, so a forgotten route can never open up by accident.
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { currentAdmin, isOwner, requireAdmin, setSession } from './auth.js';

export const AREAS = ['catalog', 'import', 'translate', 'community', 'users', 'system'];
const LEVELS = { view: 1, edit: 2 };

// First match wins, so the specific import routes come before the generic anime ones.
const RULES = [
  [/^\/api\/admin\/x\/(catalog|import|translate|community|users|system)(\/|$)/, (m) => m[1]],
  [/^\/api\/admin\/anime\/import-bulk(\/|$)/, 'import'],
  [/^\/api\/admin\/(import-all|auto-import|catalog)(\/|$)/, 'import'],
  [/^\/api\/admin\/(anime|manga|temp-cover)(\/|$)/, 'catalog'],
  [/^\/api\/admin\/translate(\/|$)/, 'translate'],
  [/^\/api\/admin\/(recs|reviews|suggestions|missing-titles)(\/|$)/, 'community'],
  [/^\/api\/admin\/users(\/|$)/, 'users'],
  [/^\/api\/admin\/(health|vpn|log)(\/|$)/, 'system'],
  [/^\/api\/admin\/(stats|overview|dashboard|me)(\/|$)/, 'any'],
  [/^\/api\/admin\/admins(\/|$)/, 'owner'],
  [/^\/api\/(anime|manga)(\/|$)/, 'catalog'],
];

const areaOf = (path) => {
  for (const [pattern, target] of RULES) {
    const match = pattern.exec(path);
    if (match) return typeof target === 'function' ? target(match) : target;
  }
  return path.startsWith('/api/admin/') ? 'owner' : null;
};

// POST routes that only read (a connectivity probe) count as 'view'.
const READ_ONLY_POSTS = /\/(probe|test)$/;
const needsLevel = (req) => (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || READ_ONLY_POSTS.test(req.path) ? 'view' : 'edit');

export const can = (admin, area, level = 'view') => {
  if (!admin) return false;
  if (admin.owner) return true;
  return (LEVELS[admin.permissions?.[area]] || 0) >= LEVELS[level];
};

// Express middleware: 403 when a logged-in admin lacks the permission for this path.
// Not logged in -> 401 here, so a route that forgets requireAdmin is still protected.
export const adminGate = (req, res, next) => {
  const isTitleWrite = /^\/api\/(anime|manga)(\/|$)/.test(req.path) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!req.path.startsWith('/api/admin/') && !isTitleWrite) return next();
  const admin = currentAdmin(req);
  if (!admin) {
    // Safety net: every admin path needs a signed-in admin, even a route that forgot requireAdmin.
    res.status(401).json({ error: 'Not logged in' });
    return undefined;
  }
  req.admin = admin;
  const area = areaOf(req.path);
  if (area === 'any') return next();
  const allowed = area === 'owner' || area === null ? admin.owner : can(admin, area, needsLevel(req));
  if (!allowed) {
    res.status(403).json({ error: 'You do not have permission for this action' });
    return undefined;
  }
  return next();
};

// ---------- management routes (owner only; /api/admin/admins) ----------
const cleanPermissions = (input) => {
  const out = {};
  for (const area of AREAS) {
    const level = input?.[area];
    if (level === 'view' || level === 'edit') out[area] = level;
  }
  return out;
};
const parse = (text) => { try { return JSON.parse(text); } catch { return {}; } };
const publicRow = (row) => ({
  id: row.id, username: row.username, label: row.label, permissions: parse(row.permissions), active: Boolean(row.active),
  createdAt: row.created_at, lastLogin: row.last_login, createdBy: row.created_by,
});
const USERNAME = /^[A-Za-z0-9_.-]{3,32}$/;
const MIN_PASSWORD = 10;
const fail = (status, message) => Object.assign(new Error(message), { status });

// A stolen session must not be able to guess the current password for a change: 5 wrong tries / 15 min per admin.
const pwFails = new Map();
const pwBlocked = (id) => {
  const entry = pwFails.get(id);
  if (!entry) return false;
  if (Date.now() - entry.at > 15 * 60_000) { pwFails.delete(id); return false; }
  return entry.n >= 5;
};
const pwFailed = (id) => { const entry = pwFails.get(id); pwFails.set(id, { n: (entry && Date.now() - entry.at <= 15 * 60_000 ? entry.n : 0) + 1, at: Date.now() }); };

export const registerAdminAccountRoutes = (app) => {
  app.get('/api/admin/admins', requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT * FROM admins ORDER BY id ASC').all();
    res.json({ owner: process.env.ADMIN_USER || '', areas: AREAS, items: rows.map(publicRow) });
  });

  app.post('/api/admin/admins', requireAdmin, async (req, res) => {
    const { username, password, label = '', permissions } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') throw fail(400, 'Username and password are required');
    if (!USERNAME.test(String(username || ''))) throw fail(400, 'Username: 3-32 letters, digits, dot, dash or underscore');
    if (isOwner(username)) throw fail(409, 'That username belongs to the owner account');
    if (String(password || '').length < MIN_PASSWORD) throw fail(400, `Password must be at least ${MIN_PASSWORD} characters`);
    if (db.prepare('SELECT 1 FROM admins WHERE username = ? COLLATE NOCASE').get(username)) throw fail(409, 'That username is already taken');
    const hash = await bcrypt.hash(String(password), 12);
    const info = db.prepare('INSERT INTO admins (username, password_hash, label, permissions, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(username, hash, String(label).slice(0, 60), JSON.stringify(cleanPermissions(permissions)), req.admin?.username || '');
    res.status(201).json(publicRow(db.prepare('SELECT * FROM admins WHERE id = ?').get(info.lastInsertRowid)));
  });

  app.patch('/api/admin/admins/:id', requireAdmin, async (req, res) => {
    const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(Number(req.params.id));
    if (!row) throw fail(404, 'Admin not found');
    const { label, permissions, active, password } = req.body || {};
    if ((label !== undefined && typeof label !== 'string') || (permissions !== undefined && (typeof permissions !== 'object' || permissions === null || Array.isArray(permissions)))) throw fail(400, 'Invalid label or permissions');
    if (password !== undefined && typeof password !== 'string') throw fail(400, 'Invalid password');
    let bump = false;
    if (label !== undefined) db.prepare('UPDATE admins SET label = ? WHERE id = ?').run(String(label).slice(0, 60), row.id);
    if (permissions !== undefined) db.prepare('UPDATE admins SET permissions = ? WHERE id = ?').run(JSON.stringify(cleanPermissions(permissions)), row.id);
    if (active !== undefined) {
      db.prepare('UPDATE admins SET active = ? WHERE id = ?').run(active ? 1 : 0, row.id);
      if (!active) bump = true;
    }
    if (password !== undefined) {
      if (String(password).length < MIN_PASSWORD) throw fail(400, `Password must be at least ${MIN_PASSWORD} characters`);
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(String(password), 12), row.id);
      bump = true;
    }
    if (bump) db.prepare('UPDATE admins SET token_version = token_version + 1 WHERE id = ?').run(row.id); // signs them out everywhere
    res.json(publicRow(db.prepare('SELECT * FROM admins WHERE id = ?').get(row.id)));
  });

  app.delete('/api/admin/admins/:id', requireAdmin, (req, res) => {
    const info = db.prepare('DELETE FROM admins WHERE id = ?').run(Number(req.params.id));
    if (!info.changes) throw fail(404, 'Admin not found');
    res.json({ ok: true });
  });

  // Any admin may change their own password (the owner's lives in server/.env).
  app.post('/api/admin/me/password', requireAdmin, async (req, res) => {
    const admin = req.admin || currentAdmin(req);
    if (!admin) throw fail(401, 'Not logged in');
    if (admin.owner) throw fail(400, 'The owner password is changed with: npm run setup-admin');
    const { current, next } = req.body || {};
    const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(admin.id);
    if (!row) throw fail(403, 'Current password is wrong');
    if (pwBlocked(row.id)) throw fail(429, 'Too many wrong passwords. Try again in 15 minutes.');
    if (!(await bcrypt.compare(String(current || ''), row.password_hash))) { pwFailed(row.id); throw fail(403, 'Current password is wrong'); }
    pwFails.delete(row.id);
    if (String(next || '').length < MIN_PASSWORD) throw fail(400, `Password must be at least ${MIN_PASSWORD} characters`);
    if (next === current) throw fail(400, 'The new password must be different from the current one');
    db.prepare('UPDATE admins SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(await bcrypt.hash(String(next), 12), row.id);
    setSession(req, res, row.username, { v: row.token_version + 1 });
    res.json({ ok: true });
  });
};
