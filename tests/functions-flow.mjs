// End-to-end check of dip-space, function taps (backspace E, enter S),
// the Typewise-style delete glide with undelete, the double-tap-center
// period, the N caret glide, the South punctuation drags, the
// suggestion-row overlay position, and the copy button. Run like
// tests/hello-flow.mjs.

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
await page.selectOption('#layoutMode', 'urza-layout');

const box = await page.locator('#stage').boundingBox();
// The wheel anchors bottom-right in the canvas; main.js exposes its
// center on the element so tests never duplicate the anchor math.
const [wx, wy] = (await page.locator('#stage').getAttribute('data-center')).split(',').map(Number);
const cx = box.x + wx;
const cy = box.y + wy;
const R = Math.min(box.width, box.height) * 0.3;
const pt = (deg, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

// Letter strokes in the urza layout: h = (E, CW, 2),
// e = (W, CW, 1). Enter mid-sector, overshoot the last arm by 25 deg.
async function stroke(from, to) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const step = from < to ? 8 : -8;
  await page.mouse.move(...pt(from), { steps: 3 });
  for (let a = from; step > 0 ? a <= to : a >= to; a += step) await page.mouse.move(...pt(a));
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.up();
}
const strokeH = () => stroke(0, 160);
const strokeE = () => stroke(180, 250);

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

// South punctuation drags: press out in S, slide to the target, lift.
// Only press and lift points matter, so a straight line is enough.
async function southDrag(tx, ty) {
  const [x, y] = pt(90, Math.min(box.width, box.height) * 0.35);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps: 8 });
  await page.mouse.up();
}

await page.click('#clearText');
await strokeH();
await southDrag(...pt(0)); // S to E
await expectOutput('S to E drag types ?', 'h?');
await southDrag(...pt(270)); // S to N
await expectOutput('S to N drag types !', 'h?!');
await southDrag(...pt(180)); // S to W
await expectOutput('S to W drag types ,', 'h?!,');
await southDrag(cx, cy); // lift in the center circle: generous N
await expectOutput('S drag into the center types !', 'h?!,!');

// The suggestion row overlays the canvas with its bottom edge 4 px
// above the wheel rim, unless the short-canvas clamp holds it at the
// canvas top (resize() in main.js). With the settings block open this
// viewport hits the clamped case, so compute the expected gap with
// the same formula instead of assuming the 4 px.
const arm = Math.min(box.width, box.height) * 0.44;
const expectedGap = Math.min(2 * arm + 12 + 4, box.height - 44) - (2 * arm + 12);
const sbox = await page.locator('#suggestions').boundingBox();
const rowGap = (cy - arm) - (sbox.y + sbox.height);
const rowOk = Math.abs(rowGap - expectedGap) < 1.5;
console.log(rowOk ? 'PASS' : 'FAIL', 'suggestion row hugs the wheel', rowOk ? '' : `gap ${rowGap} want ${expectedGap}`);
if (!rowOk) failures++;

// Copy button. The clipboard write is async, so poll the clipboard
// instead of racing the click handler.
async function expectClipboard(name, expected) {
  let ok = true;
  try {
    await page.waitForFunction(
      async (want) => (await navigator.clipboard.readText()) === want,
      expected,
      { timeout: 3000 },
    );
  } catch {
    ok = false;
  }
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `clipboard never became ${JSON.stringify(expected)}`);
  if (!ok) failures++;
}

await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
await page.click('#copyText');
await expectClipboard('copy button copies the whole text', 'h?!,!');
const flashed = await page.locator('#copyText.copied').count();
console.log(flashed ? 'PASS' : 'FAIL', 'copy button flashes the copied state');
if (!flashed) failures++;

// A selection wins over the whole text. Built programmatically: the
// first text node of #output holds the text before the caret.
await page.evaluate(() => {
  const node = document.querySelector('#output').firstChild;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 1);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});
await page.click('#copyText');
await expectClipboard('selection copy copies only the selection', 'h');

await page.screenshot({ path: process.env.SHOT ?? '/tmp/functions-flow.png' });
await browser.close();
process.exit(failures ? 1 : 0);
