// Per-keystroke latency of the shipped Predictor, at whatever
// vocabulary WORDS_DIR points at. Written for the 2026-08-30 wordfreq
// vocabulary sweep: the strip is drawn on every keystroke, so list size
// is a latency question before it is a quality question.
//
// Usage:
//   node tools/bench-predict.mjs
//   WORDS_DIR=/tmp/cut-all node tools/bench-predict.mjs
//
// The prefixes are taken from the word lists themselves, so a bigger
// vocabulary is measured on its own words, not on English-only ones.

import { Predictor } from '../prediction.js';
import { BIGRAMS as BEN } from '../bigrams-en.js';
import { BIGRAMS as BCS } from '../bigrams-cs.js';
import { TRIGRAMS as TEN } from '../trigrams-en.js';
import { TRIGRAMS as TCS } from '../trigrams-cs.js';
import { WORDS, WORDS_EXT, WORDS_DIR } from './load-words.mjs';

const t0 = performance.now();
const predictor = new Predictor([
  { id: 'en', words: WORDS.en, bigrams: BEN, trigrams: TEN },
  { id: 'cs', words: WORDS.cs, bigrams: BCS, trigrams: TCS },
]);
predictor.addWords('en', WORDS_EXT.en);
predictor.addWords('cs', WORDS_EXT.cs);
const buildMs = performance.now() - t0;

// A keystroke sample that matches how the strip is really asked:
// mostly short prefixes, some empty (next-word), a few long ones.
const cases = [];
const pick = (list, n) => {
  const step = Math.max(1, Math.floor(list.length / n));
  return Array.from({ length: n }, (_, i) => list[i * step][0]).filter(Boolean);
};
for (const lang of ['en', 'cs']) {
  const sample = [...pick(WORDS[lang], 120), ...pick(WORDS_EXT[lang], 120)];
  const prev = WORDS[lang][5][0];
  const prev2 = WORDS[lang][9][0];
  for (const w of sample) {
    for (const len of [0, 1, 2, 3, 5]) {
      if (len > w.length) continue;
      cases.push({ prefix: w.slice(0, len), prev, prev2, recent: [prev2, prev] });
    }
  }
}

for (const c of cases.slice(0, 200)) predictor.predict(c.prefix, 6, c); // warm up

const times = [];
const byLen = new Map();
for (const c of cases) {
  const t = performance.now();
  predictor.predict(c.prefix, 6, c);
  const ms = performance.now() - t;
  times.push(ms);
  if (!byLen.has(c.prefix.length)) byLen.set(c.prefix.length, []);
  byLen.get(c.prefix.length).push(ms);
}
times.sort((a, b) => a - b);
const at = (q) => times[Math.floor(times.length * q)].toFixed(2);
const mean = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2);

const entries = WORDS.en.length + WORDS.cs.length
  + WORDS_EXT.en.length + WORDS_EXT.cs.length;
console.log(`${WORDS_DIR}`);
console.log(`  entries ${entries}, build ${buildMs.toFixed(0)} ms, `
  + `heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
console.log(`  predict over ${times.length} keystrokes: `
  + `mean ${mean} ms, p50 ${at(0.5)}, p95 ${at(0.95)}, p99 ${at(0.99)}, `
  + `max ${times[times.length - 1].toFixed(2)}`);
// Split by prefix length: an empty prefix is the next-word strip, which
// has no prefix to narrow the scan with, so it is the expensive shape.
for (const len of [...byLen.keys()].sort()) {
  const ts = byLen.get(len).sort((a, b) => a - b);
  const m = (ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2);
  console.log(`    prefix ${len}: n=${String(ts.length).padStart(4)} `
    + `mean ${m} ms, p95 ${ts[Math.floor(ts.length * 0.95)].toFixed(2)}`);
}
