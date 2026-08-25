// End-to-end check of word prediction: gesture "hel", expect a "hello"
// suggestion chip, tap it, expect the completed word in the output.
// Also: next-word chips (empty prefix, bigram context), mid-word and
// mid-text corrections, and Czech diacritics matching (gesture-typing
// plain letters must surface accented suggestions).
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
  // The wheel anchors bottom-right in the canvas; main.js exposes its
  // center on the element so tests never duplicate the anchor math.
  const [wx, wy] = (await page.locator('#stage').getAttribute('data-center')).split(',').map(Number);
  const cx = box.x + wx;
  const cy = box.y + wy;
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

// Before any typing the strip shows the most frequent words, so the
// first word of a message is one tap away.
const freshChips = await page.locator('#suggestions button').allTextContents();
check('fresh strip shows top words', freshChips[0] === 'you', JSON.stringify(freshChips));

await drawStrokes(HEL);
const chips = await page.locator('#suggestions button').allTextContents();
check('hel suggests hello', chips.includes('hello'), JSON.stringify(chips));

await page.locator('#suggestions button', { hasText: /^hello$/ }).click();
const text = await page.locator('#output').textContent();
check('tap completes word', text === 'hello ', JSON.stringify(text));

// After the space the prefix is empty; the strip must show bigram
// successors of "hello" instead of going blank.
const nextChips = await page.locator('#suggestions button').allTextContents();
check('next-word chips after hello', nextChips.includes('there'), JSON.stringify(nextChips));

// N-sector hold-glide: moves the caret one step per 14 px of drag.
// Anchored to the wheel center from data-center, like drawStrokes.
async function caretGlide(dx) {
  const box = await page.locator('#stage').boundingBox();
  const [wx, wy] = (await page.locator('#stage').getAttribute('data-center')).split(',').map(Number);
  const x = box.x + wx;
  const y = box.y + wy - Math.min(box.width, box.height) * 0.35;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

// Mid-word correction: with the caret inside "hel" ("he|l"), a chip
// tap must replace the whole word, not only the "he" prefix.
await drawStrokes(HEL); // "hello hel"
await caretGlide(-20); // one step left: "hello he|l"
await page.locator('#suggestions button', { hasText: /^here$/ }).click();
let got = await page.locator('#output').textContent();
check('mid-word tap eats the tail', got === 'hello here ', JSON.stringify(got));

// Mid-text correction: the space already after the word is kept (no
// double space) and the caret lands right after it.
await caretGlide(-112); // eight steps left: "hel|lo here "
await page.locator('#suggestions button', { hasText: /^help$/ }).click();
got = await page.locator('#output').textContent();
check('mid-text tap keeps one space', got === 'help here ', JSON.stringify(got));
// The caret span splits the text nodes; the first node ends at the caret.
const caretPos = await page.evaluate(
  () => document.getElementById('output').firstChild.textContent.length,
);
check('caret after the kept space', caretPos === 5, String(caretPos));

// At "help |here " the prefix is empty, so the strip shows successors
// of "help"; tapping one replaces the word after the caret.
const midChips = await page.locator('#suggestions button').allTextContents();
check('next-word chips mid-text', midChips.includes('me'), JSON.stringify(midChips));
await page.locator('#suggestions button', { hasText: /^me$/ }).click();
got = await page.locator('#output').textContent();
check('next-word tap replaces following word', got === 'help me ', JSON.stringify(got));

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
