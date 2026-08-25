// Smoke test for the letter-cards study page: every filled slot in the
// selected layout renders exactly one card, a known card carries the
// right letter, and the page loads with no script errors.
//
// Run:
//   python3 -m http.server 8080          (repo root, in another shell)
//   node tests/cards-smoke.mjs
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
await page.goto(URL + '/cards.html');

async function expectCards(layoutId, expected) {
  await page.selectOption('#layoutMode', layoutId);
  const n = await page.locator('.card').count();
  if (n !== expected) throw new Error(`${layoutId}: expected ${expected} cards, got ${n}`);
}

// qwerty-8pen fills 26 slots (6 reserved empties draw nothing);
// original-8pen fills all 32, punctuation included.
await expectCards('qwerty-8pen', 26);
await expectCards('original-8pen', 32);

// One known address: in qwerty-8pen, W CW at 1 crossing is "e".
await page.selectOption('#layoutMode', 'qwerty-8pen');
const letter = await page
  .locator('.card', { hasText: 'W · CW · 1 line' })
  .locator('figcaption b')
  .innerText();
if (letter !== 'e') throw new Error(`expected the W CW 1 card to be "e", got "${letter}"`);

if (errors.length) throw new Error('page errors: ' + errors.join('; '));

console.log('cards-smoke: PASS');
await browser.close();
