# Word prediction research

Written 2026-08-24 by a research agent, in parallel with feature work.
This file is research only. No source files were changed for it.
All numbers marked "measured" come from a probe run against this repo's
real 3000-word vocabularies, with corpus downloads and a held-out test.
Read this before building the context-aware suggestion work
(handoff build order step 4).

## Summary

Next-word prediction is language modeling. The academic frontier is large
transformers, but no shipping keyboard runs one in the suggestion strip.
The strip must answer in about 20 ms per keystroke, on battery, offline.
So Gboard, Apple, and SwiftKey all run small on-device models there, and
they reserve large models for slow features (proofread, rewrite, replies).

For phonekeeb the same shape applies, one size smaller. The plan:

1. Fix the vocabulary bug first ("i" and "a" are missing, see below).
2. Ship bigram tables built from OpenSubtitles (about 37 KB gzipped per
   language). Empty prefix then yields next-word chips: "how" offers
   "do, you, much, are, about".
3. Add chained two-word chips ("how" also offers "are you").
4. Later: a lazy-loaded trigram layer (about 0.8 MB gzipped) for a
   further jump, a personal n-gram cache, and an offline eval harness.

Measured next-word hit@3 on held-out OpenSubtitles text, in-vocab targets:
today's data supports 12% (unigram only), bigrams reach 23%, trigrams 33%
(English; Czech is 1 to 3 points lower). Gboard's published offline
numbers for the same metric are 22% (n-gram) and 27% (their federated
LSTM), against a 164K vocabulary. The approach is sound at our scale.

## What the prototype does today

- `prediction.js` matches a prefix against the frequency-ordered word
  list and returns the first five hits (`prediction.js:27-38`).
- An empty prefix returns nothing (`prediction.js:28`). So the strip is
  blank exactly when next-word prediction has the most value.
- Suggestions refresh after every committed letter, and a tapped chip
  replaces the partial word and appends a space (`main.js:185-200`).
- The committed sentence lives in `typedText` in the same scope
  (`main.js:77`). Context is reachable today; nothing passes it to the
  predictor. The upgrade is contained in `prediction.js` plus one call
  site.

## What shipping keyboards use (2026)

### Google Gboard

- The core decoder is a finite-state transducer pipeline (spatial model,
  lexicon, language model), beam-searched, from speech recognition
  (Ouyang et al. 2017, arxiv.org/abs/1704.03987). The paper states the
  budget: visible feedback within about 20 ms, language models of 5 to
  10 MB, low-order n-grams over roughly a 64K to 164K word vocabulary.
- Next-word chips come from a CIFG-LSTM trained by federated learning:
  one layer, 670 units, embedding dim 96, 10K vocabulary, 1.4M
  parameters, 1.4 MB quantized (Hard et al. 2018,
  arxiv.org/abs/1811.03604).
- Since 2023 all these models train with differential privacy, and a
  2024 paper replaces the n-gram inside the decoder with a small neural
  LM (arxiv.org/abs/2410.15575). Still recurrent, still tiny.
- Large models sit elsewhere: Proofread ran server-side on PaLM2-XS
  (arxiv.org/abs/2406.04523), and the 2025 "AI Writing Tools" run on
  Gemini Nano on device. None of that powers the per-keystroke strip.

### Apple

- iOS 17 rebuilt autocorrect and inline predictions on an on-device
  transformer, run at every keystroke (Apple Newsroom, 2023-06-05).
  Reverse engineering found a GPT-2-style model: 6 decoder blocks,
  hidden size 512, about 34M parameters, 15K-token vocabulary
  (jackcook.com/2023/09/08/predictive-text.html).
- Third-party keyboards get none of it. The public APIs remain
  `UITextChecker` completions (prefix only, no context) and `UILexicon`
  (user shortcuts and contact names).
- iOS 26 ships the Foundation Models framework: a system-managed ~3B
  model at 2 bits per weight, about 30 tokens/s on an iPhone 15 Pro.
  The OS hosts the model, so it does not count against an extension's
  memory ceiling (Apple forums thread 795044). At least one shipping
  keyboard extension (jKey) already uses it for next-word prediction.
  Latency fits phrase-level chips, not per-keystroke ranking.

### Microsoft SwiftKey

- A static neural net and a dynamic n-gram user model run side by side
  and compete for each suggestion slot. The n-gram side carries the
  per-user learning; the neural side generalizes to unseen contexts.
- Two-word chips shipped as "Double-Word Prediction" in SwiftKey 6.0.
- Copilot features are a separate cloud call, not the prediction engine.

### The pattern

Every vendor splits the work the same way. Small model, tiny memory,
sub-20-ms answers for the strip. Big model, hundreds of ms, for optional
phrase-level features. 8pen and its successor 8VIM ship no prediction at
all, so any working context model is already a deliberate improvement
over the original.

## Options for phonekeeb, measured

Hit@3 = the correct next word is in the top 3, held-out OpenSubtitles
test, in-vocab targets only. EN / CS.

| Option | Ships as | Gzipped size | Hit@3 EN | Hit@3 CS | Verdict |
|---|---|---|---|---|---|
| Unigram only (today's data) | words-*.js | 0 added | 12.0% | 11.9% | No context |
| Bigram top-5 + unigram backoff | bigrams-*.js | ~37 KB EN, ~41 KB CS | 23.0% | 20.6% | Build now |
| + trigram top-3, context count >= 20 | trigrams-*.js, lazy | ~793 KB EN, ~547 KB CS | 33.0% | 29.6% | Build later, behind a flag |
| Personal n-gram cache with decay | localStorage | a few KB | not measured | not measured | Handoff step 4, after bigrams |
| Tiny custom LSTM (~0.5 MB int8) | CoreML / TF.js | ~500 KB | untested | untested | Only if tables plateau |
| Browser LLM (distilgpt2, int8) | ONNX | 85 MB | untested | untested | Skip, wrong tool |
| iOS 26 Foundation Models | OS-managed | 0 in-extension | untested | untested | Revisit at the iOS port |

Notes on the table:

- Today's UI scores 0 on this task, because an empty prefix shows no
  chips. The 12% row is what the existing unigram data could do if we
  showed the three most frequent words as chips.
- Expect live hit rates well below offline ones. Gboard published a
  factor of about 2 to 2.5 between offline recall and production clicks.
- Tables store words only, in rank order, no counts. Counts triple the
  size and add nothing for ranking a five-chip strip.
- A distilgpt2-class browser LLM is 2,300 times larger than the bigram
  table, needs ~150 ms per token, and still ranks words we can rank from
  a lookup. Neural only becomes interesting if the trigram ceiling
  (about 33%) proves too low, and then the right form is a from-scratch
  ~0.5 MB LSTM over our own vocabulary, not a pretrained LLM.

## Register matters: use OpenSubtitles, not web text

Two bigram sources were built and evaluated head to head on the same
subtitle test set:

- Norvig's `count_2w.txt` (Google Web Trillion Word corpus): hit@3 17.7%.
  Its chips read like web boilerplate: "how" leads to "to, do, the";
  "how are" ranks 17th; "nice" chains to "site map".
- OpenSubtitles 2018 (OPUS): hit@3 23.0%, a ~30% relative gain purely
  from register. Chips become conversational: "what are you",
  "good night", "thank you", "see you". Czech works the same way:
  "jak se", "dobrý den", "děkuji vám".

OpenSubtitles is also the corpus behind the existing `words-*.js` lists
(hermitdave/FrequencyWords), so one corpus and one attribution story
covers everything. Head coverage of our vocabularies: 99.9% EN, 100% CS.

Data routes checked for Czech: Google Books has no Czech; the Czech
National Corpus (SYN) is an academic-use license and ships shuffled
100-token blocks, not usable here; Leipzig has Czech but reports
inconsistent licenses (NC risk). OpenSubtitles wins.

Verified download URLs (mono corpus, one-pass local count is cheap):

- https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/en.txt.gz (3.4 GiB)
- https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/cs.txt.gz (1.2 GiB)
- Terms: attribution link to opensubtitles.org, same as the current lists.

A partial download (first 80 MB of each) already produced the tables and
numbers above, so the full corpus is optional for a first version.

## Vocabulary bug (fixed 2026-08-25)

Status: fixed. `tools/build-wordlists.py` now generates both lists from
the OPUS OpenSubtitles mono dump with the rules below. The committed
lists come from an 80 MB corpus sample; a full-dump rerun is still
open and only shifts tail ranks.

Both word lists were generated with a minimum word length of 2.

- `"i"` and `"a"` are missing from `words-en.js`. These are two of the
  most frequent English words. Every sentence that contains them loses
  prediction accuracy and completion coverage.
- The generation also split on apostrophes and dropped the pieces:
  the lists contain fragments like `didn`, `doesn`, `re`, `ll`, `ve`.
  The bigram data then learns "you" followed by "re".
- Fix in the regeneration filter: allow length 1, and keep apostrophes
  inside words so `don't` and `you're` are single vocabulary entries.
  The predictor key should strip apostrophes (next to the existing
  diacritics strip) so gesture-typed "dont" still matches "don't".

## Recommended build order

1. Regenerate `words-en.js` / `words-cs.js` with the filter fix above.
2. Add `tools/build-ngrams.py`: one streaming pass over the OpenSubtitles
   dump, lowercase, keep pairs where both words are in the vocabulary,
   prune to the top 5 successors per head, emit `bigrams-en.js` /
   `bigrams-cs.js` as `{head: [w1..w5]}` in rank order.
   *Done 2026-08-25, from an 80 MB sample of each dump; pairs need
   count >= 3 and clause punctuation breaks adjacency.*
3. Extend the predictor to `predict(prefix, prevWords, limit)`. Ranking:
   walk trigram list (when present), then bigram list, then unigram
   list; drop duplicates; filter by prefix. Empty prefix now returns
   next-word chips instead of nothing. The call site passes the last
   words parsed from `typedText`.
   *Done 2026-08-25 as `predict(prefix, limit, prevWord)`: the old
   argument order kept for existing callers. Unigram backoff always
   fills the strip, so even an empty text shows the top words.*
4. Two-word chips: for the top one or two candidates, chain the rank-1
   successor and render it as an extra chip ("are you" next to "are").
   A tap inserts both words. A wrong chain costs one strip slot, never a
   wrong insert.
5. Personal model (handoff step 4): seed it from the user's own chat
   exports, then learn from committed words. The full design lives in
   the "Personalization plan" section below.
6. Eval harness `tools/eval-prediction.mjs`: hit@1 / hit@3 on a held-out
   subtitle slice, run before and after each model change. This mirrors
   the industry metric and keeps changes honest.
7. Trigram layer when wanted: same build script, contexts with count
   >= 20, lazy-loaded after first paint, behind a flag.
   *Superseded 2026-08-25 by the scored-prediction design below: a
   words-only trigram table cannot rerank prefix completions. The
   trigram layer ships with counts, as that design's step 3.*

UX notes specific to this keyboard:

- A gesture letter costs more time than a tap letter, so an accepted
  next-word chip saves more here than on a normal keyboard. The strip
  after a space is the highest-value moment, and it is currently blank.
- The next-word distribution also predicts likely first letters. That
  can later feed the planned glide-target preview weighting
  (`features.md`, "Future hook").
- iOS port: `documentContextBeforeInput` provides the text before the
  cursor (~300 chars in practice), enough for trigram context. The
  tables are far under the 48 to 60 MB extension memory band. The
  Foundation Models route is worth one prototype spike, phrase-level
  only.

## Scored prediction design (added 2026-08-25, user-approved)

Motivating case, from live use: text "you are ", typed prefix "am".
The shipped bigram layer offers plain frequency order (am, american,
america, amazing, among). SwiftKey offers "amazing, am, an". The user
wants that quality. A probe against the EN sample
(tools/probe-context-scoring.py, on an 80 MB range download of the
dump) confirmed the design below reproduces it: scored order
amazing, among, an, and, am.

Three mechanisms, one score:

1. Context reranking. "amazing" is successor rank 141 of "you are"
   (count 34 of 32,089), so any pruned top-K successor list misses
   it. Flip the lookup direction: collect candidate words from the
   typed prefix (vocabulary scan, ~3000 words), then score each
   candidate by stored counts. Tables therefore need counts and full
   successor lists per context, not top 5.
2. Verbatim guarantee. The literal typed word stays reachable: if no
   exact-prefix word makes the strip on score, the best one takes the
   last slot. Matches the autocorrect-policy idea (visible, tappable
   corrections, never silent).
3. Typo hypotheses. Candidate generation also admits words whose
   beginning is within edit distance 1 of the prefix ("an" for "am").
   Each edit multiplies the score by a penalty. "an" after "you are"
   has count 236 (rank 16) and beats the penalty.

Score: stupid backoff (sources list, Brants 2007). P = trigram count
over context count when seen, else 0.4 x bigram P, else 0.16 x
unigram P; times 0.05 per edit. Both constants are tunable and must
be tuned by the eval harness, then recorded in features.md.

Costs, measured so far: "you are" alone has 978 successors with
count >= 3, so tables grow well past today's 37 KB gzipped. Levers:
per-context count floor, successor cap, 1-byte log-quantized counts
(five-chip ranking needs no precision). Real sizes measured at build
time; expected order: a few hundred KB gzipped for bigrams, 1 to 2 MB
for the lazy trigram layer. All far under the iOS memory cap.

Agreed build order, each step measurable:

1. Eval harness (build order step 6) first: hit@3 on held-out
   subtitles plus a typo-simulation eval, run before and after every
   model change. Mandatory now, because constants get tuned.
2. Bigrams with counts + the scoring predictor (candidate scan,
   backoff, edit-1 hypotheses, verbatim slot).
3. Trigram layer with counts, contexts count >= 20, lazy-loaded
   behind a flag.
4. Later refinement: gesture-aware edit costs (our typos are
   crossing-count slips and sector misses, not QWERTY neighbor taps);
   the personal model blends into the same score (plan below).

Step 1 is built (2026-08-25): `tools/eval-prediction.mjs`. The
conventions: every 100th line of the 80 MB dump prefix is held out
(build-ngrams.py now skips those lines), 4000 pairs per language are
sampled evenly across the prefix, chips cap at the strip's 5, and the
typo mode corrupts one of the two prefix letters with a seeded
substitution. Baselines of the shipped tables (they predate the split
and saw the eval lines in training; the next rebuild clears that
caveat):

| Mode | EN hit@1 | EN hit@3 | CS hit@1 | CS hit@3 |
|---|---|---|---|---|
| next-word (empty prefix) | 16.3% | 29.3% | 15.9% | 28.3% |
| prefix, 2 letters typed | 57.3% | 75.3% | 52.5% | 69.8% |
| typo, 1 edit in 2 letters | 0.0% | 0.0% | 0.0% | 0.0% |

The typo row is the scored design's target: exact-prefix matching
cannot recover a corrupted prefix, so any nonzero number there is new
capability. The next-word numbers sit above the earlier probe's 23.0%
hit@3 because the split and the pair rules differ; compare future runs
against this table, not against the probe.

## Scored predictor shipped, mixed en+cs (2026-08-26)

Steps 2 of the build order landed, plus a design the plan did not yet
have: one mixed English+Czech model with sentence-language awareness
(user request 2026-08-26: no language switching, Czech chips must not
intrude on English sentences and the reverse).

What shipped, in prediction.js:

- Stupid backoff over bigram tables v2 (build-ngrams.py): per head
  the total adjacency count plus the top 12 successors with pair
  counts, log-quantized at code = round(ln(c) x 8). Candidates come
  from the vocabulary scan, scores from the counts.
- One predictor holds both languages, counts normalized per language.
  A sentence-language posterior over the last 6 words (decay 0.65,
  per-word log-odds clamp 2.5, floor 0.05) scales each language's
  probabilities. The floor plus the prefix filter keep a genuinely
  typed cross-language word reachable.
- Typo hypotheses: candidates within one edit of the typed prefix
  (substitution, missing or extra letter) enter at a multiplier.
- Verbatim chip: the literal typed word takes the last slot when it
  earned none.
- Diacritics and apostrophe restoration need no new mechanism: the
  match-key fold plus scoring already rank "táta" first for a fully
  typed "tata", and "it's" first for "its" (the game log's miss).

Tuned by the harness (the design's constants were starting points):

- EDIT_PENALTY swept at 0.05 / 0.02 / 0.01 / 0.005 / 0: EN prefix-2
  hit@3 68.0 / 72.3 / 74.9 / 76.6 / 79.1, typo-2 hit@3 52.2 / 50.7 /
  49.3 / 47.3 / 0. Picked 0.005: exact typing is the common case and
  it still buys 47 points of typo recovery. The probe's 0.05 was too
  strong: giant unigrams entered as typo hypotheses and crowded true
  completions out of the top 3.
- BACKOFF 0.4 beat 0.3 and 0.2 on prefix-2 (76.6 vs 76.1 vs 75.1);
  next-word does not move.
- Table size: cap 24 / floor 3 gives 574+595 KB and ~2 more points of
  prefix-2 hit@3 than cap 12 / floor 4 at 301+310 KB. Shipped the
  small tables: no service worker means a 10-minute cache and repeat
  mobile downloads. The trigram layer is the better place to spend
  bytes (lazy, flagged).

Results on the rebuilt, holdout-clean tables (hit@1 / hit@3):

| Mode | EN single | CS single | EN mixed | CS mixed |
|---|---|---|---|---|
| next-word | 16.6 / 29.4 | 15.8 / 28.0 | 16.4 / 29.2 | 15.7 / 27.7 |
| prefix-2 | 59.1 / 74.3 | 54.7 / 70.2 | 59.1 / 74.1 | 54.2 / 69.9 |
| typo-2 | 28.1 / 44.6 | 26.2 / 40.7 | 27.7 / 44.4 | 25.6 / 39.9 |

Read: mixing two languages costs at most 0.3 points against the
single-language ceiling in every cell, so the posterior does its job;
prefix-2 hit@3 sits a point under the old concatenation baseline
because of the smaller tables and the typo admission (see the sweeps),
while typo-2 goes from impossible to ~40+ points. The old caveat about
tables trained on eval lines is cleared: these tables skip the holdout.

The eval harness gained mixed-en / mixed-cs rows (same pairs, mixed
predictor, the line's own words as language context) and per-pair
recent-word context; predict() now takes { prev, recent }.

## Trigram layer shipped (2026-08-26)

Step 3 of the build order: tools/build-trigrams.py (two passes so
memory stays flat), the trigram walk in prediction.js (stupid backoff
down trigram -> bigram -> unigram; the discount applies only when a
KNOWN context misses the word, so unloaded tables change nothing),
lazy loading after first paint behind the "Trigram data" toggle,
and mixed-…+tri rows in the harness (pairs now carry prev2).

Pruning swept on EN, mixed-model hit@1 / hit@3 next-word (no-trigram
baseline 16.4 / 29.2):

| Tier (ctx / top / triple) | Size | next-word | prefix-2 | typo-2 |
|---|---|---|---|---|
| 30 / 6 / 4 | 3832 KB | 23.8 / 39.6 | 64.1 / 76.5 | 37.1 / 54.2 |
| 60 / 6 / 4 | 2693 KB | 23.1 / 38.8 | 63.8 / 76.4 | 36.7 / 54.0 |
| 100 / 5 / 5 | 1725 KB | 22.3 / 37.6 | 62.5 / 75.6 | 35.4 / 52.2 |
| 200 / 4 / 6 | 886 KB | 21.4 / 36.3 | 61.2 / 75.0 | 34.1 / 50.7 |

Shipped 200 / 4 / 6 (886 KB en + 564 KB cs): ~70% of the full gain at
a quarter of the bytes, and with the 10-minute GitHub Pages cache and
no service worker, every visit past 10 minutes re-downloads the data.
Final shipped mixed numbers (hit@1 / hit@3):

| Mode | EN mixed+tri | CS mixed+tri |
|---|---|---|
| next-word | 21.2 / 36.1 | 19.2 / 33.0 |
| prefix-2 | 60.8 / 74.6 | 56.6 / 71.1 |
| typo-2 | 33.3 / 50.0 | 29.9 / 44.3 |

Quantization ties are the designed imprecision: "co se" holds děje
and stalo at the same code, so their mutual order is arbitrary
(~13% count steps; the flow test asserts top-2, not first place).

## Extension vocabulary shipped (2026-08-26)

The improvement list from the prediction game (see
prediction-game-analysis.md) put coverage first: deliberately,
zaplavat, and smooth were simply absent from the top-3000 lists.
words-ext-en.js / words-ext-cs.js extend the vocabulary to 20000 en /
40000 cs combined forms; Czech gets more because its inflection
spreads one lemma over many forms.

Design (tools/build-wordlists.py ext mode):

- Counted from a 400 MiB corpus prefix per language (~5x the core's
  80 MiB: the top 3000 is stable from 50M tokens, the tail is not).
- The core lists and every n-gram table stay byte-identical: ext
  words are unigram-only, never heads or successors.
- A tail word must be in its language's aspell dictionary
  (dump master | expand, lowercased). Deep subtitle ranks are full
  of transcription junk (iike, ofthe, we'ii) and misspellings;
  frequency alone stops being evidence of wordhood there. Fallbacks:
  en accepts clitic bases (driver's, this'll); cs accepts colloquial
  endings rewritten to standard (-uju -> -uji: gratuluju; -ej -> -ý:
  novej), because phone typing is colloquial and aspell cs is
  standard Czech only.
- Counts are rescaled by the ratio of the core words' counts in the
  big corpus to the shipped core counts (factor 4.96 en / 5.28 cs),
  so the predictor keeps the core sum as the one probability
  denominator for both tiers.
- Predictor.addWords() joins ext entries into the scan as completion
  candidates only. The typo (one-edit) branch skips them: a one-edit
  jump to a rare tail word is nearly always wrong, and skipping the
  expensive edit check keeps the 10x bigger scan cheap. The lists
  (93 KB en + 208 KB cs gzipped) lazy-load after first paint like
  the trigrams, not behind the data toggle.

Measured (80 MB held-out slice, strip of 5):

| | EN | CS |
|---|---|---|
| token coverage, core | 89.4% | 74.7% |
| token coverage, core+ext | 96.6% | 91.0% |

Displacement on the old core-vocab eval pairs is 0 to 0.1pp in every
mode (mixed+tri vs mixed+tri+ext): the added candidates cost the core
predictions nothing. On full-vocab pairs (tail targets now allowed
in) the rates read lower by construction, because the new targets are
rare words without n-gram support. These rows are the new baseline
for future model changes (hit@1 / hit@3):

| Mode | EN mixed+tri+ext | CS mixed+tri+ext |
|---|---|---|
| next-word | 18.1 / 31.3 | 14.2 / 24.1 |
| prefix-2 | 56.1 / 69.5 | 43.8 / 56.0 |
| typo-2 | 29.9 / 44.5 | 22.2 / 32.5 |

Game replay: 3/11 to 5/11 (deliberat and smoo hit at rank 1). zapla
still misses at strip width 5: zaplavat is reachable at rank 12, but
the core zaplat* inflection cluster outranks it. That case moved from
the coverage bucket to the ranking bucket (cause C in
prediction-game-analysis.md).

## Ranking fixes shipped (2026-08-27): typo cap, context discount, deeper bigrams

Causes B and C from prediction-game-analysis.md, plus the strip
growing to 6 chips in two rows (rank 1 bottom right). Three changes
in prediction.js and the tables, each swept on the eval harness:

- Typo slot cap (cause B): at most TYPO_SLOTS = 2 one-edit
  hypotheses on the strip while exact-prefix candidates exist;
  capped entries refill a strip that would otherwise come up short
  (a fully mistyped word has nothing else). Swept 1/2/3: one slot
  costs 4pp of typo-2 hit@3, three slots cost a real game hit.
- Context-miss discount (cause C): CTX_MISS = 0.15 replaces the
  classic 0.4 stupid-backoff multiplier when a KNOWN context lacks
  the candidate. The discount is cross-language: when any language
  knows the context, a language without it takes the discount too,
  else wrong-language unigram giants float up ("know" ranked first
  after Czech "si" because English has no "si" head to miss).
  Unloaded tables still discount nothing. Swept 0.4/0.15/0.08:
  0.15 wins next-word and typo rows, 0.4 wins only prefix-2.
- Deeper bigram tables: top 24 successors, pair floor 20, from the
  400 MiB corpus prefix (was 12/4 from 80 MiB). The sweep isolated
  the effects: the bigger corpus with a scaled floor (12/20) matches
  the shipped tables within 0.2pp everywhere, so the entire gain is
  successor depth. 18/20 gives half the gain for half the extra
  weight, no knee. 24/20 took it: prefix-2 hit@1 +3.7pp EN / +2.6pp
  CS, hit@3 +2.1pp both, typo-2 hit@3 +1.9pp EN, next-word flat
  (-0.2pp). Cost: 403 KB gzipped precached at first paint, against
  229 KB before.

Final mixed+tri rows (hit@1 / hit@3, strip of 6, core-vocab pairs):

| Mode | EN | CS |
|---|---|---|
| next-word | 21.4 / 36.4 | 19.3 / 33.4 |
| prefix-2 | 61.4 / 75.0 | 57.1 / 70.6 |
| typo-2 | 36.8 / 53.0 | 33.0 / 47.8 |

Game replay 6/11: case 1 (you are am -> amazing) enters at rank 6
via the cap; case 2 (how -> are) climbs rank 5 to 2 via successor
depth. Still missing: 4/6/7 are phrase-and-person tail ("future is
now", "I love", "I would": love sits ~rank 8 among "i" successors
even at depth 24, so no 6-slot static strip holds it; the
PersonalModel owns these after a few sightings). 9 is the zaplat*
morphology cluster; 10 (kuře) waits on the prefix-scaled language
floor (cause D), the one improvement from the game analysis still
open.

One UI bug found and fixed while verifying: feeding all ~54k ext
words into the predictor in one batch blocked the main thread long
enough to eat a stroke drawn during the load; the loader now feeds
4000-word chunks with a frame between slices.

## Personalization plan (added 2026-08-25)

Status 2026-08-26: Component A (learning while typing) is shipped —
PersonalModel in prediction.js, learning and controls in main.js,
locked by tests/personal-unit.mjs and the prediction-flow learning
loop. Implementation choices against this plan: λ = 0.3 instead of
0.25 (the user asked for their own phrases to rank very high;
held-out tuning waits for seeded data), out-of-vocabulary words
enroll after 2 sightings so one-off typos do not learn themselves,
and the store uses Maps internally so words like "constructor" stay
data. Component B (tools/build-personal.py seeding) is still open.

Goal: rank suggestions by how this user actually writes. Two
components, one model. A script seeds the model from exported chats
(component B), and the keyboard then updates the same model while
typing (component A). One blending rule serves both.

### The personal model

- One store holds unigram counts and bigram counts over the user's own
  messages, plus a `<s>` start-of-message token. The `<s>` bigrams
  predict the first word of a message, where the strip is blank today.
- Language-agnostic: one combined store, mixed Czech and English like
  the real messages. This matches the one-layout constraint in the
  research notes (no per-language switching in the end state).
- Personal vocabulary extends the static 3000: names and slang become
  suggestable, displayed with their real spelling.
- Storage: localStorage in the browser, roughly 200 to 400 KB of JSON.
  Never in the repo, never on GitHub Pages; the repo is public. A file
  import seeds the store; typing updates it; a button clears it.
- Blending at prediction time, per candidate:
  score = λ · P_personal + (1 − λ) · P_static, with λ near 0.25 and
  tuned on held-out personal data (see the eval below).

### Component B: the corpus script (tools/build-personal.py)

- Input: a local folder of raw exports plus `--me "Display Name"`
  (repeatable, names differ across apps). Output: one
  `personal-ngrams.json` with aggregate counts only, no raw text.
- Formats, auto-detected per file:
  - WhatsApp `.txt` (Android and iOS line variants, localized dates)
  - Telegram Desktop `result.json`
  - Facebook Messenger `message_*.json`, with the known latin-1
    mojibake fix applied
  - fallback: plain `.txt`, one message per line
- Only messages authored by `--me` count. System lines ("Media
  omitted"), URLs, and forwarded content are skipped. The script warns
  when a source matched suspiciously few own messages (wrong name).
- Tokenization: exactly the rules of tools/build-wordlists.py, moved
  into a shared tools/textnorm.py. The one-letter whitelist is the
  union of the en and cs sets.
- Pruning: unigrams with count >= 2, capped near 2000 new-word
  entries; bigrams with count >= 2, capped near 20k pairs.
- Built-in eval: split the user's messages 90/10 by time, then report
  next-word hit@3 for static-only against the blend, over
  λ in {0.1 .. 0.5}. The personalization gain is measured before any
  app work starts.
- Safety rails first: add `personal/` and `personal-ngrams.json` to
  `.gitignore` before the script exists, so an accidental
  `git add -A` can never publish personal data.

### Component A: learning while typing

- On each committed word, increment the word and the (previous, word)
  pair. Accepted chips count the same way.
- Decay by halving: when the personal token total passes about 50k,
  halve every count. Integers stay small, old habits fade, and the
  store stays bounded.
- Page controls: a "Learn from my typing" toggle (default on), an
  "Import personal data" file input, and a "Forget personal data"
  button. Import merges into the store; forget clears it.
- Persistence: write-behind to localStorage every ~20 commits. The
  store is per device; the same import file re-seeds another device.

### Order and dependencies

1. Extract tools/textnorm.py, add the gitignore rails, build
   tools/build-personal.py. Standalone: no app changes, testable on
   synthetic fixtures, then validated on the real exports.
2. The predictor context API with the static bigram tables (build
   order steps 2 and 3 above). Personal blending enters through the
   same predict(prefix, prevWords, limit) call.
3. App side: import UI, blend, online counting, the three controls.
4. The eval harness reports static against blended on both corpora
   after each change, so every step stays measurable.

Privacy summary: raw exports never leave the machine. The repo stores
no personal file. The JSON holds only word and word-pair counts. The
phone keeps them in browser storage, and "Forget" deletes them.

## Demo: measured top successors (OpenSubtitles tables)

```
how   : do, you, much, are, about       what  : are, do, you, is, the
thank : you, god, me, the, goodness     good  : night, morning, to, luck, for
see   : you, the, what, that, it        are   : you, we, the, they, not
jak   : se, to, je, dlouho, jsem        dobrý : den, večer, nápad, bože, člověk
děkuji: vám, pane, za, ti, že           co    : se, je, to, jsem, si
```

## Sources

- Gboard FST decoder and budgets: https://arxiv.org/abs/1704.03987
- Gboard federated LSTM and recall numbers: https://arxiv.org/abs/1811.03604
- Gboard DP language models: https://arxiv.org/abs/2305.18465
- Neural LM inside the Gboard decoder: https://arxiv.org/abs/2410.15575
- Gboard Proofread LLM: https://arxiv.org/abs/2406.04523
- Apple iOS 17 transformer teardown: https://jackcook.com/2023/09/08/predictive-text.html
- Apple Foundation Models (size, speed): https://machinelearning.apple.com/research/introducing-apple-foundation-models
- Foundation Models memory is system-managed: https://developer.apple.com/forums/thread/795044
- Keyboard extension limits (memory, full access): https://dev.to/tbds_2dadf2b626f315902eae/the-three-hard-constraints-of-an-ios-keyboard-extension-46af
- documentContextBeforeInput: https://developer.apple.com/documentation/uikit/uitextdocumentproxy/documentcontextbeforeinput
- SwiftKey neural + n-gram blend: https://www.engadget.com/2016-09-15-swiftkey-android-neural-network-update.html
- Stupid backoff: https://aclanthology.org/D07-1090.pdf
- KenLM structures: https://kheafield.com/code/kenlm/structures/
- SHARK2 gesture decoding: https://dl.acm.org/doi/10.1145/1029632.1029640
- Norvig n-gram data: https://norvig.com/ngrams/
- OPUS OpenSubtitles 2018: https://opus.nlpl.eu/legacy/OpenSubtitles-v2018.php
