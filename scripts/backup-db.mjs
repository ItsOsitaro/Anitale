import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const SERVER_DIR = path.resolve('server');
const dbFile = process.env.DB_FILE || path.join(SERVER_DIR, 'data.db');
const backupDir = path.resolve('backups');
fs.mkdirSync(backupDir, { recursive: true });

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const tempBackup = path.join(backupDir, `data-${timestamp}.db`);

console.log(`[backup] Starting safe SQLite backup to ${tempBackup}...`);
const db = new DatabaseSync(dbFile);
db.exec(`VACUUM INTO '${tempBackup.replace(/'/g, "''")}';`);
db.close();

console.log(`[backup] Compressing ${tempBackup} with gzip...`);
try {
  execSync(`gzip -f "${tempBackup}"`, { stdio: 'inherit' });
} catch (err) {
  console.warn(`[backup] gzip command failed or not available: ${err.message}`);
}

console.log(`[backup] Cleaning backups older than 7 days...`);
try {
  execSync(`find "${backupDir}" -name "*.db.gz" -mtime +7 -delete`, { stdio: 'inherit' });
} catch {
  // find may not be present on Windows, which is normal locally
}

console.log(`[backup] Backup completed successfully.`);
process.exit(0);
