import fs from 'node:fs';
import { db, ROOT_DIR } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { sendAlert } from './chat-bots.js';
import { backupState } from './backup.js';

// A short Saturday-morning summary for the owner (the same chat that gets health alerts): what happened this week,
// what is waiting, and whether the server is healthy. Once a week, from Saturday 10:00 Tehran time.
const TEHRAN_MS = (3 * 60 + 30) * 60000;
const faDigits = (value) => String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const n = (sql) => { try { return db.prepare(sql).get().n; } catch { return 0; } };

export const reportEnabled = () => getSetting('report.enabled', '1') !== '0';
export const setReportEnabled = (on) => setSetting('report.enabled', on ? '1' : '0');

export const buildWeeklyReport = () => {
  const week = "datetime('now', '-7 days')";
  let disk = '';
  try {
    const s = fs.statfsSync(ROOT_DIR);
    disk = `${((s.bavail * s.bsize) / 1073741824).toFixed(1)}GB`;
  } catch { /* not available everywhere */ }
  const backup = backupState();
  const lines = [
    '📊 گزارش هفتگی انی‌تیل',
    '',
    `این هفته: ${n(`SELECT COUNT(*) AS n FROM users WHERE created_at >= ${week}`)} عضو تازه، ${n(`SELECT COUNT(*) AS n FROM user_entries WHERE created_at >= ${week}`)} افزودن به لیست، ${n(`SELECT COUNT(*) AS n FROM reviews WHERE created_at >= ${week}`)} نقد، ${n(`SELECT COUNT(*) AS n FROM anime WHERE created_at >= ${week}`) + n(`SELECT COUNT(*) AS n FROM manga WHERE created_at >= ${week}`)} عنوان تازه.`,
    `منتظر تو: ${n("SELECT COUNT(*) AS n FROM content_reports WHERE status = 'open'")} گزارش، ${n("SELECT COUNT(*) AS n FROM edit_suggestions WHERE status = 'pending'")} پیشنهاد ویرایش، ${n('SELECT COUNT(*) AS n FROM missing_titles')} عنوان درخواستی، ${n('SELECT COUNT(*) AS n FROM search_misses')} جستجوی بی‌نتیجه.`,
    `سرور: ${disk ? `فضای خالی ${disk}` : 'فضای دیسک نامشخص'}${backup.enabled ? `، آخرین نسخه‌ی دیتابیس ${backup.newest ? backup.newest.slice(0, 10) : 'هنوز نیست'}` : ''}.`,
  ];
  return faDigits(lines.join('\n'));
};

export const sendWeeklyReport = async (now = Date.now()) => {
  if (!reportEnabled()) return 0;
  const tehran = new Date(now + TEHRAN_MS);
  if (tehran.getUTCDay() !== 6 || tehran.getUTCHours() < 10) return 0;
  const week = tehran.toISOString().slice(0, 10);
  if (getSetting('report.lastWeek', '') === week) return 0;
  setSetting('report.lastWeek', week); // before sending, so a restart halfway never sends twice
  return sendAlert(buildWeeklyReport());
};

export const startWeeklyReport = () => {
  setInterval(() => sendWeeklyReport().catch((error) => console.warn(`[report] ${error.message}`)), 30 * 60000).unref();
};
