// End-to-end check of dip-space, function taps (backspace E, enter S),
// the Typewise-style delete glide with undelete, the double-tap-center
// period, and the N caret glide. Run like tests/hello-flow.mjs.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
await page.goto(URL);
await page.click('#settingsToggle'); // controls sit in the collapsed settings block
await page.selectOption('#layoutMode', 'frequency');

const box = await page.locator('#stage').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const R = Math.min(box.width, box.height) * 0.3;
const pt = (deg, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

// Letter strokes in the frequency EN layout: h = (W, CCW, 1),
// e = (N, CW, 1). Enter mid-sector, overshoot the last arm by 25 deg.
async function stroke(from, to) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const step = from < to ? 8 : -8;
  await page.mouse.move(...pt(from), { steps: 3 });
  for (let a = from; step > 0 ? a <= to : a >= to; a += step) await page.mouse.move(...pt(a));
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.up();
}
const strokeH = () => stroke(180, 110);
const strokeE = () => stroke(270, 340);

async function dipSpace() {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(...pt(90, 80), { steps: 4 });
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.up();
}

// A stationary press-and-release out in a sector.
async function tapSector(midDeg) {
  const [x, y] = pt(midDeg, Math.min(box.width, box.height) * 0.35);
  await page.mouse.click(x, y);
}

// A hold-glide: press out in a sector, drag through the given x
// offsets (14 px per step in main.js), then lift.
async function glide(midDeg, ...dxs) {
  const [x, y] = pt(midDeg, Math.min(box.width, box.height) * 0.35);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const dx of dxs) await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
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
await tapSector(0); // E = backspace
await expectOutput('backspace removes space', 'h');
await tapSector(90); // S = enter
await expectOutput('enter newline', 'h\n');

// Typewise delete: drag left two steps (delete "h\n"), back to one
// step (restore "h"), lift. Only the net one-character delete stands.
await glide(0, -40, -20);
await expectOutput('delete glide with undelete', 'h');

// Double tap on the center: the second tap turns "h " into "h. ".
await page.mouse.click(cx, cy);
await page.mouse.click(cx, cy);
await expectOutput('double tap types period', 'h. ');

await strokeE();
await expectOutput('letter e after period', 'h. e');

// Caret glide: N press, drag left two steps. The caret walks back two
// characters (to just after "h."), so the next letter lands mid-text.
await glide(270, -30);
await strokeH();
await expectOutput('caret glide inserts mid-text', 'h.h e');

await page.screenshot({ path: process.env.SHOT ?? '/tmp/functions-flow.png' });
await browser.close();
process.exit(failures ? 1 : 0);
