import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { lastAirTime } from './chat-bots.js';
import { siteUrl } from './mailer.js';

// A personal calendar feed (.ics) of the weekly episodes of the anime a member is watching or plans to watch.
// Calendar apps subscribe to the URL and show the times in the viewer's own zone (Tehran for most members), so no
// time zone maths is needed on the page. The URL carries a secret token: whoever has the link can read this list
// of titles, so it can be replaced from the account page at any time.
db.exec(`
CREATE TABLE IF NOT EXISTS calendar_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const newToken = () => crypto.randomBytes(18).toString('base64url');

export const tokenFor = (userId, { reset = false } = {}) => {
  const row = db.prepare('SELECT token FROM calendar_tokens WHERE user_id = ?').get(userId);
  if (row && !reset) return row.token;
  const token = newToken();
  db.prepare('INSERT OR REPLACE INTO calendar_tokens (user_id, token) VALUES (?, ?)').run(userId, token);
  return token;
};

const esc = (text) => String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Lines may not exceed 75 octets: continue them with a leading space.
const fold = (line) => {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (parts.length ? 74 : 75)) { parts.push(current); current = ''; }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
};

const broadcastOf = (information) => {
  try { return (JSON.parse(information) || []).find((row) => row?.label === 'Broadcast')?.value || ''; } catch { return ''; }
};

export const buildCalendar = (userId, now = Date.now()) => {
  const rows = db.prepare(`
    SELECT a.slug, a.title, a.mal_id, a.airing_day, a.information FROM user_entries e
    JOIN anime a ON a.slug = e.slug
    WHERE e.user_id = ? AND e.media_type = 'anime' AND e.status IN ('watching', 'planned') AND a.airing_day != ''`).all(userId);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anitale//Episodes//FA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:انی‌تیل — قسمت‌های جدید', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H'];
  for (const row of rows) {
    const start = lastAirTime(row.airing_day, broadcastOf(row.information), now);
    if (start == null) continue; // no broadcast time known: it cannot be placed on a calendar
    lines.push(
      'BEGIN:VEVENT',
      `UID:${row.mal_id || row.slug}@anitale`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      'DURATION:PT30M',
      'RRULE:FREQ=WEEKLY',
      `SUMMARY:${esc(`📺 ${row.title}`)}`,
      `DESCRIPTION:${esc(`قسمت جدید در ژاپن پخش می‌شود.\n${siteUrl()}/anime/${row.slug}`)}`,
      `URL:${siteUrl()}/anime/${row.slug}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(row.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
};

export const registerCalendarRoutes = (app, { requireSiteUser, userIdOf, limiter }) => {
  const feedLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: 'Too many requests' });
  app.get('/api/user/calendar', requireSiteUser, (req, res) => res.json({ url: `${siteUrl()}/api/calendar/${tokenFor(userIdOf(req))}.ics` }));
  app.post('/api/user/calendar/reset', requireSiteUser, limiter, (req, res) => res.json({ url: `${siteUrl()}/api/calendar/${tokenFor(userIdOf(req), { reset: true })}.ics` }));
  app.get('/api/calendar/:token.ics', feedLimiter, (req, res) => {
    const row = db.prepare('SELECT user_id FROM calendar_tokens WHERE token = ?').get(req.params.token);
    if (!row) { res.status(404).type('text/plain').send('Not found'); return; }
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Robots-Tag', 'noindex');
    // ?download=1: a plain file download, which phones open in their calendar app (the webcal: link does nothing on many Android phones).
    if (req.query.download === '1') res.setHeader('Content-Disposition', 'attachment; filename="anitale.ics"');
    res.send(buildCalendar(row.user_id));
  });
};
