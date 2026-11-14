import { db } from './db.js';
import { bloomFor } from './users.js';
import { continueFor } from './continue-series.js';

// In-site notifications. Event kinds are written when they happen (a new follower, a review by someone you follow,
// a "helpful" on your review, the answer to your edit suggestion or report); "new title in your genres" and "a sequel
// of something you finished is airing" are derived when the list is opened, so a bulk import never fans out to
// every user.
//
// Every member can switch each type off (notification_prefs; absent = on). A switched-off type is simply not written.
// Same-type events on the same target within 24 hours are shown as one row ("3 people followed you").
const DAY_MS = 86400000;
const RETENTION_DAYS = 180;

db.exec(`
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT,
  slug TEXT,
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_ref ON notifications(user_id, kind, ref);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE TABLE IF NOT EXISTS notification_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  genre_cursor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind)
);
`);

// Older databases have a CHECK list on `kind` (follow / friend_review / new_title / report_result). SQLite cannot alter it
// in place and every new kind would need another rebuild, so the table is rebuilt once without the list.
if (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'notifications'").get().sql.includes('CHECK')) {
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE notifications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        media_type TEXT,
        slug TEXT,
        ref TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        read_at TEXT
      );
      INSERT INTO notifications_new SELECT id, user_id, kind, actor_id, media_type, slug, ref, created_at, read_at FROM notifications;
      DROP TABLE notifications;
      ALTER TABLE notifications_new RENAME TO notifications;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_ref ON notifications(user_id, kind, ref);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
    `);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
db.prepare("DELETE FROM notifications WHERE kind = 'new_title'").run(); // that notification type was removed
if (!db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('notification_state') WHERE name = 'sequel_at'").get().n) {
  db.exec('ALTER TABLE notification_state ADD COLUMN sequel_at TEXT');
}

// What a member can switch (the settings page lists exactly these). `episode` is the "an episode of something you are
// watching aired" alert: the bell's "airing today" block and the Telegram / Bale message.
export const PREF_KEYS = ['episode', 'sequel', 'follow', 'friend_review', 'helpful', 'results'];
const PREF_OF = {
  follow: 'follow', friend_review: 'friend_review', sequel_airing: 'sequel',
  review_helpful: 'helpful', rec_helpful: 'helpful', report_result: 'results', suggestion_result: 'results',
};
// Tabs of the notifications page.
const TABS = {
  titles: ['sequel_airing'],
  social: ['follow', 'friend_review', 'review_helpful', 'rec_helpful'],
  results: ['report_result', 'suggestion_result'],
};
const GROUPED = new Set(['follow', 'review_helpful', 'rec_helpful']);

export const getPrefs = (userId) => {
  const prefs = Object.fromEntries(PREF_KEYS.map((key) => [key, true]));
  for (const row of db.prepare('SELECT kind, enabled FROM notification_prefs WHERE user_id = ?').all(userId)) if (row.kind in prefs) prefs[row.kind] = Boolean(row.enabled);
  return prefs;
};
export const setPref = (userId, key, enabled) => {
  if (!PREF_KEYS.includes(key)) return false;
  db.prepare('INSERT INTO notification_prefs (user_id, kind, enabled) VALUES (?, ?, ?) ON CONFLICT(user_id, kind) DO UPDATE SET enabled = excluded.enabled').run(userId, key, enabled ? 1 : 0);
  return true;
};
export const prefEnabled = (userId, key) => db.prepare('SELECT enabled FROM notification_prefs WHERE user_id = ? AND kind = ?').get(userId, key)?.enabled !== 0;

const insertRow = db.prepare('INSERT OR IGNORE INTO notifications (user_id, kind, actor_id, media_type, slug, ref) VALUES (?, ?, ?, ?, ?, ?)');
const put = (userId, kind, actorId, mediaType, slug, ref) => {
  if (!prefEnabled(userId, PREF_OF[kind])) return;
  insertRow.run(userId, kind, actorId, mediaType, slug, ref);
};

export const notifyReportResult = (userId, reportId) => put(userId, 'report_result', null, null, null, `rep:${reportId}`);
export const notifySuggestionResult = (userId, suggestionId, mediaType, slug) => put(userId, 'suggestion_result', null, mediaType, slug, `sg:${suggestionId}`);

export const notifyFollow = (targetId, followerId) => {
  if (targetId !== followerId) put(targetId, 'follow', followerId, null, null, `f:${followerId}`);
};

// Everyone who follows the reviewer hears about a new review (capped for safety).
export const notifyFollowersOfReview = (reviewerId, mediaType, slug) => {
  const followers = db.prepare('SELECT follower_id FROM follows WHERE following_id = ? LIMIT 500').all(reviewerId);
  for (const { follower_id: id } of followers) put(id, 'friend_review', reviewerId, mediaType, slug, `r:${reviewerId}:${mediaType}:${slug}`);
};

// Someone found a review / suggestion of yours helpful (and taking the vote back removes the notification again).
export const notifyHelpful = (authorId, voterId, kind, targetId, mediaType, slug) => {
  if (authorId !== voterId) put(authorId, kind, voterId, mediaType, slug, `h:${targetId}:${voterId}`);
};
export const removeHelpful = (authorId, voterId, kind, targetId) => {
  db.prepare('DELETE FROM notifications WHERE user_id = ? AND kind = ? AND ref = ?').run(authorId, kind, `h:${targetId}:${voterId}`);
};

// The first visit creates the member's state row (the sequel check below is throttled through it).
const ensureState = (userId) => db.prepare("INSERT OR IGNORE INTO notification_state (user_id, genre_cursor) VALUES (?, datetime('now'))").run(userId);

// A sequel of something the member finished that is airing now (the same data as the "continue the series" rail).
// Checked at most every 6 hours per member; each sequel is announced once (the ref is unique).
const syncSequels = (userId) => {
  if (!prefEnabled(userId, 'sequel')) return;
  const state = db.prepare('SELECT sequel_at FROM notification_state WHERE user_id = ?').get(userId);
  if (!state) return; // ensureState creates the row on the first visit
  if (state.sequel_at && Date.now() - Date.parse(`${state.sequel_at.replace(' ', 'T')}Z`) < 6 * 3600000) return;
  db.prepare("UPDATE notification_state SET sequel_at = datetime('now') WHERE user_id = ?").run(userId);
  for (const item of continueFor(userId, 'anime', 30)) {
    if (item.airing) put(userId, 'sequel_airing', null, 'anime', item.slug, `sq:${item.slug}:${item.from.slug}`);
  }
};

const detailsOf = (row) => {
  if (row.kind === 'report_result') return { report: db.prepare('SELECT status, note FROM content_reports WHERE id = ?').get(Number(String(row.ref).slice(4))) || null };
  if (row.kind === 'suggestion_result') return { suggestion: db.prepare('SELECT status, reason, kind FROM edit_suggestions WHERE id = ?').get(Number(String(row.ref).slice(3))) || null };
  if (row.kind === 'sequel_airing') {
    const fromSlug = String(row.ref).split(':')[2];
    return { from: db.prepare('SELECT slug, title FROM anime WHERE slug = ?').get(fromSlug) || null };
  }
  return {};
};

const stamp = (value) => Date.parse(`${String(value).replace(' ', 'T')}Z`);

// Rows (newest first) -> display groups. Only follow / helpful events are merged, per kind and target, within 24 hours.
const group = (rows) => {
  const out = [];
  for (const row of rows) {
    const at = stamp(row.created_at);
    if (GROUPED.has(row.kind)) {
      const key = `${row.kind}|${row.media_type || ''}|${row.slug || ''}`;
      const found = out.find((g) => g.key === key && g.newest - at <= DAY_MS);
      if (found) { found.rows.push(row); continue; }
      out.push({ key, newest: at, rows: [row] });
    } else out.push({ key: `n${row.id}`, newest: at, rows: [row] });
  }
  return out;
};

const shapeGroup = (g) => {
  const row = g.rows[0];
  const actors = [];
  for (const r of g.rows) {
    if (r.actor_name && !actors.some((a) => a.username === r.actor_name)) actors.push({ username: r.actor_name, bloom: Number.parseInt(r.actor_color, 10) || bloomFor(r.actor_name) });
  }
  return {
    id: row.id,
    ids: g.rows.map((r) => r.id),
    count: g.rows.length,
    kind: row.kind,
    actor: actors[0] || null,
    actors: actors.slice(0, 3),
    mediaType: row.media_type,
    slug: row.slug,
    createdAt: new Date(g.newest).toISOString(),
    read: g.rows.every((r) => r.read_at),
    ...detailsOf(row),
  };
};

// opts.tab: 'titles' | 'social' | 'results' (the notifications page tabs); no tab = everything.
export const listNotifications = (userId, { limit = 30, tab = '' } = {}) => {
  ensureState(userId);
  syncSequels(userId);
  db.prepare(`DELETE FROM notifications WHERE user_id = ? AND created_at < datetime('now', '-${RETENTION_DAYS} days')`).run(userId);
  const kinds = TABS[tab] || null;
  const max = Math.min(200, Math.max(1, limit));
  const rows = db.prepare(`
    SELECT n.*, a.username AS actor_name, a.avatar_color AS actor_color
    FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
    WHERE n.user_id = ? ${kinds ? `AND n.kind IN (${kinds.map(() => '?').join(',')})` : ''}
    ORDER BY n.created_at DESC, n.id DESC LIMIT ?
  `).all(userId, ...(kinds || []), max * 6);
  const groups = group(rows);
  // Unread counts groups, not rows: five "helpful" votes on one review are one thing to look at.
  const unread = group(db.prepare('SELECT * FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 300').all(userId)).length;
  return { unread, total: groups.length, items: groups.slice(0, max).map(shapeGroup) };
};

export const markNotificationsRead = (userId, ids = null) => {
  if (!ids) return db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(userId).changes;
  const list = ids.filter(Number.isInteger).slice(0, 200);
  if (list.length === 0) return 0;
  return db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL AND id IN (${list.map(() => '?').join(',')})`).run(userId, ...list).changes;
};

// "Clear": remove what was already read (default) or everything.
export const clearNotifications = (userId, { all = false } = {}) => db
  .prepare(`DELETE FROM notifications WHERE user_id = ?${all ? '' : ' AND read_at IS NOT NULL'}`).run(userId).changes;
