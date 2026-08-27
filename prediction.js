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
const BACKOFF = 0.4; // stupid-backoff multiplier inside the personal model
const CTX_MISS = 0.15; // static-chain discount when a KNOWN context lacks
//   the word. Stronger than the classic 0.4: a stored successor list
//   that does not hold the word is real evidence against it, and 0.4
//   let context-free giants (what, kdo) outrank true continuations
//   (prediction-game-analysis.md, cause C). Swept 2026-08-26 against
//   the next-word eval rows.
const TYPO_SLOTS = 2; // strip slots one-edit hypotheses may take when
//   exact-prefix candidates exist; without the cap, giant words one
//   edit away (a, all, my for "am") crowd out real completions
//   (cause B). A fully mistyped word still fills the strip: capped
//   entries return when exact candidates run out.
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
const DECAY_DAYS = 30; // days between time sweeps. The token limit above
//   only fires for heavy typists; this one retires words that a light
//   typist stopped using, so "old" means old in time, not in keystrokes.
//   Repeated halving is exponential forgetting: a word you keep typing
//   is re-incremented and stays, one you dropped decays to nothing.
const MAX_SWEEPS = 24; // catch-up halvings after a long pause. 2^24 is
//   past every real count, so more sweeps could not change anything.
const PIN_COUNT = 3; // floor count a pinned word holds. Above
//   PERSONAL_MIN_COUNT on purpose, so pinning a brand-new word enrolls
//   it at once: pinning is also how the dictionary page adds a word.
const LOG_LIMIT = 500; // committed words kept for the history view.
//   Bounded because this is the one field that holds text rather than
//   counts, so it is the one that must not grow without a limit.
const DAY_MS = 86400000;

// Whole days since the epoch. UTC, so a day boundary can fall inside
// the user's evening. Only the decay sweep reads this, and sweeps 30
// days apart do not care which hour they land on; the history view
// groups by the local date of each timestamp instead.
export function dayNumber(now = Date.now()) {
  return Math.floor(now / DAY_MS);
}

// Are these two whole words within one edit? Substitution, insertion,
// deletion, and a swap of two neighbouring letters all count. The swap
// is in because it is the typo this check exists to catch: "teh" for
// "the" is a swap, and plain edit distance scores it as two edits and
// would miss it.
//
// withinOneEditPrefix below compares a typed prefix against a
// candidate; this compares two complete words, for the dictionary
// page's "looks like a typo of ..." check. It lives here beside its
// sibling and free of the DOM, so the Swift port finds both together.
export function withinOneEdit(a, b) {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.length - s.length > 1) return false;
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  if (i === s.length) return l.length === s.length + 1; // one char appended
  if (s.length === l.length) {
    let same = true;
    for (let j = i + 1; j < s.length; j++) if (s[j] !== l[j]) { same = false; break; }
    if (same) return true; // one substitution at i
    if (i + 1 < s.length && s[i] === l[i + 1] && s[i + 1] === l[i]) {
      for (let j = i + 2; j < s.length; j++) if (s[j] !== l[j]) return false;
      return true; // two neighbours swapped at i
    }
    return false;
  }
  for (let j = i; j < s.length; j++) if (s[j] !== l[j + 1]) return false;
  return true; // one char inserted into l at i
}

// A plain object, or an empty one. Every field of a stored model goes
// through this pair of helpers. The store is an import target now (the
// dictionary page accepts a JSON file), so a hand-edited or truncated
// file has to degrade to an empty model instead of throwing.
function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function countMap(obj) {
  const out = new Map();
  for (const [k, v] of Object.entries(asObject(obj))) {
    const n = Math.floor(Number(v));
    if (k && Number.isFinite(n) && n > 0) out.set(k, n);
  }
  return out;
}

function nestedCountMap(obj) {
  const out = new Map();
  for (const [k, v] of Object.entries(asObject(obj))) {
    const succ = countMap(v);
    if (k && succ.size) out.set(k, succ);
  }
  return out;
}

// The head that stands for "start of a message" in the personal
// bigrams: it predicts first words, where the strip is weakest. Not a
// typeable character, so it can never collide with a real word.
export const SENT_START = '\u0001';

// A context key folded to its match key, so a gesture-typed "dekuji"
// finds a stored "děkuji". SENT_START is not a word and folds to
// itself. A trigram context is two words joined by a space, and a
// learned word never holds one (the learn rule in main.js admits
// letters and apostrophes only), so the space is a safe seam to fold
// around, and it is also what tells the two levels apart by key alone.
function foldKey(key) {
  if (key === SENT_START) return key;
  const cut = key.indexOf(' ');
  if (cut < 0) return matchKey(key);
  return `${matchKey(key.slice(0, cut))} ${matchKey(key.slice(cut + 1))}`;
}

// The user's own counts, learned while typing and persisted by main.js
// (localStorage; UserDefaults on iOS). Pure and DOM-free like the
// Predictor; Maps inside so real words such as "constructor" can never
// collide with object prototypes.
//
// Past the counts the store also holds the user's decisions about them,
// which dictionary.html writes: a blocked list, a pinned list, and a
// bounded history of recent commits. The two lists exist because an
// edit to a count does not survive on its own. Delete a learned typo
// and typing it twice more brings it back, so blocking is what makes a
// deletion stick, and pinning is what makes a rare word stay.
export class PersonalModel {
  // data: the toJSON() shape at the end of this class, a v1 store
  // (counts only), or null/invalid for an empty model.
  constructor(data) {
    const d = data && (data.v === 1 || data.v === 2) ? data : null;
    this.uni = countMap(d?.uni);
    this.bi = nestedCountMap(d?.bi);
    // A v1 store has none of the fields below. They arrive empty, and
    // the model then behaves exactly as it did before the upgrade.
    this.tri = nestedCountMap(d?.tri);
    this.seen = countMap(d?.seen); // word -> day it was last learned
    this.blocked = new Set(Array.isArray(d?.blocked) ? d.blocked : []);
    this.pinned = new Set(Array.isArray(d?.pinned) ? d.pinned : []);
    this.log = (Array.isArray(d?.log) ? d.log : [])
      .filter((e) => Array.isArray(e) && typeof e[0] === 'string')
      .slice(-LOG_LIMIT);
    this.day = Number.isFinite(d?.day) ? d.day : dayNumber();
    this.version = 0; // bumped on every change; the Predictor watches it
    this.rebuildIndex();
  }

  rebuildIndex() {
    this.total = 0;
    for (const c of this.uni.values()) this.total += c;
    this.biTotals = new Map();
    this.headByKey = new Map();
    this.triTotals = new Map();
    this.ctxByKey = new Map();
    for (const [level, totals, index] of this.levels()) {
      for (const [key, succ] of level) {
        let t = 0;
        for (const c of succ.values()) t += c;
        totals.set(key, t);
        const fold = foldKey(key);
        if (!index.has(fold)) index.set(fold, key);
      }
    }
  }

  // The two successor levels, each with its totals and its folded
  // index. They differ only in the shape of the key, so every walk over
  // both goes through this rather than repeating itself.
  levels() {
    return [
      [this.bi, this.biTotals, this.headByKey],
      [this.tri, this.triTotals, this.ctxByKey],
    ];
  }

  // One committed word. ctx.prev is the word before it and ctx.prev2
  // the one before that (null when absent, both already lowercased);
  // ctx.atStart marks a word that opens a message or line, learned
  // under SENT_START. ctx.now is the injection point for the tests.
  learn(word, ctx = {}) {
    const { prev = null, prev2 = null, atStart = false, now = Date.now() } = ctx;
    if (this.blocked.has(word)) return; // a blocked word never comes back
    this.ageIfDue(now);
    this.uni.set(word, (this.uni.get(word) ?? 0) + 1);
    this.seen.set(word, dayNumber(now));
    this.total += 1;
    const head = atStart ? SENT_START : prev;
    if (head && !this.blocked.has(head)) this.addPair(this.bi, head, word);
    // A trigram context needs two real words, so SENT_START never leads
    // one: first words already have the bigram level under that token.
    if (prev && prev2 && !this.blocked.has(prev) && !this.blocked.has(prev2)) {
      this.addPair(this.tri, `${prev2} ${prev}`, word);
    }
    this.log.push([word, prev ?? '', now]);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
    if (this.total > DECAY_LIMIT) this.decay();
    this.version++;
  }

  // One successor count, plus the index entries that address it.
  addPair(level, key, word) {
    const [, totals, index] = this.levels().find(([l]) => l === level);
    let succ = level.get(key);
    if (!succ) level.set(key, (succ = new Map()));
    succ.set(word, (succ.get(word) ?? 0) + 1);
    totals.set(key, (totals.get(key) ?? 0) + 1);
    const fold = foldKey(key);
    if (!index.has(fold)) index.set(fold, key);
  }

  // Halve everything, drop what reaches zero: old habits fade and the
  // store stays bounded (word-prediction-research.md, personalization).
  decay() {
    this.halve();
    this.version++;
  }

  // A pinned word stops at its floor instead of fading. Pinning says
  // "keep this", and decay must not overrule the user.
  halve() {
    for (const [w, c] of this.uni) {
      const n = Math.max(c >> 1, this.pinned.has(w) ? PIN_COUNT : 0);
      if (n >= 1) this.uni.set(w, n);
      else { this.uni.delete(w); this.seen.delete(w); }
    }
    for (const [level] of this.levels()) {
      for (const [key, succ] of level) {
        for (const [w, c] of succ) {
          if (c >= 2) succ.set(w, c >> 1);
          else succ.delete(w);
        }
        if (!succ.size) level.delete(key);
      }
    }
    this.rebuildIndex();
  }

  // Time decay: one halving per DECAY_DAYS elapsed since the last
  // sweep. Called from learn() and from load, so the store also ages
  // while the keyboard sits unused, which the token limit cannot do.
  ageIfDue(now = Date.now()) {
    const today = dayNumber(now);
    let sweeps = 0;
    while (this.day + DECAY_DAYS <= today && sweeps < MAX_SWEEPS) {
      this.halve();
      this.day += DECAY_DAYS;
      sweeps++;
    }
    // A store from long ago, or one met by a clock moved backwards,
    // settles on today instead of sweeping again at the next call.
    if (this.day > today || this.day + DECAY_DAYS <= today) this.day = today;
    if (sweeps) this.version++;
  }

  // Stupid backoff inside the personal store: the trigram context, then
  // the start/previous-word bigram, then the unigram. Keys arrive
  // match-key folded; the levels index by their fold. A level that is
  // simply absent is not a miss, so with no prev2 the chain starts at
  // the bigram and scores exactly as it did before trigrams existed.
  prob(word, ctx = {}) {
    if (!this.total) return 0;
    const { prevKey = '', prev2Key = '', atStart = false } = ctx;
    let mult = 1;
    if (prevKey && prev2Key) {
      const c = this.ctxByKey.get(`${prev2Key} ${prevKey}`);
      if (c !== undefined) {
        const n = this.tri.get(c)?.get(word);
        if (n) return n / this.triTotals.get(c);
        mult = BACKOFF; // a known personal context that lacks the word
      }
    }
    const head = atStart ? SENT_START : (prevKey ? this.headByKey.get(prevKey) : undefined);
    if (head !== undefined) {
      const c = this.bi.get(head)?.get(word);
      if (c) return mult * (c / this.biTotals.get(head));
    }
    const u = this.uni.get(word);
    return u ? mult * BACKOFF * (u / this.total) : 0;
  }

  // --- Editing. Every method below exists for dictionary.html. ---

  // Remove a word and everything that mentions it. The history is
  // scrubbed too: a word still readable in the feed after a delete
  // looks like a delete that failed.
  forget(word) {
    this.uni.delete(word);
    this.seen.delete(word);
    this.pinned.delete(word);
    this.bi.delete(word);
    for (const ctx of [...this.tri.keys()]) {
      const cut = ctx.indexOf(' ');
      if (ctx.slice(0, cut) === word || ctx.slice(cut + 1) === word) this.tri.delete(ctx);
    }
    for (const [level] of this.levels()) {
      for (const succ of level.values()) succ.delete(word);
    }
    this.log = this.log.filter((e) => e[0] !== word && e[1] !== word);
    this.prune();
    this.version++;
  }

  // One successor pair, addressed by its stored key. A bigram head is a
  // single word and a trigram context is two words with a space between
  // them, so the key alone says which level owns it (see foldKey).
  forgetPair(key, word) {
    (key.includes(' ') ? this.tri : this.bi).get(key)?.delete(word);
    this.prune();
    this.version++;
  }

  prune() {
    for (const [level] of this.levels()) {
      for (const [key, succ] of level) if (!succ.size) level.delete(key);
    }
    this.rebuildIndex();
  }

  // Never suggest this word again, from any table, and never learn it.
  // This is what makes a delete permanent: a bare forget() is undone by
  // typing the word twice more.
  block(word) {
    this.forget(word);
    this.blocked.add(word);
    this.version++;
  }

  unblock(word) {
    this.blocked.delete(word);
    this.version++;
  }

  // Keep this word, and enroll it when it is new. Pinning a word the
  // user never typed is how the dictionary page adds one by hand.
  pin(word, now = Date.now()) {
    this.blocked.delete(word);
    this.pinned.add(word);
    if ((this.uni.get(word) ?? 0) < PIN_COUNT) this.setCount(word, PIN_COUNT, now);
    this.version++;
  }

  unpin(word) {
    this.pinned.delete(word);
    this.version++;
  }

  // The raw count edit behind the dictionary's Advanced section. A
  // count below one forgets the word, which is the only sane reading.
  setCount(word, n, now = Date.now()) {
    const c = Math.floor(Number(n));
    if (!Number.isFinite(c) || c < 1) { this.forget(word); return; }
    this.uni.set(word, c);
    if (!this.seen.has(word)) this.seen.set(word, dayNumber(now));
    this.total = 0;
    for (const v of this.uni.values()) this.total += v;
    this.version++;
  }

  clearLog() {
    this.log = [];
    this.version++;
  }

  // The header numbers on the dictionary page.
  stats() {
    let pairs = 0;
    for (const succ of this.bi.values()) pairs += succ.size;
    let triples = 0;
    for (const succ of this.tri.values()) triples += succ.size;
    return {
      words: this.uni.size, pairs, triples, tokens: this.total,
      blocked: this.blocked.size, pinned: this.pinned.size,
      events: this.log.length,
    };
  }

  toJSON() {
    const pack = (level) => {
      const out = {};
      for (const [key, succ] of level) out[key] = Object.fromEntries(succ);
      return out;
    };
    return {
      v: 2,
      day: this.day,
      uni: Object.fromEntries(this.uni),
      seen: Object.fromEntries(this.seen),
      bi: pack(this.bi),
      tri: pack(this.tri),
      blocked: [...this.blocked],
      pinned: [...this.pinned],
      log: this.log,
    };
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
      if (count >= PERSONAL_MIN_COUNT && !this.known.has(word)
        && !this.personal.blocked.has(word)) {
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
    const prev2Key = prev2 ? matchKey(prev2.toLowerCase()) : '';
    const ctx2 = prev2Key && prevKey ? `${prev2Key} ${prevKey}` : '';
    const succ2 = this.langs.map((l) => (ctx2 ? l.heads2.get(ctx2) : undefined));
    // The miss discount is cross-language: when ANY language knows the
    // context, a language without it takes CTX_MISS on that level too.
    // Otherwise the discount punishes only the language that has real
    // evidence, and wrong-language unigram giants float to the top
    // ("know" outranking every Czech word after "si"). Absent tables
    // (trigrams not loaded) still change nothing: then no language
    // knows the context and no discount applies.
    const biKnown = succ.some(Boolean);
    const triKnown = succ2.some(Boolean);
    this.syncPersonalEntries();
    const pers = this.personal?.total ? this.personal : null;
    const personalCtx = { prevKey, prev2Key, atStart: start };
    // Blocked words never surface, whichever table holds them: blocking
    // a corpus word is the only way to stop the static list offering
    // it, so this check cannot live inside the personal model. Read
    // from this.personal, not from pers: a store that holds nothing but
    // block decisions still has to enforce them.
    const blocked = this.personal?.blocked.size ? this.personal.blocked : null;

    const scored = [];
    for (const list of [this.entries, this.personalEntries]) {
      for (const e of list) {
        if (blocked?.has(e.word)) continue;
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
          const biLevel = succ[j]?.get(e.word)
            ?? (biKnown ? CTX_MISS : 1) * uni;
          base += lp * (succ2[j]?.get(e.word)
            ?? (triKnown ? CTX_MISS : 1) * biLevel);
        }
        // The personal model blends in language-free: the user's own
        // words are their language, so no prior scales them down.
        if (pers) {
          base = (1 - PERSONAL_WEIGHT) * base
            + PERSONAL_WEIGHT * pers.prob(e.word, personalCtx);
        }
        const score = mult * base;
        if (score > 0) scored.push([score, e.word, mult !== 1]);
      }
    }
    scored.sort((a, b) => b[0] - a[0]);
    // Assemble the strip with the typo cap: score order, but at most
    // TYPO_SLOTS one-edit entries. Capped entries queue up and return
    // when exact candidates cannot fill the strip (a fully mistyped
    // word has nothing else), slightly out of score order by design.
    const out = [];
    const capped = [];
    let typos = 0;
    for (const [, w, isTypo] of scored) {
      if (out.length >= limit) break;
      if (isTypo && typos >= TYPO_SLOTS) { capped.push(w); continue; }
      if (isTypo) typos++;
      out.push(w);
    }
    while (out.length < limit && capped.length) out.push(capped.shift());

    // Verbatim guarantee: the literal typed word takes the last slot
    // when it did not earn one, so an out-of-vocabulary word is always
    // acceptable as typed. Deliberately exempt from the block list: it
    // echoes what the user just typed rather than proposing anything,
    // and a blocked word would otherwise become hard to type at all.
    const typed = prefix.toLowerCase();
    if (typed.length >= 2 && !out.some((w) => w.toLowerCase() === typed)) {
      if (out.length >= limit) out.pop();
      out.push(prefix);
    }
    return out;
  }
}
