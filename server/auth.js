import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const COOKIE = 'mal_admin';
const TTL_SECONDS = 7 * 24 * 60 * 60;
// Admin cookies cover every mutation on the site; a daily expiry bounds how
// long a stolen or stale session stays useful.
const ADMIN_TTL_SECONDS = 24 * 60 * 60;

let secret = process.env.SESSION_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] SESSION_SECRET is not set; using a temporary one (you will be logged out on every restart). Run: npm run setup-admin');
}

const b64 = (value) => Buffer.from(value).toString('base64url');
const hmac = (value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const createToken = (user, kind, extra = {}, ttlSeconds = TTL_SECONDS) => {
  const body = b64(JSON.stringify({ u: user, kind, exp: Math.floor(Date.now() / 1000) + ttlSeconds, ...extra }));
  return `${body}.${hmac(body)}`;
};

const readToken = (token) => {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!safeEqual(signature, hmac(body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
};

const parseCookies = (header = '') => Object.fromEntries(
  header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }),
);

// Admin sessions: every admin login gets a row (id carried in the cookie) so the owner can see where admins are signed in
// and end one. A cookie from before this existed has no id and keeps working until it expires (1 day).
db.exec(`
CREATE TABLE IF NOT EXISTS admin_sessions (
  sid TEXT PRIMARY KEY,
  admin TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  ua TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS admin_ips (
  admin TEXT NOT NULL,
  ip TEXT NOT NULL,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (admin, ip)
);
`);
const seenAt = new Map(); // sid -> last time last_seen was written (at most once a minute per session)
export const listAdminSessions = () => db.prepare("SELECT sid, admin, ip, ua, created_at AS createdAt, last_seen AS lastSeen FROM admin_sessions WHERE revoked = 0 AND created_at >= datetime('now', '-1 day') ORDER BY last_seen DESC LIMIT 100").all();
export const revokeAdminSession = (sid) => db.prepare('UPDATE admin_sessions SET revoked = 1 WHERE sid = ?').run(String(sid)).changes;
export const revokeOtherAdminSessions = (keepSid) => db.prepare('UPDATE admin_sessions SET revoked = 1 WHERE sid != ? AND revoked = 0').run(String(keepSid || '')).changes;
export const currentSid = (req) => readToken(parseCookies(req.headers.cookie)[COOKIE])?.sid || '';

// The signed-in admin: { username, owner, permissions, id } or null. An extra admin's cookie is
// re-checked against the table on every request (disabled / deleted / password reset = signed out).
export const currentAdmin = (req) => {
  const payload = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  if (payload?.kind !== 'admin') return null;
  if (payload.sid) {
    const session = db.prepare('SELECT revoked FROM admin_sessions WHERE sid = ?').get(payload.sid);
    if (!session || session.revoked) return null; // ended by the owner (or the row was cleaned up)
    const now = Date.now();
    if (now - (seenAt.get(payload.sid) || 0) > 60000) { seenAt.set(payload.sid, now); db.prepare("UPDATE admin_sessions SET last_seen = datetime('now') WHERE sid = ?").run(payload.sid); }
  }
  if (process.env.ADMIN_USER && safeEqual(payload.u, process.env.ADMIN_USER)) return { username: payload.u, owner: true, permissions: {}, id: 0 };
  const row = adminRow(payload.u);
  if (!row || !row.active || Number(row.token_version) !== Number(payload.v ?? 0)) return null;
  let permissions = {};
  try { permissions = JSON.parse(row.permissions); } catch { /* bad JSON = no permissions */ }
  return { username: row.username, owner: false, permissions, id: row.id };
};

export const currentUser = (req) => currentAdmin(req)?.username ?? null;

export const isAuthConfigured = () => Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD_HASH);

export const isOwner = (username) => Boolean(process.env.ADMIN_USER) && safeEqual(String(username || '').toLowerCase(), process.env.ADMIN_USER.toLowerCase());
const adminRow = (username) => db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE').get(String(username || ''));
// Compared against when the username is unknown, so a wrong name and a wrong password take equally long.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Returns false, or { username, owner, version } for the owner (env) or an active extra admin.
export const verifyCredentials = async (username, password) => {
  if (isAuthConfigured() && isOwner(username)) {
    const passOk = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    return passOk ? { username: process.env.ADMIN_USER, owner: true, version: 0 } : false;
  }
  const row = adminRow(username);
  const passOk = await bcrypt.compare(password, row?.password_hash || DUMMY_HASH);
  if (!row || !row.active || !passOk) return false;
  db.prepare("UPDATE admins SET last_login = datetime('now') WHERE id = ?").run(row.id);
  return { username: row.username, owner: false, version: row.token_version };
};

// Cookie security flags: non-loopback requests always get Secure (HTTPS-only).
// Production deployments running behind PLAIN HTTP (LAN) must set
// NODE_ENV=development, otherwise cookies are marked Secure and browsers on
// http:// will drop them.
const secureFlag = (req) => {
  if (process.env.ALLOW_INSECURE_HTTP === '1') return '';
  if (process.env.NODE_ENV === 'production') return '; Secure';
  const host = String(req?.host || '');
  const local = ['127.0.0.1', '::1', 'localhost'].includes(host.replace(/:\d+$/, ''));
  return local ? '' : '; Secure';
};

export const setSession = (req, res, user, extra = {}) => {
  const sid = crypto.randomBytes(12).toString('base64url');
  const ip = String(req.ip || '').slice(0, 64);
  db.prepare('INSERT INTO admin_sessions (sid, admin, ip, ua) VALUES (?, ?, ?, ?)').run(sid, String(user), ip, String(req.headers['user-agent'] || '').slice(0, 200));
  if (Math.random() < 0.1) db.prepare("DELETE FROM admin_sessions WHERE created_at < datetime('now', '-30 days')").run();
  // A sign-in from an address this admin never used before is reported to the owner's chat (the first ever one is just recorded).
  const known = db.prepare('SELECT COUNT(*) AS n FROM admin_ips WHERE admin = ?').get(String(user)).n;
  const isNew = db.prepare('INSERT OR IGNORE INTO admin_ips (admin, ip) VALUES (?, ?)').run(String(user), ip).changes > 0;
  if (isNew && known > 0) import('./chat-bots.js').then((m) => m.sendAlert(`🔐 ورود ادمین «${user}» از نشانی تازه: ${ip}`)).catch(() => {});
  res.setHeader('Set-Cookie', `${COOKIE}=${createToken(user, 'admin', { ...extra, sid }, ADMIN_TTL_SECONDS)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_TTL_SECONDS}${secureFlag(req)}`);
};

export const clearSession = (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag(req)}`);
};

// ---------- Site-user sessions (separate cookie, same signing machinery) ----------
const USER_COOKIE = 'mal_user';
const userTokenVersion = (username) => db
  .prepare('SELECT token_version FROM users WHERE username = ? COLLATE NOCASE')
  .get(String(username || '').trim())?.token_version ?? 0;

export const setUserSession = (req, res, username) => {
  const maxAge = TTL_SECONDS * 4;
  res.setHeader('Set-Cookie', `${USER_COOKIE}=${createToken(username, 'user', { v: userTokenVersion(username) }, maxAge)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureFlag(req)}`);
};

export const clearUserSession = (req, res) => {
  res.setHeader('Set-Cookie', `${USER_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag(req)}`);
};

export const currentSiteUser = (req) => {
  const payload = readToken(parseCookies(req.headers.cookie)[USER_COOKIE]);
  return payload?.kind === 'user' ? payload.u : null;
};

// Verifies the cookie AND that the user row still exists with the token
// version current (password changes / deletes bump or remove the row).
export const requireSiteUser = (req, res, next) => {
  const username = currentSiteUser(req);
  const payload = readToken(parseCookies(req.headers.cookie)[USER_COOKIE]);
  if (!username || !payload) return res.status(401).json({ error: 'Not logged in' });
  const row = db.prepare('SELECT token_version, banned_until FROM users WHERE username = ? COLLATE NOCASE').get(username);
  // Tokens issued before this column existed carry no v; they read as version 0.
  if (!row || Number(row.token_version ?? 0) !== Number(payload.v ?? 0)) return res.status(401).json({ error: 'Not logged in' });
  if (row.banned_until && row.banned_until > new Date().toISOString()) return res.status(403).json({ error: 'This account is suspended' });
  return next();
};

export const userTokenValid = (userRow, req) => {
  const username = currentSiteUser(req);
  return Boolean(username && userRow && username === String(userRow.username) && Number(userRow.token_version ?? 0) === Number(readToken(parseCookies(req.headers.cookie)[USER_COOKIE])?.v ?? 0));
};

// Blocks cross-site writes (extra protection on top of SameSite=Strict).
// GET/HEAD/OPTIONS stay open; every state-changing method must carry a
// same-origin Origin or Referer header (browsers always send one).
export const sameOriginOnly = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path === '/csp-report') return next(); // browsers send violation reports without an Origin; the endpoint only logs, capped
  const source = req.headers.origin || req.headers.referer;
  if (!source) return res.status(403).json({ error: 'Missing Origin/Referer header' });
  try {
    // Behind the Vite dev proxy the Host header is rewritten, so the proxy forwards the browser's host separately.
    // Only honour that forwarded host when the deployment explicitly trusts its proxy.
    const expectedHost = (process.env.TRUST_PROXY === '1' ? req.headers['x-forwarded-host'] : undefined) || req.headers.host;
    if (new URL(source).host !== expectedHost) return res.status(403).json({ error: 'Cross-origin request blocked' });
  } catch {
    return res.status(403).json({ error: 'Bad origin' });
  }
  return next();
};

export const requireAdmin = (req, res, next) => {
  if (!currentUser(req)) return res.status(401).json({ error: 'Not logged in' });
  return next();
};
