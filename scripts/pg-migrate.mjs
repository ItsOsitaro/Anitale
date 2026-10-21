// One-off: migrate the local SQLite snapshot (anime/manga/users/user_entries/
// follows) into the provisioned Neon Postgres. Read-only against SQLite,
// idempotent against Postgres (explicit ids + ON CONFLICT DO NOTHING), and it
// re-syncs the bigserial sequences afterwards so future inserts don't collide.
// Usage: node scripts/pg-migrate.mjs   (POSTGRES_URL from .env.local)
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { PG_SCHEMA_SQL } from '../server/pg-schema.js';

const url = /^POSTGRES_URL=(.*)$/m.exec(fs.readFileSync('.env.local', 'utf8'))?.[1]?.replace(/^"|"$/g, '');
if (!url) throw new Error('POSTGRES_URL not found in .env.local');
const sql = postgres(url, { prepare: false });
const sqlite = new DatabaseSync('server/data.db', { readOnly: true });

const TABLES = [
  {
    name: 'anime',
    cols: ['id', 'slug', 'mal_id', 'title', 'category', 'year', 'format', 'score', 'airing_day', 'synopsis', 'genres', 'alt_synonyms', 'alt_japanese', 'alt_romaji', 'alt_english', 'information', 'statistics', 'available_at', 'resources', 'streaming_platforms', 'streaming_notice', 'cover', 'created_at', 'updated_at'],
    serial: true,
  },
  {
    name: 'manga',
    cols: ['id', 'slug', 'mal_id', 'title', 'title_fa', 'category', 'year', 'format', 'score', 'publication_status', 'chapters', 'genres', 'synopsis', 'cover', 'created_at', 'updated_at'],
    serial: true,
  },
  { name: 'users', cols: ['id', 'username', 'password_hash', 'bio', 'avatar_color', 'token_version', 'created_at'], serial: true },
  // sqlite's user_entries has a composite PK and no id column — postgres
  // assigns fresh bigserial ids (ordering there is by updated_at anyway).
  { name: 'user_entries', cols: ['user_id', 'media_type', 'slug', 'status', 'note', 'rating', 'progress', 'created_at', 'updated_at'], serial: true },
  { name: 'follows', cols: ['follower_id', 'following_id', 'created_at'], serial: false },
];

await sql.unsafe(PG_SCHEMA_SQL);

for (const { name, cols, serial } of TABLES) {
  const rows = sqlite.prepare(`SELECT ${cols.join(', ')} FROM ${name}`).all();
  const colList = cols.map((c) => (c === 'id' ? 'id' : c)).join(', ');
  for (let i = 0; i < rows.length; i += 40) {
    const chunk = rows.slice(i, i + 40).map((row) => cols.map((c) => row[c]));
    if (chunk.length) {
      await sql`INSERT INTO ${sql(name)} (${sql.unsafe(colList)}) VALUES ${sql(chunk)} ON CONFLICT DO NOTHING`;
    }
  }
  if (serial) {
    await sql.unsafe(`SELECT setval(pg_get_serial_sequence('${name}', 'id'), (SELECT COALESCE(MAX(id), 0) + 1 FROM ${name}), false)`);
  }
  const [{ n }] = await sql`select count(*)::int as n from ${sql(name)}`;
  console.log(`${name}: ${rows.length} migrated, ${n} in postgres`);
}

console.log('migration complete');
await sql.end({ timeout: 5 });
sqlite.close();
