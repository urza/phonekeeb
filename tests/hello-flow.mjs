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
// Frequency EN layout: h=(SE,CCW,1) e=(NW,CW,1) l=(NE,CW,2) o=(NE,CCW,1).
// Entry is mid-quadrant; target overshoots the last boundary by 25 deg.
const STROKES = [
  { letter: 'h', from: 45, to: -25 },
  { letter: 'e', from: 225, to: 295 },
  { letter: 'l', from: 315, to: 475 },
  { letter: 'l', from: 315, to: 475 },
  { letter: 'o', from: 315, to: 245 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
await page.goto(URL);
await page.selectOption('#layoutMode', 'frequency');

const box = await page.locator('#stage').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
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
// line, exactly as the original 8pen did it. The whole of "hello " is
// one continuous stroke.
const dip = 80;
await page.mouse.move(cx + dip * Math.cos(Math.PI / 4), cy + dip * Math.sin(Math.PI / 4), { steps: 4 });
await page.mouse.move(cx, cy, { steps: 4 });
await page.mouse.up();

const text = await page.locator('#output').textContent();
const pass = text === 'hello ';
console.log(pass ? 'PASS' : 'FAIL', JSON.stringify(text));

await page.screenshot({ path: process.env.SHOT ?? '/tmp/hello-flow.png' });
await browser.close();
process.exit(pass ? 0 : 1);
