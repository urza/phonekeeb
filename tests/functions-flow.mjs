// End-to-end check of dip-space and function taps: backspace (NE),
// shift (NW), enter (SE). Run like tests/hello-flow.mjs.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
await page.goto(URL);
await page.selectOption('#layoutMode', 'frequency');

const box = await page.locator('#stage').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const R = Math.min(box.width, box.height) * 0.3;
const pt = (deg, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

// h = (SE, CCW, 1) in the frequency EN layout.
async function strokeH() {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(...pt(45), { steps: 3 });
  for (let a = 45; a >= -25; a -= 8) await page.mouse.move(...pt(a));
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.up();
}

async function dipSpace() {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(...pt(45, 80), { steps: 4 });
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.up();
}

// A stationary press-and-release out in a quadrant.
async function tapQuadrant(midDeg) {
  const [x, y] = pt(midDeg, Math.min(box.width, box.height) * 0.35);
  await page.mouse.click(x, y);
}

let failures = 0;
async function expectOutput(name, expected) {
  const text = await page.locator('#output').textContent();
  const ok = text === expected;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(text)} want ${JSON.stringify(expected)}`);
  if (!ok) failures++;
}

await strokeH();
await expectOutput('letter h', 'h');
await dipSpace();
await expectOutput('dip space', 'h ');
await tapQuadrant(315); // NE = backspace
await expectOutput('backspace removes space', 'h');
await tapQuadrant(225); // NW = shift
await strokeH();
await expectOutput('shifted letter', 'hH');
await tapQuadrant(45); // SE = enter
await expectOutput('enter newline', 'hH\n');

await page.screenshot({ path: process.env.SHOT ?? '/tmp/functions-flow.png' });
await browser.close();
process.exit(failures ? 1 : 0);
