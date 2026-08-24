// End-to-end check of the theme switcher: the dropdown mirrors the
// registry, every theme applies its own background, the choice
// survives a reload, and no theme throws a page error. Screenshots of
// a few themes, taken mid-gesture so the preview letters and the trail
// are visible, land in SHOT_DIR (default /tmp) for visual review.
// Run like tests/hello-flow.mjs.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { THEMES } from '../themes.js';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';
const SHOT_DIR = process.env.SHOT_DIR ?? '/tmp';
const SAMPLES = ['solarized-dark', 'nord', 'black', 'solarized-light'];

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
  if (!ok) failures++;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);

const optionCount = await page.locator('#theme option').count();
check('dropdown mirrors the registry', optionCount === Object.keys(THEMES).length,
  `${optionCount} options for ${Object.keys(THEMES).length} themes`);

for (const [id, def] of Object.entries(THEMES)) {
  await page.selectOption('#theme', id);
  if (!def.vars) continue;
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  check(`${id} applies its background`, bg === def.vars['--bg'], `got ${bg}`);
}

// Hold a stroke straight down into the S sector (no arm crossed, so
// returning is only a dip-space) and screenshot with the finger down.
for (const id of SAMPLES) {
  await page.selectOption('#theme', id);
  const box = await page.locator('#stage').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + box.height * 0.28, { steps: 6 });
  await page.screenshot({ path: path.join(SHOT_DIR, `theme-${id}.png`) });
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.up();
}

await page.selectOption('#theme', 'nord');
await page.reload();
check('theme survives reload', (await page.inputValue('#theme')) === 'nord',
  await page.inputValue('#theme'));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failures ? 1 : 0);
