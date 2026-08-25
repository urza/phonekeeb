// End-to-end check of word prediction: gesture "hel", expect a "hello"
// suggestion chip, tap it, expect the completed word in the output.
// Also checks Czech diacritics matching: gesture-typing plain letters
// must surface accented suggestions.
//
// Run like tests/hello-flow.mjs (server on :8080, Playwright in ~/pw).

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

// Frequency EN layout strokes in the X geometry:
// h=(W,CCW,1) e=(N,CW,1) l=(E,CW,2).
const HEL = [
  { from: 180, to: 110 },
  { from: 270, to: 340 },
  { from: 0, to: 160 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
await page.goto(URL);
await page.click('#settingsToggle'); // controls sit in the collapsed settings block
await page.selectOption('#layoutMode', 'frequency');

async function drawStrokes(strokes) {
  const box = await page.locator('#stage').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const R = Math.min(box.width, box.height) * 0.3;
  const pt = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (const { from, to } of strokes) {
    const step = from < to ? 8 : -8;
    await page.mouse.move(...pt(from), { steps: 3 });
    for (let a = from; step > 0 ? a <= to : a >= to; a += step) {
      await page.mouse.move(...pt(a));
    }
    await page.mouse.move(cx, cy, { steps: 4 });
  }
  await page.mouse.up();
}

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
  if (!ok) failures++;
}

await drawStrokes(HEL);
const chips = await page.locator('#suggestions button').allTextContents();
check('hel suggests hello', chips.includes('hello'), JSON.stringify(chips));

await page.locator('#suggestions button', { hasText: /^hello$/ }).click();
const text = await page.locator('#output').textContent();
check('tap completes word', text === 'hello ', JSON.stringify(text));

// Czech: predictor must match stripped keys. Check in-page directly so
// the test does not depend on Czech letter positions in the layout.
const csChips = await page.evaluate(async () => {
  const { Predictor, stripDiacritics } = await import('./prediction.js');
  const { WORDS } = await import('./words-cs.js');
  const p = new Predictor(WORDS);
  return { strip: stripDiacritics('řekl'), top: p.predict('rek', 5) };
});
check('stripDiacritics', csChips.strip === 'rekl', csChips.strip);
check('cs rek finds accented', csChips.top.some((w) => w.startsWith('řek')), JSON.stringify(csChips.top));

await page.screenshot({ path: process.env.SHOT ?? '/tmp/prediction-flow.png' });
await browser.close();
process.exit(failures ? 1 : 0);
