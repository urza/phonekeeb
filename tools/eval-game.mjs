// Replays the prediction-game exchanges (prediction-game.md) through
// the shipped Predictor: mixed en+cs, bigrams+trigrams, no personal
// model. Each case states what the user wanted; the output shows the
// strip and the hit rank. Run after model changes, next to
// eval-prediction.mjs: that one measures corpus averages, this one
// keeps the user's own expectations honest.
//
// Usage: node tools/eval-game.mjs

import { Predictor, matchKey } from '../prediction.js';
import { WORDS as WEN } from '../words-en.js';
import { WORDS as WCS } from '../words-cs.js';
import { BIGRAMS as BEN } from '../bigrams-en.js';
import { BIGRAMS as BCS } from '../bigrams-cs.js';
import { TRIGRAMS as TEN } from '../trigrams-en.js';
import { TRIGRAMS as TCS } from '../trigrams-cs.js';
import { WORDS_EXT as XEN } from '../words-ext-en.js';
import { WORDS_EXT as XCS } from '../words-ext-cs.js';

// mode: 'complete' = the last token is a prefix still being typed;
// 'next' = the last token is committed, the strip predicts the next
// word (prefix ''). The game transcript has no trailing spaces, so the
// mode is read from what the user picked.
const CASES = [
  { n: 1, input: 'you are am', prefix: 'am', prev: 'are', prev2: 'you', recent: ['you', 'are'], want: 'amazing' },
  { n: 2, input: 'how', prefix: '', prev: 'how', prev2: '', recent: ['how'], want: 'are' },
  { n: 3, input: 'do i e', prefix: 'e', prev: 'i', prev2: 'do', recent: ['do', 'i'], want: 'even' },
  { n: 4, input: 'future is', prefix: '', prev: 'is', prev2: 'future', recent: ['future', 'is'], want: 'now' },
  { n: 5, input: 'its', prefix: 'its', prev: '', prev2: '', recent: [], want: "it's" },
  { n: 6, input: 'I', prefix: '', prev: 'i', prev2: '', recent: ['i'], want: 'love' },
  { n: 7, input: 'I w', prefix: 'w', prev: 'i', prev2: '', recent: ['i'], want: 'would' },
  { n: 8, input: 'deliberat', prefix: 'deliberat', prev: '', prev2: '', recent: [], want: 'deliberately' },
  { n: 9, input: 'paja se šla vykoupat a zapla', prefix: 'zapla', prev: 'a', prev2: 'vykoupat', recent: ['paja', 'se', 'šla', 'vykoupat', 'a'], want: 'zaplavat' },
  { n: 10, input: 'mam hlad dam si k', prefix: 'k', prev: 'si', prev2: 'dam', recent: ['mam', 'hlad', 'dam', 'si'], want: 'kuře' },
  { n: 11, input: 'smoo', prefix: 'smoo', prev: '', prev2: '', recent: [], want: 'smooth' },
];

const predictor = new Predictor([
  { id: 'en', words: WEN, bigrams: BEN, trigrams: TEN },
  { id: 'cs', words: WCS, bigrams: BCS, trigrams: TCS },
]);
predictor.addWords('en', XEN);
predictor.addWords('cs', XCS);

const vocab = new Set([...WEN, ...WCS, ...XEN, ...XCS].map(([w]) => w));

let hits = 0;
for (const c of CASES) {
  const chips = predictor.predict(c.prefix, 6, { prev: c.prev, prev2: c.prev2, recent: c.recent });
  const rank = chips.findIndex((w) => matchKey(w.toLowerCase()) === matchKey(c.want)) + 1;
  if (rank) hits++;
  const inv = vocab.has(c.want) ? '' : '  [want not in vocab]';
  console.log(`#${String(c.n).padStart(2)} "${c.input}" want=${c.want}`);
  console.log(`    strip: ${chips.join(' | ')}`);
  console.log(`    ${rank ? `HIT at rank ${rank}` : 'MISS'}${inv}`);
}
console.log(`\n${hits}/${CASES.length} wanted words on the strip`);
