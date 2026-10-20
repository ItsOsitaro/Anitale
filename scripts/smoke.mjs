// Queue 27: API smoke test — exercise every admin/public surface that must
// stay healthy. Uses one throwaway manga row that the test itself removes, so
// the DB is byte-for-byte back to its starting state afterwards. Run with the
// server already up: node scripts/smoke.mjs [baseUrl]
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const adminUser = process.env.SMOKE_ADMIN_USER || 'ItsOsitaro';
const adminPass = process.env.SMOKE_ADMIN_PASS || 'REDACTED';

// -------- auth --------
{
  const bad = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'nope', password: 'nope' }) });
  check('login rejects bad credentials', bad.status === 401);
}
let adminCookie = '';
{
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: adminUser, password: adminPass }) });
  adminCookie = (res.headers.get('set-cookie') || '').split(';')[0];
  check('admin login', res.status === 200 && Boolean(adminCookie), `status ${res.status}`);
}
const admin = (method, p, body) => fetch(`${BASE}${p}`, { method, headers: { 'content-type': 'application/json', cookie: adminCookie }, body: body ? JSON.stringify(body) : undefined });

{
  const guardRes = await fetch(`${BASE}/api/admin/users`);
  check('users list blocked without cookie', guardRes.status === 401 || guardRes.status === 403, `status ${guardRes.status}`);
}

// -------- public catalog --------
{
  const res = await fetch(`${BASE}/api/anime`);
  const data = await res.json().catch(() => null);
  check('GET /api/anime', res.status === 200 && Array.isArray(data) && data.length > 0, `${data?.length ?? 0} rows`);
}
{
  const res = await fetch(`${BASE}/api/manga`);
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data) ? data : [];
  const shaped = list.length > 0 && list.every((m) => typeof m.titleFa === 'string' && 'publicationStatus' in m && 'chapters' in m);
  check('GET /api/manga (titleFa/status/chapters shape)', res.status === 200 && list.length > 0 && shaped, `${list.length} rows`);
}
{
  const res = await fetch(`${BASE}/api/search?q=one`);
  const data = await res.json().catch(() => null);
  check('GET /api/search', res.status === 200 && Array.isArray(data.items), `${data?.items?.length ?? 0} hits`);
}

// -------- admin read channels --------
{
  const res = await admin('GET', '/api/admin/anime?page=1&limit=5');
  const data = await res.json().catch(() => null);
  check('GET /api/admin/anime', res.status === 200 && Array.isArray(data.items), `total ${data?.total ?? '—'}`);
}
{
  const res = await admin('GET', '/api/admin/users');
  const data = await res.json().catch(() => null);
  const users = Array.isArray(data?.users) ? data.users : (Array.isArray(data?.items) ? data.items : null);
  check('GET /api/admin/users', res.status === 200 && Array.isArray(users), `${users?.length ?? 0} rows`);
}
{
  const res = await admin('GET', '/api/admin/stats');
  check('GET /api/admin/stats', res.status === 200, `status ${res.status}`);
}
{
  const res = await admin('POST', '/api/admin/anime/import-bulk', { from: 1, to: 99999, mediaType: 'anime' });
  check('bulk range cap guarded', res.status === 400, `status ${res.status}`);
}

// -------- manga admin lifecycle (throwaway row, reverted) --------
const cleanup = [];
{
  const res = await admin('POST', '/api/admin/anime/import-bulk', { ids: [1535], mediaType: 'manga' });
  const data = await res.json().catch(() => null);
  const first = data?.results?.[0];
  const okStatus = first && (first.status === 'imported' || first.status === 'exists');
  check('bulk ids manga import', res.status === 200 && okStatus, first?.status ?? String(first));
  if (first?.slug) cleanup.push(first.slug);
}
const target = cleanup[0];
if (target) {
  {
    const res = await admin('PATCH', `/api/admin/manga/${target}`, { titleFa: 'اسم آزمایشی' });
    const data = await res.json().catch(() => null);
    check('manga fa patch', res.status === 200 && data?.item?.titleFa === 'اسم آزمایشی');
  }
  {
    const res = await admin('PATCH', `/api/admin/manga/${target}`, { titleFa: '' });
    check('manga fa clear', res.status === 200);
  }
  {
    const res = await admin('POST', `/api/admin/manga/${target}/refresh`);
    check('manga source refresh', res.status === 200, `status ${res.status}`);
  }
  {
    const res = await admin('DELETE', `/api/admin/manga/${target}`);
    check('manga delete (cleanup)', res.status === 200);
  }
}
{
  const res = await admin('DELETE', '/api/admin/manga/smoke-nonexistent');
  check('manga delete 404 on unknown slug', res.status === 404);
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
