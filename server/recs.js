import { db } from './db.js';
import { bloomFor } from './users.js';
import { notifyHelpful, removeHelpful } from './notifications.js';

// User recommendations: "if you liked A, also try B" with a reason. One per user per
// pair (A/B and B/A count as the same pair), write-once like reviews, rated with "helpful".

db.exec(`
CREATE TABLE IF NOT EXISTS recs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga')),
  slug_a TEXT NOT NULL,
  slug_b TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, media_type, slug_a, slug_b)
);
CREATE INDEX IF NOT EXISTS idx_recs_a ON recs(media_type, slug_a);
CREATE INDEX IF NOT EXISTS idx_recs_b ON recs(media_type, slug_b);
CREATE TABLE IF NOT EXISTS rec_votes (
  rec_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (rec_id, user_id)
);
`);

const pair = (x, y) => (x < y ? [x, y] : [y, x]);

export const addRec = (userId, mediaType, slug, other, body) => {
  const [a, b] = pair(slug, other);
  return db.prepare(`
    INSERT INTO recs (user_id, media_type, slug_a, slug_b, body) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, media_type, slug_a, slug_b) DO NOTHING
  `).run(userId, mediaType, a, b, body).changes > 0;
};

export const listRecs = (mediaType, slug, { viewerId = null, limit = 20 } = {}) => db.prepare(`
  SELECT r.id, r.user_id, r.slug_a, r.slug_b, r.body, r.created_at, u.username, u.avatar_color,
    (SELECT COUNT(*) FROM rec_votes v WHERE v.rec_id = r.id) AS helpful,
    EXISTS (SELECT 1 FROM rec_votes v WHERE v.rec_id = r.id AND v.user_id = ?) AS voted
  FROM recs r JOIN users u ON u.id = r.user_id
  WHERE r.media_type = ? AND (r.slug_a = ? OR r.slug_b = ?)
  ORDER BY helpful DESC, r.created_at DESC, r.id DESC LIMIT ?
`).all(viewerId ?? -1, mediaType, slug, slug, limit).map((row) => ({
  id: row.id,
  other: row.slug_a === slug ? row.slug_b : row.slug_a,
  username: row.username,
  bloom: Number.parseInt(row.avatar_color, 10) || bloomFor(row.username),
  body: row.body,
  createdAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
  mine: viewerId != null && row.user_id === viewerId,
  helpful: row.helpful || 0,
  voted: Boolean(row.voted),
}));

export const setRecHelpful = (userId, recId, on) => {
  const rec = db.prepare('SELECT id, user_id, media_type, slug_a FROM recs WHERE id = ?').get(recId);
  if (!rec || rec.user_id === userId) return null;
  if (on) {
    db.prepare('INSERT OR IGNORE INTO rec_votes (rec_id, user_id) VALUES (?, ?)').run(recId, userId);
    notifyHelpful(rec.user_id, userId, 'rec_helpful', recId, rec.media_type, rec.slug_a);
  } else {
    db.prepare('DELETE FROM rec_votes WHERE rec_id = ? AND user_id = ?').run(recId, userId);
    removeHelpful(rec.user_id, userId, 'rec_helpful', recId);
  }
  return { helpful: db.prepare('SELECT COUNT(*) AS n FROM rec_votes WHERE rec_id = ?').get(recId).n, voted: on };
};

export const adminListRecs = ({ q = '', limit = 15, offset = 0 } = {}) => {
  const like = `%${String(q).trim().replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
  const where = q.trim()
    ? "WHERE u.username LIKE ? ESCAPE '\\' OR r.body LIKE ? ESCAPE '\\' OR r.slug_a LIKE ? ESCAPE '\\' OR r.slug_b LIKE ? ESCAPE '\\'"
    : '';
  const args = q.trim() ? [like, like, like, like] : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM recs r JOIN users u ON u.id = r.user_id ${where}`).get(...args).n;
  const rows = db.prepare(`
    SELECT r.id, r.media_type, r.slug_a, r.slug_b, r.body, r.created_at, u.username,
      (SELECT COUNT(*) FROM rec_votes v WHERE v.rec_id = r.id) AS helpful
    FROM recs r JOIN users u ON u.id = r.user_id
    ${where}
    ORDER BY r.id DESC LIMIT ? OFFSET ?
  `).all(...args, limit, offset);
  return {
    items: rows.map((row) => ({
      id: row.id,
      mediaType: row.media_type,
      slugA: row.slug_a,
      slugB: row.slug_b,
      body: row.body,
      username: row.username,
      helpful: row.helpful || 0,
      createdAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
    })),
    total,
  };
};

export const adminDeleteRec = (id) => {
  db.prepare('DELETE FROM rec_votes WHERE rec_id = ?').run(id);
  return db.prepare('DELETE FROM recs WHERE id = ?').run(id).changes > 0;
};
