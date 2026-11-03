import './config.js';
import express from 'express';
import compression from 'compression';
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
import { sendMail, siteUrl, verifyEmailMail, resetPasswordMail } from './mailer.js';
import { animeInput, loginInput, mangaAdminPatch, siteAdminUserCreate, siteAdminUserPatch, siteChangePasswordInput, siteEmailChangeInput, siteForgotInput, siteProfileInput, siteRegisterInput, siteRecInput, siteReviewInput, siteResetInput, siteVerifyInput, siteUserEntryInput, malImportInput, WEEKDAYS } from './schemas.js';
import { foldTitle, parseSynopsis, rowToItem, slugify } from './shape.js';
import { deleteAnime, deleteManga, adminUpdateManga, getMangaByMalId, getMangaBySlug, getByMalId, getBySlug, insertAnime, insertManga, listManga, mangaRowToItem, updateAnime, updateManga } from './repo.js';
import { adminDeleteUser, adminAllUsers, adminGetUser, adminGetUserById, adminListUsers, adminRenameUser, adminSetUserPassword, consumeToken, createUser, ownUser, getUserByEmail, issueToken, markEmailVerified, setUserEmail, setUserPassword, tokenIssuedRecently, deleteEntry, followCounts, followUser, friendFeed, getUserByUsername, isFollowing, listEntries, canSeeList, setPrivacy, setAbout, tasteSimilarity, listFollowers, listFollowing, publicUser, setAvatarColor, setBio, unfollowUser, upsertEntry, verifySiteCredentials } from './users.js';
import { FAVORITE_KINDS, FAVORITE_LIMIT, addFavorite, favoriteInfo, listFavorites, removeFavorite } from './favorites.js';
import { addRec, adminDeleteRec, adminListRecs, listRecs, setRecHelpful } from './recs.js';
import { addReview, adminDeleteReview, adminListReviews, communityStats, listReviews, listUserReviews, setHelpful, titleExists } from './reviews.js';
import { listNotifications, markNotificationsRead, notifyFollow, notifyFollowersOfReview } from './notifications.js';
import { isSensitiveItem } from './sensitive.js';
import { searchCatalog } from './search.js';
import { exportData } from './export-data.js';
import { coverUrlFor,  cleanupTemp, MAX_IMAGE_BYTES, promoteTempCover, removeCoversForSlug, saveCoverBuffer, saveTempCover,
} from './images.js';
import { downloadImage, fetchAnimeFull, fetchMangaFull, tenraiCircuitOpen, mapTenraiMangaToDraft, mapTenraiToDraft, searchAnime, searchManga } from './tenrai.js';
import { anilistFacetSearch, anilistImport, anilistImportMany, anilistMangaDraft, anilistMangaDraftMany, anilistSearch } from './anilist.js';
import { mapPool } from './pool.js';
import { activateVpn, applyVpn, deleteVpnProfile, testVpn, turnOffVpn, vpnStatus } from './vpn.js';
import { getAutoImportState, runAutoImport, setAutoImportEnabled } from './auto-import.js';
import { registerSeoRoutes } from './seo.js';
import { registerExtrasRoutes } from './extras.js';
import { registerPeopleRoutes } from './people.js';
import { registerTopCharactersRoutes } from './topchars.js';
import { registerMediaRoutes } from './media.js';
import { registerStackRoutes } from './stacks.js';
import { registerSuggestionRoutes } from './suggestions.js';
import { registerFranchiseRoutes } from './franchise.js';
import { registerHealthRoutes } from './health.js';
import { recordMissing, registerMissingRoutes } from './missing-titles.js';
import { coverResizeHandler } from './cover-resize.js';
import { translateSynopsis, planPersian, draftPersian, inlinePersianEnabled } from './translate.js';

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
  return next;
};

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  // Behind nginx/Caddy every request arrives from the proxy; with TRUST_PROXY=1
  // the rate limiters key on the real client instead of one shared proxy IP
  // (and the CSRF host check can read x-forwarded-host).
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(compression());
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

  const mailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many email requests. Try again later.' } });

  // Link redemption is guarded by 256-bit tokens, so its limit can be looser (shared carrier IPs).
  const tokenLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });

  // Mail problems must never break the action that triggered them.
  const sendVerification = async (row) => {
    try {
      if (!row.email || row.email_verified_at || tokenIssuedRecently(row.id, 'verify')) return;
      const link = `${siteUrl()}/verify-email?token=${issueToken(row.id, 'verify')}`;
      await sendMail({ to: row.email, ...verifyEmailMail({ username: row.username, link }) });
    } catch (err) { console.error('[mail] verification failed:', err.message); }
  };

  app.post('/api/user/register', registerLimiter, async (req, res) => {
    const input = siteRegisterInput.parse(req.body);
    if (getUserByUsername(input.username)) throw httpError(409, `Username "${input.username}" is already taken`);
    if (getUserByEmail(input.email)) throw httpError(409, 'This email is already used by another account');
    const user = await createUser(input);
    setUserSession(req, res, user.username);
    await sendVerification(getUserByUsername(user.username));
    res.status(201).json({ user: ownUser(getUserByUsername(user.username)) });
  });

  // Forgot password: always answers ok, so emails cannot be probed.
  // Only verified addresses get a link.
  app.post('/api/user/forgot', mailLimiter, async (req, res) => {
    const { email } = siteForgotInput.parse(req.body);
    const row = getUserByEmail(email);
    if (row && row.email_verified_at && !tokenIssuedRecently(row.id, 'reset')) {
      try {
        const link = `${siteUrl()}/reset-password?token=${issueToken(row.id, 'reset')}`;
        await sendMail({ to: row.email, ...resetPasswordMail({ username: row.username, link }) });
      } catch (err) { console.error('[mail] reset failed:', err.message); }
    }
    res.json({ ok: true });
  });

  app.post('/api/user/reset', tokenLimiter, async (req, res) => {
    const input = siteResetInput.parse(req.body);
    const row = consumeToken(input.token, 'reset');
    if (!row) throw httpError(400, 'This link is invalid or has expired. Request a new one.');
    await setUserPassword(row.id, input.newPassword);
    markEmailVerified(row.id); // opening the link proves the inbox is theirs
    setUserSession(req, res, row.username);
    res.json({ user: ownUser(getUserByUsername(row.username)) });
  });

  app.post('/api/user/verify-email', tokenLimiter, (req, res) => {
    const { token } = siteVerifyInput.parse(req.body);
    const row = consumeToken(token, 'verify');
    if (!row) throw httpError(400, 'This link is invalid or has expired. Request a new one.');
    markEmailVerified(row.id);
    res.json({ ok: true });
  });

  app.post('/api/user/resend-verification', requireSiteUser, mailLimiter, async (req, res) => {
    const row = getUserByUsername(currentSiteUser(req));
    if (!row?.email) throw httpError(400, 'Add an email first');
    if (row.email_verified_at) return res.json({ ok: true, alreadyVerified: true });
    if (tokenIssuedRecently(row.id, 'verify')) throw httpError(429, 'A link was just sent. Wait a minute and try again.');
    await sendVerification(row);
    res.json({ ok: true });
  });

  // Add or change the email (needs the password; the new address starts unverified).
  app.post('/api/user/email', requireSiteUser, siteLoginLimiter, async (req, res) => {
    const input = siteEmailChangeInput.parse(req.body);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    if (!(await verifySiteCredentials(row.username, input.password)).ok) throw httpError(403, 'Password is wrong');
    const taken = getUserByEmail(input.email);
    if (taken && taken.id !== row.id) throw httpError(409, 'This email is already used by another account');
    if (!(taken && taken.id === row.id)) setUserEmail(row.id, input.email);
    await sendVerification(getUserByUsername(row.username));
    res.json({ user: ownUser(getUserByUsername(row.username)) });
  });

  // Logged-in: change password (revokes other sessions, keeps this one).
  app.post('/api/user/password', requireSiteUser, siteLoginLimiter, async (req, res) => {
    const input = siteChangePasswordInput.parse(req.body);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    if (!(await verifySiteCredentials(row.username, input.currentPassword)).ok) throw httpError(403, 'Current password is wrong');
    await setUserPassword(row.id, input.newPassword);
    setUserSession(req, res, row.username);
    res.json({ ok: true });
  });

  app.post('/api/user/login', siteLoginLimiter, async (req, res) => {
    const { username, password } = loginInput.parse(req.body);
    const result = await verifySiteCredentials(username, password);
    if (!result.ok) throw httpError(401, 'Wrong username or password');
    setUserSession(req, res, result.username);
    res.json({ user: ownUser(getUserByUsername(result.username)), ok: true });
  });

  app.get('/api/user/me', (req, res) => {
    const username = currentSiteUser(req);
    const row = username ? getUserByUsername(username) : null;
    if (!row) return res.json({ user: null });
    // Stale token (password changed meanwhile) counts as logged out here too.
    if (!userTokenValid(row, req)) return res.json({ user: null });
    res.json({ user: ownUser(row), entries: listEntries(row.id) });
  });

  app.put('/api/user/me', requireSiteUser, (req, res) => {
    const input = siteProfileInput.parse(req.body);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    if (input.bio !== undefined) setBio(row.id, input.bio);
    if (input.avatarColor !== undefined) setAvatarColor(row.id, input.avatarColor);
    if (input.about !== undefined) setAbout(row.id, input.about);
    if (input.privacy) setPrivacy(row.id, input.privacy);
    res.json({ user: ownUser(getUserByUsername(row.username)) });
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
    upsertEntry(row.id, input.mediaType, input.slug, input.status, input.note, input.rating, input.progress, {
      startDate: input.startDate, finishDate: input.finishDate, rewatch: input.rewatch, priority: input.priority, tags: input.tags,
    });
    res.json(listEntries(row.id));
  });

  // Download the member's own list: MyAnimeList-compatible XML (re-importable there), CSV or JSON.
  const exportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many exports. Try again later.' } });
  app.get('/api/user/export', requireSiteUser, exportLimiter, (req, res) => {
    const type = req.query.type === 'manga' ? 'manga' : 'anime';
    const format = ['xml', 'csv', 'json'].includes(req.query.format) ? req.query.format : 'xml';
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    const table = type === 'anime' ? 'anime' : 'manga';
    const entries = db.prepare(`
      SELECT e.slug, e.status, e.note, e.rating, e.progress, e.start_date, e.finish_date, e.rewatch, e.priority, e.tags, e.created_at, t.title, t.mal_id
      FROM user_entries e LEFT JOIN ${table} t ON t.slug = e.slug
      WHERE e.user_id = ? AND e.media_type = ? ORDER BY e.created_at, e.rowid
    `).all(row.id, type);
    const statusText = {
      watching: type === 'anime' ? 'Watching' : 'Reading', completed: 'Completed', on_hold: 'On-Hold', dropped: 'Dropped',
      planned: type === 'anime' ? 'Plan to Watch' : 'Plan to Read',
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `anitale-${type}list-${stamp}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.${format}"`);
    const cdata = (value) => `<![CDATA[${String(value ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
    if (format === 'json') {
      res.type('application/json; charset=utf-8').send(JSON.stringify({ type, exportedAt: new Date().toISOString(), entries: entries.map((e) => ({ malId: e.mal_id, title: e.title, slug: e.slug, status: e.status, score: e.rating, progress: e.progress, startDate: e.start_date || null, finishDate: e.finish_date || null, rewatch: e.rewatch || 0, priority: e.priority || null, tags: e.tags ? e.tags.split(',') : [], note: e.note })) }, null, 2));
      return;
    }
    if (format === 'csv') {
      const cell = (value) => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
      const lines = [['mal_id', 'title', 'status', 'score', type === 'anime' ? 'episodes_watched' : 'chapters_read', 'start_date', 'finish_date', type === 'anime' ? 'times_watched' : 'times_read', 'priority', 'tags', 'note'].join(',')];
      for (const e of entries) lines.push([e.mal_id ?? '', cell(e.title), statusText[e.status], e.rating ?? '', e.progress ?? '', e.start_date ?? '', e.finish_date ?? '', e.rewatch || 0, e.priority ?? '', cell(e.tags), cell(e.note)].join(','));
      res.type('text/csv; charset=utf-8').send(`﻿${lines.join('\r\n')}\r\n`);
      return;
    }
    // XML: MyAnimeList can only hold titles it knows, so entries without a MAL id are left out.
    const usable = entries.filter((e) => e.mal_id);
    const parts = ['<?xml version="1.0" encoding="UTF-8" ?>', '<myanimelist>', '\t<myinfo>', `\t\t<user_id>0</user_id>`, `\t\t<user_name>${cdata(row.username)}</user_name>`,
      `\t\t<user_export_type>${type === 'anime' ? 1 : 2}</user_export_type>`, `\t\t<user_total_${type}>${usable.length}</user_total_${type}>`, '\t</myinfo>'];
    for (const e of usable) {
      const score = e.rating || 0;
      const startDate = e.start_date || '0000-00-00';
      const finishDate = e.finish_date || '0000-00-00';
      const priority = (e.priority || 'low').toUpperCase();
      const tags = cdata(e.tags || '');
      if (type === 'anime') {
        parts.push('\t<anime>', `\t\t<series_animedb_id>${e.mal_id}</series_animedb_id>`, `\t\t<series_title>${cdata(e.title)}</series_title>`,
          `\t\t<my_watched_episodes>${e.progress ?? 0}</my_watched_episodes>`, `\t\t<my_start_date>${startDate}</my_start_date>`, `\t\t<my_finish_date>${finishDate}</my_finish_date>`,
          `\t\t<my_score>${score}</my_score>`, `\t\t<my_status>${statusText[e.status]}</my_status>`, `\t\t<my_comments>${cdata(e.note)}</my_comments>`, `\t\t<my_times_watched>${e.rewatch || 0}</my_times_watched>`, `\t\t<my_priority>${priority}</my_priority>`, `\t\t<my_tags>${tags}</my_tags>`, '\t\t<update_on_import>1</update_on_import>', '\t</anime>');
      } else {
        parts.push('\t<manga>', `\t\t<manga_mangadb_id>${e.mal_id}</manga_mangadb_id>`, `\t\t<manga_title>${cdata(e.title)}</manga_title>`,
          `\t\t<my_read_chapters>${e.progress ?? 0}</my_read_chapters>`, `\t\t<my_start_date>${startDate}</my_start_date>`, `\t\t<my_finish_date>${finishDate}</my_finish_date>`,
          `\t\t<my_score>${score}</my_score>`, `\t\t<my_status>${statusText[e.status]}</my_status>`, `\t\t<my_comments>${cdata(e.note)}</my_comments>`, `\t\t<my_times_read>${e.rewatch || 0}</my_times_read>`, `\t\t<my_priority>${priority}</my_priority>`, `\t\t<my_tags>${tags}</my_tags>`, '\t\t<update_on_import>1</update_on_import>', '\t</manga>');
      }
    }
    parts.push('</myanimelist>');
    res.type('application/xml; charset=utf-8').send(parts.join('\n'));
  });

  // Import a chunk of a MyAnimeList export. Titles are matched by MAL id against the local catalog;
  // existing entries are kept unless overwrite is set. Unmatched ids are returned so the page can list them.
  const malImportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many imports. Try again later.' } });
  app.post('/api/user/import-mal', requireSiteUser, malImportLimiter, (req, res) => {
    const input = malImportInput.parse(req.body);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    const slugByMal = {
      anime: new Map(db.prepare('SELECT mal_id, slug FROM anime WHERE mal_id IS NOT NULL').all().map((r) => [r.mal_id, r.slug])),
      manga: new Map(db.prepare('SELECT mal_id, slug FROM manga WHERE mal_id IS NOT NULL').all().map((r) => [r.mal_id, r.slug])),
    };
    const owned = new Set(db.prepare('SELECT media_type, slug FROM user_entries WHERE user_id = ?').all(row.id).map((e) => `${e.media_type}:${e.slug}`));
    const result = { added: 0, updated: 0, skipped: 0, unmatched: [] };
    const missingToRecord = [];
    db.exec('BEGIN');
    try {
      for (const item of input.items) {
        const slug = slugByMal[item.type].get(item.malId);
        if (!slug) { result.unmatched.push({ type: item.type, malId: item.malId }); missingToRecord.push(item); continue; }
        const key = `${item.type}:${slug}`;
        if (owned.has(key) && !input.overwrite) { result.skipped += 1; continue; }
        upsertEntry(row.id, item.type, slug, item.status, undefined, item.score ? item.score : undefined, item.progress, {
          startDate: item.startDate ?? undefined, finishDate: item.finishDate ?? undefined, rewatch: item.rewatch, priority: item.priority, tags: item.tags, noAutoDates: true,
        });
        if (owned.has(key)) result.updated += 1; else { result.added += 1; owned.add(key); }
      }
      recordMissing(row.id, missingToRecord);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json(result);
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
        (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND ((e.media_type = 'anime' AND u.privacy_anime = 'public') OR (e.media_type = 'manga' AND u.privacy_manga = 'public'))) AS total_entries,
        (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.status = 'watching' AND ((e.media_type = 'anime' AND u.privacy_anime = 'public') OR (e.media_type = 'manga' AND u.privacy_manga = 'public'))) AS watching,
        (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.status = 'completed' AND ((e.media_type = 'anime' AND u.privacy_anime = 'public') OR (e.media_type = 'manga' AND u.privacy_manga = 'public'))) AS completed,
        (SELECT COUNT(*) FROM user_entries e WHERE e.user_id = u.id AND e.status = 'planned' AND ((e.media_type = 'anime' AND u.privacy_anime = 'public') OR (e.media_type = 'manga' AND u.privacy_manga = 'public'))) AS planned
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
    const seeAnime = canSeeList(row, 'anime', viewer?.id ?? null);
    const seeManga = canSeeList(row, 'manga', viewer?.id ?? null);
    res.json({
      user: { ...publicUser(row), about: row.about || '' },
      entries: {
        anime: seeAnime ? mine.anime.map(({ note, ...rest }) => rest) : [],
        manga: seeManga ? mine.manga.map(({ note, ...rest }) => rest) : [],
      },
      // Tells the page to say "this list is private" instead of "nothing here".
      hidden: { anime: !seeAnime, manga: !seeManga },
      reviews: listUserReviews(row.id, 10, viewer?.id ?? null),
      favorites: listFavorites(row.id),
      followers: counts.followers,
      following: counts.following,
      ...(viewer && viewer.id !== row.id ? { isFollowing: isFollowing(viewer.id, row.id) } : {}),
      ...(viewer && viewer.id !== row.id ? { similarity: tasteSimilarity(viewer.id, row.id) } : {}),
    });
  });

  // ---------- Notifications (bell) ----------
  app.get('/api/user/notifications', requireSiteUser, (req, res) => {
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');
    res.json(listNotifications(row.id));
  });

  app.post('/api/user/notifications/read', requireSiteUser, writeLimiter, (req, res) => {
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
    markNotificationsRead(row.id, req.body?.all === true ? null : (ids || []));
    res.json({ ok: true });
  });

  // ---------- Community score + reviews ----------
  const reviewLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many review changes. Try again later.' } });
  const mediaParam = (req) => {
    const mediaType = req.params.mediaType;
    if (mediaType !== 'anime' && mediaType !== 'manga') throw httpError(404, 'Not found');
    return mediaType;
  };
  const viewerId = (req) => {
    const name = currentSiteUser(req);
    const row = name ? getUserByUsername(name) : null;
    return row && userTokenValid(row, req) ? row.id : null;
  };

  app.get('/api/community/:mediaType/:slug', (req, res) => {
    const mediaType = mediaParam(req);
    res.setHeader('Cache-Control', 'no-cache');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const reviews = listReviews(mediaType, req.params.slug, { viewerId: viewerId(req), limit: 10, offset: (page - 1) * 10, sort: ['new', 'helpful', 'high', 'low'].includes(req.query.sort) ? req.query.sort : 'new' });
    res.json({ stats: communityStats(mediaType, req.params.slug), reviews: reviews.items, total: reviews.total, page });
  });

  app.post('/api/user/reviews', requireSiteUser, reviewLimiter, (req, res) => {
    const input = siteReviewInput.parse(req.body);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    if (!titleExists(input.mediaType, input.slug)) throw httpError(404, 'Title not found');
    if (!addReview(row.id, input.mediaType, input.slug, input.body, input.spoiler)) throw httpError(409, 'You already reviewed this title');
    notifyFollowersOfReview(row.id, input.mediaType, input.slug);
    res.status(201).json({ ok: true });
  });

  // "Helpful" on someone else's review (PUT = on, DELETE = off).
  const helpfulHandler = (on) => (req, res) => {
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    const id = Number.parseInt(req.params.id, 10);
    const result = Number.isInteger(id) ? setHelpful(row.id, id, on) : null;
    if (!result) throw httpError(404, 'Review not found, or it is yours');
    res.json({ ok: true, ...result });
  };
  app.put('/api/user/reviews/:id/helpful', requireSiteUser, reviewLimiter, helpfulHandler(true));
  app.delete('/api/user/reviews/:id/helpful', requireSiteUser, reviewLimiter, helpfulHandler(false));

  // ---------- Favorites (hearts on titles, characters and people) ----------
  const favLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 200, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many changes. Try again later.' } });
  const favParams = (req) => {
    const kind = req.params.kind;
    const ref = String(req.params.ref || '').slice(0, 120);
    if (!FAVORITE_KINDS.includes(kind) || !ref) throw httpError(404, 'Not found');
    return { kind, ref };
  };
  app.get('/api/favorites/:kind/:ref', (req, res) => {
    const { kind, ref } = favParams(req);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ ...favoriteInfo(kind, ref, viewerId(req)), limit: FAVORITE_LIMIT });
  });
  app.put('/api/user/favorites/:kind/:ref', requireSiteUser, favLimiter, (req, res) => {
    const { kind, ref } = favParams(req);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    const result = addFavorite(row.id, kind, ref);
    if (result === 'missing') throw httpError(404, 'Not found');
    if (result === 'limit') throw httpError(409, `You can keep at most ${FAVORITE_LIMIT} favorites in this category`);
    res.json({ ok: true, ...favoriteInfo(kind, ref, row.id) });
  });
  app.delete('/api/user/favorites/:kind/:ref', requireSiteUser, favLimiter, (req, res) => {
    const { kind, ref } = favParams(req);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    removeFavorite(row.id, kind, ref);
    res.json({ ok: true, ...favoriteInfo(kind, ref, row.id) });
  });

  registerSuggestionRoutes(app, { requireSiteUser, requireAdmin, currentSiteUser, getUserByUsername, httpError });
  registerStackRoutes(app, { requireSiteUser, currentSiteUser, getUserByUsername, viewerId, httpError });

  // ---------- Recommendations ("if you liked this, try that") ----------
  app.get('/api/recs/:mediaType/:slug', (req, res) => {
    const mediaType = mediaParam(req);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ items: listRecs(mediaType, req.params.slug, { viewerId: viewerId(req) }) });
  });

  app.post('/api/user/recs', requireSiteUser, reviewLimiter, (req, res) => {
    const input = siteRecInput.parse(req.body);
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    if (input.slug === input.other) throw httpError(400, 'Pick a different title');
    if (!titleExists(input.mediaType, input.slug) || !titleExists(input.mediaType, input.other)) throw httpError(404, 'Title not found');
    if (!addRec(row.id, input.mediaType, input.slug, input.other, input.body)) throw httpError(409, 'You already recommended this pair');
    res.status(201).json({ ok: true });
  });

  const recHelpful = (on) => (req, res) => {
    const row = getUserByUsername(currentSiteUser(req));
    if (!row) throw httpError(401, 'Not logged in');
    const id = Number.parseInt(req.params.id, 10);
    const result = Number.isInteger(id) ? setRecHelpful(row.id, id, on) : null;
    if (!result) throw httpError(404, 'Recommendation not found, or it is yours');
    res.json({ ok: true, ...result });
  };
  app.put('/api/user/recs/:id/helpful', requireSiteUser, reviewLimiter, recHelpful(true));
  app.delete('/api/user/recs/:id/helpful', requireSiteUser, reviewLimiter, recHelpful(false));

  app.get('/api/admin/recs', requireAdmin, (req, res) => res.json({ items: adminListRecs() }));
  app.delete('/api/admin/recs/:id', requireAdmin, (req, res) => {
    if (!adminDeleteRec(Number(req.params.id))) throw httpError(404, 'Recommendation not found');
    res.json({ ok: true });
  });

  app.get('/api/admin/reviews', requireAdmin, (req, res) => {
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 15));
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const { items, total } = adminListReviews({ q: String(req.query.q || ''), limit, offset: (page - 1) * limit });
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  });

  app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
    if (!adminDeleteReview(Number(req.params.id))) throw httpError(404, 'Review not found');
    res.json({ ok: true });
  });

  // Follow graph — follow, unfollow, and both connection lists.
  app.post('/api/users/:username/follow', requireSiteUser, (req, res) => {
    const target = getUserByUsername(req.params.username);
    if (!target) throw httpError(404, 'User not found');
    const viewer = getUserByUsername(currentSiteUser(req));
    if (!viewer) throw httpError(401, 'Not logged in');
    if (viewer.id === target.id) throw httpError(400, 'You cannot follow yourself');
    if (followUser(viewer.id, target.id)) notifyFollow(target.id, viewer.id);
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

  // Signed-in viewers also get a taste-match percent next to each member (first 100 only).
  const withSimilarity = (req, users) => {
    const viewer = getUserByUsername(currentSiteUser(req));
    if (!viewer) return users;
    return users.map((person, index) => (index < 100 && person.id !== viewer.id ? { ...person, similarity: tasteSimilarity(viewer.id, person.id) } : person));
  };

  app.get('/api/users/:username/followers', (req, res) => {
    const row = getUserByUsername(req.params.username);
    if (!row) throw httpError(404, 'User not found');
    res.json({ users: withSimilarity(req, listFollowers(row.id)) });
  });

  app.get('/api/users/:username/following', (req, res) => {
    const row = getUserByUsername(req.params.username);
    if (!row) throw httpError(404, 'User not found');
    res.json({ users: withSimilarity(req, listFollowing(row.id)) });
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
      const friendRow = getUserByUsername(friend.username);
      for (const mediaType of ['anime', 'manga']) {
        if (!canSeeList(friendRow, mediaType, viewer.id)) continue;
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
  // Catalog reads are public and identical for everyone, so the CDN may serve
  // them for a minute and refresh in the background (admin edits show up within
  // ~1 minute; browsers revalidate every time because max-age is absent).
  const publicCatalogCache = (res) => res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  app.get('/api/anime', (req, res) => {
    publicCatalogCache(res);
    res.json(db.prepare('SELECT * FROM anime ORDER BY id ASC').all().map(rowToItem));
  });
  app.get('/api/anime/:slug', (req, res) => {
    const row = getBySlug(req.params.slug);
    if (!row) throw httpError(404, 'Anime not found');
    publicCatalogCache(res);
    res.json(rowToItem(row));
  });
  app.get('/api/manga', (req, res) => {
    publicCatalogCache(res);
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
    const sfw = req.query.sfw === '1';
    for (const item of db.prepare('SELECT * FROM anime ORDER BY id ASC').all().map(rowToItem)) {
      animeBase.set(item.slug, item.image || '');
      if (sfw && isSensitiveItem(item)) continue;
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
      if (sfw && isSensitiveItem(item)) continue;
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

  // Full search page: relevance ranking, typo tolerance, filters and facets.
  const searchLimiter = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many searches' } });
  app.get('/api/search/full', searchLimiter, (req, res) => {
    const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
    const text = String(req.query.q || '').slice(0, 80);
    // Comma separated genre lists (at most 10 names), and a 4-digit year in a sane range.
    const list = (value) => String(value || '').split(',').map((name) => name.trim().slice(0, 40)).filter(Boolean).slice(0, 10);
    const yearOf = (value) => { const n = Number.parseInt(value, 10); return n >= 1900 && n <= 2100 ? n : 0; };
    const result = searchCatalog({
      q: text,
      type: pick(String(req.query.type || ''), ['anime', 'manga'], 'all'),
      genres: list(req.query.genre),
      excludeGenres: list(req.query.xgenre),
      year: String(req.query.year || '').slice(0, 4),
      fromYear: yearOf(req.query.from),
      toYear: yearOf(req.query.to),
      format: String(req.query.format || '').slice(0, 30),
      status: pick(String(req.query.status || ''), ['airing', 'finished', 'upcoming', 'other'], ''),
      studio: String(req.query.studio || '').slice(0, 80),
      rating: String(req.query.rating || '').slice(0, 12),
      letter: /^[A-Za-z#]$/.test(String(req.query.letter || '')) ? String(req.query.letter).toUpperCase() : '',
      minScore: Math.min(10, Math.max(0, Number(req.query.min) || 0)),
      sort: pick(String(req.query.sort || ''), ['score', 'new', 'old', 'az', 'pop', 'votes', 'eps'], ''),
      page: Math.max(1, Number.parseInt(req.query.page, 10) || 1),
      sfw: req.query.sfw === '1',
    });
    const needle = foldTitle(text.trim());
    const users = needle
      ? db.prepare('SELECT username, bio, avatar_color FROM users ORDER BY id ASC').all()
        .filter((row) => foldTitle(row.username).includes(needle))
        .slice(0, 6)
        .map((row) => ({ username: row.username, bio: String(row.bio || '').slice(0, 80), bloom: Number.parseInt(row.avatar_color, 10) || 12 }))
      : [];
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ ...result, users });
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

  // ---------- Admin: MyAnimeList import (Tenrai first, AniList as fallback) ----------
  app.get('/api/admin/catalog/search', requireAdmin, async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) throw httpError(400, 'Type at least 2 characters');
    const mediaType = req.query.type === 'manga' ? 'manga' : 'anime';
    let results;
    try {
      results = mediaType === 'manga' ? await searchManga(q) : await searchAnime(q);
    } catch (error) {
      // Tenrai unreachable/refusing -> transparent AniList fallback (same response shape).
      if (!error?.network) throw error;
      console.log(`[import] Tenrai unreachable, falling back to AniList for ${mediaType} search "${q}"`);
      results = await anilistSearch(q, mediaType);
    }
    const known = new Map(db.prepare(`SELECT mal_id, slug FROM ${mediaType} WHERE mal_id IS NOT NULL`).all().map((r) => [r.mal_id, r.slug]));
    res.json(results.map((item) => ({ ...item, existingSlug: known.get(item.malId) || null })));
  });

  app.post('/api/admin/catalog/import', requireAdmin, async (req, res) => {
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
  const refreshMangaFromSource = async (row, { deferPersian = false } = {}) => {
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
    const persian = await planPersian(payload.synopsis, storedMangaSynopsis, { defer: deferPersian });
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

  // ---------- Bulk refresh as a background job ----------
  // Refreshing every title takes minutes (one source request + cover per row). A single HTTP request that
  // long is cut by the CDN / nginx timeout, so the admin starts a job and polls its progress instead.
  // The job keeps running on the server even if the admin page is closed; clicking the button again
  // while it runs just joins the running job.
  const bulkJobs = new Map();
  const bulkView = (job) => {
    if (!job) return { running: false, total: 0, done: 0, idle: true };
    const { running, total, done } = job;
    const base = { running, total, done, updated: job.results.filter((r) => r.ok).length, failed: job.results.filter((r) => !r.ok).length };
    return running ? base : { ...base, results: job.results };
  };
  const startBulk = (kind, rows, runRow, onFinish) => {
    const running = bulkJobs.get(kind);
    if (running?.running) return running;
    const job = { running: true, total: rows.length, done: 0, results: [] };
    bulkJobs.set(kind, job);
    (async () => {
      for (const row of rows) {
        try {
          job.results.push(await runRow(row));
        } catch (error) {
          job.results.push({ slug: row.slug, title: row.title, ok: false, error: error.message || String(error) });
        }
        job.done += 1;
      }
    })()
      .catch((error) => console.error(`[${kind} refresh-all]`, error))
      .finally(() => {
        try { onFinish?.(); } catch (error) { console.error(`[${kind} refresh-all finish]`, error); }
        job.running = false;
      });
    return job;
  };

  // Refresh every manga row that has a MyAnimeList id (admin bulk action).
  app.post('/api/admin/manga/refresh-all', requireAdmin, writeLimiter, (req, res) => {
    cleanupTemp();
    const rows = db.prepare('SELECT * FROM manga WHERE mal_id IS NOT NULL ORDER BY id ASC').all();
    const deferPersian = !inlinePersianEnabled();
    startBulk('manga', rows, async (row) => {
      const { item, coverWarning, changes } = await refreshMangaFromSource(row, { deferPersian });
      return { slug: row.slug, title: item.title, ok: true, changes, ...(coverWarning ? { warning: coverWarning } : {}) };
    });
    res.json(bulkView(bulkJobs.get('manga')));
  });
  app.get('/api/admin/manga/refresh-all', requireAdmin, (req, res) => res.json(bulkView(bulkJobs.get('manga'))));

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

  // Shared manga fetch: Tenrai first, AniList on network failure (draft keys: malId, title, category, year, format, score, genres, synopsis, information, availableAt, coverUrl).
  // PROVIDER=anilist and the Tenrai breaker both switch this to AniList directly —
  // a fresh server otherwise pays a connection timeout per import before the fallback.
  const anilistDirect = () => tenraiCircuitOpen() || /anilist/i.test(String(process.env.PROVIDER || ''));

  const fetchMangaDraft = async (malId) => {
    let payload;
    try {
      if (anilistDirect()) payload = await anilistMangaDraft(malId);
      else payload = mapTenraiMangaToDraft(await fetchMangaFull(malId));
    } catch (error) {
      if (!error?.network) throw error;
      console.log(`[bulk] Tenrai unreachable, falling back to AniList for manga ${malId}`);
      payload = await anilistMangaDraft(malId);
    }
    return payload;
  };

  const bulkImportHandler = async (req, res) => {
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

    // Fast path (batched AniList): when Tenrai is not usable (breaker open,
    // TENRAI_DISABLED=1, or PROVIDER=anilist), every missing id resolves in ONE
    // batched GraphQL query and covers download concurrently — instead of N
    // serial Tenrai connection timeouts + N throttled AniList queries.
    // With a healthy Tenrai, per-item Tenrai-first behavior is preserved.
    let fastMode = tenraiCircuitOpen() || /anilist/i.test(String(process.env.PROVIDER || ''));
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
        // to the per-item loop, which transparently uses Tenrai where it's
        // reachable (the deployment's datacenter IPs usually can). With
        // TENRAI_DISABLED the caller asked for AniList-only, so rethrow.
        if (process.env.TENRAI_DISABLED === '1') throw error;
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
        // Only the heavy local engine (TRANSLATE_ENGINE=nllb) defers — remote
        // keyless providers keep turning synopses here inline. Previews skip
        // it either way.
        if (!preview && fastDrafts.size > 0 && inlinePersianEnabled()) {
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
        } else if (!preview && fastDrafts.size > 0) {
          console.log(`[bulk] fast path: Persian deferred to backfill ride (${fastDrafts.size} ids)`);
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
          if (inlinePersianEnabled()) await draftPersian(draft); // local engine: backfill rides later
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
          if (inlinePersianEnabled()) await draftPersian(payload); // local engine: backfill ride
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
  };
  app.locals.bulkImport = bulkImportHandler;
  app.post('/api/admin/anime/import-bulk', requireAdmin, writeLimiter, bulkImportHandler);

  // Shared: fetch an anime's latest external data (Tenrai first unless disabled/broken,
  // transparent AniList fallback) + temp cover.
  const fetchExternalDraft = async (malId) => {
    let payload;
    try {
      if (anilistDirect()) payload = await anilistImport(malId);
      else payload = mapTenraiToDraft(await fetchAnimeFull(malId));
    } catch (error) {
      if (!error?.network) throw error;
      console.log(`[import] Tenrai unreachable, falling back to AniList for MAL ${malId}`);
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
  const refreshRowFromSource = async (row, { deferPersian = false } = {}) => {
    const { draft, tempCover, coverWarning } = await fetchExternalDraft(row.mal_id);
    // undefined = unknown source, keep the stored day; null / '' = clear; else the day itself.
    const airingDay = draft.airingDay === undefined ? (row.airing_day || '') : (draft.airingDay || '');
    // Persian synopsis self-fills: pipeline-generated fa re-translates when
    // the source English changed; admin-authored fa is preserved verbatim.
    // deferPersian (refresh-all with the local engine) skips inline
    // translation entirely — the backfill job fills the gaps afterwards.
    const stored = parseSynopsis(row.synopsis);
    const persian = await planPersian(draft.synopsis, stored, { defer: deferPersian });
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

  // Refresh every entry that has a MyAnimeList id (admin bulk action; see the job helpers above).
  app.post('/api/admin/anime/refresh-all', requireAdmin, writeLimiter, (req, res) => {
    cleanupTemp();
    const rows = db.prepare('SELECT * FROM anime WHERE mal_id IS NOT NULL ORDER BY id ASC').all();
    const deferPersian = !inlinePersianEnabled();
    startBulk('anime', rows, async (row) => {
      const { item, coverWarning, changes } = await refreshRowFromSource(row, { deferPersian });
      return { slug: item.slug, title: item.title, ok: true, changes, ...(coverWarning ? { warning: coverWarning } : {}) };
    }, () => exportData());
    res.json(bulkView(bulkJobs.get('anime')));
  });
  app.get('/api/admin/anime/refresh-all', requireAdmin, (req, res) => res.json(bulkView(bulkJobs.get('anime'))));

  // ---------- Persian backfill job ----------
  // With the local NLLB engine, bulk import inserts rows English-only and this
  // keyed-off admin job fills Persian at its own pace: one call translates as
  // many rows as fit in a bounded slice of the function time cap (240s), then
  // reports how many rows are still missing Persian so the admin UI can loop.
  // Rows whose Persian exists (manual or auto) are never touched here unless
  // explicitly retranslated in forceAuto mode; the refresh endpoints rule over
  // re-translation. Manual Persian (auto: false) is ALWAYS preserved.
  let backfillRunning = false;
  const needsPersian = (raw) => {
    try {
      const parsed = JSON.parse(raw || '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return !(parsed.fa || '').trim();
    } catch { /* plain string source text */ }
    return true;
  };
  const parseSynopsisObj = (raw) => {
    try {
      const parsed = JSON.parse(raw || '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* plain string */ }
    return null;
  };
  const getEnglishSource = (raw) => {
    const obj = parseSynopsisObj(raw);
    if (obj && typeof obj.en === 'string' && obj.en.trim()) return obj.en.trim();
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parsed.trim();
      } catch { /* not json */ }
      return raw.trim();
    }
    return '';
  };
  const missingPersianRows = (table) => {
    const rows = db.prepare(
      `SELECT id, slug, synopsis FROM ${table} WHERE mal_id IS NOT NULL AND synopsis IS NOT NULL AND synopsis != '' ORDER BY id ASC LIMIT 400`,
    ).all();
    return rows.filter((row) => needsPersian(row.synopsis));
  };
  const autoTranslatedRows = (table, limit = 400) => {
    const rows = db.prepare(
      `SELECT id, slug, synopsis FROM ${table} WHERE mal_id IS NOT NULL AND synopsis IS NOT NULL AND synopsis != '' ORDER BY id ASC LIMIT ?`,
    ).all(limit);
    const list = [];
    for (const row of rows) {
      const obj = parseSynopsisObj(row.synopsis);
      if (!obj) continue;
      if (obj.auto === false) continue; // manual - never touch
      if (!obj.auto) continue;
      const en = getEnglishSource(row.synopsis);
      if (!en) continue;
      list.push({ ...row, _en: en });
    }
    return list;
  };
  app.post('/api/admin/translate/backfill', requireAdmin, writeLimiter, async (req, res) => {
    if (backfillRunning) throw httpError(429, 'A backfill run is already in flight');
    backfillRunning = true;
    const startedAt = Date.now();
    const budgetMs = Number(req.body?.budgetMs) || 240_000; // leave headroom under the 300s cap
    const mode = String(req.body?.mode || 'missing').toLowerCase();
    const media = String(req.body?.media || 'both').toLowerCase();
    const tables = media === 'anime' ? ['anime'] : media === 'manga' ? ['manga'] : ['anime', 'manga'];
    const results = [];
    let translated = 0;
    let failed = 0;
    let scanned = 0;
    let skippedManual = 0;
    try {
      if (mode === 'forceauto' || mode === 'force-auto' || mode === 'retranslate' || mode === 'retranslate-auto') {
        outer: for (const table of tables) {
          const rows = autoTranslatedRows(table, 500);
          scanned += rows.length;
          for (const row of rows) {
            if (Date.now() - startedAt > budgetMs) break outer;
            try {
              const fa = await translateSynopsis(row._en); // retranslate from source en
              if (!fa) throw new Error('Empty translation');
              db.prepare(`UPDATE ${table} SET synopsis = ?, updated_at = datetime('now') WHERE id = ?`)
                .run(JSON.stringify({ fa, en: row._en, auto: true }), row.id);
              translated += 1;
              results.push({ table, slug: row.slug, ok: true });
              console.log(`[translate:forceAuto] ${table}/${row.slug} retranslated in ${Date.now() - startedAt}ms cumulative`);
            } catch (error) {
              failed += 1;
              results.push({ table, slug: row.slug, ok: false, error: error.message });
              console.error(`[translate:forceAuto] ${table}/${row.slug}: ${error.message}`);
            }
          }
        }
      } else {
        outer: for (const table of tables) {
          for (const row of missingPersianRows(table)) {
            if (Date.now() - startedAt > budgetMs) break outer;
            const en = getEnglishSource(row.synopsis) || String(row.synopsis).trim();
            if (!en) continue;
            try {
              const fa = await translateSynopsis(en); // policy: fresh translate with auto flag
              if (!fa) throw new Error('Empty translation');
              db.prepare(`UPDATE ${table} SET synopsis = ?, updated_at = datetime('now') WHERE id = ?`)
                .run(JSON.stringify({ fa, en, auto: true }), row.id);
              translated += 1;
              results.push({ table, slug: row.slug, ok: true });
              console.log(`[backfill] ${table}/${row.slug} filled in ${Date.now() - startedAt}ms cumulative`);
            } catch (error) {
              failed += 1;
              results.push({ table, slug: row.slug, ok: false, error: error.message });
              console.error(`[backfill] ${table}/${row.slug}: ${error.message}`);
            }
          }
        }
      }
      if (translated > 0) exportData();
    } finally {
      backfillRunning = false;
    }
    // compute remaining for missing mode
    let remainingMissing = 0;
    if (mode === 'missing') {
      for (const table of ['anime', 'manga']) {
        remainingMissing += missingPersianRows(table).length;
      }
    }
    res.json({
      translated,
      failed,
      scanned,
      skippedManual,
      remaining: mode === 'missing' ? remainingMissing : 0,
      elapsedMs: Date.now() - startedAt,
      results,
    });
  });

  // ---------- Translation review queue ----------
  // Auto-translated Persian synopses ({ fa, en, auto: true }) wait here until an
  // admin approves (optionally after editing) them. Approving drops the auto flag,
  // which also protects the text from later bulk re-translation.
  const REVIEW_TABLES = { anime: 'anime', manga: 'manga' };
  const pendingReviewRows = (table, q = '') => {
    const rows = db.prepare(
      `SELECT id, slug, title, synopsis FROM ${table} WHERE synopsis LIKE '%"auto":true%' ORDER BY id ASC`,
    ).all();
    const needle = q.trim().toLowerCase();
    const list = [];
    for (const row of rows) {
      const obj = parseSynopsisObj(row.synopsis);
      if (!obj || obj.auto !== true || !String(obj.fa || '').trim()) continue;
      if (needle && !`${row.title} ${row.slug}`.toLowerCase().includes(needle)) continue;
      list.push({ table, slug: row.slug, title: row.title, en: String(obj.en || '').trim(), fa: String(obj.fa).trim() });
    }
    return list;
  };

  app.get('/api/admin/translate/review', requireAdmin, (req, res) => {
    const media = String(req.query.media || 'both').toLowerCase();
    const tables = media === 'anime' ? ['anime'] : media === 'manga' ? ['manga'] : ['anime', 'manga'];
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const q = String(req.query.q || '').slice(0, 80);
    const all = tables.flatMap((table) => pendingReviewRows(table, q));
    res.json({ total: all.length, items: all.slice(offset, offset + limit) });
  });

  app.post('/api/admin/translate/review/:media/:slug', requireAdmin, writeLimiter, async (req, res) => {
    const table = REVIEW_TABLES[req.params.media];
    if (!table) throw httpError(400, 'Unknown media type');
    const row = db.prepare(`SELECT id, synopsis FROM ${table} WHERE slug = ?`).get(req.params.slug);
    if (!row) throw httpError(404, 'Not found');
    const obj = parseSynopsisObj(row.synopsis);
    const en = getEnglishSource(row.synopsis);
    const action = String(req.body?.action || 'approve');
    let fa;
    let auto = false;
    if (action === 'retranslate') {
      if (!en) throw httpError(400, 'No English source to translate');
      fa = await translateSynopsis(en);
      if (!fa) throw httpError(502, 'Translation service returned nothing');
      auto = true;
    } else if (action === 'approve') {
      fa = String(req.body?.fa ?? obj?.fa ?? '').trim();
      if (!fa) throw httpError(400, 'Persian text is empty');
      if (fa.length > 8000) throw httpError(400, 'Persian text is too long');
    } else {
      throw httpError(400, 'Unknown action');
    }
    db.prepare(`UPDATE ${table} SET synopsis = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify({ fa, en, ...(auto ? { auto: true } : {}) }), row.id);
    exportData();
    res.json({ ok: true, fa, auto });
  });

  app.get('/api/admin/translate/status', requireAdmin, (req, res) => {
    let missing = 0;
    let pending = 0;
    for (const table of ['anime', 'manga']) {
      missing += missingPersianRows(table).length;
      pending += pendingReviewRows(table).length;
    }
    res.json({ missing, pending });
  });

  // Approve many machine translations at once, exactly as they are stored
  // (the auto flag is dropped, which also shields them from re-translation).
  app.post('/api/admin/translate/review-bulk', requireAdmin, writeLimiter, (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    if (items.length === 0) throw httpError(400, 'No items given');
    let approved = 0;
    for (const item of items) {
      const table = REVIEW_TABLES[item?.media];
      if (!table) continue;
      const row = db.prepare(`SELECT id, synopsis FROM ${table} WHERE slug = ?`).get(String(item.slug || ''));
      const obj = row ? parseSynopsisObj(row.synopsis) : null;
      if (!obj || obj.auto !== true || !String(obj.fa || '').trim()) continue;
      db.prepare(`UPDATE ${table} SET synopsis = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify({ fa: obj.fa, en: obj.en }), row.id);
      approved += 1;
    }
    if (approved > 0) exportData();
    res.json({ ok: true, approved });
  });

  // ---------- VPN (local Xray proxy for the site's own requests) ----------
  app.get('/api/admin/vpn', requireAdmin, (req, res) => res.json(vpnStatus()));
  const vpnKind = (req) => (req.params?.kind || req.body?.kind || '');
  // Save a new config (v2ray link or WireGuard .conf text) and switch to it.
  app.post('/api/admin/vpn', requireAdmin, writeLimiter, async (req, res) => {
    res.json(await applyVpn(String(req.body?.kind || ''), String(req.body?.config || '')));
  });
  // Switch to an already-saved profile.
  app.post('/api/admin/vpn/activate', requireAdmin, writeLimiter, async (req, res) => res.json(await activateVpn(vpnKind(req))));
  app.post('/api/admin/vpn/test', requireAdmin, writeLimiter, async (req, res) => res.json(await testVpn()));
  app.delete('/api/admin/vpn', requireAdmin, writeLimiter, async (req, res) => res.json(await turnOffVpn()));
  app.delete('/api/admin/vpn/:kind', requireAdmin, writeLimiter, async (req, res) => res.json(await deleteVpnProfile(vpnKind(req))));

  // ---------- Auto-import of the current season ----------
  app.get('/api/admin/auto-import', requireAdmin, (req, res) => res.json(getAutoImportState()));
  app.post('/api/admin/auto-import', requireAdmin, writeLimiter, (req, res) => {
    setAutoImportEnabled(req.body?.enabled === true);
    res.json(getAutoImportState());
  });
  app.post('/api/admin/auto-import/run', requireAdmin, writeLimiter, async (req, res) => {
    if (getAutoImportState().running) throw httpError(429, 'An auto-import run is already in flight');
    res.json(await runAutoImport(bulkImportHandler));
  });

  app.get('/api/admin/temp-cover/:token', requireAdmin, (req, res) => {
    if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(req.params.token)) throw httpError(400, 'Bad token');
    const file = path.join(TMP_DIR, req.params.token);
    if (!fs.existsSync(file)) throw httpError(404, 'Temporary cover expired');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(file);
  });

  registerExtrasRoutes(app);
  registerPeopleRoutes(app);
  registerTopCharactersRoutes(app);
  registerMediaRoutes(app);
  registerFranchiseRoutes(app);
  registerMissingRoutes(app, { requireAdmin, writeLimiter });
  registerHealthRoutes(app, { requireAdmin, writeLimiter });

  // ---------- Static files ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.get('/covers/:name', coverResizeHandler(COVERS_DIR));
  app.use('/covers', express.static(COVERS_DIR, { maxAge: '1d' }));
  registerSeoRoutes(app);
  const dist = path.join(ROOT_DIR, 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, {
      index: false,
      setHeaders: (res, file) => {
        // Vite fingerprints /assets/*, so they can be cached for a year; the
        // service worker and manifest must always be revalidated.
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (/sw\.js$|manifest\.webmanifest$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
      },
    }));
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
