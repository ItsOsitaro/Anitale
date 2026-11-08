// Extra endpoints for the "community" admin pages. Add new routes under /api/admin/x/community/... only:
// the permission gate (server/admin-accounts.js) reads the area from that path (GET = view, other = edit).
// Site-user routes live under /api/admin/x/users/... (area "users").
import { db } from './db.js';
import { requireAdmin } from './auth.js';
import { bloomFor } from './users.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const toInt = (v, d, min, max) => Math.min(max, Math.max(min, Number.parseInt(v, 10) || d));
const likeOf = (q) => `%${String(q).trim().replace(/[%_\\]/g, '\\$&')}%`;
const iso = (s) => new Date(`${String(s).replace(' ', 'T')}Z`).toISOString();
// Prefix risky cells so spreadsheets never run them as formulas; quote everything.
const cell = (v) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
const sendCsv = (res, name, header, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(`﻿${[header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n')}\r\n`);
};
const pageOf = (req, def = 15) => {
  const limit = toInt(req.query.limit, def, 1, 50);
  const page = toInt(req.query.page, 1, 1, 100000);
  return { limit, page, offset: (page - 1) * limit };
};
const idList = (body) => {
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!ids.length) throw httpError(400, 'No ids given');
  if (ids.length > 100) throw httpError(400, 'At most 100 at a time');
  return [...new Set(ids)];
};
// Display title of a catalog row (empty when the title was removed).
const titleSql = (type, slug) => `COALESCE((SELECT title FROM anime WHERE ${type} = 'anime' AND slug = ${slug}), (SELECT title FROM manga WHERE ${type} = 'manga' AND slug = ${slug}), '')`;
const typeOf =(v) => (v === 'anime' || v === 'manga' ? v : '');

// ---- reviews ----
const reviewQuery = (query) => {
  const where = [];
  const args = [];
  const q = String(query.q || '').trim().slice(0, 100);
  if (q) { where.push(`(u.username LIKE ? ESCAPE '\\' OR r.body LIKE ? ESCAPE '\\' OR r.slug LIKE ? ESCAPE '\\' OR ${titleSql('r.media_type', 'r.slug')} LIKE ? ESCAPE '\\')`); args.push(...Array(4).fill(likeOf(q))); }
  if (typeOf(query.type)) { where.push('r.media_type = ?'); args.push(query.type); }
  if (query.spoiler === '1') where.push('r.spoiler = 1');
  if (query.voted === '1') where.push('EXISTS (SELECT 1 FROM review_votes v WHERE v.review_id = r.id)');
  const order = {
    old: 'r.created_at ASC, r.id ASC',
    long: 'LENGTH(r.body) DESC, r.id DESC',
    helpful: 'helpful DESC, r.id DESC',
    high: 'e.rating IS NULL, e.rating DESC, r.id DESC',
    low: 'e.rating IS NULL, e.rating ASC, r.id DESC',
  }[query.sort] || 'r.created_at DESC, r.id DESC';
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args, order };
};
const REVIEW_FROM = `FROM reviews r JOIN users u ON u.id = r.user_id
  LEFT JOIN user_entries e ON e.user_id = r.user_id AND e.media_type = r.media_type AND e.slug = r.slug`;
const REVIEW_COLS = `${titleSql('r.media_type', 'r.slug')} AS title, r.id, r.media_type, r.slug, r.body, r.spoiler, r.created_at, u.username, e.rating, (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS helpful`;
const reviewShape = (row) => ({
  id: row.id, username: row.username, mediaType: row.media_type, slug: row.slug, title: row.title || '', body: row.body,
  spoiler: Boolean(row.spoiler), rating: row.rating ?? null, helpful: row.helpful || 0, createdAt: iso(row.created_at),
});

// ---- recs ----
const recQuery = (query) => {
  const where = [];
  const args = [];
  const q = String(query.q || '').trim().slice(0, 100);
  if (q) { where.push(`(u.username LIKE ? ESCAPE '\\' OR r.body LIKE ? ESCAPE '\\' OR r.slug_a LIKE ? ESCAPE '\\' OR r.slug_b LIKE ? ESCAPE '\\' OR ${titleSql('r.media_type', 'r.slug_a')} LIKE ? ESCAPE '\\' OR ${titleSql('r.media_type', 'r.slug_b')} LIKE ? ESCAPE '\\')`); args.push(...Array(6).fill(likeOf(q))); }
  if (typeOf(query.type)) { where.push('r.media_type = ?'); args.push(query.type); }
  if (query.voted === '1') where.push('EXISTS (SELECT 1 FROM rec_votes v WHERE v.rec_id = r.id)');
  const order = { old: 'r.id ASC', helpful: 'helpful DESC, r.id DESC', long: 'LENGTH(r.body) DESC, r.id DESC' }[query.sort] || 'r.id DESC';
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args, order };
};
const REC_COLS = `${titleSql('r.media_type', 'r.slug_a')} AS title_a, ${titleSql('r.media_type', 'r.slug_b')} AS title_b, r.id, r.media_type, r.slug_a, r.slug_b, r.body, r.created_at, u.username, (SELECT COUNT(*) FROM rec_votes v WHERE v.rec_id = r.id) AS helpful`;
const recShape = (row) => ({
  id: row.id, username: row.username, mediaType: row.media_type, slugA: row.slug_a, slugB: row.slug_b, titleA: row.title_a || '', titleB: row.title_b || '', body: row.body,
  helpful: row.helpful || 0, createdAt: iso(row.created_at),
});

// ---- site users ----
const COUNTS = `(SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.media_type = 'anime') AS anime_count,
  (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.media_type = 'manga') AS manga_count`;
const userQuery = (query) => {
  const where = [];
  const args = [];
  const q = String(query.q || '').trim().slice(0, 60);
  if (q) { where.push("(u.username LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); args.push(likeOf(q), likeOf(q)); }
  if (query.filter === 'listed') where.push('EXISTS (SELECT 1 FROM user_entries e WHERE e.user_id = u.id)');
  else if (query.filter === 'empty') where.push('NOT EXISTS (SELECT 1 FROM user_entries e WHERE e.user_id = u.id)');
  else if (query.filter === 'verified') where.push('u.email_verified_at IS NOT NULL');
  else if (query.filter === 'unverified') where.push("u.email IS NOT NULL AND u.email <> '' AND u.email_verified_at IS NULL");
  const order = {
    old: 'u.id ASC', name: 'u.username COLLATE NOCASE ASC',
    entries: '(anime_count + manga_count) DESC, u.id DESC',
  }[query.sort] || 'u.id DESC';
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args, order };
};
const userShape = (row) => ({
  username: row.username, bio: row.bio || '', bloom: Number.parseInt(row.avatar_color, 10) || bloomFor(row.username), joined: row.created_at,
  animeCount: row.anime_count ?? 0, mangaCount: row.manga_count ?? 0, email: row.email || '', emailVerified: Boolean(row.email_verified_at),
  bannedUntil: row.banned_until && row.banned_until > new Date().toISOString() ? row.banned_until : '', banReason: row.ban_reason || '',
});

export const register = (app) => {
  // Reviews
  app.get('/api/admin/x/community/reviews', requireAdmin, (req, res) => {
    const { limit, page, offset } = pageOf(req);
    const { clause, args, order } = reviewQuery(req.query);
    const total = db.prepare(`SELECT COUNT(*) AS n ${REVIEW_FROM} ${clause}`).get(...args).n;
    const rows = db.prepare(`SELECT ${REVIEW_COLS} ${REVIEW_FROM} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
    const counts = db.prepare("SELECT COUNT(*) AS all_n, SUM(media_type = 'anime') AS anime, SUM(media_type = 'manga') AS manga, SUM(spoiler = 1) AS spoiler FROM reviews").get();
    const voted = db.prepare('SELECT COUNT(DISTINCT review_id) AS n FROM review_votes').get().n;
    res.json({ items: rows.map(reviewShape), total, page, pages: Math.max(1, Math.ceil(total / limit)), counts: { all: counts.all_n, anime: counts.anime || 0, manga: counts.manga || 0, spoiler: counts.spoiler || 0, voted } });
  });
  app.get('/api/admin/x/community/reviews/export.csv', requireAdmin, (req, res) => {
    const { clause, args, order } = reviewQuery(req.query);
    const rows = db.prepare(`SELECT ${REVIEW_COLS} ${REVIEW_FROM} ${clause} ORDER BY ${order} LIMIT 5000`).all(...args).map(reviewShape);
    sendCsv(res, 'reviews.csv', ['id', 'user', 'type', 'slug', 'title', 'rating', 'spoiler', 'helpful', 'date', 'text'],
      rows.map((r) => [r.id, r.username, r.mediaType, r.slug, r.title, r.rating ?? '', r.spoiler ? 1 : 0, r.helpful, r.createdAt, r.body]));
  });
  app.post('/api/admin/x/community/reviews/bulk-delete', requireAdmin, (req, res) => {
    const ids = idList(req.body);
    const mark = ids.map(() => '?').join(',');
    db.exec('BEGIN');
    try {
      db.prepare(`DELETE FROM review_votes WHERE review_id IN (${mark})`).run(...ids);
      const { changes } = db.prepare(`DELETE FROM reviews WHERE id IN (${mark})`).run(...ids);
      db.exec('COMMIT');
      res.json({ ok: true, deleted: changes });
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  });

  // Recommendations
  app.get('/api/admin/x/community/recs', requireAdmin, (req, res) => {
    const { limit, page, offset } = pageOf(req);
    const { clause, args, order } = recQuery(req.query);
    const from = 'FROM recs r JOIN users u ON u.id = r.user_id';
    const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...args).n;
    const rows = db.prepare(`SELECT ${REC_COLS} ${from} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
    const counts = db.prepare("SELECT COUNT(*) AS all_n, SUM(media_type = 'anime') AS anime, SUM(media_type = 'manga') AS manga FROM recs").get();
    const voted = db.prepare('SELECT COUNT(DISTINCT rec_id) AS n FROM rec_votes').get().n;
    res.json({ items: rows.map(recShape), total, page, pages: Math.max(1, Math.ceil(total / limit)), counts: { all: counts.all_n, anime: counts.anime || 0, manga: counts.manga || 0, voted } });
  });
  app.get('/api/admin/x/community/recs/export.csv', requireAdmin, (req, res) => {
    const { clause, args, order } = recQuery(req.query);
    const rows = db.prepare(`SELECT ${REC_COLS} FROM recs r JOIN users u ON u.id = r.user_id ${clause} ORDER BY ${order} LIMIT 5000`).all(...args).map(recShape);
    sendCsv(res, 'recommendations.csv', ['id', 'user', 'type', 'slug_a', 'slug_b', 'title_a', 'title_b', 'helpful', 'date', 'reason'],
      rows.map((r) => [r.id, r.username, r.mediaType, r.slugA, r.slugB, r.titleA, r.titleB, r.helpful, r.createdAt, r.body]));
  });
  app.post('/api/admin/x/community/recs/bulk-delete', requireAdmin, (req, res) => {
    const ids = idList(req.body);
    const mark = ids.map(() => '?').join(',');
    db.exec('BEGIN');
    try {
      db.prepare(`DELETE FROM rec_votes WHERE rec_id IN (${mark})`).run(...ids);
      const { changes } = db.prepare(`DELETE FROM recs WHERE id IN (${mark})`).run(...ids);
      db.exec('COMMIT');
      res.json({ ok: true, deleted: changes });
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  });

  // Site users
  app.get('/api/admin/x/users/list', requireAdmin, (req, res) => {
    const { limit, page, offset } = pageOf(req);
    const { clause, args, order } = userQuery(req.query);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM users u ${clause}`).get(...args).n;
    const rows = db.prepare(`SELECT u.*, ${COUNTS} FROM users u ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
    const c = db.prepare(`SELECT COUNT(*) AS all_n,
      SUM(EXISTS (SELECT 1 FROM user_entries e WHERE e.user_id = users.id)) AS listed,
      SUM(email_verified_at IS NOT NULL) AS verified,
      SUM(email IS NOT NULL AND email <> '' AND email_verified_at IS NULL) AS unverified FROM users`).get();
    res.json({
      items: rows.map(userShape), total, page, pages: Math.max(1, Math.ceil(total / limit)),
      counts: { all: c.all_n, listed: c.listed || 0, empty: c.all_n - (c.listed || 0), verified: c.verified || 0, unverified: c.unverified || 0 },
    });
  });
  app.get('/api/admin/x/users/export.csv', requireAdmin, (req, res) => {
    const { clause, args, order } = userQuery(req.query);
    const rows = db.prepare(`SELECT u.*, ${COUNTS} FROM users u ${clause} ORDER BY ${order}`).all(...args).map(userShape);
    sendCsv(res, 'site-users.csv', ['username', 'email', 'email_verified', 'bio', 'joined', 'anime_entries', 'manga_entries'],
      rows.map((r) => [r.username, r.email, r.emailVerified ? 1 : 0, r.bio.replace(/\s+/g, ' '), r.joined, r.animeCount, r.mangaCount]));
  });
  // Activity summary for the detail panel: contributions and status mix.
  app.get('/api/admin/x/users/:username/summary', requireAdmin, (req, res) => {
    const user = db.prepare('SELECT id, email, email_verified_at, banned_until, ban_reason FROM users WHERE username = ? COLLATE NOCASE').get(String(req.params.username || '').trim());
    if (!user) throw httpError(404, 'User not found');
    const n = (sql) => db.prepare(sql).get(user.id).n;
    const statuses = {};
    for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM user_entries WHERE user_id = ? GROUP BY status').all(user.id)) statuses[row.status] = row.n;
    res.json({
      email: user.email || '', emailVerified: Boolean(user.email_verified_at),
      bannedUntil: user.banned_until && user.banned_until > new Date().toISOString() ? user.banned_until : '', banReason: user.ban_reason || '',
      reviews: n('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ?'),
      recs: n('SELECT COUNT(*) AS n FROM recs WHERE user_id = ?'),
      suggestions: n('SELECT COUNT(*) AS n FROM edit_suggestions WHERE user_id = ?'),
      followers: n('SELECT COUNT(*) AS n FROM follows WHERE following_id = ?'),
      following: n('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?'),
      statuses,
      // The newest thing the member did on the site (list change, review or suggestion).
      lastActive: db.prepare(`SELECT MAX(t) AS t FROM (
        SELECT MAX(COALESCE(NULLIF(updated_at, ''), created_at)) AS t FROM user_entries WHERE user_id = ?1
        UNION ALL SELECT MAX(created_at) FROM reviews WHERE user_id = ?1
        UNION ALL SELECT MAX(created_at) FROM edit_suggestions WHERE user_id = ?1)`).get(user.id).t || '',
    });
  });

  // Suspend / restore a member. A ban also signs them out everywhere (token_version) and blocks login and writes.
  app.post('/api/admin/x/users/:username/ban', requireAdmin, (req, res) => {
    const user = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(String(req.params.username || '').trim());
    if (!user) throw httpError(404, 'User not found');
    const days = toInt(req.body?.days, 7, 1, 3650);
    const reason = String(req.body?.reason || '').trim().slice(0, 200);
    const until = new Date(Date.now() + days * 86400000).toISOString();
    db.prepare('UPDATE users SET banned_until = ?, ban_reason = ?, token_version = token_version + 1 WHERE id = ?').run(until, reason, user.id);
    res.json({ ok: true, until });
  });
  app.delete('/api/admin/x/users/:username/ban', requireAdmin, (req, res) => {
    const { changes } = db.prepare("UPDATE users SET banned_until = '', ban_reason = '' WHERE username = ? COLLATE NOCASE").run(String(req.params.username || '').trim());
    if (!changes) throw httpError(404, 'User not found');
    res.json({ ok: true });
  });
};
