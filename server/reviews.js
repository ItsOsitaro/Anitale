import { db } from './db.js';
import { bloomFor, canSeeList } from './users.js';

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
CREATE TABLE IF NOT EXISTS review_votes (
  review_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (review_id, user_id)
);
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
  // How many members hold the title in each list status (A2).
  const statuses = { watching: 0, completed: 0, on_hold: 0, dropped: 0, planned: 0 };
  for (const { status, n } of db.prepare('SELECT status, COUNT(*) AS n FROM user_entries WHERE media_type = ? AND slug = ? GROUP BY status').all(mediaType, slug)) {
    if (status in statuses) statuses[status] = n;
  }
  return { average: count ? Math.round((sum / count) * 10) / 10 : null, count, histogram, reviewCount, listed, statuses };
};

const shape = (row, viewerId) => ({
  id: row.id,
  username: row.username,
  bloom: Number.parseInt(row.avatar_color, 10) || bloomFor(row.username),
  body: row.body,
  spoiler: Boolean(row.spoiler),
  // A private (or friends-only) list also hides the score shown next to the review.
  rating: canSeeList({ id: row.user_id, privacy_anime: row.privacy_anime, privacy_manga: row.privacy_manga }, row.media_type, viewerId) ? (row.rating ?? null) : null,
  createdAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
  mine: viewerId != null && row.user_id === viewerId,
  helpful: row.helpful || 0,
  voted: Boolean(row.voted),
});

const SORTS = {
  new: 'r.created_at DESC, r.id DESC',
  helpful: 'helpful DESC, r.created_at DESC, r.id DESC',
  high: '(e.rating IS NULL), e.rating DESC, r.created_at DESC, r.id DESC',
  low: '(e.rating IS NULL), e.rating ASC, r.created_at DESC, r.id DESC',
};

export const listReviews = (mediaType, slug, { viewerId = null, limit = 20, offset = 0, sort = 'new' } = {}) => {
  const order = SORTS[sort] || SORTS.new;
  const rows = db.prepare(`
    SELECT r.*, u.username, u.avatar_color, u.privacy_anime, u.privacy_manga, e.rating,
      (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS helpful,
      EXISTS (SELECT 1 FROM review_votes v WHERE v.review_id = r.id AND v.user_id = ?) AS voted
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN user_entries e ON e.user_id = r.user_id AND e.media_type = r.media_type AND e.slug = r.slug
    WHERE r.media_type = ? AND r.slug = ?
    ORDER BY (r.user_id = ?) DESC, ${order}
    LIMIT ? OFFSET ?
  `).all(viewerId ?? -1, mediaType, slug, viewerId ?? -1, limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE media_type = ? AND slug = ?').get(mediaType, slug).n;
  return { items: rows.map((row) => shape(row, viewerId)), total };
};

// "Helpful" vote: one per user per review, never on your own review. Returns the new state or null when not allowed.
export const setHelpful = (userId, reviewId, on) => {
  const review = db.prepare('SELECT id, user_id FROM reviews WHERE id = ?').get(reviewId);
  if (!review || review.user_id === userId) return null;
  if (on) db.prepare('INSERT OR IGNORE INTO review_votes (review_id, user_id) VALUES (?, ?)').run(reviewId, userId);
  else db.prepare('DELETE FROM review_votes WHERE review_id = ? AND user_id = ?').run(reviewId, userId);
  return { helpful: db.prepare('SELECT COUNT(*) AS n FROM review_votes WHERE review_id = ?').get(reviewId).n, voted: on };
};

// Reviews are write-once: a user cannot edit or delete theirs (only an admin can remove one).
// Returns false when this user already reviewed the title.
export const addReview = (userId, mediaType, slug, body, spoiler) => db.prepare(`
  INSERT INTO reviews (user_id, media_type, slug, body, spoiler) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id, media_type, slug) DO NOTHING
`).run(userId, mediaType, slug, body, spoiler ? 1 : 0).changes > 0;

// A user's own public reviews, newest first (shown on their profile).
export const listUserReviews = (userId, limit = 10, viewerId = null) => {
  const owner = db.prepare('SELECT id, privacy_anime, privacy_manga FROM users WHERE id = ?').get(userId) || { id: userId };
  return db.prepare(`
    SELECT r.media_type, r.slug, r.body, r.spoiler, r.created_at, e.rating
    FROM reviews r
    LEFT JOIN user_entries e ON e.user_id = r.user_id AND e.media_type = r.media_type AND e.slug = r.slug
    WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ?
  `).all(userId, limit).map((row) => ({
    mediaType: row.media_type,
    slug: row.slug,
    body: row.body,
    spoiler: Boolean(row.spoiler),
    rating: canSeeList(owner, row.media_type, viewerId) ? (row.rating ?? null) : null,
    createdAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
  }));
};

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

export const adminDeleteReview = (id) => {
  db.prepare('DELETE FROM review_votes WHERE review_id = ?').run(id);
  return db.prepare('DELETE FROM reviews WHERE id = ?').run(id).changes > 0;
};
