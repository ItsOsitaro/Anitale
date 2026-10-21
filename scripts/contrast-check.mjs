// temp: WCAG contrast check for the admin token families (light + dark).
// Parses oklch values straight out of src/admin/admin.css so edits stay honest.
import fs from 'node:fs';

const css = fs.readFileSync('src/admin/admin.css', 'utf8');

// --- oklch -> sRGB linear luminance -> contrast ---
function tokenMap(block) {
  const map = {};
  for (const m of block.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    map[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return map;
}
const lum = ([L, C, H]) => {
  const h = (H * Math.PI) / 180, a = Math.cos(h) * C, b = Math.sin(h) * C;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const v = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return 0.2126 * r + 0.7152 * g + 0.0722 * v;
};
const contrast = (x, y) => {
  const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
};

const lightBlock = css.match(/\.admin-root \{([\s\S]*?)\n\}/)[1];
const darkBlock = css.match(/body\[data-theme="dark"\] \.admin-root \{([\s\S]*?)\n\}/)[1];
const L = tokenMap(lightBlock);
const D = tokenMap(darkBlock);

const PAIRS = [
  ['text on card', 'ink', 'panel', 4.5], ['fine print on card', 'ink-2', 'panel', 4.5],
  ['text on inset', 'ink', 'panel-2', 4.5], ['placeholder/muted on inset', 'ink-2', 'panel-2', 4.5],
  ['input border vs inset', 'ink-3', 'panel-2', 3], ['input border vs card', 'ink-3', 'panel', 3],
  ['primary label', 'on-accent', 'accent', 4.5], ['accent text on soft', 'accent-text', 'accent-soft', 4.5],
  ['danger text on card', 'danger', 'panel', 4.5], ['ok text on card', 'ok', 'panel', 4.5],
  ['warn text on card', 'warn', 'panel', 4.5], ['accent text on card', 'accent-text', 'panel', 4.5],
  ['sidebar text', 'side-ink', 'side', 4.5], ['sidebar muted', 'side-ink-2', 'side', 4.5],
  ['focus ring vs page', 'focus', 'surface', 3],
];

const verdict = [];
for (const [themeL, themeName] of [[L, 'light'], [D, 'dark']]) {
  for (const [label, t1, t2, min] of PAIRS) {
    const ratio = contrast(themeL[t1], themeL[t2]);
    const pass = ratio >= min;
    verdict.push({ themeName, label, ratio: ratio.toFixed(2), min, pass });
  }
}
for (const { themeName, label, ratio, min, pass } of verdict) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${themeName.padEnd(5)} ${label.padEnd(30)} ${ratio} (need ${min})`);
}
if (verdict.some((entry) => !entry.pass)) process.exitCode = 1;
