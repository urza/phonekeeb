// End-to-end check of word prediction: gesture "hel", expect a "hello"
// suggestion chip, tap it, expect the completed word in the output.
// Also: next-word chips (empty prefix, bigram context), mid-word and
// mid-text corrections, Czech diacritics matching (gesture-typing
// plain letters must surface accented suggestions), and the personal
// learning loop (accepted words lead the fresh strip; forget and the
// learn toggle both stop it).
//
// Run like tests/hello-flow.mjs (server on :8080, Playwright in ~/pw).

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

// urza layout strokes in the X geometry:
// h=(E,CW,2) e=(W,CW,1) l=(E,CCW,2).
const HEL = [
  { from: 0, to: 160 },
  { from: 180, to: 250 },
  { from: 360, to: 200 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
await page.goto(URL);
await page.click('#settingsToggle'); // controls sit in the collapsed settings block
await page.selectOption('#layoutMode', 'urza-layout');

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

// Before any typing the strip shows the most frequent words of BOTH
// languages (the model is mixed and no context exists yet), so the
// first word of a message is one tap away in either language.
const freshChips = await page.locator('#suggestions button').allTextContents();
check('fresh strip mixes both languages',
  freshChips.includes('you') && freshChips.includes('to'), JSON.stringify(freshChips));

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
  const p = new Predictor([{ id: 'cs', words: WORDS }]);
  return { strip: stripDiacritics('řekl'), top: p.predict('rek', 5) };
});
check('stripDiacritics', csChips.strip === 'rekl', csChips.strip);
check('cs rek finds accented', csChips.top.some((w) => w.startsWith('řek')), JSON.stringify(csChips.top));

// Trigram tables lazy-load after first paint; main.js flips a body
// marker when they are live. A zero- or one-word context scores
// identically with or without them, so the earlier assertions cannot
// race the load.
let triLoaded = true;
try {
  await page.waitForSelector('body[data-trigrams="1"]', { timeout: 15000 });
} catch {
  triLoaded = false;
}
check('trigram tables loaded lazily', triLoaded);

// The shipped cs table through the real engine, in-page: after
// "co se" the strip leads with the table's strongest continuations.
// Top 2, not first place: "děje" and "stalo" share a quantized count
// code (the ~13% steps are the designed precision), so their order
// may fall either way.
const tri = await page.evaluate(async () => {
  const { Predictor } = await import('./prediction.js');
  const { WORDS } = await import('./words-cs.js');
  const { TRIGRAMS } = await import('./trigrams-cs.js');
  const p = new Predictor([{ id: 'cs', words: WORDS, trigrams: TRIGRAMS }]);
  return p.predict('', 5, { prev: 'se', prev2: 'co' });
});
check('cs trigram context surfaces děje', tri.slice(0, 2).includes('děje'),
  JSON.stringify(tri));

// Personal learning, end to end through the UI. Forget first: the
// chip taps above already taught the model a few words.
async function acceptHello() {
  await drawStrokes(HEL);
  await page.locator('#suggestions button', { hasText: /^hello$/ }).click();
  await page.click('#clearText');
}
await page.click('#clearText');
await page.click('#forgetTyping');
await acceptHello();
await acceptHello();
const learned = await page.locator('#suggestions button').allTextContents();
check('learned start word leads the fresh strip', learned[0] === 'hello',
  JSON.stringify(learned));

await page.click('#forgetTyping');
const forgot = await page.locator('#suggestions button').allTextContents();
check('forget restores the neutral strip', !forgot.includes('hello'),
  JSON.stringify(forgot));

// With the toggle off, accepted words must not teach the model.
await page.uncheck('#learnTyping');
await acceptHello();
await acceptHello();
const off = await page.locator('#suggestions button').allTextContents();
check('learning toggle off learns nothing', !off.includes('hello'),
  JSON.stringify(off));
await page.check('#learnTyping');

await page.screenshot({ path: process.env.SHOT ?? '/tmp/prediction-flow.png' });
await browser.close();
process.exit(failures ? 1 : 0);
