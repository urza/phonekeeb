// Scored word prediction over static frequency tables: the design in
// word-prediction-research.md ("Scored prediction design"). Candidates
// come from a linear scan of the merged vocabulary against the typed
// prefix (microseconds for the ~6000 core words, so no trie); their
// rank comes from a stupid-backoff score (Brants 2007), not from list
// order. The extension tier (addWords) grows the scan tenfold, but ext
// entries take only the cheap startsWith test: the expensive one-edit
// branch stays core-only.
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
const PERSONAL_WEIGHT = 0.3; // λ: the personal model's share of the score.
//   The user's own phrases must rank very high (request 2026-08-26);
//   a small personal store makes its probabilities large, so 0.3
//   already lets a twice-typed phrase beat any corpus word.
const PERSONAL_MIN_COUNT = 2; // sightings before an out-of-vocabulary
//   word becomes a candidate; below that only the verbatim chip
//   offers it, so one-off typos do not enroll themselves
const DECAY_LIMIT = 50000; // learned tokens before all counts halve,
//   so old habits fade and the store stays bounded

// The head that stands for "start of a message" in the personal
// bigrams: it predicts first words, where the strip is weakest. Not a
// typeable character, so it can never collide with a real word.
export const SENT_START = '\u0001';

// The user's own unigram+bigram counts, learned while typing and
// persisted by main.js (localStorage; UserDefaults on iOS). Pure and
// DOM-free like the Predictor; Maps inside so real words such as
// "constructor" can never collide with object prototypes.
export class PersonalModel {
  // data: the toJSON() shape { v: 1, uni: {w: c}, bi: {head: {w: c}} },
  // or null/invalid for an empty model.
  constructor(data) {
    const ok = data && data.v === 1
      && typeof data.uni === 'object' && typeof data.bi === 'object';
    this.uni = new Map(ok ? Object.entries(data.uni) : []);
    this.bi = new Map();
    if (ok) {
      for (const [h, succ] of Object.entries(data.bi)) {
        this.bi.set(h, new Map(Object.entries(succ)));
      }
    }
    this.version = 0; // bumped on every change; the Predictor watches it
    this.rebuildIndex();
  }

  rebuildIndex() {
    this.total = 0;
    for (const c of this.uni.values()) this.total += c;
    this.biTotals = new Map();
    this.headByKey = new Map();
    for (const [h, succ] of this.bi) {
      let t = 0;
      for (const c of succ.values()) t += c;
      this.biTotals.set(h, t);
      const k = h === SENT_START ? h : matchKey(h);
      if (!this.headByKey.has(k)) this.headByKey.set(k, h);
    }
  }

  // One committed word. prev: the word before it (null when none),
  // atStart: the word opens a message/line, learned under SENT_START.
  learn(word, prev, atStart) {
    this.uni.set(word, (this.uni.get(word) ?? 0) + 1);
    this.total += 1;
    const head = atStart ? SENT_START : prev;
    if (head) {
      let succ = this.bi.get(head);
      if (!succ) this.bi.set(head, (succ = new Map()));
      succ.set(word, (succ.get(word) ?? 0) + 1);
      this.biTotals.set(head, (this.biTotals.get(head) ?? 0) + 1);
      const k = head === SENT_START ? head : matchKey(head);
      if (!this.headByKey.has(k)) this.headByKey.set(k, head);
    }
    if (this.total > DECAY_LIMIT) this.decay();
    this.version++;
  }

  // Halve everything, drop what reaches zero: old habits fade and the
  // store stays bounded (word-prediction-research.md, personalization).
  decay() {
    for (const [w, c] of this.uni) {
      if (c >= 2) this.uni.set(w, c >> 1);
      else this.uni.delete(w);
    }
    for (const [h, succ] of this.bi) {
      for (const [w, c] of succ) {
        if (c >= 2) succ.set(w, c >> 1);
        else succ.delete(w);
      }
      if (!succ.size) this.bi.delete(h);
    }
    this.rebuildIndex();
  }

  // Stupid backoff inside the personal store: the start/previous-word
  // conditional when seen, else BACKOFF times the personal unigram.
  // prevKey arrives match-key folded; heads index by their fold.
  prob(word, prevKey, atStart) {
    if (!this.total) return 0;
    const head = atStart ? SENT_START : (prevKey ? this.headByKey.get(prevKey) : undefined);
    if (head !== undefined) {
      const c = this.bi.get(head)?.get(word);
      if (c) return c / this.biTotals.get(head);
    }
    const u = this.uni.get(word);
    return u ? BACKOFF * (u / this.total) : 0;
  }

  toJSON() {
    const bi = {};
    for (const [h, succ] of this.bi) bi[h] = Object.fromEntries(succ);
    return { v: 1, uni: Object.fromEntries(this.uni), bi };
  }
}

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

// Decode one packed successor table entry ("T succ|c succ|c ...")
// into a Map of conditional probabilities. Shared by the bigram and
// trigram tables; both quantize with QUANT_K.
function decodeSuccessors(packed) {
  const parts = packed.split(' ');
  const total = Math.exp(Number(parts[0]) / QUANT_K);
  const succ = new Map();
  for (let i = 1; i < parts.length; i++) {
    const cut = parts[i].lastIndexOf('|');
    const c = Math.exp(Number(parts[i].slice(cut + 1)) / QUANT_K);
    succ.set(parts[i].slice(0, cut), Math.min(1, c / total));
  }
  return succ;
}

export class Predictor {
  // sources: [{ id, words, bigrams, trigrams }] — words as
  // [word, count] arrays sorted by count descending, bigrams and
  // trigrams in the packed string formats of tools/build-ngrams.py
  // and tools/build-trigrams.py; both optional (trigrams usually
  // arrive later via setTrigrams, lazy-loaded).
  constructor(sources) {
    this.langs = [];
    const byWord = new Map(); // one entry per display word across languages
    for (const { id, words, bigrams = {}, trigrams = null } of sources) {
      // The core list's count sum is the probability denominator for
      // both tiers: ext counts arrive rescaled to this scale.
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
        if (!heads.has(k)) heads.set(k, decodeSuccessors(packed));
      }
      const lang = { id, sum, uniByKey, heads, heads2: new Map() };
      this.langs.push(lang);
      if (trigrams) this.setTrigrams(id, trigrams);
    }
    this.byWord = byWord;
    this.entries = [...byWord.values()];
    this.known = new Set(byWord.keys());
    this.personal = null;
    this.personalEntries = [];
    this.personalVersion = -1;
  }

  // Attach a language's trigram table ("w1 w2" contexts in the packed
  // format of tools/build-trigrams.py). Kept separate from the
  // constructor so the page can lazy-load the big tables after first
  // paint; predictions before that simply back off to bigrams.
  setTrigrams(id, trigrams) {
    const lang = this.langs.find((l) => l.id === id);
    if (!lang) return;
    for (const [ctx, packed] of Object.entries(trigrams)) {
      const cut = ctx.indexOf(' ');
      const k = `${matchKey(ctx.slice(0, cut))} ${matchKey(ctx.slice(cut + 1))}`;
      if (!lang.heads2.has(k)) lang.heads2.set(k, decodeSuccessors(packed));
    }
  }

  // Attach a language's extension vocabulary (words-ext-*.js): tail
  // words with unigram counts only, lazy-loaded after first paint.
  // Counts arrive rescaled to the core list's corpus scale, so the
  // core sum stays the denominator. Ext entries are completion
  // candidates only; the typo scan skips them (a one-edit jump to a
  // rare tail word is nearly always wrong, and the edit check is the
  // expensive branch of the per-keystroke scan).
  addWords(id, words) {
    const lang = this.langs.find((l) => l.id === id);
    if (!lang) return;
    for (const [word, count] of words) {
      const p = count / lang.sum;
      const key = matchKey(word);
      if (!lang.uniByKey.has(key)) lang.uniByKey.set(key, p);
      let e = this.byWord.get(word);
      if (!e) {
        this.byWord.set(word, (e = { word, key, p: {}, ext: true }));
        this.entries.push(e);
        this.known.add(word);
      }
      if (!(id in e.p)) e.p[id] = p;
    }
    // Words the personal model enrolled may now be known: rebuild its
    // candidate entries so the scan never holds a word twice.
    this.personalVersion = -1;
  }

  // Drop all trigram tables (the data-saving toggle): predictions
  // back off to bigrams immediately.
  clearTrigrams() {
    for (const lang of this.langs) lang.heads2 = new Map();
  }

  // Attach the user's PersonalModel. Its probabilities blend into
  // every candidate's score, and its repeated out-of-vocabulary words
  // become candidates of their own.
  setPersonal(model) {
    this.personal = model;
    this.personalVersion = -1;
  }

  // Candidate entries for learned words the static tables lack, rebuilt
  // only when the model changed (at most once per committed word).
  syncPersonalEntries() {
    if (!this.personal || this.personal.version === this.personalVersion) return;
    this.personalVersion = this.personal.version;
    this.personalEntries = [];
    for (const [word, count] of this.personal.uni) {
      if (count >= PERSONAL_MIN_COUNT && !this.known.has(word)) {
        this.personalEntries.push({ word, key: matchKey(word), p: {} });
      }
    }
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
  // first (they feed the language posterior), context.start true when
  // the prefix opens a message or line (it feeds the personal model's
  // SENT_START bigrams). A plain-string context is accepted as the
  // previous word, the pre-mixed calling shape.
  predict(prefix, limit = 5, context = {}) {
    if (typeof context === 'string') context = { prev: context, recent: [context] };
    const { prev = '', prev2 = '', recent = [], start = false } = context;
    const p = matchKey(prefix.toLowerCase());
    const prior = this.langPosterior(recent);
    const prevKey = prev ? matchKey(prev.toLowerCase()) : '';
    const succ = this.langs.map((l) => (prevKey ? l.heads.get(prevKey) : undefined));
    // context.prev2 is the word before prev, set only when the three
    // are separated by spaces alone; it addresses the trigram tables.
    const ctx2 = prev2 && prevKey ? `${matchKey(prev2.toLowerCase())} ${prevKey}` : '';
    const succ2 = this.langs.map((l) => (ctx2 ? l.heads2.get(ctx2) : undefined));
    this.syncPersonalEntries();
    const pers = this.personal?.total ? this.personal : null;

    const scored = [];
    for (const list of [this.entries, this.personalEntries]) {
      for (const e of list) {
        let mult = 1;
        if (!e.key.startsWith(p)) {
          // Typo hypotheses: one edit inside the prefix, admitted at a
          // heavy discount. A 1-letter prefix is skipped: within one
          // edit it would match the whole vocabulary. Ext entries are
          // skipped too (see addWords).
          if (p.length < 2 || e.ext || !withinOneEditPrefix(e.key, p)) continue;
          mult = EDIT_PENALTY;
        }
        let base = 0;
        for (let j = 0; j < this.langs.length; j++) {
          const lp = prior[this.langs[j].id];
          // Stupid backoff down the chain. The discount applies only
          // when a KNOWN context misses the word; an unknown context
          // starts at the next level undiscounted, so absent tables
          // (trigrams not loaded yet) change nothing.
          const uni = e.p[this.langs[j].id] ?? 0;
          const biLevel = succ[j] ? (succ[j].get(e.word) ?? BACKOFF * uni) : uni;
          base += lp * (succ2[j]
            ? (succ2[j].get(e.word) ?? BACKOFF * biLevel) : biLevel);
        }
        // The personal model blends in language-free: the user's own
        // words are their language, so no prior scales them down.
        if (pers) {
          base = (1 - PERSONAL_WEIGHT) * base
            + PERSONAL_WEIGHT * pers.prob(e.word, prevKey, start);
        }
        const score = mult * base;
        if (score > 0) scored.push([score, e.word]);
      }
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
