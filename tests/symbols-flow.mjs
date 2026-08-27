// Number and symbol pad flow: the button in the wheel's top-left corner
// opens a pad that covers the wheel, the keypad and the symbol grid type
// at the caret, the bar keys edit, only one panel is open at a time, and
// closing gives the wheel back.
//
// Run:
//   python3 -m http.server 8080          (repo root, in another shell)
//   node tests/symbols-flow.mjs
//
// Playwright lives OUTSIDE the repo (~/pw) because this filesystem does
// not support the symlinks npm needs. Set PW_DIR to override.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const toggle = page.locator('#symbolToggle');
const emojiToggle = page.locator('#emojiToggle');
const pad = page.locator('#symbolPad');
const picker = page.locator('#emojiPicker');
const suggestions = page.locator('#suggestions');
const copyButton = page.locator('#copyText');
const output = page.locator('#output');

assert(await pad.count() === 0, 'the pad exists before its button is pressed');

// Parked geometry: the top-LEFT corner pocket of the wheel's bounding
// box, the mirror of the emoji button's top-right one. Its top edge
// meets that box, its left edge meets the box's left, and it stays
// clear of the disk.
const parked = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const box = c.getBoundingClientRect();
  const [cx, cy] = c.dataset.center.split(',').map(Number);
  // Same anchor math as resize() in main.js.
  const arm = box.height - 12 - cy;
  const b = document.getElementById('symbolToggle').getBoundingClientRect();
  const wheel = { x: box.left + cx, y: box.top + cy };
  const dx = wheel.x - Math.max(b.left, Math.min(wheel.x, b.right));
  const dy = wheel.y - Math.max(b.top, Math.min(wheel.y, b.bottom));
  return {
    topGap: b.top - (box.top + cy - arm),
    leftGap: b.left - (box.left + cx - arm),
    clearance: Math.hypot(dx, dy) - arm,
    // Both buttons park at the same height, being the two top corners
    // of the same box.
    sameRow: Math.abs(b.top - document.getElementById('emojiToggle').getBoundingClientRect().top),
  };
});
assert(Math.abs(parked.topGap) < 1.5, `button top is ${parked.topGap}px off the wheel box top`);
assert(Math.abs(parked.leftGap) < 1.5, `button left is ${parked.leftGap}px off the wheel box left`);
assert(parked.clearance > 0, `button overlaps the wheel disk by ${-parked.clearance}px`);
assert(parked.sameRow < 1.5, `the two corner buttons are ${parked.sameRow}px apart vertically`);

await toggle.click();
await pad.waitFor({ state: 'visible' });
assert(await suggestions.isHidden(), 'suggestion strip still visible under the pad');
assert(await copyButton.isHidden(), 'copy button still over the bar');
assert(await emojiToggle.isHidden(), 'the emoji button still floats over the pad');

// The pad must cover the wheel center the decoder is using.
const covered = await page.evaluate(() => {
  const p = document.getElementById('symbolPad').getBoundingClientRect();
  const c = document.getElementById('stage');
  const box = c.getBoundingClientRect();
  const [cx, cy] = c.dataset.center.split(',').map(Number);
  const x = box.left + cx;
  const y = box.top + cy;
  return x >= p.left && x <= p.right && y >= p.top && y <= p.bottom;
});
assert(covered, 'the pad does not cover the wheel center');

// Open, the button moves to the reserved slot at the end of the bar and
// covers none of its keys.
const inRow = await page.evaluate(() => {
  const b = document.getElementById('symbolToggle').getBoundingClientRect();
  const bar = document.querySelector('#symbolPad .pad-bar').getBoundingClientRect();
  const hit = [...document.querySelectorAll('#symbolPad .pad-bar .pad-key')].some((k) => {
    const r = k.getBoundingClientRect();
    return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
  });
  return { inside: b.top >= bar.top - 1 && b.bottom <= bar.bottom + 1, hit };
});
assert(inRow.inside, 'the open button is not aligned with the bar');
assert(!inRow.hit, 'the open button covers a bar key');

// The keypad is 1-9 then the two decimal separators around the zero.
const keypad = await page.locator('#symbolPad .pad-keys .pad-key')
  .evaluateAll((els) => els.map((e) => e.dataset.char));
assert(
  keypad.join('') === '123456789.0,',
  `unexpected keypad: ${JSON.stringify(keypad)}`,
);

// Digits type at the caret, and the decimal separators with them.
for (const ch of ['3', '.', '1', '4']) {
  await page.locator(`#symbolPad .pad-keys .pad-key[data-char="${ch}"]`).click();
}
assert(await pad.isVisible(), 'the pad closed after a key; it must stay open');
let text = await output.innerText();
assert(text === '3.14', `expected 3.14, got ${JSON.stringify(text)}`);

// The bar keys edit: space, then a symbol, then backspace takes it off.
await page.locator('#symbolPad .pad-key[data-action="space"]').click();
await page.locator('#symbolPad .pad-key[data-char="≈"]').click();
text = await output.innerText();
assert(text === '3.14 ≈', `expected the symbol appended, got ${JSON.stringify(text)}`);

await page.locator('#symbolPad .pad-key[data-action="backspace"]').click();
text = await output.innerText();
assert(text === '3.14 ', `backspace did not remove the symbol: ${JSON.stringify(text)}`);

// A multi-character key: Kč is two characters, and both must land.
await page.locator('#symbolPad .pad-key[data-char="Kč"]').click();
text = await output.innerText();
assert(text === '3.14 Kč', `expected the Kč key to type both letters, got ${JSON.stringify(text)}`);

await page.locator('#symbolPad .pad-key[data-action="enter"]').click();
text = await output.innerText();
assert(text === '3.14 Kč\n', `enter did not insert a newline: ${JSON.stringify(text)}`);

// Sticky headings scroll with their sections, as in the emoji picker.
assert(await page.locator('#symbolPad .pad-section').count() === 5, 'expected 5 symbol sections');
const sticky = await page.evaluate(() =>
  getComputedStyle(document.querySelector('#symbolPad .pad-heading')).position);
assert(sticky === 'sticky', `symbol headings are ${sticky}, not sticky`);

// One panel at a time: the emoji button is hidden while this pad is up,
// so the pad must be closed first, and opening the picker then closes
// nothing of its own.
await toggle.click();
await pad.waitFor({ state: 'hidden' });
assert(await emojiToggle.isVisible(), 'the emoji button did not come back');
await emojiToggle.click();
await picker.waitFor({ state: 'visible' });
assert(await pad.isHidden(), 'the symbol pad is still open under the emoji picker');
assert(await toggle.isHidden(), 'the symbol button still floats over the picker');
await emojiToggle.click();
await picker.waitFor({ state: 'hidden' });

assert(await suggestions.isVisible(), 'suggestion strip did not come back');
assert(await copyButton.isVisible(), 'copy button did not come back');

// A center tap types a space, which proves the canvas takes gestures
// again after the overlay is gone.
const tap = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const box = c.getBoundingClientRect();
  const [cx, cy] = c.dataset.center.split(',').map(Number);
  return { x: box.left + cx, y: box.top + cy };
});
await page.mouse.click(tap.x, tap.y);
text = await output.innerText();
assert(text === '3.14 Kč\n ', `the wheel is dead after closing the pad: ${JSON.stringify(text)}`);

if (errors.length) throw new Error('page errors: ' + errors.join('; '));

console.log('symbols-flow: PASS');
await browser.close();
