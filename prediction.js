// Scored word prediction over static frequency tables: the design in
// word-prediction-research.md ("Scored prediction design"). Candidates
// come from a linear scan of the merged vocabulary against the typed
// prefix (microseconds for ~6000 words, so no trie); their rank comes
// from a stupid-backoff score (Brants 2007), not from list order.
//
// The model is mixed-language by construction: one Predictor holds
// every language's table at once and there is no language switch,
// matching the one-layout constraint in the research notes. A
// sentence-language posterior over the recent words scales each
// language's probabilities, so mid-English-sentence Czech candidates
// sink instead of being forbidden.

// The gesture alphabet has no diacritics, so candidates match on a
// stripped key: typing "rek" can suggest "řekl", and a fully typed
// "tata" restores to "táta". The display keeps the real spelling.
export function stripDiacritics(word) {
  // ̀-ͯ = the combining diacritical marks NFD splits off.
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// The gesture alphabet has no apostrophe either, so typing "dont" must
// find "don't" and a fully typed "its" must offer "it's": match keys
// drop apostrophes on top of the diacritics strip.
export function matchKey(word) {
  return stripDiacritics(word).replace(/'/g, '');
}

// Tuned constants (features.md holds the words-and-numbers table).
const BACKOFF = 0.4; // stupid-backoff multiplier for a bigram miss
const EDIT_PENALTY = 0.005; // per-edit multiplier for typo hypotheses
const QUANT_K = 8; // count codes decode as exp(code / QUANT_K); keep in
//                    sync with tools/build-ngrams.py
const LANG_WINDOW = 6; // context words the language posterior reads
const LANG_DECAY = 0.65; // evidence weight per word further back
const LANG_CLAMP = 2.5; // max |log-odds| a single word contributes
const LANG_FLOOR = 0.05; // no language prior falls below this: a truly
//                          typed cross-language word must stay reachable
const OOV_P = 1e-7; // stand-in probability for a word a language lacks

// Is some prefix of key exactly one edit (substitution, or one char
// missing or extra in p) away from the typed prefix p? Exact prefixes
// are handled separately, so equality never reaches this.
function withinOneEditPrefix(key, p) {
  const n = p.length;
  if (key.length >= n) {
    let miss = 0;
    for (let i = 0; i < n && miss < 2; i++) if (key[i] !== p[i]) miss++;
    if (miss === 1) return true; // substitution
  }
  if (key.length >= n + 1) {
    let i = 0;
    while (i < n && key[i] === p[i]) i++;
    let ok = true; // p skipped key[i]
    for (let j = i; j < n; j++) if (key[j + 1] !== p[j]) { ok = false; break; }
    if (ok) return true;
  }
  if (key.length >= n - 1) {
    let i = 0;
    while (i < n - 1 && key[i] === p[i]) i++;
    let ok = true; // p has one extra char at i
    for (let j = i; j < n - 1; j++) if (key[j] !== p[j + 1]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

export class Predictor {
  // sources: [{ id, words, bigrams }] — words as [word, count] arrays
  // sorted by count descending, bigrams in the v2 string format of
  // tools/build-ngrams.py ("T succ|c ..."), optional.
  constructor(sources) {
    this.langs = [];
    const byWord = new Map(); // one entry per display word across languages
    for (const { id, words, bigrams = {} } of sources) {
      const sum = words.reduce((a, [, c]) => a + c, 0);
      const uniByKey = new Map(); // best P per match key, language evidence
      for (const [word, count] of words) {
        const p = count / sum;
        const key = matchKey(word);
        if (!uniByKey.has(key)) uniByKey.set(key, p); // frequency order: first is max
        let e = byWord.get(word);
        if (!e) byWord.set(word, (e = { word, key, p: {} }));
        e.p[id] = p;
      }
      // Successors as conditional probabilities, indexed by the head's
      // match key so a gesture-typed "dekuji" finds "děkuji". When two
      // heads share a key ("hell", "he'll"), the more frequent wins:
      // build-ngrams.py emits heads in frequency order.
      const heads = new Map();
      for (const [head, packed] of Object.entries(bigrams)) {
        const k = matchKey(head);
        if (heads.has(k)) continue;
        const parts = packed.split(' ');
        const total = Math.exp(Number(parts[0]) / QUANT_K);
        const succ = new Map();
        for (let i = 1; i < parts.length; i++) {
          const cut = parts[i].lastIndexOf('|');
          const c = Math.exp(Number(parts[i].slice(cut + 1)) / QUANT_K);
          succ.set(parts[i].slice(0, cut), Math.min(1, c / total));
        }
        heads.set(k, succ);
      }
      this.langs.push({ id, uniByKey, heads });
    }
    this.entries = [...byWord.values()];
  }

  // P(language | recent words), from unigram log-odds of the last few
  // words, nearest weighted most. Words all languages lack contribute
  // nothing (their logs cancel); the clamp keeps one word from
  // deciding alone; the floor keeps every language reachable.
  langPosterior(recent = []) {
    const scores = this.langs.map(() => 0);
    let weight = 1;
    let used = 0;
    for (let i = recent.length - 1; i >= 0 && used < LANG_WINDOW; i--) {
      const key = matchKey(recent[i].toLowerCase());
      if (!key) continue;
      used++;
      const logs = this.langs.map((l) => Math.log(l.uniByKey.get(key) ?? OOV_P));
      const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
      for (let j = 0; j < logs.length; j++) {
        scores[j] += weight * Math.max(-LANG_CLAMP, Math.min(LANG_CLAMP, logs[j] - mean));
      }
      weight *= LANG_DECAY;
    }
    const max = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    const norm = exps.map((e) => e / sum);
    // Floored languages keep exactly LANG_FLOOR; the rest scale down to
    // absorb it, so the final prior truly never dips below the floor.
    const low = norm.map((v) => v < LANG_FLOOR);
    const lowCount = low.filter(Boolean).length;
    const highSum = norm.reduce((a, v, j) => a + (low[j] ? 0 : v), 0);
    const scale = (1 - LANG_FLOOR * lowCount) / highSum;
    const prior = {};
    this.langs.forEach((l, j) => {
      prior[l.id] = low[j] ? LANG_FLOOR : norm[j] * scale;
    });
    return prior;
  }

  // Top suggestions for a typed prefix. context.prev is the word
  // directly before (empty when punctuation intervenes; it feeds the
  // bigram), context.recent the last words before the prefix, oldest
  // first (they feed the language posterior). A plain-string context
  // is accepted as the previous word, the pre-mixed calling shape.
  predict(prefix, limit = 5, context = {}) {
    if (typeof context === 'string') context = { prev: context, recent: [context] };
    const { prev = '', recent = [] } = context;
    const p = matchKey(prefix.toLowerCase());
    const prior = this.langPosterior(recent);
    const prevKey = prev ? matchKey(prev.toLowerCase()) : '';
    const succ = this.langs.map((l) => (prevKey ? l.heads.get(prevKey) : undefined));

    const scored = [];
    for (const e of this.entries) {
      let mult = 1;
      if (!e.key.startsWith(p)) {
        // Typo hypotheses: one edit inside the prefix, admitted at a
        // heavy discount. A 1-letter prefix is skipped: within one
        // edit it would match the whole vocabulary.
        if (p.length < 2 || !withinOneEditPrefix(e.key, p)) continue;
        mult = EDIT_PENALTY;
      }
      let base = 0;
      for (let j = 0; j < this.langs.length; j++) {
        const lp = prior[this.langs[j].id];
        const bi = succ[j]?.get(e.word);
        // Stupid backoff: the observed conditional when the pair is in
        // the table, else BACKOFF times the unigram probability.
        base += lp * (bi ?? BACKOFF * (e.p[this.langs[j].id] ?? 0));
      }
      const score = mult * base;
      if (score > 0) scored.push([score, e.word]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const out = scored.slice(0, limit).map(([, w]) => w);

    // Verbatim guarantee: the literal typed word takes the last slot
    // when it did not earn one, so an out-of-vocabulary word is always
    // acceptable as typed.
    const typed = prefix.toLowerCase();
    if (typed.length >= 2 && !out.some((w) => w.toLowerCase() === typed)) {
      if (out.length >= limit) out.pop();
      out.push(prefix);
    }
    return out;
  }
}
