// End-to-end check of the transcribed original 8pen layout: gesture
// "et." and verify the text, and that punctuation ends the prediction
// word. Run like tests/hello-flow.mjs.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

// In the transcription: e=(S,CW,1) t=(S,CCW,1) .=(W,CW,1).
// Entry at each sector's middle; overshoot the last arm by 25.
const STROKES = [
  { from: 90, to: 160 },   // e: S clockwise across the 135 arm
  { from: 90, to: 20 },    // t: S counterclockwise across the 45 arm
  { from: 180, to: 250 },  // .: W clockwise across the 225 arm
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
await page.goto(URL);
await page.selectOption('#layoutMode', 'original-8pen');

const box = await page.locator('#stage').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const R = Math.min(box.width, box.height) * 0.3;
const pt = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)];

let failures = 0;
async function expectOutput(name, expected) {
  const text = await page.locator('#output').textContent();
  const ok = text === expected;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(text)} want ${JSON.stringify(expected)}`);
  if (!ok) failures++;
}

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
await page.mouse.up();

await expectOutput('gestures type et.', 'et.');
const chips = await page.locator('#suggestions button').count();
console.log(chips === 0 ? 'PASS' : 'FAIL', 'punctuation ends prediction word', chips === 0 ? '' : `${chips} chips`);
if (chips !== 0) failures++;

await page.screenshot({ path: process.env.SHOT ?? '/tmp/original8pen-flow.png' });
await browser.close();
process.exit(failures ? 1 : 0);
