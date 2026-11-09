// One command that says "is this safe to deploy?":  npm run verify   (or: node scripts/verify.mjs [--db path/to/data.db] [--skip-build])
//   1. builds the site (vite build)
//   2. starts a throw-away server on a free port with a COPY of the database (the live data.db is never opened for writing)
//   3. runs scripts/regression.mjs against it (pages, search, sign-in, admin tools, security checks)
//   4. stops the server, deletes the copy, prints PASS/FAIL (exit code 0 / 1)
// Safety: the test server must never talk to the outside world as the real site. Every variable in server/.env is blanked
// for it (bot tokens, SMTP, proxy, ...), and the chat/alert settings stored in the database copy are removed.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const dbArg = args[args.indexOf('--db') + 1];
const dbSource = path.resolve(root, flag('--db') && dbArg ? dbArg : 'server/data.db');

const step = (text) => console.log(`\n\x1b[1m== ${text}\x1b[0m`);
const fail = (text) => { console.error(`\n\x1b[31mFAIL: ${text}\x1b[0m`); process.exitCode = 1; };

if (!existsSync(dbSource)) {
  console.error(`No database at ${dbSource}. Pass one with --db path/to/data.db (a copy of a real backup is best).`);
  process.exit(1);
}

if (!flag('--skip-build')) {
  step('Build');
  const build = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) { fail('vite build failed'); process.exit(1); }
}

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  server.on('error', reject);
});

step('Test server on a copy of the database');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'anitale-verify-'));
const dbCopy = path.join(tmp, 'data.db');
copyFileSync(dbSource, dbCopy);
for (const ext of ['-wal', '-shm']) if (existsSync(dbSource + ext)) copyFileSync(dbSource + ext, dbCopy + ext);
try {
  const copy = new DatabaseSync(dbCopy);
  // No tokens or alert targets in the copy: the test server must not message anyone.
  try { copy.exec("DELETE FROM settings WHERE key LIKE 'chat.%' OR key LIKE 'alerts.%'"); } catch { /* no settings table yet */ }
  copy.close();
} catch (error) { fail(`could not prepare the database copy: ${error.message}`); process.exit(1); }

// Blank everything the real .env would set (dotenv never overrides a variable that already exists).
const blank = {};
const envFile = path.join(root, 'server', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) blank[m[1]] = '';
  }
}
const port = await freePort();
const adminPass = 'verify-pass-123';
const env = {
  ...process.env, ...blank,
  NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', DB_FILE: dbCopy, BACKUP_DIR: path.join(tmp, 'backups'),
  TENRAI_DISABLED: '1', ADMIN_USER: 'verify-admin', ADMIN_PASSWORD_HASH: bcrypt.hashSync(adminPass, 4),
  SESSION_SECRET: 'verify-secret', ADMIN_LOGIN_LIMIT: '500', TRUST_PROXY: '', SITE_URL: `http://127.0.0.1:${port}`,
};
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);

const base = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 80 && !up; i += 1) {
  if (server.exitCode !== null) break;
  try { up = (await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) })).status === 200; } catch { await new Promise((r) => setTimeout(r, 500)); }
}
if (!up) {
  console.error(serverLog.split('\n').slice(-15).join('\n'));
  fail('the test server did not start');
  stop();
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

step('Regression checks');
const run = spawn(process.execPath, ['scripts/regression.mjs', base], { cwd: root, env: { ...process.env, SMOKE_ADMIN_USER: 'verify-admin', SMOKE_ADMIN_PASS: adminPass }, stdio: ['ignore', 'pipe', 'inherit'] });
let out = '';
run.stdout.on('data', (d) => { out += d; });
const code = await new Promise((resolve) => run.on('close', resolve));
stop();
await new Promise((r) => setTimeout(r, 500));
rmSync(tmp, { recursive: true, force: true });

const lines = out.split('\n');
const passed = lines.filter((l) => l.startsWith('PASS')).length;
const failed = lines.filter((l) => l.startsWith('FAIL'));
failed.forEach((l) => console.log(`\x1b[31m${l}\x1b[0m`));
console.log(`\n${passed} passed, ${failed.length} failed`);
if (code === 0 && failed.length === 0) console.log('\x1b[32mVERIFY OK: safe to deploy\x1b[0m');
else fail('regression checks failed; do not deploy');
