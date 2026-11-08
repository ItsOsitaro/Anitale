import { getSetting, setSetting } from './settings.js';
import { healthSnapshot } from './health.js';
import { sendAlert } from './chat-bots.js';

// Tells the owner (in the Telegram / Bale chat linked from the admin panel) when something needs attention:
// the disk is nearly full, memory is exhausted, the server loop is stuck, or the data provider has been down for a while.
// One message when a problem starts, one reminder every 6 hours while it lasts, one "recovered" when it is over.
const CHECK_MS = 5 * 60000;
const REMIND_MS = 6 * 3600000;
const CONFIRM = { tenrai: 6, lag: 3 }; // consecutive checks (x 5 min) before a slow-burning problem counts

const DEFAULTS = { enabled: 1, diskPct: 10 };
export const alertConfig = () => ({
  enabled: getSetting('alerts.enabled', '1') !== '0',
  diskPct: Math.min(50, Math.max(1, Math.round(Number(getSetting('alerts.diskPct', DEFAULTS.diskPct)) || DEFAULTS.diskPct))),
});
export const saveAlertConfig = (input = {}) => {
  if (typeof input.enabled === 'boolean') setSetting('alerts.enabled', input.enabled ? '1' : '0');
  if (input.diskPct != null) setSetting('alerts.diskPct', Math.min(50, Math.max(1, Math.round(Number(input.diskPct) || DEFAULTS.diskPct))));
  return alertConfig();
};

const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

// Pure: which problems does this snapshot show right now? `streak` counts consecutive bad checks per key.
export const problems = (snap, cfg, streak = {}) => {
  const out = [];
  const { disk, memTotal, memAvailable, loopLagMs } = snap.system;
  if (disk.total > 0 && (disk.free / disk.total) * 100 < cfg.diskPct) {
    out.push({ key: 'disk', text: `💾 فضای دیسک سرور رو به پایان است: ${gb(disk.free)} از ${gb(disk.total)} خالی مانده (کمتر از ${cfg.diskPct}٪).` });
  }
  if (memTotal > 0 && memAvailable / memTotal < 0.06) {
    out.push({ key: 'memory', text: `🧠 حافظه‌ی سرور تقریباً تمام شده است (${Math.round(memAvailable / 1048576)} مگابایت آزاد).` });
  }
  if ((loopLagMs || 0) > 2000 && (streak.lag || 0) >= CONFIRM.lag) {
    out.push({ key: 'lag', text: `🐌 سرور چند دقیقه است که کند جواب می‌دهد (تأخیر ${Math.round(loopLagMs)} میلی‌ثانیه).` });
  }
  if ((snap.clientErrors || 0) >= 15) {
    out.push({ key: 'client', text: `🧩 در ۱۰ دقیقه‌ی اخیر ${snap.clientErrors} خطای جاوااسکریپت از مرورگر بازدیدکننده‌ها گزارش شد؛ شاید نسخه‌ی تازه صفحه‌ای را خراب کرده (جزئیات در ادمین ← سلامت سایت ← خطاهای اخیر).` });
  }
  if (snap.sources.tenraiPaused && !snap.sources.tenraiDisabled && (streak.tenrai || 0) >= CONFIRM.tenrai) {
    out.push({ key: 'tenrai', text: '🔌 منبع داده (Tenrai) حدود نیم ساعت است که در دسترس نیست؛ ایمپورت و اطلاعات تازه متوقف است.' });
  }
  return out;
};

const active = new Map(); // key -> last time a message was sent
const streak = { lag: 0, tenrai: 0 };

export const checkHealth = async (now = Date.now()) => {
  const cfg = alertConfig();
  if (!cfg.enabled) return 0;
  const snap = healthSnapshot();
  streak.lag = (snap.system.loopLagMs || 0) > 2000 ? streak.lag + 1 : 0;
  streak.tenrai = snap.sources.tenraiPaused ? streak.tenrai + 1 : 0;
  const found = problems(snap, cfg, streak);
  const keys = new Set(found.map((p) => p.key));
  let sent = 0;
  for (const p of found) {
    const last = active.get(p.key);
    if (last == null || now - last >= REMIND_MS) {
      sent += await sendAlert(p.text);
      active.set(p.key, now);
    }
  }
  for (const key of [...active.keys()]) {
    if (!keys.has(key)) { active.delete(key); sent += await sendAlert(`✅ مشکل «${key}» برطرف شد.`); }
  }
  return sent;
};

export const startHealthAlerts = () => {
  // The first check waits a few minutes: right after a restart the numbers are not representative yet.
  setTimeout(() => { checkHealth().catch(() => {}); setInterval(() => checkHealth().catch(() => {}), CHECK_MS).unref(); }, 3 * 60000).unref();
};
