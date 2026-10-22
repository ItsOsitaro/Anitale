import { z } from 'zod';

const text = (max = 500) => z.string().trim().max(max).default('');
const httpUrl = z.string().trim().max(500).refine((value) => /^https?:\/\//i.test(value), 'URL must start with http:// or https://');
const list = (item, max = 50) => z.array(item).max(max).default([]);

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const animeInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
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
  genres: list(z.string().trim().min(1).max(50)),
  alternativeTitles: z.object({
    synonyms: list(z.string().trim().min(1).max(200)),
    japanese: text(200),
    romaji: text(200),
    english: text(200),
  }).default({ synonyms: [], japanese: '', romaji: '', english: '' }),
  information: list(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().max(500) }), 40),
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
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  bio: text(300).optional(),
});
export const siteUserEntryInput = z.object({
  mediaType: z.enum(['anime', 'manga']),
  slug: z.string().trim().min(1).max(120),
  status: z.enum(['watching', 'completed', 'on_hold', 'dropped', 'planned']).default('watching'),
  note: z.string().trim().max(500).optional(),
  rating: z.coerce.number().int().min(1).max(10).nullable().optional(),
  // Queue 21: episodes watched / chapters read (0..5000). Absent = keep stored.
  progress: z.coerce.number().int().min(0).max(5000).nullable().optional(),
});
export const siteProfileInput = z.object({
  bio: text(300),
  avatarColor: z.number().refine((value) => [8, 342, 276, 208, 168, 96].includes(value), 'Invalid avatar color').optional(),
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
