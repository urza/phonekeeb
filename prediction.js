// Word prediction over a static frequency list: step 3 of the build order
// in gesture-keyboard-handoff.md. A linear scan over ~3000
// frequency-sorted words is microseconds per keystroke, so no trie yet;
// the trie plus beam search arrives with the fuzzy-matching stage, where
// prefix ambiguity makes it earn its complexity.

// The gesture alphabet has no diacritics yet, so candidates match on a
// stripped key: typing "rek" can suggest "řekl". The display keeps the
// real spelling.
export function stripDiacritics(word) {
  // ̀-ͯ = the combining diacritical marks NFD splits off.
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// The gesture alphabet has no apostrophe either, so typing "dont" must
// find "don't": match keys drop apostrophes on top of the diacritics
// strip. The display keeps the real spelling.
export function matchKey(word) {
  return stripDiacritics(word).replace(/'/g, '');
}

export class Predictor {
  // words: array of [word, count], sorted by count descending.
  // bigrams: {head: [successor..]} in rank order (tools/build-ngrams.py).
  constructor(words, bigrams = {}) {
    this.entries = words.map(([word, count]) => ({
      word,
      key: matchKey(word),
      count,
    }));
    // Successors indexed by the head's match key, so a gesture-typed
    // previous word ("dekuji") finds its accented head ("děkuji").
    // When two heads share a key ("hell", "he'll"), the more frequent
    // one wins: build-ngrams.py emits heads in frequency order.
    this.nextByKey = new Map();
    for (const [head, succs] of Object.entries(bigrams)) {
      const k = matchKey(head);
      if (!this.nextByKey.has(k)) this.nextByKey.set(k, succs);
    }
  }

  // Top suggestions for a typed prefix, given the word before it.
  // Ranking (word-prediction-research.md, build order step 3): bigram
  // successors of prevWord first, filtered by the prefix, then unigram
  // completions fill the rest; duplicates dropped. An empty prefix
  // matches every successor, so the strip shows next-word chips right
  // after a space instead of going blank.
  predict(prefix, limit = 5, prevWord = '') {
    const p = matchKey(prefix.toLowerCase());
    const out = [];
    const push = (w) => { if (!out.includes(w)) out.push(w); };
    if (prevWord) {
      const succs = this.nextByKey.get(matchKey(prevWord.toLowerCase())) ?? [];
      for (const w of succs) {
        if (out.length >= limit) break;
        if (matchKey(w).startsWith(p)) push(w);
      }
    }
    for (const e of this.entries) {
      if (out.length >= limit) break;
      if (e.key.startsWith(p)) push(e.word);
    }
    return out;
  }
}
