import { z } from 'zod';

const text = (max = 500) => z.string().trim().max(max).default('');
const httpUrl = z.string().trim().max(2000).refine((value) => /^https?:\/\//i.test(value), 'URL must start with http:// or https://');
const list = (item, max = 50) => z.array(item).max(max).default([]);

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const animeInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(500),
  titleFa: z.string().trim().max(500).optional(),
  slug: z.string().trim().toLowerCase().max(80).regex(slugPattern, 'Slug may contain only a-z, 0-9 and -').optional().or(z.literal('')),
  malId: z.coerce.number().int().positive().nullable().optional(),
  category: text(100),
  year: text(10),
  format: text(50),
  score: z.coerce.number().min(0).max(10).nullable().optional(),
  airingDay: z.enum(['', ...WEEKDAYS]).default(''),
  synopsis: text(8000),
  // Persian synopsis (admin-authored). Persisted together with the English
  // text as bilingual JSON { fa, en } so the storefront switches by language.
  synopsisFa: z.string().trim().max(8000).optional(),
  // Marks the Persian text as pipeline-generated (auto translation) so a
  // later refresh may re-translate it; admin-authored fa loses this flag.
  synopsisAuto: z.boolean().optional(),
  genres: list(z.string().trim().min(1).max(50)),
  alternativeTitles: z.object({
    synonyms: list(z.string().trim().min(1).max(500)),
    japanese: text(500),
    romaji: text(500),
    english: text(500),
  }).default({ synonyms: [], japanese: '', romaji: '', english: '' }),
  information: list(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().max(1500) }), 40),
  statistics: z.object({
    score: text(20), scoredBy: text(40), ranked: text(20), popularity: text(20), members: text(40), favorites: text(40),
  }).nullable().optional(),
  availableAt: list(z.object({ label: z.string().trim().min(1).max(100), href: httpUrl.optional().or(z.literal('')), icon: text(10) })),
  resources: list(z.object({ label: z.string().trim().min(1).max(100), icon: text(10) })),
  streamingPlatforms: list(z.string().trim().min(1).max(100)),
  streamingNotice: text(300),
  tempCover: z.string().regex(/^[a-f0-9]{24}\.(jpg|png|webp)$/).optional(),
});

export const loginInput = z.object({ username: z.string().max(100), password: z.string().max(200) });

// Queue 19→25: partial Persian additions AND the full admin edit on a manga row.
const mangaText = (max) => z.string().trim().max(max);
export const mangaAdminPatch = z.object({
  title: mangaText(200).optional(),
  titleFa: mangaText(200).optional(),
  category: mangaText(80).optional(),
  year: mangaText(20).optional(),
  score: z.coerce.number().min(0).max(10).nullable().optional(),
  synopsis: mangaText(8000).optional(),
  synopsisFa: mangaText(8000).optional(),
});

// Site accounts (public profile by username, MAL-style)
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;
export const siteRegisterInput = z.object({
  username: z.string().trim().max(24).regex(USERNAME_PATTERN, 'Username may contain only letters, digits, _ and - (3–24 chars)'),
  email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  bio: text(300).optional(),
});
const emailField = z.string().trim().toLowerCase().max(254).email('Enter a valid email address');
const newPasswordField = z.string().min(8, 'Password must be at least 8 characters').max(100);
export const siteForgotInput = z.object({ email: emailField });
export const siteResetInput = z.object({ token: z.string().trim().min(20).max(100), newPassword: newPasswordField });
export const siteVerifyInput = z.object({ token: z.string().trim().min(20).max(100) });
export const siteEmailChangeInput = z.object({ email: emailField, password: z.string().max(200) });
export const siteChangePasswordInput = z.object({ currentPassword: z.string().max(200), newPassword: newPasswordField });
// YYYY-MM-DD that is a real calendar day (rejects 2026-02-31) and not absurd.
const entryDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').refine((value) => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && d.getUTCFullYear() >= 1950 && d.getUTCFullYear() <= 2100;
}, 'Invalid date');
// Up to 10 tags, 1–24 chars each; commas are stripped (they separate tags in storage and MAL exports).
const entryTags = z.array(z.string().max(60)).max(10).transform((list) => {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const tag = raw.replace(/[,\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) { seen.add(key); out.push(tag); }
  }
  return out;
});
export const siteUserEntryInput = z.object({
  mediaType: z.enum(['anime', 'manga']),
  slug: z.string().trim().min(1).max(120),
  status: z.enum(['watching', 'completed', 'on_hold', 'dropped', 'planned']).default('watching'),
  note: z.string().trim().max(500).optional(),
  rating: z.coerce.number().int().min(1).max(10).nullable().optional(),
  // Queue 21: episodes watched / chapters read (0..5000). Absent = keep stored.
  progress: z.coerce.number().int().min(0).max(5000).nullable().optional(),
  // A3: list details. Absent = keep stored; null = clear.
  startDate: entryDate.nullable().optional(),
  finishDate: entryDate.nullable().optional(),
  rewatch: z.coerce.number().int().min(0).max(99).optional(),
  priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
  tags: entryTags.optional(),
});
export const siteReviewInput = z.object({
  mediaType: z.enum(['anime', 'manga']),
  slug: z.string().trim().min(1).max(120),
  body: z.string().trim().min(10, 'Review must be at least 10 characters').max(2000),
  spoiler: z.boolean().optional(),
});
export const siteRecInput = z.object({
  mediaType: z.enum(['anime', 'manga']),
  slug: z.string().trim().min(1).max(120),
  other: z.string().trim().min(1).max(120),
  body: z.string().trim().min(10, 'Reason must be at least 10 characters').max(300),
});
export const siteProfileInput = z.object({
  bio: text(300),
  avatarColor: z.number().refine((value) => [8, 342, 276, 208, 168, 96].includes(value), 'Invalid avatar color').optional(),
  about: z.string().max(2000).optional(),
  privacy: z.object({ anime: z.enum(['public', 'friends', 'private']).optional(), manga: z.enum(['public', 'friends', 'private']).optional() }).optional(),
});
// Admin site-user management: create fully, or patch any subset (rename /
// bio edit / password reset). Everything is optional because PATCH is partial.
export const siteAdminUserCreate = z.object({
  username: z.string().trim().max(24).regex(USERNAME_PATTERN, 'Username may contain only letters, digits, _ and - (3–24 chars)'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  bio: text(300).optional(),
});
export const siteAdminUserPatch = z.object({
  username: z.string().trim().max(24).regex(USERNAME_PATTERN, 'Username may contain only letters, digits, _ and - (3–24 chars)').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100).optional(),
  // No default here: an absent bio field must stay "not provided", not ''.
  bio: z.string().trim().max(300).optional(),
});

// MyAnimeList list import: one chunk of the user's exported list (matched by MAL id on the server).
export const malImportInput = z.object({
  overwrite: z.boolean().optional(),
  items: z.array(z.object({
    type: z.enum(['anime', 'manga']),
    malId: z.number().int().positive(),
    status: z.enum(['watching', 'completed', 'on_hold', 'dropped', 'planned']),
    score: z.number().int().min(0).max(10).optional(),
    progress: z.number().int().min(0).max(5000).optional(),
    startDate: entryDate.nullable().optional(),
    finishDate: entryDate.nullable().optional(),
    rewatch: z.number().int().min(0).max(99).optional(),
    priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
    tags: entryTags.optional(),
    title: z.string().max(200).optional(),
  })).max(1500),
});
