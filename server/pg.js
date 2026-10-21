// Postgres driver (Neon) used only when POSTGRES_URL / DATABASE_URL is set —
// i.e. on the Vercel deployment. Local development keeps node:sqlite.
//
// The server's database API is node:sqlite's synchronous
// prepare(sql).all/get/run — every consumer reads results inline. A network
// database can only answer asynchronously, so queries run in pg-worker.mjs
// (which owns the postgres connection pool) and the main thread blocks on
// Atomics.wait until the worker signals the SharedArrayBuffer mailbox. Same
// sync call-surface, zero changes to repo.js / users.js / auth.js / app.js.
//
// Dialect translation (sqlite -> postgres), applied once per statement:
//   ? and @name placeholders  -> $1, $2 …
//   datetime('now')           -> UTC text timestamp (same 'YYYY-MM-DD HH:MM:SS'
//                                shape sqlite produced, so joinedAt parsing and
//                                lexicographic ORDER BY keep working)
//   COUNT(...)                -> ::int (pg returns int8 as a string otherwise)
//   = ? COLLATE NOCASE        -> lower(col) = lower($n)
//   rowid                     -> id (user_entries gains a bigserial surrogate)
//   INSERT on serial tables   -> RETURNING id feeds lastInsertRowid
import { Worker } from 'node:worker_threads';
import { PG_SCHEMA_SQL } from './pg-schema.js';

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
if (!POSTGRES_URL) throw new Error('[pg] POSTGRES_URL/DATABASE_URL is not set');

const CALL_TIMEOUT_MS = 30_000;
const REQ_BYTES = 4 * 1024 * 1024;
const RES_BYTES = 8 * 1024 * 1024;

const control = new SharedArrayBuffer(32);
const flags = new Int32Array(control);
const reqBuf = new SharedArrayBuffer(REQ_BYTES);
const resBuf = new SharedArrayBuffer(RES_BYTES);

// flags[0] reqSeq, flags[1] resSeq, flags[2] reqLen, flags[3] resLen, flags[4] err
const worker = new Worker(new URL('./pg-worker.mjs', import.meta.url), {
  workerData: { control, req: reqBuf, res: resBuf, url: POSTGRES_URL },
});
worker.on('error', (error) => console.error('[pg] worker crashed:', error.message));

let reqSeq = 0;
let resSeq = 0;

// One blocking round-trip; returns { rows, count }.
const call = (sqlText, values) => {
  const seq = ++reqSeq;
  const payload = Buffer.from(JSON.stringify({ sqlText, values }));
  if (payload.byteLength > REQ_BYTES) throw new Error('[pg] request payload too large');
  new Uint8Array(reqBuf).set(payload);
  flags[2] = payload.byteLength;
  flags[4] = 0;
  Atomics.store(flags, 0, seq);
  Atomics.notify(flags, 0);

  const status = Atomics.wait(flags, 1, resSeq, CALL_TIMEOUT_MS);
  resSeq = Atomics.load(flags, 1);
  if (status === 'timed-out') throw new Error(`[pg] query timed out after ${CALL_TIMEOUT_MS}ms`);
  const text = Buffer.from(new Uint8Array(resBuf, 0, Atomics.load(flags, 3))).toString('utf8');
  if (Atomics.load(flags, 4) === 1) throw new Error(`[pg] ${text}`);
  return JSON.parse(text);
};

const SERIAL_TABLES = new Set(['anime', 'manga', 'users', 'user_entries']);
const UTC_NOW = "to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

export const translatePg = (text) => {
  let out = text;
  const names = [];
  // @name placeholders first (they map to object keys in order of appearance).
  out = out.replace(/@([A-Za-z_]\w*)/g, (_m, name) => {
    names.push(name);
    return `$${names.length}`;
  });
  // Remaining positional ? continue after the named ones.
  let positional = names.length;
  out = out.replace(/\?/g, () => `$${++positional}`);
  // Timestamps: sqlite wrote UTC text; keep the exact same shape in pg.
  out = out.split("datetime('now')").join(UTC_NOW);
  // COUNT returns int8 in pg; every consumer expects a JS number.
  out = out.replace(/COUNT\(\s*(\*|DISTINCT [^)]+)\)/gi, 'COUNT($1)::int');
  // Case-insensitive usernames: `col = $n COLLATE NOCASE` -> lower() both sides.
  out = out.replace(/([A-Za-z_][\w.]*)\s*=\s*(\$\d+)\s+COLLATE NOCASE/gi, 'lower($1) = lower($2)');
  out = out.replace(/\s*COLLATE NOCASE/gi, '');
  // user_entries carries an explicit bigserial id on pg; sqlite's implicit
  // rowid (used for stable ordering) maps onto it.
  out = out.replace(/\be\.rowid\b/gi, 'e.id').replace(/\browid\b/gi, 'id');
  return { sql: out, names };
};

const valuesFor = (names, args) => (names.length ? names.map((name) => args[0]?.[name]) : args);

const makeStatement = (text) => {
  const { sql: pgSql, names } = translatePg(text);
  // INSERT on a serial table learns its new id via RETURNING.
  const insertMatch = /^insert\s+into\s+([a-z_][\w]*)/i.exec(pgSql.trim());
  const wantReturning = insertMatch && SERIAL_TABLES.has(insertMatch[1].toLowerCase());
  const queryText = wantReturning ? `${pgSql.replace(/;\s*$/, '')} RETURNING id` : pgSql;

  const execute = (args) => call(queryText, valuesFor(names, args));
  return {
    all: (...args) => execute(args).rows,
    get: (...args) => execute(args).rows[0],
    run: (...args) => {
      const result = execute(args);
      return {
        changes: result.count ?? 0,
        lastInsertRowid: wantReturning ? result.rows[0]?.id : undefined,
      };
    },
  };
};

export const db = {
  prepare: (text) => makeStatement(text),
  // Multi-statement DDL/maintenance; not used at request time.
  exec: (text) => {
    for (const statement of text.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
      call(statement, []);
    }
  },
};

// Idempotent schema bootstrap at boot; also warms the worker + connection.
export const ensurePgSchema = async () => {
  db.exec(PG_SCHEMA_SQL);
};
