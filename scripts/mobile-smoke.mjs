// Mobile smoke test (390x844). Opens the main public pages in a real browser and fails on:
// console/page errors, failed API/cover requests, horizontal overflow, or covers that never load.
//
// Usage (run on a machine with Playwright, e.g. your PC — not needed on the server):
//   npm i -D playwright && npx playwright install chromium
//   node scripts/mobile-smoke.mjs https://your-domain
// Optional: SMOKE_SHOTS=./shots saves a screenshot per page.
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const shots = process.env.SMOKE_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });

const list = await (await fetch(`${base}/api/anime`)).json().catch(() => []);
const mangaList = await (await fetch(`${base}/api/manga`)).json().catch(() => []);
const slug = (Array.isArray(list) ? list : list.items || [])[0]?.slug;
const mslug = (Array.isArray(mangaList) ? mangaList : mangaList.items || [])[0]?.slug;
const pages = ['/', '/anime', '/manga', '/top/anime', '/top/manga', '/seasonal', '/login'];
if (slug) pages.push(`/anime/${slug}`);
if (mslug) pages.push(`/manga/${mslug}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let failures = 0;
const fail = (page, msg) => { failures += 1; console.log(`  FAIL ${page}: ${msg}`); };

for (const route of pages) {
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) problems.push(`console: ${m.text().slice(0, 140)}`); });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if ((u.pathname.startsWith('/api/') || u.pathname.startsWith('/covers/')) && r.status() >= 400 && u.pathname !== '/api/me') problems.push(`${r.status()} ${u.pathname}`);
  });
  const res = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => { problems.push(`goto: ${e.message}`); return null; });
  if (res && res.status() >= 400) problems.push(`page status ${res.status()}`);
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const imgs = [...document.images].filter((i) => i.currentSrc.includes('/covers/'));
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      covers: imgs.length,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      text: document.body.innerText.trim().length,
    };
  });
  if (m.overflow > 1) problems.push(`horizontal overflow ${m.overflow}px`);
  if (m.broken) problems.push(`${m.broken} cover image(s) failed to load`);
  if (m.text < 20) problems.push('page looks empty');
  console.log(`${problems.length ? 'x' : 'ok'} ${route}  (covers: ${m.covers})`);
  problems.forEach((p) => fail(route, p));
  if (shots) await page.screenshot({ path: `${shots}/${route.replace(/\W+/g, '_') || 'home'}.png` });
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} problem(s)` : '\nAll pages OK');
process.exit(failures ? 1 : 0);
