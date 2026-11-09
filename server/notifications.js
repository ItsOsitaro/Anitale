import { db } from './db.js';
import { bloomFor } from './users.js';

// In-site notifications. Event kinds are written when they happen (a new follower,
// a review by someone you follow); "new title in your genres" is derived when the
// notification list is opened, so a bulk import never fans out to every user.

db.exec(`
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('follow', 'friend_review', 'new_title')),
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
`);

// A fourth kind, 'report_result' (the owner closed a report the member sent): the CHECK list cannot be altered in place,
// so the table is rebuilt once.
if (!db.prepare("SELECT sql FROM sqlite_master WHERE name = 'notifications'").get().sql.includes('report_result')) {
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE notifications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('follow', 'friend_review', 'new_title', 'report_result')),
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

export const notifyReportResult = (userId, reportId) => {
  db.prepare("INSERT OR IGNORE INTO notifications (user_id, kind, actor_id, media_type, slug, ref) VALUES (?, 'report_result', NULL, NULL, NULL, ?)").run(userId, `rep:${reportId}`);
};

const insert = db.prepare(`
  INSERT OR IGNORE INTO notifications (user_id, kind, actor_id, media_type, slug, ref) VALUES (?, ?, ?, ?, ?, ?)
`);

export const notifyFollow = (targetId, followerId) => {
  if (targetId !== followerId) insert.run(targetId, 'follow', followerId, null, null, `f:${followerId}`);
};

// Everyone who follows the reviewer hears about a new review (capped for safety).
export const notifyFollowersOfReview = (reviewerId, mediaType, slug) => {
  const followers = db.prepare('SELECT follower_id FROM follows WHERE following_id = ? LIMIT 500').all(reviewerId);
  for (const { follower_id: id } of followers) insert.run(id, 'friend_review', reviewerId, mediaType, slug, `r:${reviewerId}:${mediaType}:${slug}`);
};

const parseGenres = (text) => { try { const v = JSON.parse(text || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

const topGenres = (userId) => {
  const counts = new Map();
  const entries = db.prepare("SELECT media_type, slug FROM user_entries WHERE user_id = ? AND status != 'dropped'").all(userId);
  const stmts = { anime: db.prepare('SELECT genres FROM anime WHERE slug = ?'), manga: db.prepare('SELECT genres FROM manga WHERE slug = ?') };
  for (const { media_type: type, slug } of entries) {
    const row = stmts[type]?.get(slug);
    for (const genre of parseGenres(row?.genres)) counts.set(genre, (counts.get(genre) || 0) + 1);
  }
  return new Set([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([genre]) => genre));
};

const syncNewTitles = (userId) => {
  const state = db.prepare('SELECT genre_cursor FROM notification_state WHERE user_id = ?').get(userId);
  const now = db.prepare("SELECT datetime('now') AS now").get().now;
  if (!state) { // first visit: start from now, never backfill the whole catalog
    db.prepare('INSERT INTO notification_state (user_id, genre_cursor) VALUES (?, ?)').run(userId, now);
    return;
  }
  const fresh = ['anime', 'manga'].flatMap((type) => db
    .prepare(`SELECT slug, genres, created_at FROM ${type} WHERE created_at > ? ORDER BY created_at DESC LIMIT 60`)
    .all(state.genre_cursor)
    .map((row) => ({ ...row, type })));
  db.prepare('UPDATE notification_state SET genre_cursor = ? WHERE user_id = ?').run(now, userId);
  if (fresh.length === 0) return;
  const likes = topGenres(userId);
  if (likes.size === 0) return;
  const owned = new Set(db.prepare('SELECT media_type, slug FROM user_entries WHERE user_id = ?').all(userId).map((e) => `${e.media_type}:${e.slug}`));
  let added = 0;
  for (const row of fresh.sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (added >= 5) break;
    if (owned.has(`${row.type}:${row.slug}`) || !parseGenres(row.genres).some((genre) => likes.has(genre))) continue;
    insert.run(userId, 'new_title', null, row.type, row.slug, `t:${row.type}:${row.slug}`);
    added += 1;
  }
};

export const listNotifications = (userId) => {
  syncNewTitles(userId);
  db.prepare("DELETE FROM notifications WHERE user_id = ? AND created_at < datetime('now', '-60 days')").run(userId);
  const rows = db.prepare(`
    SELECT n.*, a.username AS actor_name, a.avatar_color AS actor_color
    FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
    WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 30
  `).all(userId);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n;
  return {
    unread,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      actor: row.actor_name ? { username: row.actor_name, bloom: Number.parseInt(row.actor_color, 10) || bloomFor(row.actor_name) } : null,
      mediaType: row.media_type,
      slug: row.slug,
      createdAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
      read: Boolean(row.read_at),
      ...(row.kind === 'report_result' ? { report: db.prepare('SELECT status, note FROM content_reports WHERE id = ?').get(Number(String(row.ref).slice(4))) || null } : {}),
    })),
  };
};

export const markNotificationsRead = (userId, ids = null) => {
  if (!ids) return db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(userId).changes;
  const list = ids.filter(Number.isInteger).slice(0, 100);
  if (list.length === 0) return 0;
  return db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL AND id IN (${list.map(() => '?').join(',')})`).run(userId, ...list).changes;
};
