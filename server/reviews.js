import { db } from './db.js';
import { bloomFor } from './users.js';

// Public reviews (one per user per title) and the community score, which is the
// average of the personal 1-10 ratings people already give on their lists.

db.exec(`
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga')),
  slug TEXT NOT NULL,
  body TEXT NOT NULL,
  spoiler INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, media_type, slug)
);
CREATE INDEX IF NOT EXISTS idx_reviews_title ON reviews(media_type, slug, created_at);
`);

export const titleExists = (mediaType, slug) => Boolean(
  db.prepare(`SELECT 1 AS hit FROM ${mediaType === 'manga' ? 'manga' : 'anime'} WHERE slug = ?`).get(slug),
);

export const communityStats = (mediaType, slug) => {
  const rows = db.prepare(
    'SELECT rating, COUNT(*) AS n FROM user_entries WHERE media_type = ? AND slug = ? AND rating IS NOT NULL GROUP BY rating',
  ).all(mediaType, slug);
  const histogram = Array(10).fill(0);
  let count = 0;
  let sum = 0;
  for (const { rating, n } of rows) {
    if (rating >= 1 && rating <= 10) { histogram[rating - 1] = n; count += n; sum += rating * n; }
  }
  const reviewCount = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE media_type = ? AND slug = ?').get(mediaType, slug).n;
  const listed = db.prepare('SELECT COUNT(*) AS n FROM user_entries WHERE media_type = ? AND slug = ?').get(mediaType, slug).n;
  return { average: count ? Math.round((sum / count) * 10) / 10 : null, count, histogram, reviewCount, listed };
};

const shape = (row, viewerId) => ({
  id: row.id,
  username: row.username,
  bloom: Number.parseInt(row.avatar_color, 10) || bloomFor(row.username),
  body: row.body,
  spoiler: Boolean(row.spoiler),
  rating: row.rating ?? null,
  createdAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
  mine: viewerId != null && row.user_id === viewerId,
});

export const listReviews = (mediaType, slug, { viewerId = null, limit = 20, offset = 0 } = {}) => {
  const rows = db.prepare(`
    SELECT r.*, u.username, u.avatar_color, e.rating
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN user_entries e ON e.user_id = r.user_id AND e.media_type = r.media_type AND e.slug = r.slug
    WHERE r.media_type = ? AND r.slug = ?
    ORDER BY (r.user_id = ?) DESC, r.created_at DESC, r.id DESC
    LIMIT ? OFFSET ?
  `).all(mediaType, slug, viewerId ?? -1, limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE media_type = ? AND slug = ?').get(mediaType, slug).n;
  return { items: rows.map((row) => shape(row, viewerId)), total };
};

// Reviews are write-once: a user cannot edit or delete theirs (only an admin can remove one).
// Returns false when this user already reviewed the title.
export const addReview = (userId, mediaType, slug, body, spoiler) => db.prepare(`
  INSERT INTO reviews (user_id, media_type, slug, body, spoiler) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id, media_type, slug) DO NOTHING
`).run(userId, mediaType, slug, body, spoiler ? 1 : 0).changes > 0;

// A user's own public reviews, newest first (shown on their profile).
export const listUserReviews = (userId, limit = 10) => db.prepare(`
  SELECT r.media_type, r.slug, r.body, r.spoiler, r.created_at, e.rating
  FROM reviews r
  LEFT JOIN user_entries e ON e.user_id = r.user_id AND e.media_type = r.media_type AND e.slug = r.slug
  WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ?
`).all(userId, limit).map((row) => ({
  mediaType: row.media_type,
  slug: row.slug,
  body: row.body,
  spoiler: Boolean(row.spoiler),
  rating: row.rating ?? null,
  createdAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
}));

// Admin moderation list: newest first, optional search over username / review text / slug.
export const adminListReviews = ({ q = '', limit = 15, offset = 0 } = {}) => {
  const like = `%${String(q).trim().replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
  const where = q.trim() ? "WHERE u.username LIKE ? ESCAPE '\\' OR r.body LIKE ? ESCAPE '\\' OR r.slug LIKE ? ESCAPE '\\'" : '';
  const args = q.trim() ? [like, like, like] : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM reviews r JOIN users u ON u.id = r.user_id ${where}`).get(...args).n;
  const rows = db.prepare(`
    SELECT r.*, u.username, u.avatar_color, e.rating
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN user_entries e ON e.user_id = r.user_id AND e.media_type = r.media_type AND e.slug = r.slug
    ${where}
    ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?
  `).all(...args, limit, offset);
  return { items: rows.map((row) => ({ ...shape(row, null), mediaType: row.media_type, slug: row.slug })), total };
};

export const adminDeleteReview = (id) => db.prepare('DELETE FROM reviews WHERE id = ?').run(id).changes > 0;
