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

// The account owner's own view: the only place the email is exposed.
export const ownUser = (row) => row && ({
  ...publicUser(row),
  email: row.email || '',
  emailVerified: Boolean(row.email_verified_at),
  privacy: { anime: row.privacy_anime || 'public', manga: row.privacy_manga || 'public' },
});

export const PRIVACY_LEVELS = ['public', 'friends', 'private'];

// May `viewerId` (null = guest) see this member's list of one media type?
// "friends" = the people the owner follows.
export const canSeeList = (ownerRow, mediaType, viewerId = null) => {
  const level = (mediaType === 'manga' ? ownerRow.privacy_manga : ownerRow.privacy_anime) || 'public';
  if (level === 'public') return true;
  if (viewerId == null) return false;
  if (viewerId === ownerRow.id) return true;
  if (level === 'private') return false;
  return Boolean(db.prepare('SELECT 1 AS x FROM follows WHERE follower_id = ? AND following_id = ?').get(ownerRow.id, viewerId));
};

export const setPrivacy = (userId, { anime, manga }) => {
  if (PRIVACY_LEVELS.includes(anime)) db.prepare('UPDATE users SET privacy_anime = ? WHERE id = ?').run(anime, userId);
  if (PRIVACY_LEVELS.includes(manga)) db.prepare('UPDATE users SET privacy_manga = ? WHERE id = ?').run(manga, userId);
};

// SQL fragment: entry rows `e` of member `u` that a viewer (bound as ?) may see. Guests pass -1.
export const VISIBLE_ENTRY_SQL = `(
  (e.media_type = 'anime' AND (u.privacy_anime = 'public' OR u.id = ? OR (u.privacy_anime = 'friends' AND EXISTS (SELECT 1 FROM follows x WHERE x.follower_id = u.id AND x.following_id = ?))))
  OR (e.media_type = 'manga' AND (u.privacy_manga = 'public' OR u.id = ? OR (u.privacy_manga = 'friends' AND EXISTS (SELECT 1 FROM follows x WHERE x.follower_id = u.id AND x.following_id = ?))))
)`;

export const getUserByUsername = (username) => db
  .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
  .get(String(username || '').trim());

// ---------- Email accounts ----------
export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const getUserByEmail = (email) => db
  .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
  .get(normalizeEmail(email));

export const setUserEmail = (userId, email) => {
  // A changed address is unverified until its link is opened.
  db.prepare('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?').run(normalizeEmail(email), userId);
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'verify'").run(userId);
};

export const markEmailVerified = (userId) => {
  db.prepare("UPDATE users SET email_verified_at = datetime('now') WHERE id = ? AND email IS NOT NULL").run(userId);
};

export const setUserPassword = async (userId, password) => {
  const password_hash = await bcrypt.hash(password, 10);
  // Bumping the token version revokes every session cookie already issued;
  // pending reset links die with the old password.
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(password_hash, userId);
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'reset'").run(userId);
};

// One-time tokens for email links. Only a SHA-256 of the token is stored.
const TOKEN_TTL = { verify: 24 * 60 * 60, reset: 60 * 60 };
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');
const nowSeconds = () => Math.floor(Date.now() / 1000);

export const issueToken = (userId, kind) => {
  const raw = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?').run(userId, kind);
  db.prepare('INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, kind, hashToken(raw), nowSeconds() + TOKEN_TTL[kind], nowSeconds());
  return raw;
};

// True when a token of this kind was issued less than `seconds` ago (resend throttle).
export const tokenIssuedRecently = (userId, kind, seconds = 60) => Boolean(db
  .prepare('SELECT 1 AS hit FROM auth_tokens WHERE user_id = ? AND kind = ? AND created_at > ?')
  .get(userId, kind, nowSeconds() - seconds));

// Returns the user row for a valid, unexpired token and burns it (single use).
export const consumeToken = (raw, kind) => {
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND kind = ?').get(hashToken(raw), kind);
  if (!row) return null;
  db.prepare('DELETE FROM auth_tokens WHERE id = ?').run(row.id);
  if (row.expires_at < nowSeconds()) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) || null;
};

export const createUser = async ({ username, password, bio = '', email = null }) => {
  const password_hash = await bcrypt.hash(password, 10);
  const info = db.prepare(
    "INSERT INTO users (username, password_hash, bio, avatar_color, email) VALUES (@username, @password_hash, @bio, '', @email)",
  ).run({ username, password_hash, bio, email: email ? normalizeEmail(email) : null });
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
const splitTags = (value) => (value ? String(value).split(',').map((tag) => tag.trim()).filter(Boolean) : []);

export const listEntries = (userId) => db
  .prepare('SELECT media_type, slug, status, note, rating, progress, start_date, finish_date, rewatch, priority, tags, created_at, updated_at FROM user_entries WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
  .all(userId)
  .reduce((acc, entry) => {
    acc[entry.media_type].push({
      slug: entry.slug, status: entry.status, note: entry.note || '', rating: entry.rating ?? null, progress: entry.progress ?? null,
      startDate: entry.start_date || null, finishDate: entry.finish_date || null, rewatch: entry.rewatch || 0,
      priority: entry.priority || null, tags: splitTags(entry.tags),
      added: entry.created_at, updated: entry.updated_at || entry.created_at,
    });
    return acc;
  }, { anime: [], manga: [] });

const todayUtc = () => new Date().toISOString().slice(0, 10);

// `extra` carries the A3 list details: { startDate, finishDate, rewatch, priority, tags }.
// Like note/rating/progress, a key that is absent is left untouched.
// Dates fill in by themselves when the status changes (watching → start date,
// completed → finish date) but only if the entry has no date yet and the caller
// did not send one, so a manual date is never overwritten.
export const upsertEntry = (userId, mediaType, slug, status, note, rating, progress, extra = {}) => {
  // note/rating/progress are optional: only touch them when the caller sent
  // them, so a status-only update never wipes them. SQLite validates NOT NULL
  // on the inserted values even in the ON CONFLICT DO UPDATE path, hence the
  // dynamic SQL.
  const noteGiven = note != null;
  const ratingGiven = rating !== undefined;
  const progressGiven = progress !== undefined;
  const existing = db.prepare('SELECT status, start_date, finish_date FROM user_entries WHERE user_id = ? AND media_type = ? AND slug = ?').get(userId, mediaType, slug);
  const statusChanged = !existing || existing.status !== status;
  let startDate = extra.startDate;
  let finishDate = extra.finishDate;
  if (statusChanged && !extra.noAutoDates) {
    if (startDate === undefined && !existing?.start_date && status === 'watching') startDate = todayUtc();
    if (finishDate === undefined && !existing?.finish_date && status === 'completed') finishDate = todayUtc();
  }
  const startGiven = startDate !== undefined;
  const finishGiven = finishDate !== undefined;
  const rewatchGiven = extra.rewatch !== undefined;
  const priorityGiven = extra.priority !== undefined;
  const tagsGiven = extra.tags !== undefined;
  const cols = ['user_id', 'media_type', 'slug', 'status'];
  const values = [userId, mediaType, slug, status];
  if (noteGiven) { cols.push('note'); values.push(String(note).slice(0, 500)); }
  if (ratingGiven) { cols.push('rating'); values.push(rating == null ? null : Number(rating)); }
  if (progressGiven) { cols.push('progress'); values.push(progress == null ? null : Math.max(0, Number(progress))); }
  if (startGiven) { cols.push('start_date'); values.push(startDate || null); }
  if (finishGiven) { cols.push('finish_date'); values.push(finishDate || null); }
  if (rewatchGiven) { cols.push('rewatch'); values.push(Math.max(0, Math.min(99, Number(extra.rewatch) || 0))); }
  if (priorityGiven) { cols.push('priority'); values.push(extra.priority || null); }
  if (tagsGiven) { cols.push('tags'); values.push((extra.tags || []).join(',')); }
  const sets = [
    'status = excluded.status',
    noteGiven ? 'note = excluded.note' : null,
    ratingGiven ? 'rating = excluded.rating' : null,
    progressGiven ? 'progress = excluded.progress' : null,
    startGiven ? 'start_date = excluded.start_date' : null,
    finishGiven ? 'finish_date = excluded.finish_date' : null,
    rewatchGiven ? 'rewatch = excluded.rewatch' : null,
    priorityGiven ? 'priority = excluded.priority' : null,
    tagsGiven ? 'tags = excluded.tags' : null,
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
// True only when this call created the follow (so a repeat tap does not notify twice).
export const followUser = (followerId, followingId) => db
  .prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING')
  .run(followerId, followingId).changes > 0;

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
  WHERE f.follower_id = ? AND ${VISIBLE_ENTRY_SQL}
  ORDER BY COALESCE(NULLIF(e.updated_at, ''), e.created_at) DESC, e.rowid DESC
  LIMIT ?
`).all(userId, userId, userId, userId, userId, limit).map((row) => ({
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
  email: row.email || '',
  emailVerified: Boolean(row.email_verified_at),
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
  // Bumping the token version revokes every session cookie already issued.
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(password_hash, userId);
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
