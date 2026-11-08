import './config.js';
import crypto from 'node:crypto';
import { fetch } from 'undici';
import { db } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { getDispatcher } from './proxy.js';
import { siteUrl } from './mailer.js';

// "A new episode of something on your list just aired": a Telegram / Bale bot the member links from the account page.
// Linking: the account page makes a one-time code; the member sends `/start <code>` to the bot (or opens the deep link) and
// the bot's long-poll loop (getUpdates, so no public webhook is needed) stores the chat id. A 10-minute job then finds the
// titles whose weekly Japanese broadcast time just passed and messages everyone who is watching them.
// Tokens come from server/.env (TELEGRAM_BOT_TOKEN / BALE_BOT_TOKEN) and are never sent to the browser.
db.exec(`
CREATE TABLE IF NOT EXISTS chat_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_chat_links_chat ON chat_links(provider, chat_id);
CREATE TABLE IF NOT EXISTS chat_link_codes (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_sent (
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  ep_key TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider, ep_key)
);
`);

export const PROVIDERS = {
  telegram: { name: 'Telegram', tokenEnv: 'TELEGRAM_BOT_TOKEN', userEnv: 'TELEGRAM_BOT_USERNAME', base: process.env.TELEGRAM_API_BASE || 'https://api.telegram.org', proxy: true, link: (u, code) => `https://t.me/${u}?start=${code}` },
  bale: { name: 'Bale', tokenEnv: 'BALE_BOT_TOKEN', userEnv: 'BALE_BOT_USERNAME', base: process.env.BALE_API_BASE || 'https://tapi.bale.ai', proxy: false, link: (u, code) => `https://ble.ir/${u}?start=${code}` },
};
// A value saved in the admin panel wins over server/.env, so the owner can change a bot without editing files.
const token = (id) => String(getSetting(`chat.${id}.token`, '') || process.env[PROVIDERS[id].tokenEnv] || '').trim();
const username = (id) => String(getSetting(`chat.${id}.username`, '') || process.env[PROVIDERS[id].userEnv] || '').trim().replace(/^@/, '');
export const configured = (id) => Boolean(PROVIDERS[id] && token(id));

const call = async (id, method, body, timeoutMs = 20000) => {
  const p = PROVIDERS[id];
  const response = await fetch(`${p.base}/bot${token(id)}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    dispatcher: p.proxy ? getDispatcher() : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.description || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data.result;
};

// ---- owner alerts (health problems go to one chat linked from the admin panel) ------------------
const alertChat = (id) => String(getSetting(`chat.${id}.alertChat`, '') || '');
export const alertInfo = () => Object.keys(PROVIDERS).map((id) => ({ id, name: PROVIDERS[id].name, configured: configured(id), linked: Boolean(alertChat(id)) }));
export const makeAlertCode = (id) => {
  const code = crypto.randomBytes(5).toString('hex').toUpperCase();
  setSetting('chat.alertcode', JSON.stringify({ code, provider: id, expires: Date.now() + 15 * 60000 }));
  const u = username(id);
  return { code, url: u ? PROVIDERS[id].link(u, code) : '', username: u };
};
export const unlinkAlert = (id) => setSetting(`chat.${id}.alertChat`, '');
export const sendAlert = async (text) => {
  let sent = 0;
  for (const id of Object.keys(PROVIDERS)) {
    const chat = alertChat(id);
    if (!chat || !configured(id)) continue;
    try { await sendMessage(id, chat, text); sent += 1; } catch { /* the chat may be gone; the panel shows it as linked until the owner unlinks */ }
  }
  return sent;
};
export const sendAlertTest = () => sendAlert('✅ پیام آزمایشی انی‌تیل: هشدارهای سلامت به این گفتگو می‌آیند.');
const pendingAlertCode = () => { try { return JSON.parse(getSetting('chat.alertcode', '') || 'null'); } catch { return null; } };

// ---- admin panel settings (the token itself is never returned) ---------------------------------
export const botSettings = () => Object.keys(PROVIDERS).map((id) => {
  const t = token(id);
  const fromPanel = Boolean(getSetting(`chat.${id}.token`, ''));
  return { id, name: PROVIDERS[id].name, tokenSet: Boolean(t), tokenHint: t ? t.slice(-4) : '', source: !t ? '' : fromPanel ? 'panel' : 'env', username: username(id), needsProxy: PROVIDERS[id].proxy };
});

export const saveBotSettings = (id, { token: next, username: name, clear }) => {
  if (clear) setSetting(`chat.${id}.token`, '');
  else if (typeof next === 'string' && next.trim()) setSetting(`chat.${id}.token`, next.trim());
  if (typeof name === 'string') setSetting(`chat.${id}.username`, name.trim().replace(/^@/, ''));
};

// Asks the messenger who the bot is (getMe): proves the token works, and fills in the username when it is empty.
export const verifyBot = async (id) => {
  const me = await call(id, 'getMe', {}, 20000);
  if (me?.username && !getSetting(`chat.${id}.username`, '') && !process.env[PROVIDERS[id].userEnv]) setSetting(`chat.${id}.username`, me.username);
  return me?.username || '';
};

export const sendMessage = (id, chatId, text) => call(id, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });

// ---- links --------------------------------------------------------------------------------
export const linkInfo = (userId) => Object.keys(PROVIDERS).map((id) => {
  const row = db.prepare('SELECT linked_at FROM chat_links WHERE user_id = ? AND provider = ?').get(userId, id);
  return { id, name: PROVIDERS[id].name, configured: configured(id), username: username(id), linked: Boolean(row), linkedAt: row?.linked_at || null };
});

export const makeCode = (userId, id) => {
  db.prepare('DELETE FROM chat_link_codes WHERE user_id = ? AND provider = ?').run(userId, id);
  db.prepare('DELETE FROM chat_link_codes WHERE expires_at < ?').run(Date.now());
  const code = crypto.randomBytes(5).toString('hex').toUpperCase();
  db.prepare('INSERT INTO chat_link_codes (code, user_id, provider, expires_at) VALUES (?, ?, ?, ?)').run(code, userId, id, Date.now() + 15 * 60000);
  const u = username(id);
  return { code, url: u ? PROVIDERS[id].link(u, code) : '', username: u };
};

export const unlink = (userId, id) => db.prepare('DELETE FROM chat_links WHERE user_id = ? AND provider = ?').run(userId, id).changes;

// ---- incoming messages (long polling) --------------------------------------------------------
const HELP = 'سلام! من بات انی‌تیل هستم.\nبرای وصل شدن، در سایت به «حساب من» برو، دکمه‌ی اتصال را بزن و کدی که می‌دهد را اینجا بفرست: /start کد\nبرای قطع شدن: /stop';

const handleMessage = async (id, message) => {
  const chatId = String(message?.chat?.id || '');
  const text = String(message?.text || '').trim();
  if (!chatId || !text) return;
  const [command, payload] = text.split(/\s+/);
  const verb = String(command || '').toLowerCase().replace(/@.*$/, '');
  if (verb === '/stop') {
    if (alertChat(id) === chatId) unlinkAlert(id);
    const removed = db.prepare('DELETE FROM chat_links WHERE provider = ? AND chat_id = ?').run(id, chatId).changes;
    await sendMessage(id, chatId, removed ? 'اتصال قطع شد. دیگر پیامی نمی‌فرستم.' : 'این گفتگو به حسابی وصل نبود.');
    return;
  }
  const code = String(payload || (verb === '/start' ? '' : text)).trim().toUpperCase();
  if (!code || (verb !== '/start' && !/^[0-9A-F]{10}$/.test(code))) { await sendMessage(id, chatId, HELP); return; }
  const pending = pendingAlertCode();
  if (pending && pending.provider === id && pending.code === code && pending.expires > Date.now()) {
    setSetting(`chat.${id}.alertChat`, chatId);
    setSetting('chat.alertcode', '');
    await sendMessage(id, chatId, '✅ این گفتگو برای هشدارهای سلامت انی‌تیل ثبت شد.');
    return;
  }
  const row = db.prepare('SELECT user_id FROM chat_link_codes WHERE code = ? AND provider = ? AND expires_at > ?').get(code, id, Date.now());
  if (!row) { await sendMessage(id, chatId, 'این کد معتبر نیست یا منقضی شده. از «حساب من» در سایت کد تازه بگیر.'); return; }
  db.prepare('INSERT OR REPLACE INTO chat_links (user_id, provider, chat_id) VALUES (?, ?, ?)').run(row.user_id, id, chatId);
  db.prepare('DELETE FROM chat_link_codes WHERE code = ?').run(code);
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(row.user_id);
  await sendMessage(id, chatId, `✅ وصل شد به حساب «${user?.username || ''}». وقتی قسمت تازه‌ی انیمه‌های «در حال تماشا»ی تو پخش شود، همین‌جا خبرت می‌کنم.`);
};

export const handleUpdate = handleMessage; // exported for the self-check script

const poll = async (id) => {
  const key = `chat.${id}.offset`;
  let offset = Number(getSetting(key, '0')) || 0;
  let failures = 0;
  // Runs for the life of the process; a bad token or a blocked network only slows it down.
  for (;;) {
    if (!configured(id)) { await new Promise((r) => setTimeout(r, 20000)); continue; }
    try {
      const updates = await call(id, 'getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 40000);
      failures = 0;
      for (const update of updates || []) {
        offset = update.update_id + 1;
        try { await handleMessage(id, update.message); } catch (error) { console.error(`[chat:${id}] ${error.message}`); }
      }
      if (updates?.length) setSetting(key, offset);
    } catch (error) {
      failures += 1;
      if (failures === 1 || failures % 20 === 0) console.error(`[chat:${id}] ${error.message}`);
      await new Promise((r) => setTimeout(r, Math.min(300000, 15000 * failures)));
    }
  }
};

// ---- new-episode notices -------------------------------------------------------------------
const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const JST_MS = 9 * 3600000;
const WINDOW_MS = 25 * 60000; // a little more than the 10-minute tick, so one missed tick loses nothing

// Last time (UTC ms) a weekly "<Day>s at HH:MM (JST)" broadcast aired at or before `now`, or null.
export const lastAirTime = (airingDay, broadcast, now = Date.now()) => {
  const match = /(\d{1,2}):(\d{2})/.exec(String(broadcast || ''));
  const day = DAYS[String(airingDay || '').slice(0, 3).toLowerCase()];
  if (!match || day === undefined) return null;
  const nowJst = now + JST_MS;
  for (let back = 0; back <= 7; back += 1) {
    const d = new Date(nowJst - back * 86400000);
    if (d.getUTCDay() !== day) continue;
    const airJst = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Number(match[1]), Number(match[2]));
    if (airJst <= nowJst) return airJst - JST_MS;
  }
  return null;
};

const broadcastOf = (information) => {
  try { return (JSON.parse(information) || []).find((row) => row?.label === 'Broadcast')?.value || ''; } catch { return ''; }
};

// ---- weekly digest (Saturday morning, Tehran time) --------------------------------------------------
const FA_DAYS = { Sat: 'شنبه', Sun: 'یک‌شنبه', Mon: 'دوشنبه', Tue: 'سه‌شنبه', Wed: 'چهارشنبه', Thu: 'پنجشنبه', Fri: 'جمعه' };
const TEHRAN_ORDER = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const JS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TEHRAN_MS = (3 * 60 + 30) * 60000;
const faDigits = (text) => String(text).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

// Broadcast day/time (Japan) -> day/time in Tehran (UTC+3:30, no daylight saving), the same maths as the schedule page.
export const tehranSlot = (airingDay, broadcast) => {
  const match = /(\d{1,2}):(\d{2})/.exec(String(broadcast || ''));
  const day = DAYS[String(airingDay || '').slice(0, 3).toLowerCase()];
  if (!match || day === undefined) return null;
  let minutes = Number(match[1]) * 60 + Number(match[2]) - (9 * 60 - (3 * 60 + 30));
  let shift = 0;
  if (minutes < 0) { minutes += 1440; shift = -1; }
  return { day: JS_DAYS[(day + shift + 7) % 7], time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` };
};

export const digestFor = (userId) => {
  const rows = db.prepare(`
    SELECT a.slug, a.title, a.airing_day, a.information FROM user_entries e JOIN anime a ON a.slug = e.slug
    WHERE e.user_id = ? AND e.media_type = 'anime' AND e.status = 'watching' AND a.airing_day != ''`).all(userId);
  const slots = rows.map((row) => ({ title: row.title, slug: row.slug, slot: tehranSlot(row.airing_day, broadcastOf(row.information)) })).filter((r) => r.slot);
  if (!slots.length) return '';
  slots.sort((a, b) => TEHRAN_ORDER.indexOf(a.slot.day) - TEHRAN_ORDER.indexOf(b.slot.day) || a.slot.time.localeCompare(b.slot.time));
  const lines = slots.map((r) => `• ${FA_DAYS[r.slot.day]} ${faDigits(r.slot.time)} — ${r.title}`);
  return `📅 برنامه‌ی این هفته‌ی تو (به وقت تهران)\n\n${lines.join('\n')}\n\nقسمت‌ها در ژاپن همان ساعت پخش می‌شوند و زیرنویس‌ها کمی بعد می‌آیند.\n${siteUrl()}/schedule`;
};

// Once a week, from Saturday 09:00 Tehran: one message per linked member who is watching something that airs.
export const sendWeeklyDigest = async (now = Date.now()) => {
  const tehran = new Date(now + TEHRAN_MS);
  if (tehran.getUTCDay() !== 6 || tehran.getUTCHours() < 9) return 0;
  const week = tehran.toISOString().slice(0, 10);
  if (getSetting('digest.lastWeek', '') === week) return 0;
  setSetting('digest.lastWeek', week); // before sending, so a restart halfway never sends twice
  let sent = 0;
  for (const link of db.prepare('SELECT user_id, provider, chat_id FROM chat_links').all()) {
    if (!configured(link.provider)) continue;
    const text = digestFor(link.user_id);
    if (!text) continue;
    try { await sendMessage(link.provider, link.chat_id, text); sent += 1; await new Promise((r) => setTimeout(r, 120)); } catch { /* blocked chats are cleaned up by the episode notices */ }
  }
  return sent;
};

let notifying = false;
export const notifyDue = async (now = Date.now()) => {
  if (notifying) return 0;
  notifying = true;
  let sent = 0;
  try {
    const airing = db.prepare("SELECT slug, title, mal_id, airing_day, information FROM anime WHERE airing_day != '' AND mal_id IS NOT NULL").all();
    const due = [];
    for (const row of airing) {
      const at = lastAirTime(row.airing_day, broadcastOf(row.information), now);
      if (at != null && now - at <= WINDOW_MS && now - at >= 0) due.push({ ...row, key: `${row.mal_id}:${Math.floor(at / 60000)}` });
    }
    if (!due.length) return 0;
    const find = db.prepare(`
      SELECT l.user_id, l.provider, l.chat_id FROM chat_links l
      JOIN user_entries e ON e.user_id = l.user_id AND e.media_type = 'anime' AND e.status = 'watching'
      WHERE e.slug = ?`);
    const claim = db.prepare('INSERT OR IGNORE INTO chat_sent (user_id, provider, ep_key, sent_at) VALUES (?, ?, ?, ?)');
    for (const item of due) {
      for (const link of find.all(item.slug)) {
        if (!configured(link.provider)) continue;
        if (claim.run(link.user_id, link.provider, item.key, now).changes === 0) continue; // already told
        try {
          await sendMessage(link.provider, link.chat_id, `📺 قسمت تازه‌ی «${item.title}» همین الان در ژاپن پخش شد.\nزیرنویس‌ها معمولاً چند ساعت بعد می‌آیند.\n${siteUrl()}/anime/${item.slug}`);
          sent += 1;
          await new Promise((r) => setTimeout(r, 120)); // stay far below the bots' per-second limits
        } catch (error) {
          // The member blocked the bot or deleted the chat: forget the link instead of failing every tick.
          if (error.status === 403 || error.status === 400) unlink(link.user_id, link.provider);
          else db.prepare('DELETE FROM chat_sent WHERE user_id = ? AND provider = ? AND ep_key = ?').run(link.user_id, link.provider, item.key);
        }
      }
    }
    db.prepare('DELETE FROM chat_sent WHERE sent_at < ?').run(now - 30 * 86400000);
  } finally {
    notifying = false;
  }
  return sent;
};

export const startChatBots = () => {
  // Every loop starts: one without a token just waits, so a token saved in the admin panel works without a restart.
  for (const id of Object.keys(PROVIDERS)) poll(id).catch((error) => console.error(`[chat:${id}] stopped: ${error.message}`));
  // The notice job is cheap, so it always runs; without a token it finds no configured provider and sends nothing.
  setInterval(() => notifyDue().catch((error) => console.error(`[chat] ${error.message}`)), 10 * 60000).unref();
  setInterval(() => sendWeeklyDigest().catch((error) => console.error(`[chat] ${error.message}`)), 30 * 60000).unref();
};

// ---- routes ----------------------------------------------------------------------------------
export const registerChatBotRoutes = (app, { requireSiteUser, userIdOf, httpError, limiter }) => {
  app.get('/api/user/chat', requireSiteUser, (req, res) => res.json({ providers: linkInfo(userIdOf(req)) }));
  app.post('/api/user/chat/:provider/code', requireSiteUser, limiter, (req, res) => {
    const id = req.params.provider;
    if (!PROVIDERS[id] || !configured(id)) throw httpError(404, 'This messenger is not set up');
    res.json(makeCode(userIdOf(req), id));
  });
  app.post('/api/user/chat/:provider/test', requireSiteUser, limiter, async (req, res) => {
    const id = req.params.provider;
    const row = PROVIDERS[id] && db.prepare('SELECT chat_id FROM chat_links WHERE user_id = ? AND provider = ?').get(userIdOf(req), id);
    if (!row) throw httpError(404, 'Not linked');
    try { await sendMessage(id, row.chat_id, '✅ پیام آزمایشی انی‌تیل: اتصال درست کار می‌کند.'); } catch { throw httpError(502, 'The messenger did not accept the message'); }
    res.json({ ok: true });
  });
  app.delete('/api/user/chat/:provider', requireSiteUser, limiter, (req, res) => {
    const id = req.params.provider;
    if (!PROVIDERS[id]) throw httpError(404, 'Unknown messenger');
    unlink(userIdOf(req), id);
    res.json({ ok: true });
  });
};
