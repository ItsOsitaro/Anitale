// Self-check for server/chat-bots.js against a fake Telegram API (no real token, throw-away database).
//   node scripts/dev/chat-bot-check.mjs
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const sent = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const method = req.url.split('/').pop();
    if (method === 'sendMessage') sent.push(JSON.parse(body));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, result: method === 'getUpdates' ? [] : {} }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

process.env.DB_FILE = path.join(os.tmpdir(), `chat-check-${process.pid}.db`);
process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${server.address().port}`;
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_BOT_USERNAME = 'anitale_test_bot';
process.env.SITE_URL = 'https://example.test';

const { db } = await import('../../server/db.js');
const bots = await import('../../server/chat-bots.js');

// 1. weekly JST broadcast -> last air time (Sunday 00:00 JST = Saturday 15:00 UTC)
const now = Date.UTC(2026, 10, 7, 15, 10); // Sat 2026-11-07 15:10 UTC
assert.equal(bots.lastAirTime('Sun', 'Sundays at 00:00 (JST)', now), Date.UTC(2026, 10, 7, 15, 0));
assert.equal(bots.lastAirTime('Sun', 'Sundays at 00:00 (JST)', now - 3 * 3600000), Date.UTC(2026, 9, 31, 15, 0)); // before it aired: last week
assert.equal(bots.lastAirTime('Mon', 'Unknown', now), null);

// 2. linking with a one-time code
db.prepare("INSERT INTO users (id, username, password_hash) VALUES (1, 'tester', 'x')").run();
const { code } = bots.makeCode(1, 'telegram');
await bots.handleUpdate('telegram', { chat: { id: 555 }, text: `/start ${code}` });
assert.equal(db.prepare('SELECT chat_id FROM chat_links WHERE user_id = 1').get().chat_id, '555');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_link_codes').get().n, 0, 'the code is single use');
await bots.handleUpdate('telegram', { chat: { id: 556 }, text: `/start ${code}` });
assert.ok(sent.at(-1).text.includes('معتبر نیست'), 'a used code is rejected');

// 3. a title on the list airs -> one message, never twice
const info = JSON.stringify([{ label: 'Broadcast', value: 'Sundays at 00:00 (JST)' }]);
db.prepare("INSERT INTO anime (slug, title, mal_id, airing_day, information) VALUES ('t-show', 'Test Show', 4242, 'Sun', ?)").run(info);
db.prepare("INSERT INTO anime (slug, title, mal_id, airing_day, information) VALUES ('other', 'Other Show', 4243, 'Sun', ?)").run(info);
db.prepare("INSERT INTO user_entries (user_id, media_type, slug, status) VALUES (1, 'anime', 't-show', 'watching')").run();
db.prepare("INSERT INTO user_entries (user_id, media_type, slug, status) VALUES (1, 'anime', 'other', 'planned')").run();
const before = sent.length;
assert.equal(await bots.notifyDue(now), 1, 'only the watched title is announced');
assert.ok(sent.at(-1).text.includes('Test Show') && sent.at(-1).text.includes('https://example.test/anime/t-show'));
assert.equal(await bots.notifyDue(now + 5 * 60000), 0, 'the same episode is not announced twice');
assert.equal(sent.length, before + 1);

// 4. /stop forgets the link
await bots.handleUpdate('telegram', { chat: { id: 555 }, text: '/stop' });
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_links').get().n, 0);

console.log('chat-bots: all checks passed');
server.close();
process.exit(0);
