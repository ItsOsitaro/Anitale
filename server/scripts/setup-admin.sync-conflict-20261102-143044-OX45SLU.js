// Creates server/.env with the admin login. Usage: npm run setup-admin -- <username> <password> [--force]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const force = process.argv.includes('--force');

if (fs.existsSync(envFile) && !force) {
  console.error('server/.env already exists. Use --force to overwrite it.');
  process.exit(1);
}

let [username, password] = args;
if (!username || !password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  username = username || (await rl.question('Admin username: ')).trim();
  password = password || (await rl.question('Admin password (min 8 chars): '));
  rl.close();
}
if (!username || !password || password.length < 8) {
  console.error('Username is required and the password must be at least 8 characters.');
  process.exit(1);
}

fs.writeFileSync(envFile, [
  `ADMIN_USER=${username}`,
  `ADMIN_PASSWORD_HASH='${bcrypt.hashSync(password, 12)}'`,
  `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`,
  'PORT=3000',
  '# Needed if Jikan / MyAnimeList are blocked without a VPN, e.g. PROXY_URL=http://127.0.0.1:10809',
  'PROXY_URL=',
  '',
].join('\n'));
console.log('Created server/.env - you can now run: npm start');
