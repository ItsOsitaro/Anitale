import crypto from 'node:crypto';
import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { siteUrl } from './mailer.js';

// Optional two-step sign-in for admins: a 6-digit code from an authenticator app (Google Authenticator, Aegis, ...),
// standard TOTP (RFC 6238: HMAC-SHA1, 30 s steps, 6 digits). Each admin turns it on for their own account.
// A code is accepted once only (last_step), with one step of clock drift allowed either way.
// Emergency exit if the phone is lost: set DISABLE_ADMIN_2FA=1 in server/.env and restart; sign in, turn it off here, remove the line.
db.exec(`
CREATE TABLE IF NOT EXISTS admin_totp (
  admin TEXT PRIMARY KEY COLLATE NOCASE,
  secret TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_step INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const base32 = (buffer) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};
const unbase32 = (text) => {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(text).toUpperCase().replace(/=+$/, '')) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
};

export const codeAt = (secret, step) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', unbase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
};

// The step a code matches (now, one before, one after), or 0.
const matchStep = (secret, code, now = Date.now()) => {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return 0;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    const expected = Buffer.from(codeAt(secret, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return 0;
};

const row = (admin) => db.prepare('SELECT * FROM admin_totp WHERE admin = ?').get(String(admin));
export const totpRequired = (admin) => process.env.DISABLE_ADMIN_2FA !== '1' && Boolean(row(admin)?.enabled);

// True for a fresh, correct code (and remembers it so it cannot be used twice).
export const checkTotp = (admin, code, now = Date.now()) => {
  const r = row(admin);
  if (!r) return false;
  const step = matchStep(r.secret, code, now);
  if (!step || step <= r.last_step) return false;
  db.prepare('UPDATE admin_totp SET last_step = ? WHERE admin = ?').run(step, String(admin));
  return true;
};

export const registerTotpRoutes = (app) => {
  const me = (req) => req.admin?.username || '';
  app.get('/api/admin/me/2fa', requireAdmin, (req, res) => res.json({ enabled: Boolean(row(me(req))?.enabled), suspended: process.env.DISABLE_ADMIN_2FA === '1' }));
  // Step 1: a new secret (not active yet). The admin adds it to the app by typing the key or opening the link.
  app.post('/api/admin/me/2fa/start', requireAdmin, (req, res) => {
    if (row(me(req))?.enabled) { res.status(409).json({ error: 'Already on' }); return; }
    const secret = base32(crypto.randomBytes(20));
    db.prepare('INSERT OR REPLACE INTO admin_totp (admin, secret, enabled, last_step) VALUES (?, ?, 0, 0)').run(me(req), secret);
    const issuer = new URL(siteUrl()).hostname;
    res.json({ secret, uri: `otpauth://totp/${encodeURIComponent(`${issuer}:${me(req)}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30` });
  });
  // Step 2: prove the app shows the right codes, then it is on.
  app.post('/api/admin/me/2fa/enable', requireAdmin, (req, res) => {
    const r = row(me(req));
    if (!r || r.enabled) { res.status(409).json({ error: 'Start first' }); return; }
    if (!checkTotp(me(req), req.body?.code)) { res.status(400).json({ error: 'That code is not right' }); return; }
    db.prepare('UPDATE admin_totp SET enabled = 1 WHERE admin = ?').run(me(req));
    res.json({ ok: true });
  });
  // Turning it off needs a current code (a stolen session alone cannot switch it off).
  app.post('/api/admin/me/2fa/disable', requireAdmin, (req, res) => {
    const r = row(me(req));
    if (!r) { res.json({ ok: true }); return; }
    if (r.enabled && !checkTotp(me(req), req.body?.code)) { res.status(400).json({ error: 'That code is not right' }); return; }
    db.prepare('DELETE FROM admin_totp WHERE admin = ?').run(me(req));
    res.json({ ok: true });
  });
};
