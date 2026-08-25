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
  constructor(words) {
    this.entries = words.map(([word, count]) => ({
      word,
      key: matchKey(word),
      count,
    }));
  }

  // Top completions for a typed prefix, most frequent first. The typed
  // prefix is already diacritics-free (gesture alphabet), lowercase.
  predict(prefix, limit = 5) {
    if (!prefix) return [];
    const p = prefix.toLowerCase();
    const out = [];
    for (const e of this.entries) {
      if (e.key.startsWith(p)) {
        out.push(e.word);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}
