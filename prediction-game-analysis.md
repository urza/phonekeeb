# Prediction game vs. the shipped engine

Date: 2026-08-26. Inputs: the 11 exchanges in `prediction-game.md`.
Harness: `tools/eval-game.mjs` replays them through the shipped
Predictor (mixed en+cs, bigrams+trigrams, no personal model). Run it
after every model change, next to `tools/eval-prediction.mjs`.

The LLM in the game put the wanted word on the strip 8 times of 11.
The engine puts it there 3 times of 11. That gap is the work list.

## Replay results

| # | Input | Wanted | Engine strip | Result |
|---|-------|--------|--------------|--------|
| 1 | you are am | amazing | a, am, all, american, my | miss |
| 2 | how | are | do, you, much, to, are | hit @5 |
| 3 | do i e | even | even, ever, everything, enough, every | hit @1 |
| 4 | future is | now | it, a, the, that, not | miss |
| 5 | its | it's | it's, its, it, is, itself | hit @1 |
| 6 | I | love | don't, know, have, was, think | miss |
| 7 | I w | would | was, want, what, we, with | miss |
| 8 | deliberat | deliberately | (verbatim only) | miss, not in vocab |
| 9 | ...vykoupat a zapla | zaplavat | zaplatit, zaplatil, ... | miss, not in vocab |
| 10 | mam hlad dam si k | kuře | když, k, kdo, kde, know | miss |
| 11 | smoo | smooth | soon, shoot, moon, smoke | miss, not in vocab |

Bright spot: case 5 works by design. `matchKey` folds the apostrophe,
so typed `its` finds `it's` and corpus frequency ranks it first. The
game's session-1 lesson is already shipped.

## Why each miss happens

### Cause A: the vocabulary is too small (cases 8, 9, 11)

`deliberately`, `zaplavat`, and `smooth` are not in the top-3000
word lists. No scoring change can help; the candidate does not exist.
Czech hurts most: rich inflection spreads one lemma over many forms,
so 3000 forms cover few lemmas. Case 9 still shows the right reflex
(zaplatit, zaplatil... complete the prefix); only the word is absent.

### Cause B: typo hypotheses crowd out real completions (cases 1, 11)

In case 1 the strip gives three of five slots to one-edit hypotheses
(`a`, `all`, `my`) instead of the exact-prefix completion `amazing`
(which is in vocab). `EDIT_PENALTY` is 0.005, but the frequency gap
between `a` and `amazing` is about four orders of magnitude, so the
penalty does not close it. Case 11 is the same shape: `soon`, `moon`,
`shoot` outrank the `smo-` completions.

### Cause C: backoff giants beat true continuations (cases 7, 10)

When a candidate is missing from the head's stored successor list, it
backs off to `BACKOFF * unigram`. For giant words (`what`, `we`,
`with`, `když`, `kdo`, `know`) that backed-off score still beats the
real bigram score of a medium word (`would` after `i`, `kuře` after
`si`). Stupid backoff has no penalty for "the context is known and
this word was NOT seen in it".

### Cause D: cross-language leak under a short prefix (case 10)

`know` reaches a Czech strip. The language floor (`LANG_FLOOR` 0.05)
exists so a truly typed cross-language word stays reachable, but with
a 1-letter prefix there is no typing evidence yet, and 0.05 times a
giant English unigram beats 0.95 times a small Czech one.

### Cause E: set phrases and personal phrasing (cases 4, 6)

`future is now` and `I love ...` are phrase knowledge. The pruned
trigram table lacks `future is -> now`; `love` sits around rank 8
among `i` successors in subtitle counts. The LLM missed case 6 in the
live game too, so this tail is genuinely hard. The shipped
PersonalModel is the intended answer: after the user types `I love`
twice, its bigram outranks the corpus.

## Improvement candidates, ranked

Rule for all of them: `tools/eval-prediction.mjs` numbers decide, and
`tools/eval-game.mjs` must not lose its current hits.

1. **Grow the unigram vocabulary** (cause A). Completions only need
   unigrams; the bigram and trigram tables can stay on the 3000-word
   core. Top 15-30k forms per language costs a few hundred kB, far
   under the iOS keyboard memory cap. This is the largest and safest
   win: 3 of 8 misses are pure coverage.
2. **Cap typo hypotheses to at most 1-2 slots** (cause B). Admit
   edit-distance candidates only when exact-prefix candidates cannot
   fill the strip, or reserve them one slot. Safer than tuning
   `EDIT_PENALTY` alone, which trades against real typo recall
   (the typo-2 eval row watches that).
3. **Discount backed-off candidates under a known head** (cause C).
   When the head has a successor list and the candidate is not in it,
   apply a stronger multiplier than the flat `BACKOFF` 0.4, or
   interpolate instead of backing off. Retune against the next-word
   eval row.
4. **Scale the language floor with prefix length** (cause D). With
   zero or one typed letter, trust the posterior (floor near 0);
   restore the 0.05 floor once 2-3 letters of a cross-language word
   exist. Keeps the floor's purpose, removes its 1-letter leak.
5. **Leave phrase memory to the PersonalModel** (cause E). Already
   shipped. Optionally revisit trigram pruning thresholds later;
   do not chase set phrases in static tables.

## Update 2026-08-26: fix 1 shipped (extension vocabulary)

`words-ext-en.js` / `words-ext-cs.js` close cause A (design and full
numbers: word-prediction-research.md, "Extension vocabulary
shipped"). Replay went from 3/11 to 5/11.

- Case 8 (deliberately) and case 11 (smooth): now hit at rank 1.
- Case 9 (zaplavat): reachable at rank 12, but the core zaplat*
  inflection cluster fills the strip. Reclassified from cause A to
  cause C.
- Token coverage: en 89.4% to 96.6%, cs 74.7% to 91.0%.
- Core-pair eval rows moved at most 0.1pp: the bigger candidate pool
  displaces nothing.
- smoothie stayed out (below rank 20000 in the corpus). The
  EXT_TOTAL knob or a more modern corpus would admit it; not worth a
  change alone.

Next up: fix 2 (typo slot cap, cause B) and fix 3 (backed-off giant
discount, cause C, which now owns cases 1, 7, 9, 10).

## Update 2026-08-27: fixes 2 and 3 shipped

Typo slot cap (2), context-miss discount (0.15, cross-language),
bigram successor depth 12 to 24, and a 6-chip two-row strip. Details
and sweep numbers: word-prediction-research.md, "Ranking fixes
shipped". Replay: 5/11 to 6/11 on the 6-chip strip.

- Case 1 (amazing): hits at rank 6. The cap holds "a" and "all" to
  two slots; "my" no longer pushes the real completion off.
- Case 2 (are): rank 5 to 2, from successor depth.
- New lesson while tuning: the miss discount must be cross-language.
  Discounting only the language that knows the context pushed
  English "know" to rank 1 after Czech "si", because English had no
  "si" head to miss. Any-language-knows now means every language
  discounts.
- Cases 4, 6, 7 (now, love, would): reclassified from cause C to
  cause E. Even at depth 24, "love" sits ~rank 8 among "i"
  successors; no 6-slot static strip reaches it. The PersonalModel
  owns these after a few sightings.
- Case 9 (zaplavat): unchanged, the zaplat* cluster outranks it.
- Case 10 (kuře): the English leak is gone ("know" left the strip),
  but kuře still loses to Czech k-giants. Waits on fix 4.

Fix 4 (prefix-scaled language floor, cause D) is the one improvement
still open.

## Update 2026-08-27: case 12, and a flaw in this harness

Case 12 (`ahojky zebricko`, wanted `zebřičko`) is the first case no
counting model can ever answer. Both halves are absent from the corpus:
`ahojky` is not in the vocabulary at all, only `ahoj`, and no form of
`zebřička` is among the 40000 Czech forms. Replay is now 6/12.

Adding it exposed a bug in `tools/eval-game.mjs`. The hit test compared
match keys on both sides, so the verbatim chip `zebricko` counted as a
hit for `zebřičko`, because the two fold to the same key. They are not
the same insert. The test now compares exact strings and reports a
fold-only match as a near miss. No other case moved, so the flaw had
been latent since the harness was written: every earlier hit was already
spelled correctly, including `it's` in case 5.

New cause, beyond A to E above:

### Cause F: the word was never in any corpus

Coined pet names, playful greeting forms, and personal nicknames do not
appear in subtitles at any table size. Case 12 is the pure form of it,
and cases 4 and 6 (`future is now`, `I love`) are the milder version.
Two things reach cause F, and neither is a bigger table:

- **The personal model**, from the second sighting, or from the first if
  it is seeded from chat exports. A chat export holds both `ahojky` and
  the nickname. This is now the strongest argument for the seeding work.
- **A model that works below the word.** `zebřičko` is derivable from
  `zebra`, which the vocabulary does have, by two productive Czech rules.
  Measured with the harness of `czech-lm-research.md`: Czech-GPT-2-XL
  puts `zebřičko` at rank 1, CzeGPT-2 at rank 2, czech-gpt2-oscar at
  rank 3 with the wrong z. Context matters even here: without `ahojky`
  in front, the XL model drops it from rank 1 to rank 8.

## Update 2026-08-27: the game replayed through language models

`czech-lm-research.md` replays these same 11 exchanges through four Czech
GPT-2 models and a KenLM n-gram. Scores: Czech-GPT-2-XL 7/11, this engine
6/11, KenLM 4/11, the three 124M models 2 to 3 of 11. Seven exchanges are
English, which a Czech-only model cannot answer, so only the XL total is
comparable.

What it says about the two open cases here:

- **Case 9 (zaplavat) is a context case, not a ranking case.** Three of
  the four transformers put `zaplavat` at rank 1 or 2, where every
  counting model (this engine, KenLM at every size) answers with the
  `zaplat*` payment cluster. No reweighting of static tables reaches it;
  the answer needs the sense of "vykoupat a".
- **Case 10 (kuře) needs more than the language floor.** Fix 4 (the
  prefix-scaled floor) removes the English leak, but KenLM misses this
  case too, so the Czech k-giants win on counts alone. The 124M models
  answer with food and drink (kousek, kafe, kávu), and only the 1.58B
  model reaches `kuře`, at rank 5.

So both remaining Czech misses are semantic, not statistical. They are the
right cases to stop chasing with table tuning.

## Update 2026-08-27: session 4 splits cause A in two

Cases 13 and 14 (`zkouška nového predik`, wanted `predikčního`, then
`algoritmu`) both miss, and neither is a ranking failure. Replay is now
7/14. Full exchange and strips in `prediction-game.md`, session 4. What
they add is that cause A, vocabulary, has two distinct halves:

- **Topical register.** No form of `predikce`, `prediktor` or
  `predikční` exists in the 40000 Czech forms, because subtitles are
  people talking and nobody in a film discusses prediction algorithms.
  The English tail does carry `prediction`, so this is Czech-side and
  topical, not a size problem. A bigger subtitle corpus adds nothing
  here; a different register would.
- **Inflection coverage.** `algoritmus` is in the vocabulary and
  `algoritmu`, the genitive the sentence needs, is not. One lemma, one
  case form short. This is cause F's neighbour rather than its twin: the
  lemma IS in the corpus, only the form is missing, so a morphological
  tier or a bigger Czech tail could reach it.

Two engine behaviors worth recording from the same replay, because both
argue against blaming the scorer:

- After `nového` the strip is `světa, přítele, o, roku, v, života`, all
  genitive masculine and neuter. The agreement is right. The engine knew
  the shape of the answer and lacked the word.
- `zkouška` is in the vocabulary and still carries no context: no pair
  headed by it clears the floor of 20, so its next-word strip is the
  same generic `to | se | je | a | na | jsem` an unknown word gets. For
  the strip, rare-but-known and unknown behave alike. Anything that
  lowers the pair floor for rare heads would show up here first.

## Update 2026-08-30: case 16 puts topical register on the English side

Case 16 (`listening to playl`, wanted `playlists`) misses. Replay is now
7/15, and the denominator moved: every earlier score in this file and in
the research notes is out of 11, 12 or 14 exchanges.

Session 4 read the `predik*` gap as topical register and called it
"Czech-side, not a size problem". That reading was half right. The cause
is register, and the language was a coincidence of which sentence the
user happened to type. `playlist` and `playlists` are missing from the
English tables the same way, with the same shape of neighbourhood
around them: `playback, playboy, playful, playground, playmate,
playoffs, playtime, playwright` are all there. The corpus is
OpenSubtitles v2018. Film dialogue has playboys and playwrights and no
streaming playlists.

So cause A's topical half is a property of the corpus, not of Czech. It
predicts the misses to expect next: app words, device words, and the
vocabulary of typing to someone on a phone, which is the exact register
this keyboard serves. The two answers stay the ones session 4 named,
the personal model and a corpus with chat in it, and this case moves
the second one up. A chat-register word list would fix case 16 without
touching the engine.

Two engine behaviors worth recording, both correct:

- The strip is all typo hypotheses. Nothing in the tables starts with
  `playl`, so `withinOneEditPrefix` reads the trailing `l` as an extra
  letter and every chip comes from `play*`. `TYPO_SLOTS` (2) releases
  its cap when exact candidates cannot fill the strip, which is why 5
  of them show. A strip made only of typo chips is a readable signal
  that the prefix matches no word at all.
- `playlist` would not have counted. The wanted word is the plural, and
  the two do not fold to one match key, so the harness scores a full
  miss. This is the case-12 rule applied to English morphology: a chip
  that inserts the wrong string is not a hit.

The personal model reaches the word on the second sighting
(`PERSONAL_MIN_COUNT` is 2), then ranks it first for the prefix and
first for the next-word slot after `to`. Strips in `prediction-game.md`,
session 5.

## Notes

- The game mixes two strip modes (completion vs. next word) and the
  `its`/`zapla` pair shows both directions of the same ambiguity. The
  engine already serves both from one scored pool; that design choice
  is confirmed, not questioned, by the game.
- Keep feeding new game sessions into `tools/eval-game.mjs` as cases.
  The file is the user-expectation test set; the corpus eval is the
  average-case test set.
