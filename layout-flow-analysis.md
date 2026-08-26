# Layout flow analysis: how often the finger draws a figure eight

Measured 2026-08-26. Regenerate with `node tools/score-flow.mjs`, or
`--matrix` for the side-by-side grids.

The original keyboard is called 8pen because a good letter pair draws a
figure eight. This document measures how often that happens, for each
layout, in English and in Czech. It gives layout tuning a number to
move instead of a feeling.

## What counts as a figure eight

A letter is one closed loop. The finger leaves the center into an
**entry sector**, rotates one way across N arm crossings, and returns
to the center from its **landing sector** (`landingSector()` in
`layout.js`). A bigram joins the landing sector of the first letter to
the entry sector of the second. Two independent properties describe
that join.

**Shape**, from the two sectors:

- `through`: opposite sectors. The finger runs in and straight out the
  far side.
- `turn`: adjacent sectors. A 90 degree corner at the center.
- `reverse`: the same sector. The finger doubles back over itself.

**Curl**, from the two rotations:

- `counter`: the rotations differ. The second loop falls on the far
  side of the center and the stroke crosses itself.
- `co`: the rotations match. The two loops share a sector and retrace,
  which draws a circle rather than an eight.

A figure eight needs both halves, `through` **and** `counter`. Either
half alone is not an eight. Six categories result, and the tool reports
all six, because how a layout fails is as useful as whether it fails.

The model is `flowJoin()` in `layout.js`, kept next to the rest of the
slot geometry so the app, the tool, and the test share one definition.

### Why trust the model

It agrees with two sets of results produced before it existed.

1. The 8pen demo video, hand-decoded into `CLAUDE.md`. The rule
   reproduces all seven recorded results: `he`, `in`, `er`, `ea` are
   eights on the original layout, and `th`, `an`, `on` are not.
2. The five side effects hand-checked in the "swap a and s" entry of
   `layout-tuning.md`. All five match, including the swap's purpose
   (`is` goes from `turn/co` to `through/counter`).

`tests/flow-unit.mjs` locks both sets.

## Data

Letter bigrams and trigrams come from the OPUS OpenSubtitles v2018
dumps already in `tools/corpus/`, built by
`tools/build-letter-ngrams.py` into `tools/letter-ngrams-{en,cs}.js`.
These are letter n-grams (`th`, `he`, `in`). The files
`bigrams-{en,cs}.js` in the repo root are **word** bigrams for the
predictor and are unrelated.

| | English | Czech |
|---|---|---|
| corpus | 9.3M lines, 49.5M tokens | 8.7M lines, 38.1M tokens |
| distinct bigrams | 667 | 658 |
| top 100 bigrams cover | 76.7% of all pairs | 74.1% of all pairs |
| top 100 trigrams cover | 38.4% of all triples | 24.3% of all triples |

Decisions that change the numbers:

- **Within-word pairs only.** A space is a dip or tap in the center, so
  the finger is already there. A cross-word pair is not a two-loop
  shape at all.
- **The apostrophe splits a word.** `don't` gives `do`, `on`, and a
  lone `t`. The apostrophe is not on the letter layouts, so `n't` must
  not invent an `nt` pair.
- **Czech diacritics fold to base letters before counting**, so `ří`
  merges into `ri`. The end-state keyboard is one combined en+cs layout
  with no diacritic slots, per the constraint in `CLAUDE.md`.
- The tokenizer is imported from `tools/build-wordlists.py`, so the
  letter tables and the word lists always describe one token stream.

### Cross-check against a published table

No published letter-bigram table exists for Czech, which is why both
languages are derived here by one method. For English there is a check:
Peter Norvig's Google Books table, saved as `tools/norvig-bigrams.json`.

83 of our top 100 pairs are in his top 100, Spearman 0.61 on the shared
set. The 17 that differ are the spoken/literary split, not an error. We
gain `yo do go ay oo gh ck ey` (you, do, go, okay, look, right, back,
they) and lose `io ns ec pr ct tr nc` (-tion, -ness, pro-, -ction). An
independent agreement on method: the published sources say the top 100
bigrams carry about 76% of bigram frequency, and our English tables
measured 76.7%.

Subtitles are the better model of phone typing, so they are the primary
table. The tool scores English against both, and the layout ranking
survives the swap.

## Results: bigrams

Count of the top 100 that draw an eight, and the share of weighted
bigram mass those pairs carry.

| source | Original 8pen | QWERTY 8pen | urza |
|---|---|---|---|
| English (subtitles) | 13 / 19.3% | 19 / 20.7% | **19 / 21.0%** |
| English (Norvig/Books) | 13 / 17.6% | **18 / 20.6%** | 17 / 20.2% |
| Czech (subtitles) | 9 / 8.5% | 11 / 13.9% | **14 / 16.1%** |

### Is 21% a lot?

On its own the number means nothing, so the tool anchors it. A random
letter placement lands an eight when the sectors happen to be opposite
(1 in 4) and the curls happen to differ (1 in 2), so chance alone
scores 12.5%. Shuffling the real letters over the real slots 2000 times
confirms it and gives the spread.

| | chance | mean | median | p95 | best of 2000 |
|---|---|---|---|---|---|
| English (subtitles) | 12.5% | 12.5% | 12.2% | 18.7% | 26.6% |
| Czech (subtitles) | 12.5% | 12.9% | 12.8% | 18.3% | 26.6% |

This is the most important result in the document. Every real layout
beats the average shuffle, so none of them is accidental. But urza's
English 21.0% sits barely above the shuffle p95 of 18.7%, and 2000
random tries already found 26.6%. **No layout here is optimized for
flow, and a real search has room to beat all of them by a wide
margin.**

### The six categories

English (subtitles), share of weighted mass:

| category | Original 8pen | QWERTY 8pen | urza |
|---|---|---|---|
| through/counter (**eight**) | 19.3% | 20.7% | 21.0% |
| through/co | 9.4% | 17.6% | 20.8% |
| turn/counter | 27.0% | 21.7% | 13.6% |
| turn/co | 28.7% | 14.8% | 11.5% |
| reverse/counter | 9.0% | 14.5% | 17.5% |
| reverse/co | 6.6% | 10.7% | 15.5% |

Czech (subtitles), share of weighted mass:

| category | Original 8pen | QWERTY 8pen | urza |
|---|---|---|---|
| through/counter (**eight**) | 8.5% | 13.9% | 16.1% |
| through/co | 10.5% | 15.3% | 15.8% |
| turn/counter | 28.3% | 29.3% | 19.9% |
| turn/co | 21.2% | 20.4% | 17.6% |
| reverse/counter | 17.0% | 14.5% | 15.2% |
| reverse/co | 14.6% | 6.6% | 15.4% |

The breakdown says something the eight count hides. The original 8pen
is **turn-heavy**: 55.7% of English mass is a soft 90 degree corner and
only 15.6% doubles back. It is the smoothest layout to type even though
it draws the fewest eights. urza is the opposite. It has the most
eights and also the most reversals, 33.0% of English mass against the
original's 15.6%. urza buys its eights partly with doubling back.

### Which pairs, top 20 by frequency

English (subtitles). `thru` and `turn` are pass-throughs and corners
that miss the counter-curl half.

| gram | share | Original 8pen | QWERTY 8pen | urza |
|---|---|---|---|---|
| th | 4.5% | turn | **EIGHT** | **EIGHT** |
| he | 3.9% | **EIGHT** | reverse | reverse |
| ou | 3.5% | turn | thru | thru |
| in | 2.9% | **EIGHT** | thru | thru |
| er | 2.5% | **EIGHT** | reverse | reverse |
| re | 2.5% | turn | turn | turn |
| an | 2.4% | turn | turn | reverse |
| yo | 2.3% | **EIGHT** | reverse | reverse |
| ha | 2.1% | turn | turn | reverse |
| on | 2.0% | turn | reverse | reverse |
| at | 2.0% | thru | turn | thru |
| it | 1.7% | turn | reverse | reverse |
| ng | 1.6% | turn | thru | thru |
| to | 1.6% | reverse | **EIGHT** | **EIGHT** |
| me | 1.5% | **EIGHT** | turn | turn |
| ll | 1.5% | thru | thru | thru |
| is | 1.4% | thru | turn | **EIGHT** |
| ve | 1.4% | turn | thru | thru |
| hi | 1.4% | reverse | **EIGHT** | **EIGHT** |
| or | 1.3% | turn | **EIGHT** | **EIGHT** |

Full eight lists, in frequency order:

- **Original 8pen**: he 3.9%, in 2.9%, er 2.5%, yo 2.3%, me 1.5%,
  ea 1.2%, al 1.1%, wh 1.0%, ur 0.8%, ro 0.7%, ck 0.4%, im 0.4%,
  bo 0.4%
- **QWERTY 8pen**: th 4.5%, to 1.6%, hi 1.4%, or 1.3%, en 1.3%,
  nd 1.3%, al 1.1%, ne 1.0%, ow 0.9%, we 0.9%, ur 0.8%, ut 0.8%,
  ot 0.8%, ma 0.7%, lo 0.6%, ic 0.4%, ry 0.4%, bo 0.4%, ai 0.4%
- **urza**: th 4.5%, to 1.6%, is 1.4%, hi 1.4%, or 1.3%, en 1.3%,
  nd 1.3%, ne 1.0%, ow 0.9%, we 0.9%, ur 0.8%, ut 0.8%, ot 0.8%,
  lo 0.6%, ay 0.6%, si 0.5%, ic 0.4%, ry 0.4%, bo 0.4%

The two families barely overlap. The original wins `he in er yo me`,
the QWERTY-derived pair wins `th to hi or en nd`. Only `ur` and `bo`
are eights in all three.

Czech (subtitles):

| gram | share | Original 8pen | QWERTY 8pen | urza |
|---|---|---|---|---|
| ne | 3.5% | turn | **EIGHT** | **EIGHT** |
| te | 2.4% | turn | reverse | reverse |
| se | 2.3% | turn | turn | reverse |
| to | 2.2% | reverse | **EIGHT** | **EIGHT** |
| st | 2.0% | turn | thru | turn |
| je | 1.9% | turn | turn | turn |
| na | 1.9% | reverse | turn | thru |
| pr | 1.7% | reverse | turn | turn |
| ta | 1.6% | reverse | turn | reverse |
| ra | 1.6% | thru | reverse | turn |
| ni | 1.6% | turn | reverse | reverse |
| le | 1.6% | thru | reverse | reverse |
| ch | 1.5% | reverse | turn | turn |
| em | 1.5% | reverse | **EIGHT** | **EIGHT** |
| de | 1.5% | reverse | thru | thru |
| en | 1.4% | reverse | **EIGHT** | **EIGHT** |
| po | 1.4% | reverse | thru | thru |
| me | 1.4% | **EIGHT** | turn | turn |
| la | 1.4% | turn | turn | reverse |
| si | 1.4% | turn | turn | **EIGHT** |

Full eight lists:

- **Original 8pen**: me 1.4%, al 1.3%, ro 1.2%, va 1.1%, im 0.9%,
  er 0.7%, in 0.6%, dy 0.6%, hl 0.5%
- **QWERTY 8pen**: ne 3.5%, to 2.2%, em 1.5%, en 1.4%, al 1.3%,
  ma 0.9%, ic 0.7%, lo 0.7%, hl 0.5%, or 0.5%, ot 0.5%
- **urza**: ne 3.5%, to 2.2%, em 1.5%, en 1.4%, si 1.4%, va 1.1%,
  ic 0.7%, lo 0.7%, is 0.7%, da 0.6%, sl 0.6%, hl 0.5%, or 0.5%,
  ot 0.5%

The original 8pen misses every one of the four most common Czech pairs.
It was tuned for English rings, and Czech pays for it.

## Results: trigrams

A trigram has two joins. Both eights means three loops in one unbroken
serpentine.

| | Original 8pen | QWERTY 8pen | urza |
|---|---|---|---|
| English, both joins | 2 / 3.3% | 2 / 2.9% | **3 / 4.4%** |
| English, one join | 34 / 41.9% | 32 / 34.7% | 29 / 31.1% |
| English, neither | 64 / 54.8% | 66 / 62.4% | 68 / 64.5% |
| Czech, both joins | 1 / 0.7% | **3 / 2.8%** | **3 / 2.8%** |
| Czech, one join | 16 / 16.5% | 21 / 21.1% | **26 / 24.9%** |
| Czech, neither | 83 / 82.8% | 76 / 76.1% | 71 / 72.3% |

Double eights, in frequency order:

- English: Original `her` 2.7%, `whe` 0.6%. QWERTY `thi` 2.4%,
  `oth` 0.6%. urza `thi` 2.4%, `his` 1.5%, `oth` 0.6%.
- Czech: Original `sme` 0.7%. QWERTY and urza both `nem` 1.3%,
  `neb` 0.8%, `nen` 0.7%.

Chaining two eights is hard everywhere. At most 3 of the top 100
trigrams manage it in any layout. The single-eight column is where the
layouts really differ, and there the original leads in English (41.9%)
while urza leads in Czech (24.9%).

## Whole words that flow end to end

Words of 3 or more letters from the top 3000 whose every join is an
eight. The count in brackets is the corpus frequency.

- **Original 8pen** (en, 6): her (138,138), boy (26,610), box (4,142),
  hero (2,594), joy (1,954), meal (1,379)
- **QWERTY 8pen** (en, 8): lot (26,536), end (16,199), both (15,988),
  owe (4,089), low (2,814), ends (2,034), jury (1,833), bow (1,043)
- **urza** (en, 11): **this (421,767)**, his (115,301), day (40,756),
  lot (26,536), end (16,199), both (15,988), owe (4,089), slow (4,022),
  low (2,814), jury (1,833), bow (1,043)

- **Original 8pen** (cs, 3): rok (6,552), tvá (5,523), sme (1,197)
- **QWERTY 8pen** (cs, 6): nebo (65,061), nemá (11,770), toto (9,830),
  něm (8,761), málo (3,258), spí (1,988)
- **urza** (cs, 8): nebo (65,061), sis (11,948), toto (9,830),
  auto (9,708), něm (8,761), šlo (4,118), this (1,860), piš (1,139)

On urza the word **this** is four loops and three consecutive figure
eights, `th` then `hi` then `is`. It is the most common word in either
list that flows unbroken, and it exists because of the a/s swap: before
the swap `is` was `turn/co` and the chain broke at the last join.

## What this says

1. **urza is the best layout for Czech by a clear margin**, 16.1%
   against 13.9% for its own baseline and 8.5% for the original. Since
   the end state is one combined en+cs layout, this matters more than
   the English number.
2. **The English gain over qwerty-8pen is inside the noise.** urza is
   ahead by 0.3 points on subtitles and behind by 0.4 points on Norvig,
   with the same 19 pairs either way. The a/s swap was made for one
   word and it delivered that word. It did not move English flow.
3. **The a/s swap polarized urza.** It moved mass out of `turn` into
   both `through` and `reverse`. urza has the most eights and the most
   doubling back, 33.0% of English mass against the original's 15.6%.
   Whether that trade feels good is a question for the phone, not for
   this table. It is worth typing the original 8pen layout for a while
   to feel what 55.7% of soft corners is like.
4. **Nothing here is optimized.** All three layouts sit near the
   shuffle p95, and 2000 blind shuffles found 26.6%. A search that
   optimizes the combined en+cs weighted eight share, under the ring
   constraint that keeps frequent letters cheap, should beat 26.6%
   comfortably. That is the obvious next piece of work.
5. **The eight share is not the only objective.** Ring cost (crossings
   per letter) and the reversal share both matter, and this document
   deliberately measures only one thing. A layout that maximizes eights
   while pushing common letters to ring 4 would be worse to type.

## Files

- `tools/build-letter-ngrams.py` builds the letter tables from the
  corpus dumps in `tools/corpus/`.
- `tools/letter-ngrams-{en,cs}.js` are the generated tables, top 100
  bigrams and trigrams each. No runtime code reads them.
- `tools/norvig-bigrams.json` is the published English cross-check.
- `tools/score-flow.mjs` produces every number above.
- `layout.js` holds `flowJoin()`, the model.
- `tests/flow-unit.mjs` locks the model and the tuned slots.
