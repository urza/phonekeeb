// End-to-end check in a real browser: type "hello" as one continuous
// stroke, then a center tap for space, and assert the output text.
//
// Run:
//   python3 -m http.server 8080          (repo root, in another shell)
//   node tests/hello-flow.mjs
//
// Playwright lives OUTSIDE the repo (~/pw) because this filesystem does
// not support the symlinks npm needs. Set PW_DIR to override.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

// (entry angle, target angle) per letter, screen degrees, y axis down.
// X geometry: arms on the diagonals, sectors N(270) E(0) S(90) W(180).
// Frequency EN layout: h=(W,CCW,1) e=(N,CW,1) l=(E,CW,2) o=(E,CCW,1).
// Entry is mid-sector; target overshoots the last arm by 25 deg.
const STROKES = [
  { letter: 'h', from: 180, to: 110 },
  { letter: 'e', from: 270, to: 340 },
  { letter: 'l', from: 0, to: 160 },
  { letter: 'l', from: 0, to: 160 },
  { letter: 'o', from: 360, to: 290 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
await page.goto(URL);
await page.click('#settingsToggle'); // controls sit in the collapsed settings block
await page.selectOption('#layoutMode', 'frequency');

const box = await page.locator('#stage').boundingBox();
// The wheel anchors bottom-right in the canvas; main.js exposes its
// center on the element so tests never duplicate the anchor math.
const [wx, wy] = (await page.locator('#stage').getAttribute('data-center')).split(',').map(Number);
const cx = box.x + wx;
const cy = box.y + wy;
const R = Math.min(box.width, box.height) * 0.3;
const pt = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)];

await page.mouse.move(cx, cy);
await page.mouse.down();
for (const { from, to } of STROKES) {
  const step = from < to ? 8 : -8;
  await page.mouse.move(...pt(from), { steps: 3 });
  for (let a = from; step > 0 ? a <= to : a >= to; a += step) {
    await page.mouse.move(...pt(a));
  }
  await page.mouse.move(cx, cy, { steps: 4 });
}

// Space without lifting: dip out of the center and back, crossing no
// arm, exactly as the original 8pen did it. The whole of "hello " is
// one continuous stroke. Straight down = mid of the S sector.
await page.mouse.move(cx, cy + 80, { steps: 4 });
await page.mouse.move(cx, cy, { steps: 4 });
await page.mouse.up();

const text = await page.locator('#output').textContent();
const pass = text === 'hello ';
console.log(pass ? 'PASS' : 'FAIL', JSON.stringify(text));

await page.screenshot({ path: process.env.SHOT ?? '/tmp/hello-flow.png' });
await browser.close();
process.exit(pass ? 0 : 1);
