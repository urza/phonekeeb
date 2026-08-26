// Measure how well each layout's letters flow into each other.
//
//   node tools/score-flow.mjs            # summary + per-layout detail
//   node tools/score-flow.mjs --matrix   # add the top-20 comparison grids
//
// Writes nothing. The prose write-up of these numbers, and the
// reasoning behind the rule, live in layout-flow-analysis.md.
//
// The model of a figure eight lives in layout.js (`flowJoin`), next to
// the rest of the slot geometry, so the app, this tool, and
// tests/flow-unit.mjs cannot drift apart. Read the comment there for
// the rule itself.
//
// Validation: applied to original-8pen the rule reproduces all seven
// hand-decoded results recorded in CLAUDE.md from the 8pen demo video
// (he, in, er, ea are eights; th, an, on are not). The `check`
// function below asserts it, so a change that breaks the model fails
// loudly instead of quietly reporting nonsense.

import { readFileSync } from 'node:fs';
import { LAYOUTS, buildLayout } from '../layouts.js';
import { SECTORS, DIRECTIONS, flowJoin } from '../layout.js';
import * as EN from './letter-ngrams-en.js';
import * as CS from './letter-ngrams-cs.js';
import { WORDS as WORDS_EN } from '../words-en.js';
import { WORDS as WORDS_CS } from '../words-cs.js';

// Czech diacritics fold to base letters, matching how the letter
// n-gram tables were built: the end-state keyboard is one combined
// en+cs layout with no diacritic slots.
const FOLD = { á: 'a', č: 'c', ď: 'd', é: 'e', ě: 'e', í: 'i', ň: 'n', ó: 'o', ř: 'r', š: 's', ť: 't', ú: 'u', ů: 'u', ý: 'y', ž: 'z' };
const fold = (w) => [...w].map((c) => FOLD[c] ?? c).join('');

const join = flowJoin;

// letter -> its slot. Slot index 0 is 1 crossing.
function letterMap(layout) {
  const map = new Map();
  for (const sector of SECTORS) {
    for (const direction of DIRECTIONS) {
      layout[sector][direction].forEach((ch, i) => {
        if (ch !== null) map.set(ch, { sector, direction, crossings: i + 1 });
      });
    }
  }
  return map;
}

const CATEGORIES = [
  ['through/counter', 'figure eight, straight through and crossing over'],
  ['through/co', 'straight through, but both loops curl the same way'],
  ['turn/counter', 'soft 90 degree turn at the center, loops counter-curl'],
  ['turn/co', 'soft 90 degree turn, loops stack the same way'],
  ['reverse/counter', 'doubles back on itself, loops counter-curl'],
  ['reverse/co', 'doubles back and both loops curl the same way'],
];

function scoreBigrams(map, table) {
  const rows = [];
  let scoredMass = 0;
  const skipped = [];
  for (const [gram, count] of table.top) {
    const a = map.get(gram[0]);
    const b = map.get(gram[1]);
    if (!a || !b) { skipped.push(gram); continue; }
    rows.push({ gram, count, ...join(a, b) });
    scoredMass += count;
  }
  return { rows, scoredMass, skipped };
}

function scoreTrigrams(map, table) {
  const rows = [];
  let scoredMass = 0;
  const skipped = [];
  for (const [gram, count] of table.top) {
    const g = [...gram].map((ch) => map.get(ch));
    if (g.some((x) => !x)) { skipped.push(gram); continue; }
    const joins = [join(g[0], g[1]), join(g[1], g[2])];
    const eights = joins.filter((j) => j.eight).length;
    rows.push({ gram, count, joins, eights });
    scoredMass += count;
  }
  return { rows, scoredMass, skipped };
}

const pct = (part, whole) => `${((100 * part) / whole).toFixed(1)}%`;
const mass = (rows, f) => rows.filter(f).reduce((s, r) => s + r.count, 0);

function bigramReport(name, map, table, label) {
  const { rows, scoredMass, skipped } = scoreBigrams(map, table);
  const eights = rows.filter((r) => r.eight);
  console.log(`\n### ${name} / ${label}`);
  console.log(`eights: ${eights.length} of ${rows.length} pairs, ` +
    `${pct(mass(rows, (r) => r.eight), scoredMass)} of the weighted mass` +
    (skipped.length ? `  (unmapped, excluded: ${skipped.join(' ')})` : ''));
  for (const [key, blurb] of CATEGORIES) {
    const set = rows.filter((r) => r.key === key);
    const w = pct(mass(rows, (r) => r.key === key), scoredMass);
    console.log(`  ${key.padEnd(16)} ${String(set.length).padStart(3)}  ${w.padStart(6)}   ${blurb}`);
  }
  const top = eights.slice(0, 20)
    .map((r) => `${r.gram} ${pct(r.count, scoredMass)}`).join(', ');
  console.log(`  top eights: ${top || '(none)'}`);
  return { rows, scoredMass, eights };
}

function trigramReport(name, map, table, label) {
  const { rows, scoredMass, skipped } = scoreTrigrams(map, table);
  const full = rows.filter((r) => r.eights === 2);
  const half = rows.filter((r) => r.eights === 1);
  console.log(`\n### ${name} / ${label} trigrams`);
  console.log(`both joins eight: ${full.length} of ${rows.length}, ` +
    `${pct(mass(rows, (r) => r.eights === 2), scoredMass)} weighted` +
    (skipped.length ? `  (unmapped: ${skipped.join(' ')})` : ''));
  console.log(`one join eight:   ${half.length} of ${rows.length}, ` +
    `${pct(mass(rows, (r) => r.eights === 1), scoredMass)} weighted`);
  console.log(`no join eight:    ${rows.length - full.length - half.length} of ${rows.length}, ` +
    `${pct(mass(rows, (r) => r.eights === 0), scoredMass)} weighted`);
  console.log(`  top double eights: ${full.slice(0, 20).map((r) => `${r.gram} ${pct(r.count, scoredMass)}`).join(', ') || '(none)'}`);
  console.log(`  top single eights: ${half.slice(0, 20).map((r) => r.gram).join(' ') || '(none)'}`);
  return { rows, scoredMass, full };
}

// Side-by-side grid: for the N most frequent grams, which layouts flow.
function matrix(perLayout, table, n, isTri) {
  const ids = Object.keys(perLayout);
  const heads = ids.map((id) => LAYOUTS[id].label);
  const w = Math.max(...heads.map((h) => h.length)) + 2;
  console.log(`\n  gram   share   ${heads.map((h) => h.padEnd(w)).join('')}`);
  for (const row of perLayout[ids[0]].rows.slice(0, n)) {
    const cells = ids.map((id) => {
      const r = perLayout[id].rows.find((x) => x.gram === row.gram);
      const mark = isTri
        ? (r.eights === 2 ? 'EIGHT x2' : r.eights === 1 ? 'eight x1' : '-')
        : (r.eight ? 'EIGHT' : r.shape === 'through' ? 'thru' : r.shape === 'turn' ? 'turn' : '-');
      return mark.padEnd(w);
    });
    console.log(`  ${row.gram.padEnd(6)} ${pct(row.count, perLayout[ids[0]].scoredMass).padStart(5)}   ${cells.join('')}`);
  }
}

// Is 20% a lot? On its own the number means nothing, so anchor it.
// A random letter-to-slot assignment lands an eight when the sectors
// happen to be opposite (1 in 4) and the curls happen to differ (1 in
// 2), so chance alone scores about 12.5%. Shuffling the real letters
// over the real slots gives the empirical spread, and the best of many
// shuffles shows how much room a tuned layout still has above the
// layouts we have. Seeded, so the printed numbers are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleBaseline(layoutId, table, runs = 2000) {
  const slots = [...letterMap(buildLayout(layoutId)).values()];
  const letters = [...letterMap(buildLayout(layoutId)).keys()];
  const rand = mulberry32(20260826);
  const scores = [];
  for (let r = 0; r < runs; r++) {
    const pool = slots.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const map = new Map(letters.map((ch, i) => [ch, pool[i]]));
    const { rows, scoredMass } = scoreBigrams(map, table);
    scores.push(mass(rows, (x) => x.eight) / scoredMass);
  }
  scores.sort((a, b) => a - b);
  return {
    mean: scores.reduce((s, x) => s + x, 0) / runs,
    p50: scores[Math.floor(runs * 0.5)],
    p95: scores[Math.floor(runs * 0.95)],
    max: scores[runs - 1],
  };
}

// The 8pen demo video, hand-decoded in CLAUDE.md. If the model of an
// eight ever stops reproducing these, every number below is suspect.
function check() {
  const map = letterMap(buildLayout('original-8pen'));
  const expected = { he: true, in: true, er: true, ea: true, th: false, an: false, on: false };
  const bad = Object.entries(expected).filter(([g, want]) =>
    join(map.get(g[0]), map.get(g[1])).eight !== want);
  if (bad.length) {
    console.error(`FAIL: model disagrees with the 8pen video on ${bad.map(([g]) => g).join(' ')}`);
    process.exit(1);
  }
  console.log('model check: reproduces all 7 hand-decoded 8pen video results');
}

// Words of 3+ letters whose every join is an eight, so the whole word
// is one unbroken serpentine. The payoff the bigram percentages are a
// proxy for, and the thing a user actually feels.
function chainWords(map, words, min = 3) {
  const hits = [];
  for (const [word, count] of words) {
    const f = fold(word);
    if (f.length < min || !/^[a-z]+$/.test(f)) continue;
    const slots = [...f].map((ch) => map.get(ch));
    if (slots.some((s) => !s)) continue;
    let all = true;
    for (let i = 0; i < slots.length - 1 && all; i++) {
      if (!join(slots[i], slots[i + 1]).eight) all = false;
    }
    if (all) hits.push([word, count]);
  }
  return hits;
}

const showMatrix = process.argv.includes('--matrix');
check();

const norvig = JSON.parse(readFileSync(new URL('./norvig-bigrams.json', import.meta.url), 'utf8'));
const NORVIG = { top: norvig.slice(0, 100) };

const SOURCES = [
  ['English (subtitles)', 'en', EN.BIGRAMS, EN.TRIGRAMS, WORDS_EN],
  ['Czech (subtitles)', 'cs', CS.BIGRAMS, CS.TRIGRAMS, WORDS_CS],
  ['English (Norvig/Books)', 'en', NORVIG, null, null],
];

for (const [label, code, bi, tri, words] of SOURCES) {
  console.log(`\n\n## ${label}`);
  const per = {};
  for (const id of Object.keys(LAYOUTS)) {
    per[id] = bigramReport(LAYOUTS[id].label, letterMap(buildLayout(id)), bi, label);
  }
  if (showMatrix) matrix(per, bi, 20, false);

  if (tri) {
    const perT = {};
    for (const id of Object.keys(LAYOUTS)) {
      perT[id] = trigramReport(LAYOUTS[id].label, letterMap(buildLayout(id)), tri, label);
    }
    if (showMatrix) matrix(perT, tri, 20, true);
  }

  if (words) {
    console.log(`\n  whole words that flow as one unbroken serpentine (top 3000 ${code} words):`);
    for (const id of Object.keys(LAYOUTS)) {
      const hits = chainWords(letterMap(buildLayout(id)), words);
      console.log(`    ${LAYOUTS[id].label.padEnd(14)} ${String(hits.length).padStart(2)}  ` +
        hits.slice(0, 12).map(([w, c]) => `${w} (${c.toLocaleString('en-US')})`).join(', '));
    }
  }

  // Baseline uses urza's slot shape (26 letters, 6 empty ring-4 slots),
  // so it is comparable to the two letters-only layouts.
  const b = shuffleBaseline('urza-layout', bi);
  console.log(`\n  shuffle baseline (2000 random letter placements, urza slot shape):`);
  console.log(`    chance alone 12.5%   mean ${pct(b.mean, 1)}   median ${pct(b.p50, 1)}` +
    `   p95 ${pct(b.p95, 1)}   best ${pct(b.max, 1)}`);
}
