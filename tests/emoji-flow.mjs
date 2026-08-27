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

// Geometry of the parked button: it sits in the wheel's top-right
// corner pocket, mirroring the copy button in the bottom-right one.
// Its top and right edges meet the disk's bounding box (the box, not
// the canvas: the wheel is centered under a mouse and hugs the right
// edge only on a touch screen), and it stays clear of the disk itself.
const parked = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const box = c.getBoundingClientRect();
  const [cx, cy] = c.dataset.center.split(',').map(Number);
  // Same anchor math as resize() in main.js: the disk is tangent to
  // the canvas bottom at a 12 px margin.
  const arm = box.height - 12 - cy;
  const b = document.getElementById('emojiToggle').getBoundingClientRect();
  const wheel = { x: box.left + cx, y: box.top + cy };
  // Nearest point of the button box to the wheel center.
  const dx = wheel.x - Math.max(b.left, Math.min(wheel.x, b.right));
  const dy = wheel.y - Math.max(b.top, Math.min(wheel.y, b.bottom));
  return {
    arm,
    topGap: b.top - (box.top + cy - arm),
    rightGap: (box.left + cx + arm) - b.right,
    clearance: Math.hypot(dx, dy) - arm,
  };
});
assert(Math.abs(parked.topGap) < 1.5, `button top is ${parked.topGap}px off the wheel box top`);
assert(Math.abs(parked.rightGap) < 1.5, `button right is ${parked.rightGap}px off the wheel box right`);
assert(parked.clearance > 0, `button overlaps the wheel disk by ${-parked.clearance}px`);

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

// Open, the button drops to the end of the category tab row. It must
// not cover a tab: the tab row reserves its slot.
const inRow = await page.evaluate(() => {
  const b = document.getElementById('emojiToggle').getBoundingClientRect();
  const row = document.querySelector('.pad-bar').getBoundingClientRect();
  const hit = [...document.querySelectorAll('.emoji-tab')].some((t) => {
    const r = t.getBoundingClientRect();
    return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
  });
  return { inside: b.top >= row.top - 1 && b.bottom <= row.bottom + 1, hit };
});
assert(inRow.inside, 'the open button is not aligned with the tab row');
assert(!inRow.hit, 'the open button covers a category tab');

// Ten categories plus the recently-used one: one tab and one section
// each, all present at once because the grid is a single scroll.
assert(await page.locator('.emoji-tab').count() === 11, 'expected 11 tabs');
assert(await page.locator('.pad-section').count() === 11, 'expected 11 sections');
assert(await page.locator('.pad-cell').count() === 925, 'expected 925 emoji cells');

// First run: the recent section is empty, so the picker opens at
// smileys instead of on an empty band.
assert(
  await page.locator('.emoji-tab.active').getAttribute('data-category') === 'smileys',
  'a first open should land on smileys, not on an empty recent section',
);

// Scrolling alone moves the active tab: no tab was pressed here.
const animalsTop = await page.evaluate(() => {
  const grid = document.querySelector('.pad-scroll');
  const first = document.querySelector('.pad-section');
  const animals = document.querySelector('.pad-section[data-category="animals"]');
  grid.scrollTop = animals.offsetTop - first.offsetTop;
  return grid.scrollTop;
});
assert(animalsTop > 0, 'the animals section is not below the top of the scroll');
await page.waitForFunction(
  () => document.querySelector('.emoji-tab.active')?.dataset.category === 'animals',
  null,
  { timeout: 2000 },
);

// A tab jumps the scroll to its section.
await page.locator('.emoji-tab[data-category="food"]').click();
const jumped = await page.evaluate(() => {
  const grid = document.querySelector('.pad-scroll');
  const first = document.querySelector('.pad-section');
  const food = document.querySelector('.pad-section[data-category="food"]');
  return Math.abs(grid.scrollTop - (food.offsetTop - first.offsetTop)) < 4;
});
assert(jumped, 'the food tab did not scroll to the food section');
assert(
  await page.locator('.emoji-tab.active').getAttribute('data-category') === 'food',
  'the food tab is not active after its own press',
);

// Picks land in the text and leave the picker open.
await page.locator('.pad-cell[data-emoji="🐶"]').click();
assert(await picker.isVisible(), 'the picker closed after a pick; it must stay open');
let text = await page.locator('#output').innerText();
assert(text === '🐶', `expected the emoji in the output, got ${JSON.stringify(text)}`);

// The recent section must NOT rebuild on a pick: that would move every
// category down the scroll under a finger picking a second emoji.
const recentNow = await page.locator('.pad-section[data-category="recent"] .pad-cell').count();
assert(recentNow === 0, `the recent section rebuilt mid-session (${recentNow} cells)`);

await page.locator('.pad-cell[data-emoji="🐱"]').click();
text = await page.locator('#output').innerText();
assert(text === '🐶🐱', `expected two emoji, got ${JSON.stringify(text)}`);

// Close: the wheel comes back and typing still works.
await toggle.click();
await picker.waitFor({ state: 'hidden' });
assert(await toggle.getAttribute('aria-expanded') === 'false', 'button still marked expanded');
assert(await suggestions.isVisible(), 'suggestion strip did not come back');
assert(await copyButton.isVisible(), 'copy button did not come back');

// Reopening is when the recent section rebuilds: both picks, newest
// first, exactly once each, and the scroll lands on them.
await toggle.click();
await picker.waitFor({ state: 'visible' });
const recent = await page.locator('.pad-section[data-category="recent"] .pad-cell')
  .evaluateAll((els) => els.map((e) => e.dataset.emoji));
assert(recent.join('') === '🐱🐶', `unexpected recent section: ${JSON.stringify(recent)}`);
assert(
  await page.locator('.emoji-tab.active').getAttribute('data-category') === 'recent',
  'a reopen with picks behind it should land on the recent section',
);
await toggle.click();
await picker.waitFor({ state: 'hidden' });

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
const kept = await page.locator('.pad-section[data-category="recent"] .pad-cell')
  .evaluateAll((els) => els.map((e) => e.dataset.emoji));
assert(kept.join('') === '🐱🐶', `recent list lost on reload: ${JSON.stringify(kept)}`);

if (errors.length) throw new Error('page errors: ' + errors.join('; '));

console.log('emoji-flow: PASS');
await browser.close();
