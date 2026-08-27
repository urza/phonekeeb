# Completion scorer: implementation plan (roadmap direction 1)

Written 2026-08-27. This is the implementation plan for direction 1 of
`prediction-roadmap.md`: fix the completion scorer. It is written for an
implementer who starts with no context. Read these first, in this order:

1. `czech-lm-research.md`, "Result 3: KenLM" — the evidence.
2. `word-prediction-research.md`, the sweep list near line 480 and the
   conclusions near line 620 — what was already tried.
3. `features.md`, the constants table at the end — the spec that must
   stay in sync with every constant this plan touches.
4. `CLAUDE.md` working mode — staging by name, `?v=` bumps, tests.

## The evidence, in three lines

KenLM, trained on the same corpus with the same tokenization and the
same vocabulary, beats our Czech tables by 9 points of prefix-2 hit@1
and 16 of hit@3 at the same byte budget. About a third of that gap is
the typo slots, a trade we keep. The rest is smoothing and successor
depth. So the realistic target is about +6 hit@1 and +11 hit@3 on
Czech prefix-2, with a similar direction in English.

## What must not change

- **The runtime shape stays a table lookup with backoff.** Samsung's
  Op-Ngram result says this shape is right for phones. All smoothing
  work happens in the builders. `prediction.js` changes stay small.
- **`PersonalModel` is untouched.** Its own `BACKOFF = 0.4` chain and
  the `PERSONAL_WEIGHT` blend belong to roadmap direction 3.
- **The unigram contract is untouched.** `words-*.js` stays raw
  `[word, count]`. The core sum stays the single probability
  denominator; `words-ext-*.js` counts are pre-rescaled to that scale
  (`build-wordlists.py` around line 183). The language posterior and
  the extension tier both depend on this. Do not switch unigrams to
  continuation counts in this round.
- **Head emission order stays vocabulary frequency order** in
  `build-ngrams.py` (the `for head in words:` loop). `prediction.js`
  resolves match-key collisions first-wins (`hell` beats `he'll`,
  lines 511-514 and 534-538) and depends on that order.
- **`QUANT_K = 8` stays in sync** across `prediction.js:46`,
  `build-ngrams.py:53`, `build-trigrams.py:41`.
- **`prediction.js` stays DOM-free.** It ports to Swift.

## Current mechanics, one paragraph

`build-ngrams.py` and `build-trigrams.py` emit packed tables:
`"T succ|c succ|c ..."`, counts log-quantized as
`round(log(count) * 8)`. `T` is the head's total adjacency count
before the cap and floor. The shipped bigram tier is top-24
successors, pair floor 20, from a 400 MiB corpus prefix (these are
CLI overrides, not the source defaults of 12/4). Trigrams are top-4,
floors 200/6. At load, `decodeSuccessors()` (`prediction.js:472-482`)
turns each entry into a conditional probability `min(1, c/T)`. At
score time (lines 683-702) the chain per language is: trigram hit, or
`CTX_MISS = 0.15` times the bigram level when the trigram context is
known but misses the word, or a multiplier of 1 when the table is
absent. Same rule one level down to the unigram. The known-miss test
is cross-language on purpose: if any language knows the context,
every language takes the discount (this stops wrong-language unigram
giants; see `word-prediction-research.md` around line 475).

The flat 0.15 is the target. It says every context leaves the same
probability mass for unseen words. In truth a context whose top-24
covers 95% of its mass should back off weakly, and a flat one should
back off strongly. KenLM knows this per context; we do not.

## Stage 0: baseline

Re-run the eval and confirm it reproduces the committed numbers before
touching anything:

```
node tools/eval-prediction.mjs        # ~5 s, corpus already in tools/corpus/
```

Reference rows (mixed+tri, core-vocab pairs, hit@1 / hit@3):
next-word 21.4/36.4 EN, 19.3/33.4 CS; prefix-2 61.4/75.0 EN,
57.1/70.6 CS; typo-2 36.8/53.0 EN, 33.0/47.8 CS. The pairs are
deterministic (fixed subsample and typo seed), so deltas between runs
are paired, and small differences are meaningful. Gate rule for every
stage: accept when prefix-2 improves by at least 1 point (hit@1 or
hit@3, both languages moving the same direction) and no other row
loses more than 1 point. Otherwise revert the stage and record the
numbers in `word-prediction-research.md` anyway.

## Stage 1: per-context backoff mass (the equal-bytes win)

Replace the flat known-miss discount with a per-context backoff weight
`γ(ctx)`, computed at build time by absolute discounting, baked into
the tables.

**Builder changes** (`build-ngrams.py`, `build-trigrams.py`):

- Estimate one discount per order from count-of-counts over the full,
  unfiltered pair counts: `D = n1 / (n1 + 2 * n2)`, where `n1` and
  `n2` are the numbers of pairs seen exactly once and twice. Print D
  in the emitted file header.
- Store each kept successor's count as `c - D` (quantize as before;
  every kept `c` is at least the floor, so `c - D` stays positive).
- Compute the backoff weight from mass conservation. With `K` kept
  successors and `dropped = T - Σ kept c` (the floor and cap
  casualties):

  ```
  γ(ctx) = (D * K + dropped) / T
  ```

  The kept discounted probabilities plus γ sum to exactly 1.
- Emit γ in the packed head token: extend `"T ..."` to `"T|g ..."`,
  where `g = round(log(γ) * QUANT_K)` (a small negative integer).
  Document the grammar in the emitted file header and bump its
  format note to v3.

**Runtime changes** (`prediction.js`):

- `decodeSuccessors()` parses the optional `|g` and stores γ next to
  the successor map. When the token has no `|`, fall back to
  `CTX_MISS` so an old table still loads.
- In the scoring chain, when THIS language's table knows the context
  but misses the word, multiply the lower level by that entry's γ
  instead of `CTX_MISS`.
- **Keep the cross-language guard as it is.** When this language's
  table lacks the context but another language knows it, the flat
  `CTX_MISS` still applies. γ exists only where a real entry provides
  it. This preserves the wrong-language-giant fix; do not simplify it
  away.
- An absent table still multiplies by 1 (the lazy-loaded trigram
  toggle depends on this).

Rebuild all four tables with the shipped overrides:

```
python3 tools/build-ngrams.py en tools/corpus/os-en-419430400.txt.gz words-en.js bigrams-en.js 24 20
python3 tools/build-ngrams.py cs tools/corpus/os-cs-419430400.txt.gz words-cs.js bigrams-cs.js 24 20
python3 tools/build-trigrams.py en ... trigrams-en.js
python3 tools/build-trigrams.py cs ... trigrams-cs.js
```

(Check each builder's actual argv order in its header before running;
the trigram builder keeps its floors 200/6 and top-4.)

Then run the eval and apply the gate. Byte cost should be near zero:
one short token per head.

**Known simplification, on purpose:** true Kneser-Ney also divides γ's
mass by the unigram mass of the unseen words, and replaces the unigram
backoff target with a continuation distribution. Both are out of this
stage. If Stage 1 passes its gate but falls well short of the target,
these are the first two follow-on experiments, in that order, and the
continuation distribution must be a second stored value, never a
change to `words-*.js`.

## Stage 2: interpolation instead of backoff

With discounted probabilities and real γ in place, interpolation is a
few-line runtime change: always add the lower level, instead of
falling to it only on a miss.

```
score = P_tri(w) + γ_tri * (P_bi(w) + γ_bi * P_uni(w))
```

with each `P` read as 0 on a miss, and the absent-table multiplier
still 1. This mainly reorders words that tie or nearly tie at the top
level, so expect the gain in hit@3 more than hit@1. Same gate. If it
fails the gate, revert; Stage 1 stands on its own.

## Stage 3: successor cap sweep, after smoothing

Only after Stages 1-2 settle, sweep the bigram cap upward: 32, then
48, floor 20 unchanged. Smoothing changes what the tail is worth, so
sweeping before it would measure the wrong engine. Track gzipped
bytes of both bigram files at each cap; the precache at first paint
is ~441 KB gzipped today and must stay under ~550 KB unless the gain
is exceptional. Decide by points per 100 KB, and record the losing
cap sizes too. Trigram caps are a separate, cheaper axis (top-4 is
shallow); one probe at top-8 is worth a row in the same table.

## Measurement protocol

- Always `node tools/eval-prediction.mjs` (both languages), full
  default settings. Never compare a smoke run
  (`EVAL_PREFIX_MB=2`) against a full run.
- Compare on the mixed+tri core-vocab rows. Report all three modes.
- `tools/dump-eval-pairs.mjs` and the Python harnesses only matter if
  a cross-check against KenLM is wanted at the end; they are not part
  of the gates.

## Ship checklist

- Update the `features.md` constants table: D per order, the γ
  definition, the surviving role of `CTX_MISS` (cross-language and
  legacy-format fallback only), and the scoring formula in words.
- Update `word-prediction-research.md` with the measured numbers for
  every stage, kept or reverted, and `prediction-roadmap.md` direction
  1 with the outcome.
- Run the tests (`python3 -m http.server 8080`, then
  `node tests/hello-flow.mjs`), and a Playwright screenshot of the
  strip on the phone-width page.
- Bump every `?v=` in `index.html` and `cards.html` and the `BUILD`
  constant in `sw.js` to the same next value (grep for `?v=`). The
  bigram tables are precached under `?v=`; without the bump, phones
  keep the old tables while running new decode code, and the old
  format has no γ, which the fallback tolerates but the user never
  sees the improvement.
- Stage the exact files edited, by name. Never `git add -A`.
