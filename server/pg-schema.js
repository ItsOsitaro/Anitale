// The complete current schema (the state AFTER every sqlite migration in
// db.js) translated to Postgres. Applied idempotently (IF NOT EXISTS) at
// serverless boot through the sync bridge.
//
// Types mirror the sqlite definitions with two deliberate differences:
//  - user_entries gains `id bigserial PRIMARY KEY` as a surrogate for sqlite's
//    implicit rowid (the feed and list ordering use it); the composite
//    (user_id, media_type, slug) uniqueness moves to a UNIQUE constraint so
//    the upsert's ON CONFLICT target stays identical.
//  - created_at/updated_at stay TEXT with a default that renders the exact
//    same 'YYYY-MM-DD HH:MM:SS' UTC string sqlite's datetime('now') produced,
//    so `joinedAt` parsing and lexicographic date ordering behave identically.
export const PG_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS anime (
    id bigserial PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    mal_id integer UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT '',
    score double precision,
    airing_day TEXT NOT NULL DEFAULT '',
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
    created_at TEXT NOT NULL DEFAULT (to_char((now() at time zone 'UTC'), 'YYYY-MM-DD HH24:MI:SS')),
    updated_at TEXT NOT NULL DEFAULT (to_char((now() at time zone 'UTC'), 'YYYY-MM-DD HH24:MI:SS'))
  );
  CREATE INDEX IF NOT EXISTS idx_anime_title ON anime(title);

  CREATE TABLE IF NOT EXISTS manga (
    id bigserial PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    mal_id integer UNIQUE,
    title TEXT NOT NULL,
    title_fa TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT 'Manga',
    score double precision,
    publication_status TEXT NOT NULL DEFAULT '',
    chapters integer,
    genres TEXT NOT NULL DEFAULT '[]',
    synopsis TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (to_char((now() at time zone 'UTC'), 'YYYY-MM-DD HH24:MI:SS')),
    updated_at TEXT NOT NULL DEFAULT (to_char((now() at time zone 'UTC'), 'YYYY-MM-DD HH24:MI:SS'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_manga_mal_id ON manga(mal_id) WHERE mal_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS users (
    id bigserial PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    avatar_color TEXT NOT NULL DEFAULT '',
    token_version integer NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (to_char((now() at time zone 'UTC'), 'YYYY-MM-DD HH24:MI:SS'))
  );

  CREATE TABLE IF NOT EXISTS user_entries (
    id bigserial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga')),
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching', 'completed', 'on_hold', 'dropped', 'planned')),
    note TEXT NOT NULL DEFAULT '',
    rating integer,
    progress integer,
    created_at TEXT NOT NULL DEFAULT (to_char((now() at time zone 'UTC'), 'YYYY-MM-DD HH24:MI:SS')),
    updated_at TEXT NOT NULL DEFAULT (to_char((now() at time zone 'UTC'), 'YYYY-MM-DD HH24:MI:SS')),
    UNIQUE (user_id, media_type, slug)
  );
  CREATE INDEX IF NOT EXISTS idx_entries_user ON user_entries(user_id);

  CREATE TABLE IF NOT EXISTS follows (
    follower_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (to_char((now() at time zone 'UTC'), 'YYYY-MM-DD HH24:MI:SS')),
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;
