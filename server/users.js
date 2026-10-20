import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

// Deterministic "bloom" hue per user: the profile identity color used by the
// avatar, banner and dashboard accents. Cormastable hex oklch-friendly.
const BLOOM_HUES = [8, 342, 276, 208, 168, 96];

export const bloomFor = (username) => {
  const digest = crypto.createHash('sha256').update(String(username).toLowerCase()).digest();
  return BLOOM_HUES[digest[0] % BLOOM_HUES.length];
};

export const publicUser = (row) => row && ({
  id: row.id,
  username: row.username,
  bio: row.bio,
  bloom: Number.parseInt(row.avatar_color, 10) || 12,
  joined: row.created_at,
  joinedAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
});

export const getUserByUsername = (username) => db
  .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
  .get(String(username || '').trim());

export const createUser = async ({ username, password, bio = '' }) => {
  const password_hash = await bcrypt.hash(password, 10);
  const info = db.prepare(
    "INSERT INTO users (username, password_hash, bio, avatar_color) VALUES (@username, @password_hash, @bio, '')",
  ).run({ username, password_hash, bio });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  db.prepare('UPDATE users SET avatar_color = ? WHERE id = ?').run(String(bloomFor(row.username)), row.id);
  row.avatar_color = String(bloomFor(row.username));
  return publicUser(row);
};

export const verifySiteCredentials = async (username, password) => {
  const row = getUserByUsername(username);
  if (!row) return { ok: false };
  return { ok: await bcrypt.compare(password, row.password_hash), username: row.username };
};

// ---------- Personal list entries ----------
export const listEntries = (userId) => db
  .prepare('SELECT media_type, slug, status, note, rating, progress, created_at FROM user_entries WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
  .all(userId)
  .reduce((acc, entry) => {
    acc[entry.media_type].push({ slug: entry.slug, status: entry.status, note: entry.note || '', rating: entry.rating ?? null, progress: entry.progress ?? null, added: entry.created_at });
    return acc;
  }, { anime: [], manga: [] });

export const upsertEntry = (userId, mediaType, slug, status, note, rating, progress) => {
  // note/rating/progress are optional: only touch them when the caller sent
  // them, so a status-only update never wipes them. SQLite validates NOT NULL
  // on the inserted values even in the ON CONFLICT DO UPDATE path, hence the
  // dynamic SQL.
  const noteGiven = note != null;
  const ratingGiven = rating !== undefined;
  const progressGiven = progress !== undefined;
  const cols = ['user_id', 'media_type', 'slug', 'status'];
  const values = [userId, mediaType, slug, status];
  if (noteGiven) { cols.push('note'); values.push(String(note).slice(0, 500)); }
  if (ratingGiven) { cols.push('rating'); values.push(rating == null ? null : Number(rating)); }
  if (progressGiven) { cols.push('progress'); values.push(progress == null ? null : Math.max(0, Number(progress))); }
  const sets = [
    'status = excluded.status',
    noteGiven ? 'note = excluded.note' : null,
    ratingGiven ? 'rating = excluded.rating' : null,
    progressGiven ? 'progress = excluded.progress' : null,
    "updated_at = datetime('now')",
  ].filter(Boolean);
  db.prepare(`
    INSERT INTO user_entries (${cols.join(', ')})
    VALUES (${cols.map(() => '?').join(', ')})
    ON CONFLICT (user_id, media_type, slug) DO UPDATE SET
      ${sets.join(',\n      ')}
  `).run(...values);
};

export const deleteEntry = (userId, mediaType, slug) => db
  .prepare('DELETE FROM user_entries WHERE user_id = ? AND media_type = ? AND slug = ?')
  .run(userId, mediaType, slug);

// ---------- Follow graph (queue 15) ----------
export const followUser = (followerId, followingId) => {
  db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(followerId, followingId);
};

export const unfollowUser = (followerId, followingId) => {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(followerId, followingId);
};

export const isFollowing = (followerId, followingId) => Boolean(
  db.prepare('SELECT 1 AS x FROM follows WHERE follower_id = ? AND following_id = ?').get(followerId, followingId),
);

export const followCounts = (userId) => ({
  followers: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE following_id = ?').get(userId).n,
  following: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?').get(userId).n,
});

export const listFollowers = (userId) => db
  .prepare('SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.following_id = ? ORDER BY f.created_at DESC, u.id DESC')
  .all(userId)
  .map(publicUser);

export const listFollowing = (userId) => db
  .prepare('SELECT u.* FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? ORDER BY f.created_at DESC, u.id DESC')
  .all(userId)
  .map(publicUser);

// Friends activity feed: the newest list activity of the people the viewer
// follows (new entries and status changes surface because upsert re-timestamps
// nothing — we use added (created_at) plus the entry's last actual write).
export const friendFeed = (userId, limit = 30) => db.prepare(`
  SELECT u.username, u.avatar_color, e.media_type, e.slug, e.status, e.rating, e.progress, e.updated_at, e.created_at,
    a.title AS item_title
  FROM follows f
  JOIN user_entries e ON e.user_id = f.following_id
  JOIN users u ON u.id = e.user_id
  LEFT JOIN anime a ON a.slug = e.slug
  WHERE f.follower_id = ?
  ORDER BY COALESCE(NULLIF(e.updated_at, ''), e.created_at) DESC, e.rowid DESC
  LIMIT ?
`).all(userId, limit).map((row) => ({
  username: row.username,
  bloom: Number.parseInt(row.avatar_color, 10) || 12,
  mediaType: row.media_type,
  slug: row.slug,
  title: row.item_title || row.slug,
  status: row.status,
  rating: row.rating ?? null,
  progress: row.progress ?? null,
  added: row.created_at,
}));

export const setBio = (userId, bio) => {
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(String(bio || '').slice(0, 300), userId);
};

export const setAvatarColor = (userId, hue) => {
  db.prepare('UPDATE users SET avatar_color = ? WHERE id = ?').run(String(hue), userId);
};

// ---------- Admin: site-user management ----------
const userWithCounts = (row) => ({
  id: row.id,
  username: row.username,
  bio: row.bio || '',
  bloom: Number.parseInt(row.avatar_color, 10) || 12,
  joined: row.created_at,
  joinedAt: new Date(`${row.created_at.replace(' ', 'T')}Z`).toISOString(),
  animeCount: row.anime_count ?? 0,
  mangaCount: row.manga_count ?? 0,
});

const USER_COUNTS = `
  (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.media_type = 'anime') AS anime_count,
  (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.media_type = 'manga') AS manga_count`;

export const adminListUsers = (query, limit, offset) => {
  const like = `%${String(query || '').replace(/[%_\\]/g, '\\$&')}%`;
  const where = query ? "WHERE u.username LIKE ? ESCAPE '\\'" : '';
  const rows = db
    .prepare(`SELECT u.*, ${USER_COUNTS} FROM users u ${where} ORDER BY u.id ASC LIMIT ? OFFSET ?`)
    .all(...(query ? [like] : []), limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).get(...(query ? [like] : [])).n;
  return { rows: rows.map(userWithCounts), total };
};

export const adminGetUser = (username) => {
  const row = db
    .prepare(`SELECT u.*, ${USER_COUNTS} FROM users u WHERE u.username = ? COLLATE NOCASE`)
    .get(String(username || '').trim());
  return row ? userWithCounts(row) : null;
};

export const adminRenameUser = async (userId, username) => {
  // The hash and bio stay; the identity color follows the new username.
  db.prepare('UPDATE users SET username = ?, avatar_color = ? WHERE id = ?')
    .run(username, String(bloomFor(username)), userId);
  return adminGetUserById(userId);
};

export const adminGetUserById = (userId) => {
  const row = db.prepare(`SELECT u.*, ${USER_COUNTS} FROM users u WHERE u.id = ?`).get(userId);
  return row ? userWithCounts(row) : null;
};

// Every user row (used for the admin CSV export).
export const adminAllUsers = () => db
  .prepare(`SELECT u.*, ${USER_COUNTS} FROM users u ORDER BY u.id ASC`)
  .all()
  .map(userWithCounts);

export const adminSetUserPassword = async (userId, password) => {
  const password_hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, userId);
};

// Deleting a user removes their entries too; foreign keys may not be enforced
// on every connection, so clear the entries explicitly.
export const adminDeleteUser = (userId) => {
  const rmEntries = db.prepare('DELETE FROM user_entries WHERE user_id = ?');
  const rmUser = db.prepare('DELETE FROM users WHERE id = ?');
  rmEntries.run(userId);
  rmUser.run(userId);
  return rmUser.changes === 1;
};
