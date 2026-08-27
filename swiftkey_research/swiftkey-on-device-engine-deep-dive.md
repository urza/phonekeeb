# SwiftKey on-device engine: deep dive + how to recreate it

Researched: 2026-08-27 (follow-up to `swiftkey-prediction-research.md`)
Question: how does the on-device model actually work, and how can I rebuild
something like it in my own phone keyboard?

## 1. Short answer

- Yes, SwiftKey runs a neural network language model on the phone (since late
  2013/alpha 2015), GPU-accelerated with a CPU fallback. Its job is the
  language-model part: given the words typed so far, score the next word.
- But the engine is NOT "one small NN". It is a pipeline with at least four
  probabilistic components (documented in TouchType's patents):
  1. **Touch/input model** ("KeyPressVector"): each keypress becomes a
     probability distribution over the characters you probably meant.
  2. **Candidate generator**: a constrained probabilistic graph (PCSG/EPCSG)
     over the in-progress word, handling missing/extra/wrong characters and
     inferred word boundaries.
  3. **Context language model**: an n-gram model (trigram in the patent
     examples) over committed context, later augmented by the neural model.
  4. **Personalization layer**: on-device model updated from your typing.
  Final score for a candidate = (input-model probability) x (context LM
  probability), with graph pruning by a probability-ratio threshold.
- The exact neural architecture (RNN vs transformer, sizes, tokenizer) is not
  public. Treat "word embeddings + on-device NN LM" as company-claimed.
- Everything you need to recreate a 90%-of-SwiftKey experience exists in
  open form: AOSP LatinIME (the engine behind the stock Android keyboard and
  HeliBoard) implements the personal-dictionary + n-gram-context +
  forgetting-curve part in public source.

## 2. SwiftKey's engine, from primary sources

### 2.1 Patent family (TouchType Ltd -> Microsoft, 2009-2023)

The patent list for assignee "Touchtype" (Google Patents, 2026-08):

| Patent | Date | Title | What it covers |
|---|---|---|---|
| PCT/GB2010/000622 (US 9189472B2 + family) | 2010/2015 | System and method for inputting text into small screen devices | **KeyPressVector**: character-level input model. Touch data -> distribution over intended characters per position |
| PCT/GB2011/001419 (US 9424246B2, US10073829B2, US10146765B2, US10191654B2, US10445424B2, US10402493B2, US10706230B2) | 2011-2019 | System and method for inputting text into electronic devices | Core engine: **n-gram LM + KeyPressVector** word prediction and correction |
| PCT/GB2013/050182 (US 10037319B2; app US20140351741A1; inventors Medlock, Osborne) | 2013/2018 | User input prediction | **Multi-term prediction + term-boundary inference** (see 2.2) |
| US 10671182B2 (inventors Aley, Orr, Nixon) | 2015/2020 | Text prediction integration | Whole-field prediction: per-term probability distributions sent to apps to filter/rank contacts, messages, songs. Domain vocabularies can be passed into the engine. Optional server-side variant |
| US 10613746B2 (Medlock) | 2012/2020 | System and method for inputting text | **Swipe/gesture input**: prefix tree with cumulative path probabilities |
| US 10664657B2, US 11720744B2, US 10372310B2 | 2020-2023 | Inputting images/labels | Emoji/image input + suppression |

Key mechanism, in detail (from US 2014/0351741 A1, "User input prediction"):

1. **Input sequence generator** splits the screen text into:
   - *context sequence*: committed words (fixed).
   - *input sequence*: the word being typed, as a **probabilistic string** -
     a sequence of character sets, each with a probability distribution
     (e.g. pressed key 'h' -> {h:0.8, n:0.1, t:0.1, ...}).
2. **Candidate generator** builds a **PCSG** (probabilistic constrained
   sequence graph): a DAG, one node per possible character at each position,
   edge weight = character probability, all paths same length.
3. The PCSG is extended to an **EPCSG** with extra structures:
   - null nodes (user accidentally hit a key -> delete),
   - wildcard nodes (user omitted a character -> insert any char),
   - term-boundary nodes (optional space between any two characters) - this is
     how "calkmebac" becomes "call me back" and why the keyboard can do
     without a space bar.
4. **Pruning + context scoring**: the context LM (trigram in the example)
   gives P(context | candidate terms); paths whose probability ratio to the
   best path falls below a threshold are pruned. Candidate score =
   input-model path probability x context-LM probability. Trigram lookups are
   cached and reused across candidates.
5. **Target-sequence prior**: smoothed unigram LM + character Markov chain,
   used to approximate normalization and score unknown sequences.
6. The context model can also branch over **orthographic/lexical variations**
   (e.g. "the user may have wrongly accepted 'in' instead of 'on'"), with
   branch weights from the model itself.

The US 10671182 B2 patent adds the **whole-field** view: the engine generates
a probability distribution per term over the entire input field, optionally
factored (unigram, bigram) or as top-n full sequences, and passes it to the
host app. The app can push its own vocabulary (contacts, song titles,
phrases) into the engine. Example from the patent: typing "mire then a
feeli" yields candidates {mire .5, more .5} {then .4, than .4, the .2}
{feeling .5, feels .4, feeli .1}, which the music app matches against "more
than a feeling".

### 2.2 The neural part (company claims, Oct 2015)

Sources: SwiftKey blog "Introducing the world's first neural network
keyboard" (2015-10-08) and CTO Ben Medlock's Medium post of the same day
("Why Turing's legacy demands a smarter keyboard").

- Work started in earnest **late 2013**.
- The engine's 2010-era core was word-sequence **n-gram** technology
  ("a sophisticated form of word frequency counting"), used on 1B+ devices.
  Known limit (SwiftKey's words): cannot predict words never seen in the same
  word sequence, no word meaning.
- The neural model "meaningfully captures the relationship between words":
  words are organized into **clusters** at varying proximity - i.e. a trained
  **word-embedding / vector-space** representation inside the LM.
- It generalizes: trained on "Let's meet at the airport", it predicts
  "office"/"hotel" in new contexts.
- Input = "what you've just typed", output = "your most likely next word".
- **Runs locally on the phone**; inference on the phone **GPU**, with the
  same code runnable on CPU when no GPU is available. (In 2015 NN language
  models were normally server-only.)
- No public detail on topology (RNN/LSTM/transformer), parameter count,
  vocab, or training data. Assume "small NN LM with word embeddings", not
  more.
- 2026 third-party writeups (SwiftKey2HeliBoard migration guide) still
  describe current SwiftKey as having a "neural model", consistent with the
  NN engine remaining in the product post-acquisition.

### 2.3 Personalization (what it "learns")

- On-device **dynamic/personal language model**, updated as you type
  (words, phrases, emoji, style). By default all personal data stays local;
  never transferred without an opt-in account (Microsoft privacy page).
- 2011-2013: cloud personalization service analyzed your Gmail/Twitter/FB/SMS
  typing. A 2016 cloud-sync bug leaked emails/phone numbers as suggestion
  words to other users; SwiftKey disabled cloud word-suggestion sync.
- Guardrails: never learns from password fields, doesn't retain long numbers.
- The 2012 SwiftKey SDK exposed the "core language engine" to third parties -
  the same probabilistic engine described above.

## 3. What the academic literature says (numbers to plan against)

- **Op-Ngram** (Samsung, IEEE ICSC 2019; arXiv 2101.03967): an end-to-end
  n-gram pipeline for mobile soft keyboards (word completion + next-word
  prediction). Uses **stupid backoff + pruning** for a light model. Results
  vs a SORTED-array BerkeleyLM on mobile: -37% model ROM, -76% model RAM,
  -88% load time, -89% average suggestion time; also faster than KenLM in
  their setup. Takeaway: on modern phones, a well-engineered n-gram is
  already fast enough for real-time suggestions; the value of a neural model
  is accuracy (context/semantics), not raw speed.
- **Adhikary & Vertanen, Interspeech 2023** ("Language Model Personalization
  for Improved Touchscreen Typing"): personalizes LMs with (a) PPM
  (prediction by partial match) n-grams and (b) RNN LMs, using the Enron
  personalization dataset (OSF: osf.io/45p3j). On simulated noisy typing of
  44 users, the best model gave **+9.9% relative keystroke savings** and
  **-36% relative word error rate** vs a static background LM. Takeaway:
  personalization on top of a solid base LM is where most of the SwiftKey
  magic comes from; a personal n-gram/PPM model is a practical, fast way to
  get a large part of it.
- **Yin, Ouyang, Partridge, Zhai (CHI 2013)**: adaptive touchscreen keyboards
  via a **hierarchical spatial backoff** touch-error model (individual user
  -> hand posture -> global). Useful design pattern for the input model.

## 4. Open reference implementation: AOSP LatinIME (HeliBoard)

AOSP's stock Latin keyboard engine (carried on by HeliBoard, GPL/Apache)
implements the personalization + n-gram-context parts in public. Key pieces
in the HeliBoard repo (github.com/HeliBorg/HeliBoard):

- `app/src/main/java/helium314/keyboard/latin/NgramContext.java` +
  `app/src/main/jni/src/dictionary/property/ngram_context.*`: candidates are
  scored against the last N committed words. The shipped AOSP dictionary
  files contain per-word **n-gram context scores** (unigram/bigram/trigram
  probabilities), so even the stock keyboard does local n-gram ranking.
- `app/src/main/java/helium314/keyboard/latin/personalization/UserHistoryDictionary.java`:
  the on-device learning. An expandable binary dictionary per locale that
  "locally gathers statistics about the words user types and various other
  signals like auto-correction cancellation or manual picks". Learning call:
  `addToDictionary(dict, ngramContext, word, isValid, count, timestamp)` -
  i.e. on every committed/corrected word it stores the word, the context
  n-gram, whether it was valid, and a timestamp.
- Dictionary header flags used: `USES_FORGETTING_CURVE` (old entries decay)
  and `HAS_HISTORICAL_INFO` (per-word history). This is the concrete design
  of "learn from your typing, keep it fresh, keep it small".
- `personalization/PersonalizationHelper.java`: per-locale cached instance,
  plus a "remove all user history" path (privacy control).
- `makedict/`: tools to build the binary dictionary format.

If you fork HeliBoard (or AOSP LatinIME), the personalization loop, the
n-gram context ranking, and the dictionary format are already there. What
you would be adding is: better personal n-gram counts/blending, and an
optional neural LM.

## 5. Recreation blueprint

### 5.1 Pipeline (mirrors the patents)

```
touches -> [1] input model: per-position char distributions (KeyPressVector-style)
         -> [2] candidate generation: prefix trie + limited edits
                (EPCSG-style graph: insert/delete/substitute, optional word boundaries)
         -> [3] context scoring: base n-gram LM + personal n-gram (+ neural LM)
         -> [4] rank, prune, show top-k; commit = learning signal
```

1. **Input model.** For each keypress, P(intended char | touch position,
   key). Start with a key-adjacency/Gaussian model from key geometry; then
   learn per-user corrections (record what the user actually commits after a
   suggestion; adjust the model - see the CHI 2013 hierarchical backoff
   pattern).
2. **Candidate generation.** Dictionary prefix trie for the in-progress word;
   expand with 1-2 edits (substitution at any position, one insertion, one
   deletion); cap the beam (e.g. 20-50 candidates). For multi-word
   ("no-spacebar") behavior, allow boundary nodes between words.
3. **Context LM.** Word bigram+trigram, Kneser-Ney or stupid-backoff
   smoothed, over the last ~5-8 committed words. Precompute and cache
   context trigram lookups (the patent explicitly caches/reuses them).
   Final candidate score = P(candidate | touches) x P(context + candidate |
   language).
4. **Personal layer.** Keep per-user counts: unigram frequencies, bigrams
   (last-word -> word), trigrams if memory allows; store with timestamps and
   apply a forgetting curve (exponential decay, or AOSP's approach). Blend
   with the base LM by log-linear interpolation:
   P = lambda * P_personal + (1 - lambda) * P_base, or use the personal model
   first and back off to base (PPM style - the Interspeech 2023 result that
   worked well).
5. **Learning signals.** (a) word committed after a suggestion, (b) user
   corrected a suggestion, (c) user typed a word not in the vocabulary.
   Update counts in background; persist as a small local file/DB.

### 5.2 Data

- Base LM corpus: OSCAR / Common Crawl / Wikipedia / news (English ~1-5 GB
  raw text is plenty). For SMS-style text: Reddit dumps, HC corpora,
  SubjCT (commonly used for next-word-prediction research).
- Personal data: your own commits/corrections, logged locally.
- Personalization research data (public): Enron LM Personalization Dataset,
  osf.io/45p3j (44 users of email) - used in the Interspeech 2023 paper;
  convenient for benchmarking before building.

### 5.3 Model sizes and budgets

- **n-gram only**: trigram, Kneser-Ney, pruned to top-N context, ~5-50 MB
  ROM, mmaps cleanly, sub-100 ms load, single-digit ms scoring. This alone
  beats "no prediction" by a lot and is what SwiftKey shipped for 5 years.
- **Small neural LM** (optional upgrade): GRU/transformer LM, 1-10M params,
  vocab ~30-60k (words or BPE), int8 quantized -> 1-10 MB. On a mid-range
  2024+ phone (NNAPI/GPU via TFLite, or CoreML on iOS) one forward pass
  for top-k next-word scoring lands in ~5-50 ms. Use it as a re-ranker on
  the n-gram candidate set, not as the sole generator (robustness + cold
  start).
- Keep the n-gram as the fallback path for low-end devices - exactly the
  hybrid SwiftKey ran (n-gram + NN).
- Latency budget: recompute suggestions on a worker thread per keypress,
  debounce ~30-80 ms; the suggestion bar may be slightly stale by design.

### 5.4 Neural model specifics (practical)

- Architecture: word-level GRU (embedding 50-128, hidden 128-256, 1-2
  layers) is the classic small-LM; a 2-4 layer transformer (d_model 128,
  2-4 heads) is a fine 2026 default. Char-level is an alternative that kills
  OOV but costs ~10x the sequence length.
- Train next-word prediction on the corpus; optionally distill from a larger
  LM (soft labels) to get "meaning" quality at small size.
- Export to TFLite (Android NNAPI/GPU delegate) or CoreML (iOS); int8.
- Scoring blend: log-linear interpolation of log P_ngram and log P_neural
  (tune the mixing weight on a held-out noisy-typing set), plus the personal
  counts as an additive bonus for frequently used personal words/names.
- Word embeddings from the NN (or fastText) give you a cheap "typo
  similarity" score for re-ranking corrections.

### 5.5 Evaluation

- Simulate typing with a touch-error model (key adjacency + substitution
  probability ~0.1-0.3 on random chars), measure: word error rate and
  keystroke savings vs verbatim typing (the metrics from Interspeech 2023).
- The Enron dataset + your own commit log give you train/test personal splits.
- Target to beat: stock AOSP/HeliBoard suggestions on the same corpus.

### 5.6 Licensing / legal notes

- AOSP LatinIME is Apache-2.0 (HeliBoard's own code is GPL-3.0; the AOSP
  parts remain Apache-2.0 - check each file header). KenLM is BSD. fastText
  is MIT.
- SwiftKey's specific inventions (PCSG/EPCSG multi-term boundary scheme,
  KeyPressVector, whole-field distribution integration) are patented and
  owned by Microsoft. The general building blocks (n-gram LMs, edit
  distance, key-adjacency error models, personal counts) are standard prior
  art, but do not lift SwiftKey code or replicate the patent claims
  verbatim if you plan to ship publicly.

## 6. Suggested build order

1. **Base**: fork HeliBoard (Android) or use AOSP LatinIME directly. You get
   the dictionary format, T9, swipe, and the UserHistoryDictionary
   personalization loop for free.
2. **Personal n-gram**: extend the user-history dictionary into explicit
   bigram/trigram counts with decay; blend via interpolation into
   NgramContext ranking. (Highest value/effort.)
3. **Better input model**: per-user touch-error learning from corrections.
4. **Neural re-ranker**: small quantized GRU/transformer LM over the
   n-gram candidate set; blend scores; ship as an opt-in "advanced
   prediction" setting.
5. **Whole-field features** (contacts/phrases): expose per-field candidate
   distributions to the app (US 10671182 style) - a nice differentiator.

## 7. Sources

Patents (Google Patents):
- US 2014/0351741 A1 / US 10037319 B2 "User input prediction" (Medlock, Osborne):
  https://patents.google.com/patent/US20140351741A1/en
- US 10671182 B2 "Text prediction integration" (Aley, Orr, Nixon):
  https://patents.google.com/patent/US10671182B2/en
- US 9189472 B2 "Inputting text into small screen devices" (KeyPressVector family):
  https://patents.google.com/patent/US9189472B2/en
- Family list (assignee: Touchtype): US10613746B2, US10037319B2, US9424246B2,
  US10073829B2, US10809914B2, US10664657B2, US10146765B2, US9189472B2,
  US10191654B2, US10671182B2, US10445424B2, US10402493B2, US10706230B2,
  US11720744B2, US10372310B2, EP2807535B1, CN102893239B.

Company (SwiftKey):
- SwiftKey blog, 2015-10-08 (neural network announcement; n-gram history):
  http://web.archive.org/web/20161227001652/https://blog.swiftkey.com/neural-networks-a-meaningful-leap-for-mobile-typing/
- Ben Medlock (CTO), Medium, 2015-10-08 (GPU+CPU inference, 2013 start,
  word clusters):
  http://web.archive.org/web/20160326074053/https://medium.com/@Ben_Medlock/why-turing-s-legacy-demands-a-smarter-keyboard-9e7324463306

Academic:
- Op-Ngram (mobile n-gram pipeline, Samsung): https://arxiv.org/abs/2101.03967
- Adhikary & Vertanen, Interspeech 2023, "Language Model Personalization for
  Improved Touchscreen Typing": https://www.isca-archive.org/interspeech_2023/adhikary23_interspeech.html
  (PDF: https://www.isca-archive.org/interspeech_2023/adhikary23_interspeech.pdf)
- Enron LM Personalization Dataset: https://osf.io/45p3j/wiki/home/
- Yin, Ouyang, Partridge, Zhai, "Making touchscreen keyboards adaptive to
  keys, hand postures, and typing styles" (CHI 2013):
  https://dl.acm.org/doi/10.1145/2470654.2481384

Open code:
- HeliBoard (AOSP LatinIME engine + personalization):
  https://github.com/HeliBorg/HeliBoard
  - `app/src/main/java/helium314/keyboard/latin/personalization/UserHistoryDictionary.java`
  - `app/src/main/java/helium314/keyboard/latin/personalization/PersonalizationHelper.java`
  - `app/src/main/java/helium314/keyboard/latin/NgramContext.java`
  - `app/src/main/jni/src/dictionary/property/ngram_context.*`
- KenLM (n-gram toolkit, BSD): https://github.com/kpu/kenlm
