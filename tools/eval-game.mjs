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
// The cases live in tools/game-cases.mjs so that this harness and the
// served-model harness (tools/api-lm-predict.mjs) score the same 14.
import { CASES } from './game-cases.mjs';

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
  // The hit test is on the exact string, not the match key. A chip that
  // folds to the wanted word but spells it differently would be inserted
  // wrong: the verbatim chip "zebricko" is not "zebřičko" (case 12), and
  // "its" is not "it's" (case 5, where the engine does offer "it's"
  // itself). Fold-only matches are reported as near misses instead.
  const rank = chips.indexOf(c.want) + 1;
  const fold = chips.findIndex((w) => matchKey(w.toLowerCase()) === matchKey(c.want)) + 1;
  if (rank) hits++;
  const inv = vocab.has(c.want) ? '' : '  [want not in vocab]';
  console.log(`#${String(c.n).padStart(2)} "${c.input}" want=${c.want}`);
  console.log(`    strip: ${chips.join(' | ')}`);
  const verdict = rank ? `HIT at rank ${rank}`
    : fold ? `MISS (fold-only match "${chips[fold - 1]}" at rank ${fold})`
      : 'MISS';
  console.log(`    ${verdict}${inv}`);
}
console.log(`\n${hits}/${CASES.length} wanted words on the strip`);
