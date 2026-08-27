// End-to-end check of the practice game (game.html): answer one prompt
// correctly, answer the next one wrong, and assert that the drill
// grades, reveals, schedules, and persists.
//
// Run:
//   python3 -m http.server 8080          (repo root, in another shell)
//   node tests/game-flow.mjs
//
// Playwright lives OUTSIDE the repo (~/pw) because this filesystem does
// not support the symlinks npm needs. Set PW_DIR to override.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail ?? '');
  if (!ok) failures++;
};

// The bug this guards: an answer that renders correctly in the DOM but
// below the fold looks exactly like a button that does nothing. Asking
// only "is the element there" missed it once already, so every answer
// path asserts the answer is actually on screen without scrolling.
async function checkVisible(name) {
  const m = await page.evaluate(() => {
    const r = document.getElementById('feedback').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: window.innerHeight, scrollY: window.scrollY };
  });
  check(name, m.scrollY === 0 && m.top >= 0 && m.bottom <= m.vh,
    `feedback ${Math.round(m.top)}..${Math.round(m.bottom)} in viewport 0..${m.vh}, scrollY ${m.scrollY}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 680 } });
await page.goto(`${URL}/game.html`);
await page.selectOption('#layoutMode', 'urza-layout');

// The pad centers the wheel and publishes its geometry, so the test
// gestures around the real wheel instead of guessing.
const box = await page.locator('#pad').boundingBox();
const [wx, wy] = (await page.locator('#pad').getAttribute('data-center')).split(',').map(Number);
const arm = Number(await page.locator('#pad').getAttribute('data-arm'));
const cx = box.x + wx;
const cy = box.y + wy;
const R = arm * 0.66; // out past ring 4, safely inside the arm tip
const pt = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)];

// urza-layout slot geometry, mirroring tests/hello-flow.mjs: sector
// mids are N=270 E=0 S=90 W=180, and the target overshoots the last
// arm crossed by 25 degrees so the count is unambiguous.
const SECTOR_MID = { E: 0, S: 90, W: 180, N: 270 };
function strokeFor(sector, direction, crossings) {
  const from = SECTOR_MID[sector];
  const span = 45 + (crossings - 1) * 90 + 25;
  return { from, to: direction === 'CW' ? from + span : from - span };
}

async function draw({ from, to }) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const step = from < to ? 8 : -8;
  await page.mouse.move(...pt(from), { steps: 3 });
  for (let a = from; step > 0 ? a <= to : a >= to; a += step) await page.mouse.move(...pt(a));
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.up();
}

// The prompt is whatever the scheduler picked; ask the page where that
// letter lives rather than hard-coding one, so the test survives a
// layout edit.
async function slotOfPrompt() {
  const letter = await page.locator('#prompt').textContent();
  const slot = await page.evaluate(async (ch) => {
    const [{ buildLayout }, { slotOf }] = await Promise.all([
      import('./layouts.js'), import('./layout.js'),
    ]);
    return slotOf(buildLayout('urza-layout'), ch);
  }, letter);
  return { letter, slot };
}

// --- 1. a correct answer -------------------------------------------
const first = await slotOfPrompt();
check('prompt is a ring-1 letter', first.slot.crossings === 1,
  `${first.letter} is ring ${first.slot?.crossings}`);
await draw(strokeFor(first.slot.sector, first.slot.direction, first.slot.crossings));

await page.waitForSelector('#feedback.ok, #feedback.bad');
check(`"${first.letter}" drawn correctly grades as right`,
  await page.locator('#feedback.ok').count() === 1,
  await page.locator('.verdict').textContent());
check('reveal card is shown', await page.locator('.reveal svg').count() === 1);
check('QWERTY hint is shown', await page.locator('svg.qhint').count() === 1);
check('Next button appears', await page.locator('#nextBtn').isVisible());
await checkVisible('the right-answer panel is on screen');

// --- 2. a wrong answer ----------------------------------------------
await page.click('#nextBtn');
// Wait on the button, not on #feedback.idle: an empty feedback box has
// zero height, which Playwright reports as hidden forever.
await page.waitForSelector('#nextBtn', { state: 'hidden' });
const second = await slotOfPrompt();
check('scheduler does not repeat the same letter', second.letter !== first.letter,
  `got ${second.letter} twice`);

// Same sector, opposite rotation: a real letter, reliably not the
// prompt, so the miss path is exercised rather than an empty slot.
const wrongDir = second.slot.direction === 'CW' ? 'CCW' : 'CW';
await draw(strokeFor(second.slot.sector, wrongDir, 1));
await page.waitForSelector('#feedback.ok, #feedback.bad');
check(`"${second.letter}" drawn wrong grades as wrong`,
  await page.locator('#feedback.bad').count() === 1,
  await page.locator('.verdict').textContent());
await checkVisible('the wrong-answer panel is on screen');

// --- 3. giving up ----------------------------------------------------
// Its own grading branch (a null commit), and the one that keeps the
// boxes honest, so it is worth locking.
await page.click('#nextBtn');
await page.waitForSelector('#nextBtn', { state: 'hidden' });
const third = await slotOfPrompt();
await page.click('#showBtn');
await page.waitForSelector('.reveal svg');
check('"Show me" reveals the stroke', await page.locator('.reveal svg').count() === 1);
check('"Show me" is not scored as right', await page.locator('#feedback.ok').count() === 0,
  await page.locator('.verdict').textContent());
await checkVisible('the "Show me" panel is on screen');

// --- 4. progress is counted and persisted ---------------------------
check('three answers counted', (await page.locator('#step').textContent()).startsWith('3 '),
  await page.locator('#step').textContent());

const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('phonekeeb.game.v1') || '{}'));
const saved = stored['urza-layout'];
check('progress persisted under the layout id', !!saved && saved.step === 3, JSON.stringify(stored).slice(0, 120));
check('right answer moved a box up', saved?.letters?.[first.letter]?.box === 1,
  JSON.stringify(saved?.letters?.[first.letter]));
check('wrong answer reset a box', saved?.letters?.[second.letter]?.box === 0,
  JSON.stringify(saved?.letters?.[second.letter]));
check('a recall time was recorded', (saved?.letters?.[first.letter]?.times ?? []).length === 1);
check('"Show me" recorded no time', (saved?.letters?.[third.letter]?.times ?? []).length === 0,
  JSON.stringify(saved?.letters?.[third.letter]));

// --- 5. progress survives a reload ----------------------------------
await page.reload();
await page.selectOption('#layoutMode', 'urza-layout');
check('progress reloads', (await page.locator('#step').textContent()).startsWith('3 '),
  await page.locator('#step').textContent());

// --- 6. the pad teaches nothing away --------------------------------
// The whole point of the drill is that the map is hidden. If a letter
// ever gets painted on the pad, the exercise is worthless.
const padHasText = await page.evaluate(() => {
  const c = document.getElementById('pad');
  return typeof c.getContext('2d').fillText === 'function' && c.dataset.showsLetters === 'true';
});
check('pad does not show the letter map', !padHasText);

await page.screenshot({ path: process.env.SHOT ?? '/tmp/game-flow.png', fullPage: true });
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
