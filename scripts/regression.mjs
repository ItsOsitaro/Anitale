// (Start the server with ADMIN_LOGIN_LIMIT=100: this script signs in as admin many times, and the real limit is 10 per 15 minutes.)
// Regression checks over HTTP for the flows people actually use: pages, search, landing pages, SEO, a member's list,
// calendar feed, bot/admin settings. Run it against a running server before every deploy:
//   SMOKE_ADMIN_USER=<user> SMOKE_ADMIN_PASS=<plaintext> node scripts/regression.mjs [baseUrl]
// It creates one throw-away member and removes it at the end. Nothing here needs Tenrai or AniList.
import crypto from 'node:crypto';
const unbase32 = (text) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0; let value = 0; const out = []; for (const ch of text) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = (secret, offsetSteps = 0) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offsetSteps)); const h = crypto.createHmac('sha1', unbase32(secret)).update(c).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0'); };
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const ORIGIN = new URL(BASE).origin;
const adminUser = process.env.SMOKE_ADMIN_USER;
const adminPass = process.env.SMOKE_ADMIN_PASS;
if (!adminUser || !adminPass) { console.error('Set SMOKE_ADMIN_USER and SMOKE_ADMIN_PASS (plaintext) and run again.'); process.exit(1); }

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const call = async (method, path, { body, cookie = '' } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = (res.headers.get('set-cookie') || '').split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html or ics */ }
  return { status: res.status, json, text, cookie: setCookie };
};

// ---- pages and static files the site cannot work without
for (const path of ['/', '/schedule', '/seasonal', '/genres', '/pick', '/search?q=naruto', '/login', '/manifest.webmanifest', '/sw.js', '/robots.txt', '/sitemap.xml']) {
  const res = await call('GET', path);
  check(`page ${path}`, res.status === 200, `status ${res.status}`);
}
{
  const home = await call('GET', '/');
  const bundle = /assets\/index-[^"]+\.js/.exec(home.text)?.[0];
  const js = bundle ? await call('GET', `/${bundle}`) : { status: 0 };
  check('home links a JavaScript bundle that loads', js.status === 200, bundle || 'no bundle in index.html');
}

// ---- catalog and search
const catalog = await call('GET', '/api/anime?lite=1');
const items = Array.isArray(catalog.json) ? catalog.json : [];
check('lite catalog', items.length > 0, `${items.length} titles`);
const sample = items.find((i) => i.malId) || items[0];
{
  const res = await call('GET', `/api/search?q=${encodeURIComponent(sample.title.slice(0, 5))}`);
  check('search by title', res.status === 200, `status ${res.status}`);
  const persian = await call('GET', `/api/search?q=${encodeURIComponent('ناروتو')}`);
  check('Persian-typed search answers', persian.status === 200);
  const full = await call('GET', '/api/search/full?type=anime&sort=score&sfw=1');
  check('full search with sort', full.status === 200 && Boolean(full.json), `status ${full.status}`);
  const eps = await call('GET', '/api/search/full?type=anime&maxEps=13');
  check('search filter maxEps', eps.status === 200);
}

// ---- SEO: title page meta, landing pages, sitemap
{
  const page = await call('GET', `/anime/${sample.slug}`);
  check('title page has a title tag and JSON-LD graph', /<title>[^<]+<\/title>/.test(page.text) && page.text.includes('"@graph"'));
  const genre = await call('GET', '/genre/action');
  check('genre landing page', genre.status === 200 && genre.text.includes('ItemList'));
  check('unknown genre is a real 404', (await call('GET', '/genre/not-a-genre')).status === 404);
  check('landing seasons API', (await call('GET', '/api/landing')).status === 200);
  const map = await call('GET', '/sitemap-pages.xml');
  check('sitemap lists landing pages', map.text.includes('/genre/') && map.text.includes('/genres'));
}

// ---- browser error reports are accepted but never trusted
{
  const report = await call('POST', '/api/client-error', { body: { message: 'regression probe', source: 'regression.mjs', page: '/' } });
  check('client error report is accepted', report.status === 204, `status ${report.status}`);
}

// ---- a member: register, list, calendar
const name = `reg${Date.now().toString(36)}`;
const password = 'regression-pass-1';
const reg = await call('POST', '/api/user/register', { body: { username: name, email: `${name}@example.com`, password } });
check('register', reg.status === 200 || reg.status === 201, `status ${reg.status}`);
const login = await call('POST', '/api/user/login', { body: { username: name, password } });
const me = login.cookie;
check('login', login.status === 200 && Boolean(me), `status ${login.status}`);
if (me) {
  check('community highlights', (await call('GET', '/api/home/community')).status === 200);
  check('calendar feed with an unknown token is 404', (await call('GET', '/api/calendar/nope.ics')).status === 404);
  const bad = await call('POST', '/api/user/anilist-list', { cookie: me, body: { username: 'bad name!' } });
  check('AniList import rejects a bad username', bad.status === 400, `status ${bad.status}`);
}

// ---- people you follow who have a title (and privacy: a private list never shows)
{
  const mk = async (suffix) => {
    const username = `${name}${suffix}`;
    await call('POST', '/api/user/register', { body: { username, email: `${username}@example.com`, password } });
    const r = await call('POST', '/api/user/login', { body: { username, password } });
    return { username, cookie: r.cookie };
  };
  const a = await mk('a');
  const b = await mk('b');
  await call('PUT', '/api/user/entries', { cookie: b.cookie, body: { mediaType: 'anime', slug: sample.slug, status: 'completed', rating: 8 } });
  check('friends-on needs login', (await call('GET', `/api/user/friends-on/anime/${sample.slug}`)).status === 401);
  check('nobody followed yet', (await call('GET', `/api/user/friends-on/anime/${sample.slug}`, { cookie: a.cookie })).json?.items?.length === 0);
  await call('POST', `/api/users/${b.username}/follow`, { cookie: a.cookie });
  const seen = await call('GET', `/api/user/friends-on/anime/${sample.slug}`, { cookie: a.cookie });
  check('followed member with the title is listed', seen.json?.items?.[0]?.username === b.username && seen.json.items[0].rating === 8);
  await call('PUT', '/api/user/me', { cookie: b.cookie, body: { privacy: { anime: 'private' } } });
  const hidden = await call('GET', `/api/user/friends-on/anime/${sample.slug}`, { cookie: a.cookie });
  // together: b loved the sample title and a does not have it -> a sees it (while b's list is public)
  await call('PUT', '/api/user/me', { cookie: b.cookie, body: { privacy: { anime: 'public' } } });
  await call('DELETE', `/api/user/entries/anime/${sample.slug}`, { cookie: a.cookie });
  const together = await call('GET', `/api/users/${b.username}/together`, { cookie: a.cookie });
  check('watch-together lists what they loved', together.status === 200 && together.json?.theyLoved?.includes(sample.slug), JSON.stringify(together.json));
  check('watch-together needs login', (await call('GET', `/api/users/${b.username}/together`)).status === 401);
  await call('PUT', '/api/user/me', { cookie: b.cookie, body: { privacy: { anime: 'private' } } });
  check('watch-together hides a private list', (await call('GET', `/api/users/${b.username}/together`, { cookie: a.cookie })).json?.hidden === true);
  check('continue (manga) answers', (await call('GET', '/api/user/continue?type=manga', { cookie: a.cookie })).status === 200);
  const trending = await call('GET', '/api/home/community');
  check('home community has a trending list', Array.isArray(trending.json?.trending));
  const og = await fetch(`${BASE}/og/anime/${sample.slug}.png`);
  check('share image is a PNG (or 404 when the title has no cover or is sensitive)', og.status === 404 || (og.status === 200 && og.headers.get('content-type') === 'image/png'), `status ${og.status}`);
  check('CSP is report-only', Boolean((await fetch(`${BASE}/`)).headers.get('content-security-policy-report-only')));
  check('CSP report endpoint accepts a report', (await fetch(`${BASE}/api/csp-report`, { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'inline' } }) })).status === 204);
  check('a private list is not shown', hidden.json?.items?.length === 0, JSON.stringify(hidden.json));
  globalThis.extraUsers = [a.username, b.username];
}

// ---- admin settings (the bot token check once rejected any token containing the letter s)
const adminLogin = await call('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
const admin = adminLogin.cookie;
check('admin login', adminLogin.status === 200 && Boolean(admin), `status ${adminLogin.status}`);
if (admin) {
  const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
  const saved = await call('POST', '/api/admin/x/system/chat', { cookie: admin, body: { provider: 'telegram', token: `${token}\n` } });
  check('bot token with the letter s and a trailing newline is accepted', saved.status === 200, `status ${saved.status}`);
  check('bot token is never sent back', !saved.text.includes(token));
  check('a token with a space inside is rejected', (await call('POST', '/api/admin/x/system/chat', { cookie: admin, body: { provider: 'telegram', token: 'has space' } })).status === 400);
  await call('POST', '/api/admin/x/system/chat', { cookie: admin, body: { provider: 'telegram', clear: true } });

  // an empty search is counted, and an alias makes the next search find the title
  const phrase = 'zzqx regression nickname';
  await call('GET', `/api/search?q=${encodeURIComponent(phrase)}`);
  const misses = await call('GET', '/api/admin/x/community/search-misses', { cookie: admin });
  check('empty search is listed for the owner', misses.status === 200 && misses.json?.misses?.some((m) => m.q === phrase));
  const alias = await call('POST', '/api/admin/x/community/search-aliases', { cookie: admin, body: { alias: phrase, kind: 'anime', slug: sample.slug } });
  check('alias saved', alias.status === 200, `status ${alias.status}`);
  const viaAlias = await call('GET', `/api/search/full?q=${encodeURIComponent(phrase)}&type=anime`);
  check('alias makes the search find its title first', viaAlias.json?.items?.[0]?.slug === sample.slug);
  await call('DELETE', '/api/admin/x/community/search-aliases', { cookie: admin, body: { alias: phrase } });
  check('health alerts settings', (await call('GET', '/api/admin/x/system/alerts', { cookie: admin })).status === 200);
  // admin tools: quality, growth, jobs, self-check, palette search, queues
  for (const [label, path] of [['catalog quality', '/api/admin/x/catalog/quality'], ['growth', '/api/admin/x/system/growth'], ['background jobs', '/api/admin/x/system/jobs'], ['dashboard queues', '/api/admin/x/community/queues'], ['palette titles', `/api/admin/x/catalog/find?q=${encodeURIComponent(sample.title.slice(0, 4))}`], ['palette members', '/api/admin/x/users/find?q=reg']]) {
    const r = await call('GET', path, { cookie: admin });
    check(`admin ${label}`, r.status === 200 && r.json, `status ${r.status}`);
  }
  const growth = await call('GET', '/api/admin/x/system/growth', { cookie: admin });
  check('growth has 30 days per series', growth.json?.series?.users?.length === 30);
  const selfcheck = await call('POST', '/api/admin/x/system/selfcheck', { cookie: admin, body: {} });
  check('post-deploy self-check passes', selfcheck.status === 200 && selfcheck.json?.ok === true, JSON.stringify((selfcheck.json?.results || []).filter((r) => !r.ok)));
  const jobOff = await call('POST', '/api/admin/x/system/jobs/alerts', { cookie: admin, body: { enabled: false } });
  const jobOn = await call('POST', '/api/admin/x/system/jobs/alerts', { cookie: admin, body: { enabled: true } });
  check('a background job can be switched off and on', jobOff.status === 200 && jobOn.status === 200);
  // suspension: login refused while suspended, works again after lifting
  const victim = globalThis.extraUsers?.[0];
  if (victim) {
    const ban = await call('POST', `/api/admin/x/users/${victim}/ban`, { cookie: admin, body: { days: 3, reason: 'regression' } });
    check('member suspended', ban.status === 200, `status ${ban.status}`);
    const refused = await call('POST', '/api/user/login', { body: { username: victim, password } });
    check('suspended member cannot log in', refused.status === 403, `status ${refused.status}`);
    const wrong = await call('POST', '/api/user/login', { body: { username: victim, password: 'wrong-password-1' } });
    check('wrong password still looks like any other failure', wrong.status === 401, `status ${wrong.status}`);
    await call('DELETE', `/api/admin/x/users/${victim}/ban`, { cookie: admin });
    check('lifted suspension allows login', (await call('POST', '/api/user/login', { body: { username: victim, password } })).status === 200);
  }
  // sixth admin round: bulk genre + revert, merge, reports, announcement, backups
  const pick = items.filter((i) => i.slug !== sample.slug).slice(0, 2);
  const [one, two] = pick;
  const before = (await call('GET', `/api/anime/${one.slug}`)).json;
  const bulk = await call('POST', '/api/admin/x/catalog/bulk-genre', { cookie: admin, body: { type: 'anime', slugs: [one.slug], genre: 'RegressionGenre', mode: 'add' } });
  check('bulk genre adds a genre', bulk.status === 200 && bulk.json?.changed === 1, JSON.stringify(bulk.json));
  const withGenre = (await call('GET', `/api/anime/${one.slug}`)).json;
  check('the genre is on the title', withGenre?.genres?.includes('RegressionGenre'));
  const revs = await call('GET', '/api/admin/x/system/revisions', { cookie: admin });
  const rev = revs.json?.items?.find((r) => r.slug === one.slug && r.action === 'genre');
  check('the change is listed as a revision', Boolean(rev));
  const back = rev && await call('POST', `/api/admin/x/system/revisions/${rev.id}/revert`, { cookie: admin, body: {} });
  check('revert restores the old genres', back?.status === 200 && !(await call('GET', `/api/anime/${one.slug}`)).json?.genres?.includes('RegressionGenre') && JSON.stringify((await call('GET', `/api/anime/${one.slug}`)).json?.genres) === JSON.stringify(before?.genres));

  const note = await call('POST', '/api/admin/x/system/announcement', { cookie: admin, body: { text: 'regression notice', hours: 1, level: 'warn' } });
  check('announcement saved', note.status === 200 && note.json?.active === true);
  const shown = await call('GET', '/api/announcement');
  check('announcement is public', shown.json?.text === 'regression notice');
  await call('DELETE', '/api/admin/x/system/announcement', { cookie: admin });
  check('announcement can be removed', Object.keys((await call('GET', '/api/announcement')).json || {}).length === 0);

  const backups = await call('GET', '/api/admin/x/system/backups', { cookie: admin });
  check('backup status answers', backups.status === 200 && Array.isArray(backups.json?.files));
  const snap = await call('POST', '/api/admin/x/system/backups', { cookie: admin, body: { now: true } });
  check('backup now creates a snapshot', snap.status === 200 && snap.json?.files?.length >= 1 && snap.json.files[0].size > 10000, JSON.stringify(snap.json?.files?.[0]));

  // reports: a member reports a review; the owner sees and closes it
  if (globalThis.extraUsers) {
    const [ua, ub] = globalThis.extraUsers;
    const loginA = await call('POST', '/api/user/login', { body: { username: ua, password } });
    const loginB = await call('POST', '/api/user/login', { body: { username: ub, password } });
    await call('POST', '/api/user/reviews', { cookie: loginB.cookie, body: { mediaType: 'anime', slug: sample.slug, body: 'A review written by the regression script for reports.' } });
    const posted = await call('POST', '/api/user/reviews', { cookie: loginB.cookie, body: { mediaType: 'anime', slug: sample.slug, body: 'A review written by the regression script for reports.' } });
    const rv = (await call('GET', `/api/community/anime/${sample.slug}`)).json?.reviews?.find((r) => r.username === ub);
    if (!rv) check('regression review is visible', false, `post ${posted.status} ${posted.text.slice(0, 120)}`);
    if (rv) {
      const rep = await call('POST', '/api/user/reports', { cookie: loginA.cookie, body: { kind: 'review', ref: String(rv.id), reason: 'regression' } });
      check('a member can report a review', rep.status === 200, `status ${rep.status}`);
      check('reporting needs login', (await call('POST', '/api/user/reports', { body: { kind: 'review', ref: String(rv.id) } })).status === 401);
      const queue = await call('GET', '/api/admin/x/reports', { cookie: admin });
      const item = queue.json?.items?.find((r) => r.ref === String(rv.id));
      check('the owner sees the report with its text', Boolean(item?.subject?.text?.includes('regression script')));
      check('the report can be closed with a note', item && (await call('POST', `/api/admin/x/reports/${item.id}`, { cookie: admin, body: { status: 'done', note: 'removed, thanks' } })).status === 200);
      const inbox = await call('GET', '/api/user/notifications', { cookie: loginA.cookie });
      check('the reporter is told, with the note', inbox.status === 200 && inbox.json?.items?.some((n) => n.kind === 'report_result' && n.report?.note === 'removed, thanks'), JSON.stringify(inbox.json?.items?.[0]));

      // notification settings, "helpful" alerts, grouping, tabs, suggestion result, clearing
      const prefs = await call('GET', '/api/user/notification-prefs', { cookie: loginB.cookie });
      check('every notification type is on by default', prefs.status === 200 && Object.values(prefs.json?.prefs || {}).length >= 6 && Object.values(prefs.json.prefs).every(Boolean));
      check('an unknown notification type is refused', (await call('PUT', '/api/user/notification-prefs', { cookie: loginB.cookie, body: { key: 'nope', enabled: false } })).status === 400);
      const inboxOf = async (cookie, tab = '') => (await call('GET', `/api/user/notifications${tab ? `?tab=${tab}` : ''}`, { cookie })).json;
      await call('PUT', '/api/user/notification-prefs', { cookie: loginB.cookie, body: { key: 'helpful', enabled: false } });
      await call('PUT', `/api/user/reviews/${rv.id}/helpful`, { cookie: loginA.cookie });
      check('a switched-off type creates nothing', !(await inboxOf(loginB.cookie)).items.some((n) => n.kind === 'review_helpful'));
      await call('PUT', '/api/user/notification-prefs', { cookie: loginB.cookie, body: { key: 'helpful', enabled: true } });
      await call('DELETE', `/api/user/reviews/${rv.id}/helpful`, { cookie: loginA.cookie });
      await call('PUT', `/api/user/reviews/${rv.id}/helpful`, { cookie: loginA.cookie });
      const helpful = (await inboxOf(loginB.cookie)).items.find((n) => n.kind === 'review_helpful');
      check('the author hears that the review was helpful', helpful?.count === 1 && helpful.actor?.username === ua && helpful.slug === sample.slug, JSON.stringify(helpful));
      await call('DELETE', `/api/user/reviews/${rv.id}/helpful`, { cookie: loginA.cookie });
      check('taking the vote back removes the notification', !(await inboxOf(loginB.cookie)).items.some((n) => n.kind === 'review_helpful'));
      await call('POST', `/api/users/${ub}/follow`, { cookie: loginA.cookie });
      await call('POST', `/api/users/${ub}/follow`, { cookie: me });
      const follows = (await inboxOf(loginB.cookie)).items.filter((n) => n.kind === 'follow');
      check('followers in one day merge into one row', follows.length === 1 && follows[0].count === 2 && follows[0].ids.length === 2, JSON.stringify(follows));
      check('the social tab holds follows, the results tab does not', (await inboxOf(loginB.cookie, 'social')).items.some((n) => n.kind === 'follow') && (await inboxOf(loginB.cookie, 'results')).items.length === 0);
      check('the results tab holds the report answer', (await inboxOf(loginA.cookie, 'results')).items.some((n) => n.kind === 'report_result') && !(await inboxOf(loginA.cookie, 'social')).items.some((n) => n.kind === 'report_result'));
      // a rejected edit suggestion reaches its author with the reason
      const sg = await call('POST', '/api/user/suggestions', { cookie: loginA.cookie, body: { mediaType: 'anime', slug: sample.slug, kind: 'report', text: 'regression suggestion about a mistake' } });
      if (sg.status === 201) {
        const rej = await call('POST', `/api/admin/suggestions/${sg.json.id}/reject`, { cookie: admin, body: { reason: 'not needed' } });
        const note = (await inboxOf(loginA.cookie)).items.find((n) => n.kind === 'suggestion_result');
        check('a rejected suggestion notifies its author with the reason', rej.status === 200 && note?.suggestion?.status === 'rejected' && note.suggestion.reason === 'not needed', JSON.stringify(note));
      } else check('create a suggestion for the notification test', false, `status ${sg.status}`);
      // read, then clear only what was read
      await call('POST', '/api/user/notifications/read', { cookie: loginB.cookie, body: { all: true } });
      const cleared = await call('POST', '/api/user/notifications/clear', { cookie: loginB.cookie, body: {} });
      check('clearing removes what was read', cleared.status === 200 && cleared.json?.removed >= 1 && (await inboxOf(loginB.cookie)).items.length === 0, JSON.stringify(cleared.json));
    }
  }

  // merge two titles: a member's entry on the duplicate moves to the main title
  const dupSlug = `regression-dup-${Date.now().toString(36)}`;
  const mk = await call('POST', '/api/anime', { cookie: admin, body: { slug: dupSlug, title: 'Regression Duplicate', category: 'Action', year: '2020', format: 'TV' } });
  if (mk.status < 300) {
    await call('PUT', '/api/user/entries', { cookie: me, body: { mediaType: 'anime', slug: dupSlug, status: 'planned' } });
    const merged = await call('POST', '/api/admin/x/catalog/merge', { cookie: admin, body: { type: 'anime', from: dupSlug, into: two.slug } });
    check('merge moves entries and removes the duplicate', merged.status === 200 && merged.json?.moved?.entries >= 1, JSON.stringify(merged.json));
    const entries = (await call('GET', '/api/user/entries', { cookie: me })).json;
    check('the member now has the main title', JSON.stringify(entries).includes(two.slug) && !JSON.stringify(entries).includes(dupSlug));
    await call('DELETE', `/api/user/entries/anime/${two.slug}`, { cookie: me });
  } else check('create a duplicate title for the merge test', false, `status ${mk.status} ${mk.text.slice(0, 120)}`);
  // seventh admin round: sessions, finer permissions, notes, canned reasons, weekly report, revision search
  const second = await call('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
  const sessions = await call('GET', '/api/admin/admins/sessions', { cookie: admin });
  check('owner sees admin sessions', sessions.status === 200 && sessions.json?.items?.length >= 2 && Boolean(sessions.json?.current));
  const other = sessions.json?.items?.find((x) => x.sid !== sessions.json.current);
  check('an extra session still works before it is ended', (await call('GET', '/api/admin/overview', { cookie: second.cookie })).status === 200);
  const ended = other && await call('DELETE', `/api/admin/admins/sessions/${other.sid}`, { cookie: admin });
  check('owner can end a session', ended?.status === 200);
  const statuses = [(await call('GET', '/api/admin/overview', { cookie: second.cookie })).status, (await call('GET', '/api/admin/overview', { cookie: admin })).status];
  check('the ended session is signed out and the other stays', statuses.includes(401) && statuses.includes(200), JSON.stringify(statuses));

  const mkAdmin = async (suffix, permissions) => {
    const username = `${name}${suffix}`;
    const made = await call('POST', '/api/admin/admins', { cookie: admin, body: { username, password: 'regression-admin-pass-1', permissions } });
    const entered = await call('POST', '/api/auth/login', { body: { username, password: 'regression-admin-pass-1' } });
    return { username, id: made.json?.item?.id ?? made.json?.id, cookie: entered.cookie, status: made.status };
  };
  const reportsOnly = await mkAdmin('r', { reports: 'edit' });
  check('an admin with only the reports area is created', reportsOnly.status < 300 && Boolean(reportsOnly.cookie), `status ${reportsOnly.status}`);
  check('reports-only admin can open the reports queue', (await call('GET', '/api/admin/x/reports', { cookie: reportsOnly.cookie })).status === 200);
  check('reports-only admin cannot open catalog tools', (await call('GET', '/api/admin/x/catalog/quality', { cookie: reportsOnly.cookie })).status === 403);
  check('reports-only admin cannot open reviews moderation', (await call('GET', '/api/admin/reviews', { cookie: reportsOnly.cookie })).status === 403);
  const legacy = await mkAdmin('c', { community: 'view' });
  check('an older community permission still opens reviews and reports', (await call('GET', '/api/admin/x/reports', { cookie: legacy.cookie })).status === 200 && (await call('GET', '/api/admin/reviews', { cookie: legacy.cookie })).status === 200);
  for (const made of [reportsOnly, legacy]) if (made.id) await call('DELETE', `/api/admin/admins/${made.id}`, { cookie: admin });

  const noteAdd = await call('POST', '/api/admin/x/catalog/notes', { cookie: admin, body: { type: 'anime', slug: sample.slug, body: 'check the cover' } });
  const notes = await call('GET', `/api/admin/x/catalog/notes?type=anime&slug=${sample.slug}`, { cookie: admin });
  check('a note on a title is saved and listed', noteAdd.status === 200 && notes.json?.items?.[0]?.body === 'check the cover');
  check('a note can be deleted', (await call('DELETE', `/api/admin/x/catalog/notes/${notes.json.items[0].id}`, { cookie: admin })).status === 200);
  await call('POST', '/api/admin/x/users/notes', { cookie: admin, body: { username: name, body: 'spam twice' } });
  const userNotes = await call('GET', `/api/admin/x/users/notes?username=${name}`, { cookie: admin });
  check('a note on a member is saved and listed', userNotes.json?.items?.[0]?.body === 'spam twice');
  const canned = await call('PUT', '/api/admin/x/reviews/canned', { cookie: admin, body: { items: ['Duplicate', 'Already correct', 'x'] } });
  check('canned reasons keep only real ones', canned.status === 200 && JSON.stringify(canned.json?.items) === JSON.stringify(['Duplicate', 'Already correct']));
  const weekly = await call('GET', '/api/admin/x/system/weekly-report', { cookie: admin });
  check('weekly report preview has text', weekly.status === 200 && String(weekly.json?.text || '').includes('گزارش هفتگی'));
  const found = await call('GET', `/api/admin/x/system/revisions?q=${encodeURIComponent(one.slug.slice(0, 6))}`, { cookie: admin });
  check('revisions can be searched by title', found.status === 200 && found.json?.items?.every((r) => r.slug.includes(one.slug.slice(0, 6)) || r.title.toLowerCase().includes(one.slug.slice(0, 6).toLowerCase())));
  // eighth admin round: log titles, report notes, shared views, failed-login log, my work, data export, two-step sign-in
  await call('PATCH', `/api/admin/anime/${one.slug}/airing-day`, { cookie: admin, body: { airingDay: '' } }); // a title write that the log should label with the title name
  const logHit = await call('GET', `/api/admin/log?q=${encodeURIComponent(one.title.slice(0, 8))}`, { cookie: admin });
  check('the activity log can be searched by title name', logHit.status === 200 && logHit.json?.items?.some((r) => r.label === one.title || (r.label || '').toLowerCase().includes(one.title.slice(0, 8).toLowerCase())), `${logHit.json?.items?.length} rows`);
  const view = await call('POST', '/api/admin/x/catalog/views', { cookie: admin, body: { scope: 'anime', name: 'no cover 2025', search: 'filter=noCover&q=2025' } });
  const views = await call('GET', '/api/admin/x/catalog/views?scope=anime', { cookie: admin });
  check('a saved view is stored for everyone', view.status === 200 && views.json?.items?.some((v) => v.name === 'no cover 2025' && v.search.includes('noCover')));
  const userView = await call('POST', '/api/admin/x/users/views', { cookie: admin, body: { scope: 'users', name: 'listed', search: '{"q":"","filter":"listed","sort":"new"}' } });
  check('a saved view for members works', userView.status === 200 && (await call('GET', '/api/admin/x/users/views?scope=users', { cookie: admin })).json?.items?.length >= 1);
  check('a view scope is checked', (await call('POST', '/api/admin/x/catalog/views', { cookie: admin, body: { scope: 'users', name: 'x' } })).status === 400);
  for (const v of views.json.items) await call('DELETE', `/api/admin/x/catalog/views/${v.id}`, { cookie: admin });

  const wrong = await call('POST', '/api/auth/login', { body: { username: adminUser, password: 'definitely-wrong-password' } });
  const failedLog = await call('GET', '/api/admin/log?q=auth%2Flogin', { cookie: admin });
  check('a failed admin sign-in is written to the log', wrong.status === 401 && failedLog.json?.items?.some((r) => r.status === 401 && r.admin === adminUser));
  const ov = await call('GET', '/api/admin/overview', { cookie: admin });
  check('the dashboard has my work of the week', typeof ov.json?.mine?.all === 'number' && ov.json.mine.all >= 1);
  if (globalThis.extraUsers?.[0]) {
    const exp = await call('GET', `/api/admin/x/users/${globalThis.extraUsers[0]}/export.json`, { cookie: admin });
    check('a member data export has the account and lists', exp.status === 200 && exp.json?.account?.username === globalThis.extraUsers[0] && Array.isArray(exp.json?.list) && !exp.text.includes('password_hash'));
  }

  // two-step sign-in on a throw-away extra admin
  const tfName = `${name}t`;
  const tfMade = await call('POST', '/api/admin/admins', { cookie: admin, body: { username: tfName, password: 'regression-admin-pass-1', permissions: { reports: 'view' } } });
  const tfLogin = await call('POST', '/api/auth/login', { body: { username: tfName, password: 'regression-admin-pass-1' } });
  const started = await call('POST', '/api/admin/me/2fa/start', { cookie: tfLogin.cookie, body: {} });
  check('two-step setup gives a secret and a link', started.status === 200 && /^[A-Z2-7]{32}$/.test(started.json?.secret || '') && started.json.uri.startsWith('otpauth://totp/'));
  check('a wrong code does not turn it on', (await call('POST', '/api/admin/me/2fa/enable', { cookie: tfLogin.cookie, body: { code: '000000' } })).status === 400);
  const good = totp(started.json.secret);
  check('the right code turns it on', (await call('POST', '/api/admin/me/2fa/enable', { cookie: tfLogin.cookie, body: { code: good } })).status === 200);
  const noCode = await call('POST', '/api/auth/login', { body: { username: tfName, password: 'regression-admin-pass-1' } });
  check('sign-in now asks for a code', noCode.status === 401 && noCode.json?.needCode === true);
  check('a wrong code is refused', (await call('POST', '/api/auth/login', { body: { username: tfName, password: 'regression-admin-pass-1', code: '123456' } })).status === 401);
  check('a used code cannot be replayed', (await call('POST', '/api/auth/login', { body: { username: tfName, password: 'regression-admin-pass-1', code: good } })).status === 401);
  const next = totp(started.json.secret, 1);
  const withCode = await call('POST', '/api/auth/login', { body: { username: tfName, password: 'regression-admin-pass-1', code: next } });
  check('a fresh code signs in', withCode.status === 200 && Boolean(withCode.cookie), `status ${withCode.status}`);
  check('turning it off needs a code', (await call('POST', '/api/admin/me/2fa/disable', { cookie: withCode.cookie, body: { code: '111111' } })).status === 400);
  const tfAdmin = (await call('GET', '/api/admin/admins', { cookie: admin })).json?.items?.find((x) => x.username === tfName);
  if (tfAdmin) await call('DELETE', `/api/admin/admins/${tfAdmin.id}`, { cookie: admin });
  void tfMade;
  // ninth admin round: page counters, popular searches, funnel, CSV bulk edit, event alerts switch
  for (let i = 0; i < 3; i += 1) await call('POST', '/api/hit', { body: { path: `/anime/${sample.slug}` } });
  await call('POST', '/api/hit', { body: { path: '/admin/secret' } });
  await call('GET', '/api/search/full?q=regressionterm&type=anime');
  const stats = await call('GET', '/api/admin/x/system/stats?days=7', { cookie: admin });
  check('page views are counted per title', stats.status === 200 && stats.json?.anime?.some((r) => r.ref === sample.slug && r.n >= 3));
  check('admin pages are never counted', !JSON.stringify(stats.json).includes('secret'));
  check('popular searches are counted', stats.json?.searches?.some((r) => r.q === 'regressionterm'));
  const funnel = await call('GET', '/api/admin/x/system/funnel', { cookie: admin });
  check('the sign-up funnel answers', funnel.status === 200 && Array.isArray(funnel.json?.weeks) && funnel.json.weeks[0]?.signups >= 1);
  const jobs2 = await call('GET', '/api/admin/x/system/jobs', { cookie: admin });
  check('instant alerts can be switched', jobs2.json?.jobs?.some((j) => j.id === 'events') && (await call('POST', '/api/admin/x/system/jobs/events', { cookie: admin, body: { enabled: true } })).status === 200);
  const rowsIn = [{ slug: two.slug, titleFa: 'عنوان آزمایشی', genres: 'Action; RegressionGenre2', year: '', synopsisFa: '' }, { slug: 'no-such-title', titleFa: 'x' }];
  const beforeTwo = (await call('GET', `/api/anime/${two.slug}`)).json;
  const prev = await call('POST', '/api/admin/x/catalog/bulk-edit', { cookie: admin, body: { type: 'anime', rows: rowsIn, apply: false } });
  check('bulk edit preview lists changes and saves nothing', prev.status === 200 && prev.json?.rows?.[0]?.changes?.length >= 1 && prev.json.rows[1].found === false && prev.json.applied === 0 && (await call('GET', `/api/anime/${two.slug}`)).json?.titleFa === beforeTwo?.titleFa);
  const done = await call('POST', '/api/admin/x/catalog/bulk-edit', { cookie: admin, body: { type: 'anime', rows: rowsIn, apply: true } });
  const afterTwo = (await call('GET', `/api/anime/${two.slug}`)).json;
  check('bulk edit saves titleFa and genres', done.json?.applied === 1 && afterTwo?.titleFa === 'عنوان آزمایشی' && afterTwo?.genres?.includes('RegressionGenre2'));
  const revs2 = await call('GET', `/api/admin/x/system/revisions?q=${encodeURIComponent(two.slug.slice(0, 6))}`, { cookie: admin });
  const rev2 = revs2.json?.items?.find((r) => r.slug === two.slug && r.action === 'edit' && !r.reverted);
  check('a bulk edit can be undone', rev2 && (await call('POST', `/api/admin/x/system/revisions/${rev2.id}/revert`, { cookie: admin, body: {} })).status === 200 && !(await call('GET', `/api/anime/${two.slug}`)).json?.genres?.includes('RegressionGenre2'));
  check('a bulk edit with no rows is refused', (await call('POST', '/api/admin/x/catalog/bulk-edit', { cookie: admin, body: { type: 'anime', rows: [] } })).status === 400);
  const noOrigin = await fetch(`${BASE}/api/admin/x/community/search-aliases`, { method: 'DELETE', headers: { 'content-type': 'application/json', cookie: admin }, body: '{"alias":"x"}' });
  check('admin extras reject a write without Origin (CSRF)', noOrigin.status === 403, `status ${noOrigin.status}`);
  check('site cannot be framed by other sites', (await fetch(`${BASE}/`)).headers.get('x-frame-options') === 'SAMEORIGIN');
  check('admin routes are locked without login', (await call('GET', '/api/admin/x/system/chat')).status === 401);
  for (const extra of globalThis.extraUsers || []) await call('DELETE', `/api/admin/users/${extra}`, { cookie: admin });
  if (me) check('remove the throw-away member', (await call('DELETE', `/api/admin/users/${name}`, { cookie: admin })).status === 200);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll regression checks passed');
process.exit(failed ? 1 : 0);
