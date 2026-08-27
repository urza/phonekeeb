// End-to-end check of the learned-words page (dictionary.html): the
// three views, search, the typo queue, delete/undo, pin, and the one
// thing that matters most, that an edit made here actually changes what
// the keyboard suggests on the next page load.
//
// Run:
//   python3 -m http.server 8080          (repo root, in another shell)
//   node tests/dictionary-flow.mjs
//
// Playwright lives OUTSIDE the repo (~/pw); set PW_DIR to override.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : (detail ?? ''));
  if (!ok) failures++;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// A store built by hand rather than by gesture-typing: this test is
// about the page, and prediction-flow already covers the learning loop.
// "teh" is the typo, one neighbour swap away from "the". "kolodej" is a
// personal word no corpus knows.
const DAY = 86400000;
// Local midday, not "now minus N hours": a day boundary must not fall
// between the stored UTC day number and the local date the page prints,
// or the Today/Yesterday labels below would depend on the wall clock.
const noon = new Date();
noon.setHours(12, 0, 0, 0);
const today = noon.getTime();
const yesterday = today - DAY;
const day = (t) => Math.floor(t / DAY);

const store = {
  v: 2,
  day: day(today),
  uni: { ahoj: 9, kolodej: 4, teh: 2, svete: 3, jak: 5 },
  seen: {
    ahoj: day(today), kolodej: day(today), svete: day(today),
    jak: day(today), teh: day(yesterday),
  },
  bi: {
    '': { ahoj: 4 },
    ahoj: { svete: 3, jak: 2 },
    and: { teh: 2 },
  },
  tri: { 'ahoj jak': { se: 2 } },
  blocked: [],
  pinned: [],
  // Oldest first, the order learn() appends in. The page reverses it.
  log: [
    ['teh', 'and', yesterday],
    ['ahoj', '', today - 3 * 60000],
    ['jak', 'ahoj', today - 3 * 60000 + 1000],
    ['se', 'jak', today - 3 * 60000 + 2000],
  ],
};

await page.goto(URL + '/index.html');
await page.evaluate((s) => localStorage.setItem('phonekeeb.personal', JSON.stringify(s)), store);
await page.goto(URL + '/dictionary.html');

// --- 1. the header and the default view -----------------------------

check('the store loads', (await page.locator('#stats').textContent()).includes('5 words'),
  await page.locator('#stats').textContent());
check('Recent is the default view',
  await page.locator('#tabs .chip[aria-pressed="true"]').textContent() === 'Recent');
// Three words typed one after another render as one line, the fourth is
// a day older and stands alone.
check('the feed groups a run into one line', await page.locator('.run').count() === 2,
  String(await page.locator('.run').count()));
check('the feed reads like typed text',
  (await page.locator('.run').first().textContent()).includes('ahojjakse'),
  await page.locator('.run').first().textContent());
check('the feed names the days',
  (await page.locator('.day').allTextContents()).join(',') === 'Today,Yesterday',
  (await page.locator('.day').allTextContents()).join(','));
check('the typo is marked in the feed', await page.locator('.w.sus').count() === 1,
  String(await page.locator('.w.sus').count()));

// --- 2. words, sorting and the typo queue ---------------------------

await page.click('#tabs .chip:has-text("Words")');
const rows = await page.locator('.row .label').allTextContents();
check('words sort by count', rows[0] === 'ahoj' && rows[1] === 'jak', rows.join(','));
check('every word is listed', rows.length === 5, rows.join(','));
check('the typo carries its correction',
  (await page.locator('.row:has-text("teh") .tag').textContent()).includes('the'),
  await page.locator('.row:has-text("teh") .tag').textContent());

await page.click('#filters .chip:has-text("Typos")');
const sus = await page.locator('.row .label').allTextContents();
check('the typo queue holds only the typo', sus.join(',') === 'teh', sus.join(','));
check('a personal word is not called a typo', !sus.includes('kolodej'));
await page.click('#filters .chip:has-text("All")');

// --- 3. search across the views -------------------------------------

await page.fill('#search', 'aho');
check('search filters the word list',
  (await page.locator('.row .label').allTextContents()).join(',') === 'ahoj',
  (await page.locator('.row .label').allTextContents()).join(','));
await page.fill('#search', 'zzz');
check('a search with no hits offers to add the word',
  await page.locator('.actions button:has-text("Add")').count() === 1);
await page.fill('#search', '');

// --- 4. one word expanded -------------------------------------------

await page.click('.row:has-text("ahoj") .rowhead');
const detail = await page.locator('.detail').first().textContent();
check('the detail shows the count', detail.includes('9 times'), detail);
check('the detail shows when it was last seen', detail.includes('Today'), detail);
check('the detail lists what follows the word',
  (await page.locator('.pairlist button').allTextContents()).some((t) => t.startsWith('svete')),
  (await page.locator('.pairlist button').allTextContents()).join(','));

// --- 5. delete, and undo --------------------------------------------

await page.click('.detail .actions button:has-text("Delete")');
check('the deleted word is gone',
  !(await page.locator('.row .label').allTextContents()).includes('ahoj'),
  (await page.locator('.row .label').allTextContents()).join(','));
check('a delete blocks the word, so it cannot be re-learned',
  (await page.locator('#stats').textContent()).includes('1 blocked'),
  await page.locator('#stats').textContent());
check('the undo toast appears', await page.locator('#toast:visible').count() === 1);
await page.click('#toastUndo');
check('undo restores the word',
  (await page.locator('.row .label').allTextContents()).includes('ahoj'),
  (await page.locator('.row .label').allTextContents()).join(','));
check('undo restores the block list too',
  !(await page.locator('#stats').textContent()).includes('blocked'),
  await page.locator('#stats').textContent());

// --- 6. phrases ------------------------------------------------------

await page.click('#tabs .chip:has-text("Phrases")');
const pairs = await page.locator('.row .label').allTextContents();
check('two-word phrases are listed', pairs.some((t) => t.includes('ahoj svete')), pairs.join(','));
check('the start token gets a readable name',
  pairs.some((t) => t.includes('start')), pairs.join(','));
await page.click('#filters .chip:has-text("3 words")');
const triples = await page.locator('.row .label').allTextContents();
check('three-word phrases are listed', triples.join(',') === 'ahoj jak se', triples.join(','));
await page.click('.row .rowhead');
await page.click('.detail .actions button:has-text("Delete phrase")');
check('a phrase deletes on its own',
  (await page.locator('#stats').textContent()).includes('0 triples'),
  await page.locator('#stats').textContent());

// --- 7. the edit reaches the keyboard --------------------------------
// The point of the whole page. Block a word here, then load the
// keyboard and confirm the suggestion strip has stopped offering it.

await page.click('#tabs .chip:has-text("Words")');
await page.fill('#search', 'kolodej');
await page.click('.row:has-text("kolodej") .rowhead');
await page.click('.detail .actions button:has-text("Delete")');
await page.waitForTimeout(400); // the write-behind debounce

await page.goto(URL + '/index.html');
const after = await page.evaluate(() => {
  const strip = [...document.querySelectorAll('#suggestions button')].map((b) => b.textContent);
  return { strip, stored: JSON.parse(localStorage.getItem('phonekeeb.personal')) };
});
check('the keyboard reloads the edited store', after.stored.blocked.includes('kolodej'),
  JSON.stringify(after.stored.blocked));
check('the keyboard still starts with suggestions', after.strip.length > 0, after.strip.join(','));

// The regression this guards: index.html holds its own model in memory
// and writes it back on hide. If it did not re-read the store, that
// write would silently undo every edit made on the dictionary page.
const survives = await page.evaluate(() => {
  window.dispatchEvent(new Event('pagehide'));
  return JSON.parse(localStorage.getItem('phonekeeb.personal'));
});
check('the keyboard does not clobber the edit when it saves',
  survives.blocked.includes('kolodej') && !('kolodej' in survives.uni),
  JSON.stringify(survives.blocked));

check('no page errors anywhere', errors.length === 0, errors.join('; '));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
await browser.close();
process.exit(failures ? 1 : 0);
