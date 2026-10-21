// WCAG contrast check for the public user surfaces (dashboard + profile).
// Reads tokens straight from src/tailwind.css so token edits stay honest.
// Hardcoded extra pairs cover the colors this stylesheet bakes in.
import fs from 'node:fs';

const css = fs.readFileSync('src/tailwind.css', 'utf8');

const grab = (block) => {
  const map = {};
  for (const m of block.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    map[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return map;
};
const rootStart = css.indexOf(':root {');
const darkStart = css.indexOf('body[data-theme="dark"] {');
const L = grab(css.slice(rootStart, css.indexOf('}', rootStart)));
const D = grab(css.slice(darkStart, css.indexOf('}', darkStart)));

const lum = ([x, C, H]) => {
  const h = (H * Math.PI) / 180, a = Math.cos(h) * C, b = Math.sin(h) * C;
  const l = (x + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (x - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (x - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return 0.2126 * (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    + 0.7152 * (-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    + 0.0722 * (-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
};
const contrast = (a, b) => {
  const [p, q] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (p + 0.05) / (q + 0.05);
};

// Pairs with values baked into the user-pages stylesheet (style.css, user section).
const PAIRS = [
  ['text on card', (t) => t.foreground, (t) => t.card, 4.5],
  ['muted text on card', (t) => t['muted-foreground'], (t) => t.card, 4.5],
  ['solid primary label', (t) => t['primary-foreground'], (t) => t.primary, 4.5],
  ['primary link on card', (t) => t.primary, (t) => t.card, 4.5],
  ['outline button label', (t) => t.foreground, (t) => t.card, 4.5],
  // user-surface fields pin their own boundary colors (style.css): >=3:1 vs field
  ['field border (light pinned)', () => [0.62, 0.03, 345], () => [1, 0, 0], 3],
  ['field border (dark pinned)', () => [0.58, 0.045, 335], () => [0.3, 0.042, 335], 3],
];
// status pills: exact oklch color-mix arithmetic (bg = hue 10%/14% over --muted,
// fg = 84%/80% hue over --foreground) for all five statuses, both themes.
const mix = (a, fa, b, fb) => ([
  fa * a[0] + fb * b[0],
  fa * a[1] + fb * b[1],
  fa * a[2] + fb * b[2],
]);
const STATUS = { watching: 12, completed: 152, on_hold: 75, dropped: 270, planned: 300 };
const STATUS_EXTRA = [];
for (const [status, h] of Object.entries(STATUS)) {
  STATUS_EXTRA.push(['light', `pill ${status}`, [0.45, 0.16, h], mix([0.58, 0.12, h], 0.1, L.muted, 0.9), 4.5]);
  STATUS_EXTRA.push(['dark', `pill ${status}`, [0.8, 0.11, h], mix([0.62, 0.12, h], 0.14, D.muted, 0.86), 4.5]);
}
// stamp numbers: bloom fg on the 9% bloom tint over card; progress text:
// muted-foreground on the entry-copy inset (muted 46% over card).
const stampBg = (t) => mix([0.55, 0.14, 12], 0.09, t.card, 0.91);
const insetBg = (t) => mix(t.muted, 0.46, t.card, 0.54);
const EXTRA = [
  ['light', 'stamp number on tint', [0.5, 0.17, 12], stampBg(L), 4.5],
  ['light', 'progress text on inset', L['muted-foreground'], insetBg(L), 4.5],
  ['dark', 'stamp number on tint', [0.78, 0.14, 12], stampBg(D), 4.5],
  ['dark', 'progress text on inset', D['muted-foreground'], insetBg(D), 4.5],
];

let failures = 0;
const report = (theme, label, c1, c2, min) => {
  const ratio = contrast(c1, c2);
  const pass = ratio >= min;
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${theme.padEnd(5)} ${label.padEnd(28)} ${ratio.toFixed(2)} (need ${min})`);
};
for (const [theme, tokens] of [['light', L], ['dark', D]]) {
  for (const [label, a, b, min] of PAIRS) report(theme, label, a(tokens), b(tokens), min);
  for (const [t, label, c1, c2, min] of STATUS_EXTRA) if (t === theme) report(theme, label, c1, c2, min);
  for (const [t, label, c1, c2, min] of EXTRA) if (t === theme) report(theme, label, c1, c2, min);
}
if (failures) { console.log(`\n${failures} failing pair(s)`); process.exitCode = 1; }
else console.log('\nall pairs pass');
