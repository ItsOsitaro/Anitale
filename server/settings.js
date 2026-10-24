// Tiny key/value settings store, shared across both DB engines (SQLite locally,
// Neon Postgres on Vercel — the SQL kept in the common dialect subset). The
// admin Settings page persists runtime choices here, e.g. the desired synopsis
// translation provider; unlike env vars these changes apply instantly without
// a redeploy.
import { db } from './db.js';

export const getSetting = (key, fallback = '') => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? fallback;
};

export const setSetting = (key, value) => {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
};
