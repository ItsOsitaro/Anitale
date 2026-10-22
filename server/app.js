import './config.js';
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { db, COVERS_DIR, ROOT_DIR, TMP_DIR } from './db.js';
import {
  clearSession, clearUserSession, currentSiteUser, currentUser, isAuthConfigured, requireAdmin, requireSiteUser,
  sameOriginOnly, setSession, setUserSession, userTokenValid, verifyCredentials,
} from './auth.js';
import { animeInput, loginInput, mangaAdminPatch, siteAdminUserCreate, siteAdminUserPatch, siteProfileInput, siteRegisterInput, siteUserEntryInput, WEEKDAYS } from './schemas.js';
import { foldTitle, parseSynopsis, rowToItem, slugify } from './shape.js';
import { deleteAnime, deleteManga, adminUpdateManga, getMangaByMalId, getMangaBySlug, getByMalId, getBySlug, insertAnime, insertManga, listManga, mangaRowToItem, updateAnime, updateManga } from './repo.js';
import { adminDeleteUser, adminAllUsers, adminGetUser, adminGetUserById, adminListUsers, adminRenameUser, adminSetUserPassword, createUser, deleteEntry, followCounts, followUser, friendFeed, getUserByUsername, isFollowing, listEntries, listFollowers, listFollowing, publicUser, setAvatarColor, setBio, unfollowUser, upsertEntry, verifySiteCredentials } from './users.js';
import { exportData } from './export-data.js';
import { BLOB_MODE, coverUrlFor,  cleanupTemp, handleCoverRequest, MAX_IMAGE_BYTES, promoteTempCover, removeCoversForSlug, saveCoverBuffer, saveTempCover, renameBlobCover,
} from './images.js';
import { downloadImage, fetchAnimeFull, fetchMangaFull, jikanCircuitOpen, mapJikanMangaToDraft, mapJikanToDraft, searchAnime } from './jikan.js';
import { anilistFacetSearch, anilistImport, anilistImportMany, anilistMangaDraft, anilistMangaDraftMany, anilistSearch } from './anilist.js';
import { mapPool } from './pool.js';
import { translateSynopsis, planPersian, draftPersian } from './translate.js';

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

const uniqueSlug = (base, ignoreId) => {
  const root = slugify(base) || `anime-${Date.now()}`;
  let candidate = root;
  for (let n = 2; getBySlug(candidate) && getBySlug(candidate).id !== ignoreId; n += 1) candidate = `${root}-${n}`;
  return candidate;
};

// Same idea over the manga table (seeded rows included).
const uniqueMangaSlug = (base) => {
  const root = slugify(base) || `manga-${Date.now()}`;
  let candidate = root;
  for (let n = 2; getMangaBySlug(candidate); n += 1) candidate = `${root}-${n}`;
  return candidate;
};

const renameCover = (cover, newSlug) => {
  if (!cover) return cover;
  const ext = path.extname(cover);
  const next = `${newSlug}${ext}`;
  if (next === cover) return cover;
  const from = path.join(COVERS_DIR, cover);
  if (!fs.existsSync(from)) return cover;
  fs.copyFileSync(from, path.join(COVERS_DIR, next)); // copy: the old file may still be used by the static fallback data
  renameBlobCover(cover, next);
  return next;
};

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  // Behind Vercel's proxy every request arrives from the platform; with
  // TRUST_PROXY=1 the rate limiters key on the real client instead of one
  // shared platform IP (and the CSRF host check can read x-forwarded-host).
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  // Baseline browser hardening; CSP (SPA + inline styles) is a manual follow-up.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', sameOriginOnly);

  // ---------- Auth ----------
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Try again later.' } });
  // Moderate limiter for the heavy write endpoints (bulk imports + refreshes).
  const writeLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many write requests' } });
  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    if (!isAuthConfigured()) throw httpError(503, 'Admin login is not configured. Run: npm run setup-admin');
    const { username, password } = loginInput.parse(req.body);
    if (!(await verifyCredentials(username, password))) throw httpError(401, 'Wrong username or password');
    setSession(req, res, username);
    res.json({ user: username });
  });
  app.post('/api/auth/logout', (req, res) => { clearSession(req, res); res.json({ ok: true }); });
  app.get('/api/auth/me', (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not logged in', configured: isAuthConfigured() });
    return res.json({ user });
  });

  // ---------- Site accounts (register / login / lists / public profiles) ----------
  const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many registration attempts. Try again later.' } });
  const siteLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Try again later.' } });

  app.post('/api/user/register', registerLimiter, async (req, res) => {
    const input = siteRegisterInput.parse(req.body);
    if (getUserByUsername(input.username)) throw httpError(409, `Username "${input.username}" is already taken`);
    const user = await createUser(input);
    setUserSession(req, res, user.username);
    res.status(201).json({ user });
  });

  app.post('/api/user/login', siteLoginLimiter, async (req, res) => {
    const { username, password } = loginInput.parse(req.body);
    const result = await verifySiteCredentials(username, password);
    if (!result.ok) throw httpError(401, 'Wrong username or password');
    setUserSession(req, res, result.username);
    res.json({ user: publicUser(getUserByUsername(result.username)), ok: true });
  });

  app.get('/api/user/me', (req, res) => {
    const username = currentSiteUser(req);
    const row = username ? getUserByUsername(username) : null;
    if (!row) return res.json({ user: null });
    // Stale token (password changed meanwhile) counts as logged out here too.
    if (!userTokenValid(row, req)) return res.json({ user: null });
    res.json({ user: publicUser(row), entries: listEntries(row.id) });
  });

  app.put('/api/user/me', requireSiteUser, (req, res) => {
    const input = siteProfileInput.parse(req.body);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    if (input.bio !== undefined) setBio(row.id, input.bio);
    if (input.avatarColor !== undefined) setAvatarColor(row.id, input.avatarColor);
    res.json({ user: publicUser(getUserByUsername(row.username)) });
  });

  app.post('/api/user/logout', (req, res) => {
    clearUserSession(req, res);
    res.json({ ok: true });
  });

  app.get('/api/user/entries', requireSiteUser, (req, res) => {
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    res.json(listEntries(row.id));
  });

  app.put('/api/user/entries', requireSiteUser, (req, res) => {
    const input = siteUserEntryInput.parse(req.body);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    upsertEntry(row.id, input.mediaType, input.slug, input.status, input.note, input.rating, input.progress);
    res.json(listEntries(row.id));
  });

  app.delete('/api/user/entries/:mediaType/:slug', requireSiteUser, (req, res) => {
    if (!['anime', 'manga'].includes(req.params.mediaType)) throw httpError(400, 'mediaType must be anime or manga');
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    deleteEntry(row.id, req.params.mediaType, req.params.slug);
    res.json(listEntries(row.id));
  });

  // Public member directory — featured members for the homepage panel
  // (most list entries first; ties resolved by newest). Aggregated
  // per-status counts power the homepage stats without extra round-trips.
  app.get('/api/users', (_req, res) => {
    const rows = db.prepare(`
      SELECT u.id, u.username, u.bio, u.avatar_color, u.created_at,
        (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id) AS total_entries,
        (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.status = 'watching') AS watching,
        (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.status = 'completed') AS completed,
        (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.status = 'planned') AS planned
      FROM users u
      ORDER BY total_entries DESC, u.id DESC
      LIMIT 6
    `).all();
    res.json({
      users: rows.map((row) => ({
        ...publicUser(row),
        entryCount: row.total_entries,
        watching: row.watching,
        completed: row.completed,
        planned: row.planned,
      })),
    });
  });

  // Public profile (No personal data beyond username/bio/joined/lists).
  // Notes stay private; ratings and counts are public. The follow graph and
  // the viewer-specific isFollowing flag ride along for the same request.
  app.get('/api/users/:username', (req, res) => {
    const row = getUserByUsername(req.params.username);
    if (!row) throw httpError(404, 'User not found');
    const counts = followCounts(row.id);
    const viewerName = currentSiteUser(req);
    const viewer = viewerName ? getUserByUsername(viewerName) : null;
    // Notes are private (see the feed comment below): strip them the same way
    // for public profiles; status/rating/progress stay public by design.
    const mine = listEntries(row.id);
    res.json({
      user: publicUser(row),
      entries: {
        anime: mine.anime.map(({ note, ...rest }) => rest),
        manga: mine.manga.map(({ note, ...rest }) => rest),
      },
      followers: counts.followers,
      following: counts.following,
      ...(viewer && viewer.id !== row.id ? { isFollowing: isFollowing(viewer.id, row.id) } : {}),
    });
  });

  // Follow graph — follow, unfollow, and both connection lists.
  app.post('/api/users/:username/follow', requireSiteUser, (req, res) => {
    const target = getUserByUsername(req.params.username);
    if (!target) throw httpError(404, 'User not found');
    const viewer = getUserByUsername(currentSiteUser(req));
    if (!viewer) throw httpError(401, 'Not logged in');
    if (viewer.id === target.id) throw httpError(400, 'You cannot follow yourself');
    followUser(viewer.id, target.id);
    res.json({ following: true, followers: followCounts(target.id).followers });
  });

  app.delete('/api/users/:username/follow', requireSiteUser, (req, res) => {
    const target = getUserByUsername(req.params.username);
    if (!target) throw httpError(404, 'User not found');
    const viewer = getUserByUsername(currentSiteUser(req));
    if (!viewer) throw httpError(401, 'Not logged in');
    unfollowUser(viewer.id, target.id);
    res.json({ following: false, followers: followCounts(target.id).followers });
  });

  app.get('/api/users/:username/followers', (req, res) => {
    const row = getUserByUsername(req.params.username);
    if (!row) throw httpError(404, 'User not found');
    res.json({ users: listFollowers(row.id) });
  });

  app.get('/api/users/:username/following', (req, res) => {
    const row = getUserByUsername(req.params.username);
    if (!row) throw httpError(404, 'User not found');
    res.json({ users: listFollowing(row.id) });
  });

  // Queue 23: «list matches» — titles the viewer and the people they follow
  // both keep on their lists (any statuses; the view shows whose is where).
  app.get('/api/user/common-lists', requireSiteUser, (req, res) => {
    const viewer = getUserByUsername(currentSiteUser(req));
    if (!viewer) throw httpError(401, 'Not logged in');
    const mine = listEntries(viewer.id);
    const mineByType = new Map([['anime', new Map(mine.anime.map((entry) => [entry.slug, entry]))], ['manga', new Map(mine.manga.map((entry) => [entry.slug, entry]))]]);
    const matches = [];
    for (const friend of listFollowing(viewer.id)) {
      const theirs = listEntries(friend.id);
      for (const mediaType of ['anime', 'manga']) {
        for (const their of theirs[mediaType]) {
          const myEntry = mineByType.get(mediaType).get(their.slug);
          if (!myEntry) continue;
          matches.push({
            username: friend.username,
            bloom: friend.bloom,
            mediaType,
            slug: their.slug,
            theirStatus: their.status,
            myStatus: myEntry.status,
            added: their.added,
          });
        }
      }
    }
    matches.sort((first, second) => (second.added > first.added ? 1 : second.added < first.added ? -1 : 0));
    res.json({ count: matches.length, items: matches.slice(0, 60) });
  });

  // Friends activity feed: the most recent real list activity (new entry,
  // status / rating / note change) of the people the viewer follows. Notes
  // are intentionally not included — they stay private.
  app.get('/api/feed', requireSiteUser, (req, res) => {
    const viewer = getUserByUsername(currentSiteUser(req));
    if (!viewer) throw httpError(401, 'Not logged in');
    res.json({ items: friendFeed(viewer.id) });
  });

  // ---------- Public catalog ----------
  app.get('/api/anime', (req, res) => {
    res.json(db.prepare('SELECT * FROM anime ORDER BY id ASC').all().map(rowToItem));
  });
  app.get('/api/anime/:slug', (req, res) => {
    const row = getBySlug(req.params.slug);
    if (!row) throw httpError(404, 'Anime not found');
    res.json(rowToItem(row));
  });
  app.get('/api/manga', (req, res) => {
    res.json(listManga());
  });

  // ---------- Admin: site-user management ----------
  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 50);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const { rows, total } = adminListUsers(q, limit, (page - 1) * limit);
    res.json({
      items: rows,
      total, page,
      pages: Math.max(Math.ceil(total / limit), 1),
    });
  });

  // Full site-user list as a downloadable CSV (Excel-friendly UTF-8 BOM).
  // Must be registered before the GET /api/admin/users/:username route so
  // "export.csv" is not swallowed as a username.
  app.get('/api/admin/users/export.csv', requireAdmin, (req, res) => {
    const rows = adminAllUsers();
    const header = 'username,bio,joined,anime_entries,manga_entries';
    const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [header].concat(rows.map((row) => [
      row.username, row.bio, row.joined, row.animeCount, row.mangaCount,
    ].map(esc).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="site-users.csv"');
    res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
  });

  app.get('/api/admin/users/:username', requireAdmin, (req, res) => {
    const user = adminGetUser(req.params.username);
    if (!user) throw httpError(404, 'User not found');
    res.json({ user, entries: listEntries(user.id) });
  });

  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const input = siteAdminUserCreate.parse(req.body);
    if (getUserByUsername(input.username)) throw httpError(409, `Username "${input.username}" is already taken`);
    const user = await createUser(input);
    res.status(201).json({ user });
  });

  app.patch('/api/admin/users/:username', requireAdmin, async (req, res) => {
    const user = adminGetUser(req.params.username);
    if (!user) throw httpError(404, 'User not found');
    const input = siteAdminUserPatch.parse(req.body);
    if (input.username && input.username !== user.username && getUserByUsername(input.username)) {
      throw httpError(409, `Username "${input.username}" is already taken`);
    }
    if (input.username && input.username !== user.username) await adminRenameUser(user.id, input.username);
    if (input.bio !== undefined) setBio(user.id, input.bio);
    if (input.password) await adminSetUserPassword(user.id, input.password);
    res.json({ user: adminGetUserById(user.id) });
  });

  app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
    const user = adminGetUser(req.params.username);
    if (!user) throw httpError(404, 'User not found');
    adminDeleteUser(user.id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/users/:username/entries/:mediaType/:slug', requireAdmin, (req, res) => {
    const user = adminGetUser(req.params.username);
    if (!user) throw httpError(404, 'User not found');
    const mediaType = req.params.mediaType === 'manga' ? 'manga' : 'anime';
    deleteEntry(user.id, mediaType, String(req.params.slug).trim());
    res.json({ ok: true, entries: listEntries(user.id) });
  });

  // Small overview stats for the admin header strip.
  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const titles = db.prepare('SELECT COUNT(*) AS n FROM anime').get().n + db.prepare('SELECT COUNT(*) AS n FROM manga').get().n;
    const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const listEntries = db.prepare('SELECT COUNT(*) AS n FROM user_entries').get().n;
    const listers = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM user_entries').get().n;
    const lastUser = db.prepare('SELECT username, created_at FROM users ORDER BY id DESC LIMIT 1').get();
    res.json({ titles, users, listEntries, listers, lastUser: lastUser && { username: lastUser.username, joined: lastUser.created_at } });
  });

  // ---------- Public: live search for the header combobox ----------
  // Matches the main title plus english / romaji / japanese / synonyms, so
  // e.g. "Sousou no Frieren" finds the same entry the English title does.
  // foldTitle keeps ordering, accents and Arabic letter variants forgiving.
  app.get('/api/search', (req, res) => {
    const query = foldTitle(String(req.query.q || '').trim());
    if (!query) { res.json({ items: [] }); return; }

    const titlesOf = (item) => {
      const titles = item.alternativeTitles || {};
      return [item.title, titles.english, titles.romaji, titles.japanese, ...(titles.synonyms || [])]
        .filter(Boolean)
        .map(foldTitle);
    };

    // One pass builds the anime cover fallback map AND the anime hits.
    const animeBase = new Map();
    const hits = [];
    for (const item of db.prepare('SELECT * FROM anime ORDER BY id ASC').all().map(rowToItem)) {
      animeBase.set(item.slug, item.image || '');
      const titles = titlesOf(item);
      if (!titles.includes(query) && !titles.some((value) => value.includes(query))) continue;
      hits.push({
        kind: 'anime',
        slug: item.slug,
        title: item.title,
        year: item.year,
        format: item.format,
        image: item.image,
        rank: titles.some((value) => value.startsWith(query)) ? 0 : 1,
      });
    }
    for (const item of listManga()) {
      const titles = [...titlesOf(item), ...[item.titleFa].filter(Boolean).map(foldTitle)];
      if (!titles.includes(query) && !titles.some((value) => value.includes(query))) continue;
      hits.push({
        kind: 'manga',
        slug: item.slug,
        title: item.title,
        year: item.year,
        format: item.format,
        // Manga covers reuse the matching anime cover; fall back to the plain PNG path.
        image: item.image || animeBase.get(item.slug) || coverUrlFor(item.slug),
        rank: titles.some((value) => value.startsWith(query)) ? 0 : 1,
      });
    }

    // Site users match too — the header combobox shows them after the titles.
    const users = db.prepare('SELECT username, bio, avatar_color FROM users ORDER BY id ASC').all()
      .filter((row) => foldTitle(row.username).includes(query))
      .slice(0, 4)
      .map((row) => ({
        kind: 'user',
        username: row.username,
        bio: row.bio,
        bloom: Number.parseInt(row.avatar_color, 10) || 12,
      }));

    res.json({ items: hits.sort((a, b) => a.rank - b.rank).slice(0, 8), users });
  });

  // ---------- Admin: list ----------
  app.get('/api/admin/anime', requireAdmin, (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    const where = q ? "WHERE title LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\'" : '';
    const params = q ? [like, like] : [];
    const total = db.prepare(`SELECT COUNT(*) AS n FROM anime ${where}`).get(...params).n;
    const rows = db.prepare(`SELECT * FROM anime ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
    res.json({
      items: rows.map((row) => { const { slug, title, format, year, sampleScore, image, updatedAt, malId } = rowToItem(row); return { slug, title, format, year, score: sampleScore, image, updatedAt, malId }; }),
      total, page, pages: Math.max(Math.ceil(total / limit), 1),
      withMalId: db.prepare('SELECT COUNT(*) AS n FROM anime WHERE mal_id IS NOT NULL').get().n,
    });
  });

  // ---------- Admin: create / update / delete ----------
  app.post('/api/anime', requireAdmin, (req, res) => {
    const input = animeInput.parse(req.body);
    if (input.slug && getBySlug(input.slug)) throw httpError(409, `Slug "${input.slug}" is already used`);
    const existing = getByMalId(input.malId);
    if (existing) throw httpError(409, `This MyAnimeList title is already in the catalog ("${existing.title}")`, { existingSlug: existing.slug });
    const slug = input.slug || uniqueSlug(input.title);
    const cover = input.tempCover ? promoteTempCover(slug, input.tempCover) || '' : '';
    const created = insertAnime(slug, input, cover);
    exportData();
    res.status(201).json(rowToItem(created));
  });

  app.put('/api/anime/:slug', requireAdmin, (req, res) => {
    const row = getBySlug(req.params.slug);
    if (!row) throw httpError(404, 'Anime not found');
    const input = animeInput.parse(req.body);
    const slug = input.slug || row.slug;
    if (slug !== row.slug && getBySlug(slug)) throw httpError(409, `Slug "${slug}" is already used`);
    const other = getByMalId(input.malId);
    if (other && other.id !== row.id) throw httpError(409, `This MyAnimeList title is already in the catalog ("${other.title}")`, { existingSlug: other.slug });
    let cover = renameCover(row.cover, slug);
    if (input.tempCover) cover = promoteTempCover(slug, input.tempCover) || cover;
    // Keep user list rows joined to the right slug before the anime row moves.
    if (slug !== row.slug) {
      db.prepare("UPDATE user_entries SET slug = ? WHERE media_type = 'anime' AND slug = ?").run(slug, row.slug);
    }
    const updated = updateAnime(row.id, slug, input, cover);
    exportData();
    res.json(rowToItem(updated));
  });

  app.patch('/api/admin/anime/:slug/airing-day', requireAdmin, (req, res) => {
    const row = getBySlug(req.params.slug);
    if (!row) throw httpError(404, 'Anime not found');
    const day = req.body?.airingDay;
    const value = (day === null || day === undefined || day === '') ? '' : String(day).trim();
    if (value && !WEEKDAYS.includes(value)) throw httpError(400, 'Invalid weekday');
    db.prepare('UPDATE anime SET airing_day = ? WHERE id = ?').run(value, row.id);
    exportData();
    res.json({ ok: true, airingDay: value });
  });

  app.delete('/api/anime/:slug', requireAdmin, (req, res) => {
    const row = getBySlug(req.params.slug);
    if (!row) throw httpError(404, 'Anime not found');
    removeCoversForSlug(row.slug); // cover files must not outlive the row
    deleteAnime(row.id);
    exportData();
    res.json({ ok: true });
  });

  app.post('/api/anime/:slug/cover', requireAdmin, upload.single('cover'), (req, res) => {
    const row = getBySlug(req.params.slug);
    if (!row) throw httpError(404, 'Anime not found');
    if (!req.file) throw httpError(400, 'No cover file uploaded (field name: cover)');
    const name = saveCoverBuffer(row.slug, req.file.buffer);
    db.prepare("UPDATE anime SET cover = ?, updated_at = datetime('now') WHERE id = ?").run(name, row.id);
    res.json(rowToItem(getBySlug(row.slug)));
  });

  // ---------- Admin: Jikan / MyAnimeList import ----------
  app.get('/api/admin/jikan/search', requireAdmin, async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) throw httpError(400, 'Type at least 2 characters');
    let results;
    try {
      results = await searchAnime(q);
    } catch (error) {
      // Jikan blocked/unreachable -> transparent AniList fallback (same response shape).
      if (!error?.network) throw error;
      console.log(`[import] Jikan unreachable, falling back to AniList for search "${q}"`);
      results = await anilistSearch(q);
    }
    const known = new Map(db.prepare('SELECT mal_id, slug FROM anime WHERE mal_id IS NOT NULL').all().map((r) => [r.mal_id, r.slug]));
    res.json(results.map((item) => ({ ...item, existingSlug: known.get(item.malId) || null })));
  });

  app.post('/api/admin/jikan/import', requireAdmin, async (req, res) => {
    const malId = Number(req.body?.malId);
    if (!Number.isInteger(malId) || malId <= 0) throw httpError(400, 'malId must be a positive integer');
    const existing = getByMalId(malId);
    if (existing) {
      // Re-importing the same entry from the admin edit form is an update, not a conflict.
      const currentSlug = String(req.body?.currentSlug || '').trim();
      if (!currentSlug || existing.slug !== currentSlug) throw httpError(409, `Already in the catalog: "${existing.title}"`, { existingSlug: existing.slug });
    }
    cleanupTemp();
    const { draft, tempCover, coverWarning } = await fetchExternalDraft(malId);
    draft.slug = uniqueSlug(draft.title);
    // Auto Persian synopsis so the form opens pre-filled (still editable).
    await draftPersian(draft);
    res.json({ draft, tempCover, coverWarning });
  });

  // Refresh overwrite for imported manga (rows with mal_id). Slug, fa content
  // and cover are preserved unless the source itself has something better.
  const refreshMangaFromSource = async (row) => {
    const payload = await fetchMangaDraft(row.mal_id);
    let cover = row.cover;
    let coverWarning = '';
    if (payload.coverUrl) {
      try { cover = saveCoverBuffer(row.slug, await downloadImage(payload.coverUrl)); }
      catch (error) { coverWarning = error.message; }
    }
    // Persian synopsis self-fills like the anime refresh: pipeline-generated fa
    // re-translates when the source changed; admin-authored fa is preserved.
    const storedMangaSynopsis = (() => {
      try {
        const parsed = JSON.parse(row.synopsis || '');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch { /* plain string source text */ }
      return typeof row.synopsis === 'string' ? row.synopsis : '';
    })();
    const persian = await planPersian(payload.synopsis, storedMangaSynopsis);
    const sourceEn = payload.synopsis || (storedMangaSynopsis && typeof storedMangaSynopsis === 'object' ? (storedMangaSynopsis.en || '') : storedMangaSynopsis);
    // updateManga stringifies whatever it receives; object = bilingual row.
    const mangaSynopsis = persian.fa
      ? { fa: persian.fa, en: sourceEn, ...(persian.auto ? { auto: true } : {}) }
      : (payload.synopsis || row.synopsis);
    const updated = updateManga(row.id, {
      title: payload.title || row.title,
      category: payload.category || row.category,
      year: payload.year || row.year,
      format: 'Manga',
      genres: payload.genres,
      publicationStatus: payload.publicationStatus || row.publication_status || '',
      chapters: payload.chapters ?? null,
      // Only borrowed rows get raw source text; seeded bilingual synopsis keeps its fa, en.
      synopsis: mangaSynopsis,
    }, { malId: payload.malId || row.mal_id, score: payload.score ?? row.score, cover });
    exportData();

    const before = { title: row.title, score: row.score, year: row.year, category: row.category };
    const after = { title: updated.title, score: updated.score, year: updated.year, category: updated.category };
    const changed = [];
    for (const field of Object.keys(before)) {
      if (before[field] !== after[field]) changed.push({ field, from: before[field], to: after[field] });
    }
    return {
      item: {
        slug: row.slug, malId: updated.mal_id, title: updated.title, category: updated.category,
        year: updated.year, format: updated.format, sampleScore: updated.score, cover: updated.cover,
        ...(updated.cover ? { image: `/covers/${updated.cover}` } : {}),
      },
      coverWarning,
      changes: changed,
    };
  };

  // Refresh every manga row that has a MyAnimeList id (admin bulk action).
  app.post('/api/admin/manga/refresh-all', requireAdmin, writeLimiter, async (req, res) => {
    cleanupTemp();
    const rows = db.prepare('SELECT * FROM manga WHERE mal_id IS NOT NULL ORDER BY id ASC').all();
    const results = [];
    for (const row of rows) {
      try {
        const { item, coverWarning, changes } = await refreshMangaFromSource(row);
        results.push({ slug: row.slug, title: item.title, ok: true, changes, ...(coverWarning ? { warning: coverWarning } : {}) });
      } catch (error) {
        results.push({ slug: row.slug, title: row.title, ok: false, error: error.message || String(error) });
      }
    }
    res.json({ updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
  });

// Queue 25: refresh one manga row (its button in the admin manga list).
app.post('/api/admin/manga/:slug/refresh', requireAdmin, writeLimiter, async (req, res) => {
  try {
    const row = getMangaBySlug(req.params.slug);
    if (!row) throw httpError(404, 'Manga not found');
    if (!row.mal_id) throw httpError(400, 'این مدخل شناسه‌ی MyAnimeList ندارد.');
    const { item, coverWarning, changes } = await refreshMangaFromSource(row);
    res.json({ ok: true, item, coverWarning, changes });
  } catch (error) {
    // Log with the route tag, then answer inline (the global error middleware
    // would only see a rethrow and double-log the same failure).
    console.error('[manga refresh]', error);
    const status = error?.status && error.status < 600 ? error.status : 500;
    res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message });
  }
});

// Queue 19 + 25: save Persian fields / full admin edit on a manga row.
// (This endpoint grew from the titleFa-only patch into the manga editor API.)
app.patch('/api/admin/manga/:slug', requireAdmin, (req, res) => {
  const row = getMangaBySlug(req.params.slug);
  if (!row) throw httpError(404, 'Manga not found');
  const input = mangaAdminPatch.parse(req.body || {});

  let synopsis;
  const base = (() => {
    let parsed = null;
    try { parsed = JSON.parse(row.synopsis || ''); } catch { parsed = null; }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { fa: parsed.fa || '', en: parsed.en || '' };
    return { fa: '', en: typeof row.synopsis === 'string' ? row.synopsis : '' };
  })();
  if (input.synopsisFa !== undefined || input.synopsis !== undefined) {
    synopsis = JSON.stringify({
      fa: input.synopsisFa !== undefined ? input.synopsisFa : base.fa,
      en: input.synopsis !== undefined ? input.synopsis : base.en,
    });
  }
  const updated = adminUpdateManga(row.id, {
    title: input.title,
    titleFa: input.titleFa,
    category: input.category,
    year: input.year,
    synopsis,
  }, { score: input.score });
  if (!updated) throw httpError(404, 'Manga not found');
  exportData();
  res.json({ ok: true, item: mangaRowToItem(updated) });
});

// Queue 25: admin removes a manga row (row + its cover file).
app.delete('/api/admin/manga/:slug', requireAdmin, (req, res) => {
  const row = getMangaBySlug(req.params.slug);
  if (!row) throw httpError(404, 'Manga not found');
  deleteManga(row.id);
  if (row.cover) {
    for (const name of fs.readdirSync(COVERS_DIR)) {
      if (name.startsWith(`${row.slug}.`)) fs.rmSync(path.join(COVERS_DIR, name), { force: true });
    }
  }
  exportData();
  res.json({ ok: true });
});

  // Bulk MyAnimeList range import (queue: bulk add). One request carries at
  // most BULK_MAX ids; the admin UI chunks larger ranges so progress stays
  // visible. Anime rows are persisted directly (no form round-trip) with the
  // same fetchExternalDraft pipeline the single import uses; manga rows land
  // in the manga catalog with mal_id/score/cover.
  const BULK_MAX = 50;

  // Shared manga fetch: Jikan first, AniList on network failure (draft keys: malId, title, category, year, format, score, genres, synopsis, information, availableAt, coverUrl).
  // PROVIDER=anilist and the Jikan breaker both switch this to AniList directly —
  // a fresh server otherwise pays a connection timeout per import before the fallback.
  const anilistDirect = () => jikanCircuitOpen() || /anilist/i.test(String(process.env.PROVIDER || ''));

  const fetchMangaDraft = async (malId) => {
    let payload;
    try {
      if (anilistDirect()) payload = await anilistMangaDraft(malId);
      else payload = mapJikanMangaToDraft(await fetchMangaFull(malId));
    } catch (error) {
      if (!error?.network) throw error;
      console.log(`[bulk] Jikan unreachable, falling back to AniList for manga ${malId}`);
      payload = await anilistMangaDraft(malId);
    }
    return payload;
  };

  app.post('/api/admin/anime/import-bulk', requireAdmin, writeLimiter, async (req, res) => {
    const mediaType = req.body?.mediaType === 'manga' ? 'manga' : 'anime';
    // Queue 26: facet discovery mode — returns candidate rows, writes nothing.
    if (req.body?.discover) {
      const items = await anilistFacetSearch({
        mediaType, genre: String(req.body.genre || ''), year: Number(req.body.year || 0), minScore: Number(req.body.minScore || 0), perPage: 30,
      });
      res.json({ mediaType, items });
      return;
    }
    // Queue 26: explicit id list (selected from discovery) instead of from/to.
    // An empty array is not a valid selector — treat it like an absent one.
    const idList = Array.isArray(req.body?.ids) && req.body.ids.length > 0 ? [...new Set(req.body.ids.map((id) => Math.floor(Number(id))))].filter((id) => Number.isInteger(id) && id > 0) : null;
    const from = idList ? idList[0] : Math.floor(Number(req.body?.from));
    const to = idList ? idList[idList.length - 1] : Math.floor(Number(req.body?.to));
    if (!idList && (!Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to <= 0)) throw httpError(400, 'Range must be positive integers');
    if (!idList && to < from) throw httpError(400, 'Range end must be equal to or greater than range start');
    const ids = idList || Array.from({ length: to - from + 1 }, (_, index) => from + index);
    if (ids.length > BULK_MAX) throw httpError(400, `Import at most ${BULK_MAX} ids per call — larger ranges are split by the admin UI`);
    // Queue 24: preview=true resolves each id against the provider but writes nothing.
    const preview = req.body?.preview === true;
    cleanupTemp();

    // One query resolves which of the requested ids already live in the catalog —
    // the per-item existence probe becomes a Map read.
    const knownRows = (() => {
      const table = mediaType === 'anime' ? 'anime' : 'manga';
      const placeholders = ids.map(() => '?').join(',');
      return new Map(db.prepare(
        `SELECT mal_id, slug, title FROM ${table} WHERE mal_id IS NOT NULL AND mal_id IN (${placeholders})`,
      ).all(...ids).map((r) => [r.mal_id, r]));
    })();

    // Fast path (batched AniList): when Jikan is not usable (breaker open,
    // JIKAN_DISABLED=1, or PROVIDER=anilist), every missing id resolves in ONE
    // batched GraphQL query and covers download concurrently — instead of N
    // serial Jikan connection timeouts + N throttled AniList queries.
    // With a healthy Jikan, per-item Jikan-first behavior is preserved.
    let fastMode = jikanCircuitOpen() || /anilist/i.test(String(process.env.PROVIDER || ''));
    let fastDrafts = new Map();   // malId -> draft (same shape as single import)
    const fastMissing = new Set(); // ids the provider has no row for
    const fastCovers = new Map(); // malId -> { token, warning } (staged temp covers)
    if (fastMode) {
      const need = ids.filter((id) => !knownRows.has(id));
      const tProvider = Date.now();
      let many;
      try {
        many = mediaType === 'anime' ? await anilistImportMany(need) : await anilistMangaDraftMany(need);
      } catch (error) {
        // AniList down (routine outage / datacenter block): hand the batch back
        // to the per-item loop, which transparently uses Jikan where it's
        // reachable (the deployment's datacenter IPs usually can). With
        // JIKAN_DISABLED the caller asked for AniList-only, so rethrow.
        if (process.env.JIKAN_DISABLED === '1') throw error;
        fastMode = false;
        console.log(`[bulk] AniList batch unavailable (${error.message}); falling back to per-item providers`);
      }
      if (fastMode) {
      const providerMs = Date.now() - tProvider;
      fastDrafts = many.found;
      for (const id of many.missing) fastMissing.add(id);
      // Preview never touches the filesystem; real imports stage covers
      // concurrently (6 at a time) so cdn latency is not serial.
      if (!preview && fastDrafts.size > 0) {
        const NO_COVER = 'MyAnimeList has no cover for this title';
        const tCovers = Date.now();
        await mapPool([...fastDrafts.values()], 6, async (draft) => {
          let token = '';
          let warning = NO_COVER;
          if (draft.coverUrl) {
            try { token = saveTempCover(await downloadImage(draft.coverUrl)); warning = ''; }
            catch (error) { warning = error.message; }
          }
          fastCovers.set(draft.malId, { token, warning });
        });
        console.log(`[bulk] fast path: ${need.length} ids in one provider query (${providerMs}ms), covers ${fastDrafts.size} concurrent (${Date.now() - tCovers}ms)`);
        // Auto Persian synopsis: translate fresh drafts once, pooled 4-way so
        // bulk stays a single-digit-percent tax on the provider+cover time.
        // Previews skip it (nothing is displayed), translation failures let
        // the row through English-only.
        if (!preview && fastDrafts.size > 0) {
          const translatable = [...fastDrafts.values()].filter((draft) => draft.synopsis);
          const tTranslate = Date.now();
          let translatedFa = 0;
          await mapPool(translatable, 4, async (draft) => {
            try {
              draft.synopsisFa = await translateSynopsis(draft.synopsis);
              translatedFa += 1;
            } catch (error) {
              console.error(`[bulk translate ${draft.malId}] ${error.message}`);
            }
          });
          console.log(`[bulk] fast path: Persian '${translatedFa}/${translatable.length}' (${Date.now() - tTranslate}ms)`);
        }
      }
      }
    }

    // 'missing' = the provider has no such id (gap ids / removed entries) —
    // reported separately so the admin can still save a previewed run that
    // merely contained absent ids.
    const isMissingErr = (error) => error?.status === 404 || /not found/i.test(String(error?.message || ''));
    const results = [];
    let imported = 0;
    let exists = 0;
    let failed = 0;
    let missing = 0;
    for (const malId of ids) {
      try {
        const existing = knownRows.get(malId);
        if (existing) {
          exists += 1;
          results.push({ malId, status: 'exists', title: existing.title, slug: existing.slug });
          continue;
        }
        if (fastMode) {
          if (fastMissing.has(malId)) {
            missing += 1;
            results.push({ malId, status: 'missing', error: 'Not on MyAnimeList' });
            continue;
          }
          const draft = fastDrafts.get(malId);
          if (!draft) {
            failed += 1;
            results.push({ malId, status: 'failed', error: 'Provider did not return this id' });
            continue;
          }
          if (preview) {
            results.push({ malId, status: 'ok', title: draft.title, year: draft.year, category: draft.category, score: draft.score ?? null });
            continue;
          }
          const coverInfo = fastCovers.get(malId) || { token: '', warning: '' };
          if (mediaType === 'anime') {
            const slug = uniqueSlug(draft.title);
            // The AniList fallback uses null airingDay for finished shows; the
            // form flow never parses that, but bulk persists directly.
            const draftForParse = {
              ...draft,
              slug,
              airingDay: typeof draft.airingDay === 'string' ? draft.airingDay : '',
              ...(draft.synopsisFa ? { synopsisAuto: true } : {}),
            };
            const tempCover = coverInfo.token;
            const input = animeInput.parse(tempCover ? { ...draftForParse, tempCover } : draftForParse);
            const cover = input.tempCover ? promoteTempCover(slug, input.tempCover) || '' : '';
            const created = insertAnime(slug, input, cover);
            imported += 1;
            results.push({ malId, status: 'imported', title: created.title, slug, ...(coverInfo.warning ? { warning: coverInfo.warning } : {}) });
          } else {
            const slug = uniqueMangaSlug(draft.title);
            let cover = '';
            try { cover = coverInfo.token ? (promoteTempCover(slug, coverInfo.token) || '') : ''; }
            catch (error) { coverInfo.warning = coverInfo.warning || error.message; }
            // Manga synopsis stays a bilingual { fa, en, auto? } object when the
            // pipeline produced Persian text; otherwise the legacy plain string.
            const mangaSynopsis = draft.synopsisFa
              ? { fa: draft.synopsisFa, en: draft.synopsis, auto: true }
              : draft.synopsis;
            const created = insertManga(
              { slug, title: draft.title, category: draft.category, year: draft.year, format: 'Manga', genres: draft.genres, synopsis: mangaSynopsis },
              { malId: draft.malId, score: draft.score, cover, publicationStatus: draft.publicationStatus || '', chapters: draft.chapters ?? null },
            );
            imported += 1;
            results.push({ malId, status: 'imported', title: created.title, slug, ...(coverInfo.warning ? { warning: coverInfo.warning } : {}) });
          }
          continue;
        }
        if (mediaType === 'anime') {
          const { draft, tempCover, coverWarning } = await fetchExternalDraft(malId);
          if (preview) {
            // No slug/cover side effects: just the facts the admin eyeballs.
            // The temp cover was saved for the form flow; discard it.
            if (tempCover) { try { fs.rmSync(path.join(TMP_DIR, tempCover), { force: true }); } catch { /* ignore */ } }
            results.push({ malId, status: 'ok', title: draft.title, year: draft.year, category: draft.category, score: draft.score ?? null });
            continue;
          }
          const slug = uniqueSlug(draft.title);
          // The AniList fallback uses null airingDay for finished shows; the
          // form flow never parses that, but bulk persists directly.
          await draftPersian(draft);
          const draftForParse = {
            ...draft,
            slug,
            airingDay: typeof draft.airingDay === 'string' ? draft.airingDay : '',
            ...(draft.synopsisFa ? { synopsisAuto: true } : {}),
          };

          const input = animeInput.parse(tempCover ? { ...draftForParse, tempCover } : draftForParse);
          const cover = input.tempCover ? promoteTempCover(slug, input.tempCover) || '' : '';
          const created = insertAnime(slug, input, cover);
          imported += 1;
          results.push({ malId, status: 'imported', title: created.title, slug, ...(coverWarning ? { warning: coverWarning } : {}) });
        } else {
          const payload = await fetchMangaDraft(malId);
          if (preview) {
            results.push({ malId, status: 'ok', title: payload.title, year: payload.year, category: payload.category, score: payload.score ?? null });
            continue;
          }
          const slug = uniqueMangaSlug(payload.title);
          let cover = '';
          let warning = '';
          if (payload.coverUrl) {
            try { cover = saveCoverBuffer(slug, await downloadImage(payload.coverUrl)); }
            catch (error) { warning = error.message; }
          } else {
            warning = 'MyAnimeList has no cover for this title';
          }
          await draftPersian(payload);
          const created = insertManga(
            { slug, title: payload.title, category: payload.category, year: payload.year, format: 'Manga', genres: payload.genres, synopsis: payload.synopsisFa ? { fa: payload.synopsisFa, en: payload.synopsis, auto: true } : payload.synopsis },
            { malId: payload.malId, score: payload.score, cover, publicationStatus: payload.publicationStatus || '', chapters: payload.chapters ?? null },
          );
          imported += 1;
          results.push({ malId, status: 'imported', title: created.title, slug, ...(warning ? { warning } : {}) });
        }
      } catch (error) {
        if (isMissingErr(error)) {
          missing += 1;
          results.push({ malId, status: 'missing', error: 'Not on MyAnimeList' });
        } else {
          failed += 1;
          results.push({ malId, status: 'failed', error: error.message });
        }
      }
    }
    if (imported > 0) exportData();
    res.json({ mediaType, preview, imported, exists, failed, missing, results });
  });

  // Shared: fetch an anime's latest external data (Jikan first unless disabled/broken,
  // transparent AniList fallback) + temp cover.
  const fetchExternalDraft = async (malId) => {
    let payload;
    try {
      if (anilistDirect()) payload = await anilistImport(malId);
      else payload = mapJikanToDraft(await fetchAnimeFull(malId));
    } catch (error) {
      if (!error?.network) throw error;
      console.log(`[import] Jikan unreachable, falling back to AniList for MAL ${malId}`);
      payload = await anilistImport(malId);
    }
    const { coverUrl, ...draft } = payload;
    let tempCover = '';
    let coverWarning = '';
    if (coverUrl) {
      try { tempCover = saveTempCover(await downloadImage(coverUrl)); } catch (error) { coverWarning = error.message; }
    } else {
      coverWarning = 'MyAnimeList has no cover for this title';
    }
    return { draft, tempCover, coverWarning };
  };

  // Shared: overwrite an existing DB row with fresh source data; slug is kept.
  // The airing day follows the source: a live broadcast day updates it, a
  // finished/upcoming show clears it, unknown keeps the stored day.
  const refreshRowFromSource = async (row) => {
    const { draft, tempCover, coverWarning } = await fetchExternalDraft(row.mal_id);
    // undefined = unknown source, keep the stored day; null / '' = clear; else the day itself.
    const airingDay = draft.airingDay === undefined ? (row.airing_day || '') : (draft.airingDay || '');
    // Persian synopsis self-fills: pipeline-generated fa re-translates when
    // the source English changed; admin-authored fa is preserved verbatim.
    const stored = parseSynopsis(row.synopsis);
    const persian = await planPersian(draft.synopsis, stored);
    const input = animeInput.parse({
      ...draft,
      slug: row.slug,
      airingDay,
      ...(persian.fa ? { synopsisFa: persian.fa, synopsisAuto: persian.auto } : {}),
      ...(tempCover ? { tempCover } : {}),
    });
    let cover = row.cover;
    if (input.tempCover) cover = promoteTempCover(row.slug, input.tempCover) || cover;
    const updated = updateAnime(row.id, row.slug, input, cover);
    // Small before/after report so the admin list can toast what changed.
    const before = rowToItem(row);
    const after = rowToItem(updated);
    const changed = [];
    if (before.title !== after.title) changed.push({ field: 'title', from: before.title, to: after.title });
    if (before.format !== after.format) changed.push({ field: 'format', from: before.format, to: after.format });
    if (before.sampleScore !== after.sampleScore) changed.push({ field: 'score', from: before.sampleScore, to: after.sampleScore });
    if ((before.airingDay || '') !== (after.airingDay || '')) changed.push({ field: 'airingDay', from: before.airingDay || '', to: after.airingDay || '' });
    if (JSON.stringify(before.synopsis) !== JSON.stringify(after.synopsis)) changed.push({ field: 'synopsis' });
    return { item: after, coverWarning, changes: changed };
  };

  // Refresh a single entry (its row button in the admin list).
  app.post('/api/admin/anime/:slug/refresh', requireAdmin, writeLimiter, async (req, res) => {
    const row = getBySlug(req.params.slug);
    if (!row) throw httpError(404, 'Anime not found');
    if (!row.mal_id) throw httpError(400, 'This entry has no MyAnimeList id stored; import it once from the edit form first.');
    cleanupTemp();
    const { item, coverWarning, changes } = await refreshRowFromSource(row);
    exportData();
    res.json({ item, coverWarning, changes });
  });

  // Refresh every entry that has a MyAnimeList id (admin bulk action).
  app.post('/api/admin/anime/refresh-all', requireAdmin, writeLimiter, async (req, res) => {
    cleanupTemp();
    const rows = db.prepare('SELECT * FROM anime WHERE mal_id IS NOT NULL ORDER BY id ASC').all();
    const results = [];
    for (const row of rows) {
      try {
        const { item, coverWarning, changes } = await refreshRowFromSource(row);
        results.push({ slug: item.slug, title: item.title, ok: true, changes, ...(coverWarning ? { warning: coverWarning } : {}) });
      } catch (error) {
        results.push({ slug: row.slug, title: row.title, ok: false, error: error.message || String(error) });
      }
    }
    exportData();
    res.json({ updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
  });

  app.get('/api/admin/temp-cover/:token', requireAdmin, (req, res) => {
    if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(req.params.token)) throw httpError(400, 'Bad token');
    const file = path.join(TMP_DIR, req.params.token);
    if (!fs.existsSync(file)) throw httpError(404, 'Temporary cover expired');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(file);
  });

  // ---------- Static files ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // Blob mode: /covers paths reaching the function (i.e. files absent from the
  // static layer) resolve from the warm-instance mirror or redirect to the
  // durable store; every other environment keeps plain static serving.
  app.use('/covers', (req, res, next) => {
    if (BLOB_MODE) {
      handleCoverRequest(req, res).catch(next);
      return;
    }
    next();
  }, express.static(COVERS_DIR));
  const dist = path.join(ROOT_DIR, 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false }));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
  } else {
    app.get('/', (req, res) => res.type('text').send('API is running. For the website run "npm run build" first, or use "npm start" (dev mode, http://127.0.0.1:5173).'));
  }

  // ---------- Errors ----------
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return res.status(400).json({ error: `${where}${issue.message}`, issues: error.issues.map((i) => ({ path: i.path, message: i.message })) });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Cover is larger than 2 MB' : error.message });
    }
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (/constraint failed/i.test(error.message)) return res.status(409).json({ error: 'Slug or MyAnimeList ID already exists' });
    const status = error.status && error.status < 600 ? error.status : 500;
    if (status === 500) console.error(error);
    return res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message, ...(error.existingSlug ? { existingSlug: error.existingSlug } : {}) });
  });

  return app;
};
