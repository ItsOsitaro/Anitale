import fs from 'node:fs';
import path from 'node:path';
import { db, SERVER_DIR } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { requireAdmin } from './auth.js';

// An in-app snapshot of the database (VACUUM INTO: a consistent copy while the site runs), shown in the admin panel
// with its age. Off by default. This is NOT an off-site backup: the files live on the same server (see BACKUP_DIR).
// Note: the project folder is synced by Syncthing; add the backup folder to .stignore if you do not want copies on the PC.
const DIR = process.env.BACKUP_DIR || path.join(SERVER_DIR, 'cache', 'backups');
const KEEP = 3;
const DAY = 86400000;

const listFiles = () => {
  try {
    return fs.readdirSync(DIR).filter((n) => /^anitale-\d{8}-\d{4}\.db$/.test(n)).map((name) => {
      const st = fs.statSync(path.join(DIR, name));
      return { name, size: st.size, at: st.mtime.toISOString() };
    }).sort((a, b) => b.at.localeCompare(a.at));
  } catch { return []; }
};

export const backupNow = () => {
  fs.mkdirSync(DIR, { recursive: true });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `anitale-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.db`;
  const target = path.join(DIR, name);
  if (fs.existsSync(target)) fs.rmSync(target); // two runs in the same minute: keep the newer one
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  for (const old of listFiles().slice(KEEP)) fs.rmSync(path.join(DIR, old.name), { force: true });
  return name;
};

export const backupState = () => {
  const files = listFiles();
  const enabled = getSetting('backup.enabled', '0') === '1';
  const newest = files[0]?.at || '';
  return { enabled, dir: DIR, files, newest, stale: enabled && (!newest || Date.now() - Date.parse(newest) > 2 * DAY) };
};

export const registerBackupRoutes = (app) => {
  app.get('/api/admin/x/system/backups', requireAdmin, (_req, res) => res.json(backupState()));
  app.post('/api/admin/x/system/backups', requireAdmin, (req, res) => {
    if (typeof req.body?.enabled === 'boolean') setSetting('backup.enabled', req.body.enabled ? '1' : '0');
    if (req.body?.now === true) backupNow();
    res.json(backupState());
  });
  // Once enabled, a snapshot is taken when the newest one is older than 22 hours (checked every 3 hours).
  setInterval(() => {
    try {
      const s = backupState();
      if (s.enabled && (!s.newest || Date.now() - Date.parse(s.newest) > 22 * 3600000)) backupNow();
    } catch (error) { console.warn(`[backup] ${error.message}`); }
  }, 3 * 3600000).unref();
};
