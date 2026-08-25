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
3. Extend the predictor to `predict(prefix, prevWords, limit)`. Ranking:
   walk trigram list (when present), then bigram list, then unigram
   list; drop duplicates; filter by prefix. Empty prefix now returns
   next-word chips instead of nothing. The call site passes the last
   words parsed from `typedText`.
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

## Personalization plan (added 2026-08-25)

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
