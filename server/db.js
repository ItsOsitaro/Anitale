import './config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SERVER_DIR, '..');
export const COVERS_DIR = path.join(ROOT_DIR, 'public', 'covers');
export const TMP_DIR = path.join(SERVER_DIR, 'tmp');

// Node's built-in SQLite (Node >= 22.13) - no native module to compile or download.
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (String(warning).includes('SQLite') ? undefined : originalEmitWarning.call(process, warning, ...rest));
const { DatabaseSync } = await import('node:sqlite');
process.emitWarning = originalEmitWarning;

export const db = new DatabaseSync(process.env.DB_FILE || path.join(SERVER_DIR, 'data.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS anime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  mal_id INTEGER UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  score REAL,
  synopsis TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT '[]',
  alt_synonyms TEXT NOT NULL DEFAULT '[]',
  alt_japanese TEXT NOT NULL DEFAULT '',
  alt_romaji TEXT NOT NULL DEFAULT '',
  alt_english TEXT NOT NULL DEFAULT '',
  information TEXT NOT NULL DEFAULT '[]',
  statistics TEXT,
  available_at TEXT NOT NULL DEFAULT '[]',
  resources TEXT NOT NULL DEFAULT '[]',
  streaming_platforms TEXT NOT NULL DEFAULT '[]',
  streaming_notice TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_anime_title ON anime(title);

CREATE TABLE IF NOT EXISTS manga (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  mal_id INTEGER UNIQUE,
  title TEXT NOT NULL,
  title_fa TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'Manga',
  score REAL,
  publication_status TEXT NOT NULL DEFAULT '', -- Publishing / Finished / On Hiatus … (queue 20)
  chapters INTEGER,
  genres TEXT NOT NULL DEFAULT '[]',
  synopsis TEXT NOT NULL DEFAULT '', -- JSON { fa, en } for the bilingual storefront
  cover TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_entries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga')),
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching', 'completed', 'on_hold', 'dropped', 'planned')),
  note TEXT NOT NULL DEFAULT '',
  rating INTEGER,
  progress INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, media_type, slug)
);
CREATE INDEX IF NOT EXISTS idx_entries_user ON user_entries(user_id);
`);

// Migration for databases created before the airing-day schedule existed.
const airingDayColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('anime') WHERE name = 'airing_day'").get();
if (!airingDayColumn.n) db.exec(`ALTER TABLE anime ADD COLUMN airing_day TEXT NOT NULL DEFAULT ''`);

// Migration: databases created before romaji titles existed.
const romajiColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('anime') WHERE name = 'alt_romaji'").get();
if (!romajiColumn.n) db.exec(`ALTER TABLE anime ADD COLUMN alt_romaji TEXT NOT NULL DEFAULT ''`);

// Migration: personal note on each list entry.
const noteColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('user_entries') WHERE name = 'note'").get();
if (!noteColumn.n) db.exec(`ALTER TABLE user_entries ADD COLUMN note TEXT NOT NULL DEFAULT ''`);

// Migration: personal rating (1–10) per list entry.
const ratingColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('user_entries') WHERE name = 'rating'").get();
if (!ratingColumn.n) db.exec(`ALTER TABLE user_entries ADD COLUMN rating INTEGER`);

// Follow graph (queue 15): who follows whom. Both sides cascade on user delete.
db.exec(`
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);
`);

// Migration: last-write timestamp per entry so the feed can surface status /
// rating / note changes, not just new adds. Backfilled from the insert time.
const updatedAtColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('user_entries') WHERE name = 'updated_at'").get();
if (!updatedAtColumn.n) {
  db.exec(`ALTER TABLE user_entries ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`);
  db.exec(`UPDATE user_entries SET updated_at = created_at WHERE updated_at = ''`);
}

// Migration: per-entry progress (episodes watched / chapters read — queue 21).
const progressColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('user_entries') WHERE name = 'progress'").get();
if (!progressColumn.n) db.exec(`ALTER TABLE user_entries ADD COLUMN progress INTEGER`);

// Migration: MyAnimeList ids + scores on manga (bulk import + /manga/{id} links).
const mangaMalIdColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('manga') WHERE name = 'mal_id'").get();
if (!mangaMalIdColumn.n) db.exec(`ALTER TABLE manga ADD COLUMN mal_id INTEGER`);
const mangaScoreColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('manga') WHERE name = 'score'").get();
if (!mangaScoreColumn.n) db.exec(`ALTER TABLE manga ADD COLUMN score REAL`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_manga_mal_id ON manga(mal_id) WHERE mal_id IS NOT NULL');

// Migration: Persian display title for manga (fa storefront), editor-managed.
const mangaTitleFaColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('manga') WHERE name = 'title_fa'").get();
if (!mangaTitleFaColumn.n) db.exec(`ALTER TABLE manga ADD COLUMN title_fa TEXT NOT NULL DEFAULT ''`);

// Migration: publication status + chapter count (queue 20 «fresh manga» section).
const mangaStatusColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('manga') WHERE name = 'publication_status'").get();
if (!mangaStatusColumn.n) db.exec(`ALTER TABLE manga ADD COLUMN publication_status TEXT NOT NULL DEFAULT ''`);
const mangaChaptersColumn = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('manga') WHERE name = 'chapters'").get();
if (!mangaChaptersColumn.n) db.exec(`ALTER TABLE manga ADD COLUMN chapters INTEGER`);

// Migration: user_entries from the 3-status era needs a rebuild to accept
// the five list statuses (SQLite cannot alter a CHECK constraint in place).
const userEntriesSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_entries'").get()?.sql || '';
if (userEntriesSql && !userEntriesSql.includes("'on_hold'")) {
  db.exec(`
    BEGIN;
    CREATE TABLE user_entries_new (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga')),
      slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching', 'completed', 'on_hold', 'dropped', 'planned')),
      note TEXT NOT NULL DEFAULT '',
      rating INTEGER,
      progress INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, media_type, slug)
    );
    INSERT INTO user_entries_new (user_id, media_type, slug, status, note, rating, progress, created_at, updated_at)
      SELECT user_id, media_type, slug, status, COALESCE(note, ''), rating, progress, created_at, CASE WHEN updated_at = '' THEN created_at ELSE updated_at END FROM user_entries;
    DROP TABLE user_entries;
    ALTER TABLE user_entries_new RENAME TO user_entries;
    CREATE INDEX IF NOT EXISTS idx_entries_user ON user_entries(user_id);
    COMMIT;
  `);
}
