import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
const svg = fs.readFileSync('public/logo.svg', 'utf8');
const render = (w) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, background: 'rgba(0,0,0,0)' }).render().asPng();
for (const [file, size] of [['public/favicon-32.png', 32], ['public/logo-192.png', 192], ['public/logo-512.png', 512], ['public/apple-touch-icon.png', 180]]) {
  fs.writeFileSync(file, render(size));
  console.log(file, size);
}
