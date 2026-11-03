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

export const currentUser = (req) => {
  const payload = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  if (payload?.kind !== 'admin' || !process.env.ADMIN_USER || !safeEqual(payload.u, process.env.ADMIN_USER)) return null;
  return payload.u;
};

export const isAuthConfigured = () => Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD_HASH);

export const verifyCredentials = async (username, password) => {
  if (!isAuthConfigured()) return false;
  const userOk = safeEqual(username, process.env.ADMIN_USER);
  const passOk = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  return userOk && passOk;
};

// Cookie security flags: non-loopback requests always get Secure (HTTPS-only).
// Production deployments running behind PLAIN HTTP (LAN) must set
// NODE_ENV=development, otherwise cookies are marked Secure and browsers on
// http:// will drop them.
const secureFlag = (req) => {
  if (process.env.NODE_ENV === 'production') return '; Secure';
  const host = String(req?.host || '');
  const local = ['127.0.0.1', '::1', 'localhost'].includes(host.replace(/:\d+$/, ''));
  return local ? '' : '; Secure';
};

export const setSession = (req, res, user) => {
  res.setHeader('Set-Cookie', `${COOKIE}=${createToken(user, 'admin', {}, ADMIN_TTL_SECONDS)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_TTL_SECONDS}${secureFlag(req)}`);
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
  const row = db.prepare('SELECT token_version FROM users WHERE username = ? COLLATE NOCASE').get(username);
  // Tokens issued before this column existed carry no v; they read as version 0.
  if (!row || Number(row.token_version ?? 0) !== Number(payload.v ?? 0)) return res.status(401).json({ error: 'Not logged in' });
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
