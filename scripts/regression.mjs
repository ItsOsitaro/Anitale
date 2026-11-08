// Regression checks over HTTP for the flows people actually use: pages, search, landing pages, SEO, a member's list,
// calendar feed, bot/admin settings. Run it against a running server before every deploy:
//   SMOKE_ADMIN_USER=<user> SMOKE_ADMIN_PASS=<plaintext> node scripts/regression.mjs [baseUrl]
// It creates one throw-away member and removes it at the end. Nothing here needs Tenrai or AniList.
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
    const rv = (await call('GET', `/api/community/anime/${sample.slug}`)).json?.reviews?.find((r) => r.username === ub);
    if (rv) {
      const rep = await call('POST', '/api/user/reports', { cookie: loginA.cookie, body: { kind: 'review', ref: String(rv.id), reason: 'regression' } });
      check('a member can report a review', rep.status === 200, `status ${rep.status}`);
      check('reporting needs login', (await call('POST', '/api/user/reports', { body: { kind: 'review', ref: String(rv.id) } })).status === 401);
      const queue = await call('GET', '/api/admin/x/community/reports', { cookie: admin });
      const item = queue.json?.items?.find((r) => r.ref === String(rv.id));
      check('the owner sees the report with its text', Boolean(item?.subject?.text?.includes('regression script')));
      check('the report can be closed', item && (await call('POST', `/api/admin/x/community/reports/${item.id}`, { cookie: admin, body: { status: 'done' } })).status === 200);
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
  const noOrigin = await fetch(`${BASE}/api/admin/x/community/search-aliases`, { method: 'DELETE', headers: { 'content-type': 'application/json', cookie: admin }, body: '{"alias":"x"}' });
  check('admin extras reject a write without Origin (CSRF)', noOrigin.status === 403, `status ${noOrigin.status}`);
  check('site cannot be framed by other sites', (await fetch(`${BASE}/`)).headers.get('x-frame-options') === 'SAMEORIGIN');
  check('admin routes are locked without login', (await call('GET', '/api/admin/x/system/chat')).status === 401);
  for (const extra of globalThis.extraUsers || []) await call('DELETE', `/api/admin/users/${extra}`, { cookie: admin });
  if (me) check('remove the throw-away member', (await call('DELETE', `/api/admin/users/${name}`, { cookie: admin })).status === 200);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll regression checks passed');
process.exit(failed ? 1 : 0);
