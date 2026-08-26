// Unit test of the scored mixed-language predictor against the real
// shipped tables. Plain node, no browser. Run: node tests/prediction-unit.mjs
//
// Locks the behaviors requested 2026-08-26: one mixed en+cs model with
// no switching, sentence-language awareness, diacritics restoration
// (tata -> táta), apostrophe restoration (its -> it's, the prediction
// game's miss), typo tolerance, and the verbatim chip.

import { Predictor, stripDiacritics, matchKey } from '../prediction.js';
import { WORDS as WORDS_EN } from '../words-en.js';
import { WORDS as WORDS_CS } from '../words-cs.js';
import { BIGRAMS as BIGRAMS_EN } from '../bigrams-en.js';
import { BIGRAMS as BIGRAMS_CS } from '../bigrams-cs.js';

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : (detail ?? ''));
  if (!ok) failures++;
}

const p = new Predictor([
  { id: 'en', words: WORDS_EN, bigrams: BIGRAMS_EN },
  { id: 'cs', words: WORDS_CS, bigrams: BIGRAMS_CS },
]);

check('matchKey folds diacritics and apostrophes',
  matchKey("don't") === 'dont' && stripDiacritics('řekl') === 'rekl');

// Diacritics restoration: a fully typed base-letter word offers its
// accented form first.
const tata = p.predict('tata', 5);
check('tata restores to táta', tata[0] === 'táta', JSON.stringify(tata));

// Apostrophe restoration, the prediction game's recorded miss.
const its = p.predict('its', 5, { prev: 'think', recent: ['i', 'think'] });
check("its offers it's first", its[0] === "it's", JSON.stringify(its));
const dont = p.predict('dont', 5);
check("dont offers don't first", dont[0] === "don't", JSON.stringify(dont));

// Sentence-language awareness: the same prefix leans with the context.
const enNe = p.predict('ne', 5, { prev: 'i', recent: ['what', 'do', 'you', 'i'] });
check('en context suppresses cs candidates',
  !enNe.some((w) => ['není', 'něco', 'nebo', 'nic'].includes(w)), JSON.stringify(enNe));
const csNe = p.predict('ne', 5, { prev: 'to', recent: ['proč', 'je', 'to'] });
check('cs context surfaces cs candidates', csNe[0] === 'není', JSON.stringify(csNe));

// The posterior itself: confident but floored, and neutral with no
// context, so the fresh strip serves both languages.
const en = p.langPosterior(['what', 'do', 'you']);
check('en posterior confident yet floored', en.en > 0.9 && en.cs >= 0.05,
  JSON.stringify(en));
check('empty context is neutral', p.langPosterior([]).en === 0.5);
const fresh = p.predict('', 5);
check('fresh strip mixes both languages',
  fresh.includes('you') && fresh.includes('to'), JSON.stringify(fresh));

// Bigram scoring: after "help" the strip leads with its successors.
const afterHelp = p.predict('', 5, { prev: 'help', recent: ['help'] });
check('bigram successors lead next-word', afterHelp[0] === 'me',
  JSON.stringify(afterHelp));

// Typo hypotheses: one substitution and one missing letter both find
// the word; the literal typed form survives as the verbatim chip.
const typo = p.predict('hwllo', 5);
check('substitution typo finds hello', typo[0] === 'hello', JSON.stringify(typo));
check('typo keeps the verbatim chip', typo.includes('hwllo'), JSON.stringify(typo));
const short = p.predict('helo', 5);
check('missing-letter typo finds hello', short.includes('hello'), JSON.stringify(short));

// Verbatim guarantee: an out-of-vocabulary word is offerable as typed.
const oov = p.predict('zxq', 5);
check('oov word offered verbatim', oov.includes('zxq'), JSON.stringify(oov));

// Trigram layer, synthetic so the math is inspectable. Codes are
// round(ln(count) x 8): 56 ~ 1097, 44 ~ 245, 38 ~ 116, 32 ~ 55.
const tWords = [['alpha', 100], ['beta', 90], ['gamma', 80]];
const tp = new Predictor([{
  id: 'xx',
  words: tWords,
  bigrams: { alpha: '56 beta|44 gamma|32' },
  trigrams: { 'zero alpha': '44 gamma|38' },
}]);
check('bigram order without prev2',
  tp.predict('', 3, { prev: 'alpha' })[0] === 'beta');
check('trigram context flips the order',
  tp.predict('', 3, { prev: 'alpha', prev2: 'zero' })[0] === 'gamma');
check('unknown prev2 keeps the bigram order',
  tp.predict('', 3, { prev: 'alpha', prev2: 'nope' })[0] === 'beta');
tp.clearTrigrams();
check('clearTrigrams reverts to bigrams',
  tp.predict('', 3, { prev: 'alpha', prev2: 'zero' })[0] === 'beta');

// Extension tier, synthetic: ext words are completion candidates but
// never typo hypotheses, and re-adding a core word does not duplicate.
const xp = new Predictor([{ id: 'xx', words: [['alpha', 100], ['beta', 90]], bigrams: {} }]);
xp.addWords('xx', [['alphorn', 5], ['alpha', 50]]);
check('ext word completes by prefix',
  xp.predict('alph', 3).includes('alphorn'), JSON.stringify(xp.predict('alph', 3)));
check('ext word skipped by the typo scan',
  !xp.predict('slpho', 5).includes('alphorn'), JSON.stringify(xp.predict('slpho', 5)));
check('re-added core word stays single',
  xp.entries.filter((e) => e.word === 'alpha').length === 1);

// Extension tier, real tables: the prediction-game coverage misses
// (prediction-game-analysis.md, cause A) must stay fixed.
const { WORDS_EXT: XEN } = await import('../words-ext-en.js');
const { WORDS_EXT: XCS } = await import('../words-ext-cs.js');
p.addWords('en', XEN);
p.addWords('cs', XCS);
const delib = p.predict('deliberat', 5);
check('ext en: deliberat completes to deliberately',
  delib.includes('deliberately'), JSON.stringify(delib));
const smoo = p.predict('smoo', 5);
check('ext en: smoo completes to smooth', smoo.includes('smooth'), JSON.stringify(smoo));
// Reachability, not rank: the core zaplat* inflection cluster fills a
// 5-wide strip, so zaplavat sits ~rank 12 today. Lifting it needs the
// ranking fix (prediction-game-analysis.md, cause C), not vocabulary.
const zapla = p.predict('zapla', 20,
  { prev: 'a', prev2: 'vykoupat', recent: ['se', 'šla', 'vykoupat', 'a'] });
check('ext cs: zapla reaches zaplavat',
  zapla.includes('zaplavat'), JSON.stringify(zapla));

process.exit(failures ? 1 : 0);
