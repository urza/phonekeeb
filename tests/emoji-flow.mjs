// Emoji picker flow: the button opens a picker that covers the wheel,
// tabs switch category, a tap types the emoji at the caret, the picked
// emoji reaches the recently-used tab, and closing gives the wheel back.
//
// Run:
//   python3 -m http.server 8080          (repo root, in another shell)
//   node tests/emoji-flow.mjs
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

const toggle = page.locator('#emojiToggle');
const picker = page.locator('#emojiPicker');
const suggestions = page.locator('#suggestions');
const copyButton = page.locator('#copyText');

// Closed at load, and the module is not fetched until it is needed.
assert(await picker.count() === 0, 'picker exists before the button is pressed');

await toggle.click();
await picker.waitFor({ state: 'visible' });
assert(await toggle.getAttribute('aria-expanded') === 'true', 'button not marked expanded');
assert(await suggestions.isHidden(), 'suggestion strip still visible under the picker');
assert(await copyButton.isHidden(), 'copy button still over the category tabs');

// The picker must cover the wheel: its box has to contain the wheel
// center the decoder is using.
const covered = await page.evaluate(() => {
  const p = document.getElementById('emojiPicker').getBoundingClientRect();
  const c = document.getElementById('stage');
  const box = c.getBoundingClientRect();
  const [cx, cy] = c.dataset.center.split(',').map(Number);
  const wx = box.left + cx;
  const wy = box.top + cy;
  return wx >= p.left && wx <= p.right && wy >= p.top && wy <= p.bottom;
});
assert(covered, 'the picker does not cover the wheel center');

// Ten categories plus the recently-used tab.
assert(await page.locator('.emoji-tab').count() === 11, 'expected 11 tabs');

// First run: the recent page is empty, so the picker opens on smileys.
assert(
  await page.locator('.emoji-tab.active').getAttribute('data-category') === 'smileys',
  'a first open should land on smileys, not on an empty recent page',
);

// Pick from a second category, to prove the tabs switch the grid.
await page.locator('.emoji-tab[data-category="animals"]').click();
const dog = page.locator('.emoji-page:not([hidden]) .emoji-cell[data-emoji="🐶"]');
await dog.click();

assert(await picker.isVisible(), 'the picker closed after a pick; it must stay open');
let text = await page.locator('#output').innerText();
assert(text === '🐶', `expected the emoji in the output, got ${JSON.stringify(text)}`);

// A second pick appends, and the visible grid must not have reshuffled
// under the finger: the cat is still where the animals page put it.
await page.locator('.emoji-page:not([hidden]) .emoji-cell[data-emoji="🐱"]').click();
text = await page.locator('#output').innerText();
assert(text === '🐶🐱', `expected two emoji, got ${JSON.stringify(text)}`);

// Both picks reach the recent page, newest first, exactly once each.
await page.locator('.emoji-tab[data-category="recent"]').click();
const recent = await page.locator('.emoji-page:not([hidden]) .emoji-cell')
  .evaluateAll((els) => els.map((e) => e.dataset.emoji));
assert(
  recent[0] === '🐱' && recent[1] === '🐶' && recent.length === 2,
  `unexpected recent page: ${JSON.stringify(recent)}`,
);

// Exactly one page is visible. A stale page left in the DOM would show
// a second grid under the current one.
assert(
  await page.locator('.emoji-page:not([hidden])').count() === 1,
  'more than one emoji page is visible',
);

// Close: the wheel comes back and typing still works.
await toggle.click();
await picker.waitFor({ state: 'hidden' });
assert(await toggle.getAttribute('aria-expanded') === 'false', 'button still marked expanded');
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
text = await page.locator('#output').innerText();
assert(text === '🐶🐱 ', `the wheel is dead after closing the picker: ${JSON.stringify(text)}`);

// The recent list survives a reload.
await page.reload();
await page.locator('#emojiToggle').click();
await page.locator('#emojiPicker').waitFor({ state: 'visible' });
assert(
  await page.locator('.emoji-tab.active').getAttribute('data-category') === 'recent',
  'a later open should land on the recent page',
);
const kept = await page.locator('.emoji-page:not([hidden]) .emoji-cell')
  .evaluateAll((els) => els.map((e) => e.dataset.emoji));
assert(kept.join('') === '🐱🐶', `recent list lost on reload: ${JSON.stringify(kept)}`);

if (errors.length) throw new Error('page errors: ' + errors.join('; '));

console.log('emoji-flow: PASS');
await browser.close();
