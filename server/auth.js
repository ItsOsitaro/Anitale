import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const COOKIE = 'mal_admin';
const TTL_SECONDS = 7 * 24 * 60 * 60;

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

const createToken = (user) => {
  const body = b64(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }));
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

export const currentUser = (req) => readToken(parseCookies(req.headers.cookie)[COOKIE])?.u || null;

export const isAuthConfigured = () => Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD_HASH);

export const verifyCredentials = async (username, password) => {
  if (!isAuthConfigured()) return false;
  const userOk = safeEqual(username, process.env.ADMIN_USER);
  const passOk = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  return userOk && passOk;
};

export const setSession = (res, user) => {
  res.setHeader('Set-Cookie', `${COOKIE}=${createToken(user)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL_SECONDS}`);
};

export const clearSession = (res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
};

// ---------- Site-user sessions (separate cookie, same signing machinery) ----------
const USER_COOKIE = 'mal_user';

export const setUserSession = (res, username) => {
  res.setHeader('Set-Cookie', `${USER_COOKIE}=${createToken(username)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL_SECONDS * 4}`);
};

export const clearUserSession = (res) => {
  res.setHeader('Set-Cookie', `${USER_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
};

export const currentSiteUser = (req) => readToken(parseCookies(req.headers.cookie)[USER_COOKIE])?.u || null;

export const requireSiteUser = (req, res, next) => {
  if (!currentSiteUser(req)) return res.status(401).json({ error: 'Not logged in' });
  return next();
};

// Blocks cross-site writes (extra protection on top of SameSite=Strict).
export const sameOriginOnly = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    try {
      // Behind the Vite dev proxy the Host header is rewritten, so the proxy forwards the browser's host separately.
      const expectedHost = req.headers['x-forwarded-host'] || req.headers.host;
      if (new URL(origin).host !== expectedHost) return res.status(403).json({ error: 'Cross-origin request blocked' });
    } catch {
      return res.status(403).json({ error: 'Bad origin' });
    }
  }
  return next();
};

export const requireAdmin = (req, res, next) => {
  if (!currentUser(req)) return res.status(401).json({ error: 'Not logged in' });
  return next();
};
