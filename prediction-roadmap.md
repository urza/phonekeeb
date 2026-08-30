# Suggestion engine: where we are and where we can go

Written 2026-08-27, after the language-model study. Refreshed the same
day, after the learned-words page landed. This is the standing overview
of the prediction work: what the engine does, what has been tried, what
each route returned, and which directions are open. It is a map, not a
plan of record. The detail lives in the research files it points to.

## Where the engine stands

`prediction.js` holds one mixed English and Czech model, with no language
switch. Candidates come from a scan of the merged vocabulary against the
typed prefix. Scores come from backoff down trigram, bigram, then
unigram counts, each level discounted by its own stored backoff weight.
On top sit a sentence-language posterior, one-edit typo
hypotheses, a verbatim chip, and a personal model that learns while you
type.

The personal side is now the most finished layer of the engine. It keeps
its own trigram, bigram and unigram counts, halves them every 30 days as
well as past 50000 tokens, and holds the user's own decisions: a blocked
list, a pinned list, and the last 500 committed words. `dictionary.html`
makes all of it readable and editable, including a review queue for
learned typos.

Measured on held-out subtitles, strip of 6, core-vocabulary pairs
(hit@1 / hit@3), re-run 2026-08-30 after the vocabulary rebuild:

| Mode | EN | CS |
|---|---|---|
| next-word | 22.0 / 37.3 | 20.0 / 33.8 |
| 2-letter prefix | 65.6 / 78.9 | 60.5 / 73.9 |
| corrupted prefix | 38.4 / 53.4 | 33.5 / 47.6 |

Token coverage is the number the rebuild moved: **97.7% EN and 93.9% CS**
of held-out running text, from 96.6% and 91.0%. Every hit@1 above rose
with it; the two corrupted-prefix hit@3 cells fell 2pp, because a bigger
vocabulary means more words match a corrupted prefix exactly and crowd
the typo hypotheses out of slots 2 and 3.

Prediction game: 8 of 15. Case 7, "I w" to "would", entered at rank 4
with the 2026-08-27 smoothing; case 16, "listening to playl" to
"playlists", entered at rank 4 with the 2026-08-30 vocabulary rebuild.
The LLM that played it live scored 8 of the first 11.

## The five layers, and which ones we have

SwiftKey's patents describe a four-stage pipeline
(`swiftkey_research/swiftkey-on-device-engine-deep-dive.md`). Adding the
neural re-ranker gives five layers. Our engine is a subset of it, and the
gaps are the map.

| Layer | What it does | Our state |
|---|---|---|
| 1. Input model | Each input event becomes a distribution over intended letters | **Missing.** We use a generic one-edit string model |
| 2. Candidate generation | Prefix trie plus edits, plus word-boundary nodes | Prefix scan plus 1 edit. No boundary inference |
| 3. Context LM | n-gram over committed words | Well developed. The scoring is the weak part |
| 4. Personal layer | Counts from the user's own typing, with decay | Learning, decay, editing and a typo queue all shipped. Seeding and tuning open |
| 5. Neural re-ranker | Small model reorders the n-gram candidates | Measured, not built |

## What we explored, and what each returned

- **Corpus register.** Web bigrams lost to subtitle bigrams by 30%
  relative. Register beats size at every scale we tested. Settled.
- **Vocabulary size.** Core 3000 plus an extension tier took Czech token
  coverage from 74.7% to 91.0% and fixed three game misses. Closed.
- **Table depth.** Successor depth 12 to 24 to 32 gave the whole gain. A
  five times bigger corpus with a scaled floor gave nothing. Depth, not
  data. Depth is still paying at cap 48; only the byte budget stops it.
- **Scoring constants.** Edit penalty, backoff, context-miss discount and
  typo slots are all swept and tuned. The flat context-miss discount is
  now a per-context weight, which was the last of the real headroom.
- **Language mixing.** One model with a posterior costs at most 0.7
  points against the single-language ceilings. The design is confirmed.
- **Pretrained Czech GPT-2 (124M).** Worse than our tables at next-word,
  by about half. The cause is register, not size. Per-word perplexity on
  our text: 3202, where a 1.86 MB KenLM scores 1428. Closed.
- **Czech-GPT-2-XL (1.58B).** Ties us on held-out text, but scores 7 of
  11 on the game and answers both Czech cases. 2.3 seconds per strip.
  Phrase level only.
- **KenLM.** At our own byte budget it beats our ranking by 9 points of
  prefix hit@1 and 16 of hit@3. It proves the gap is in our scoring.
- **Mini model from scratch.** 1.30M parameters, 1.3 MB, 0.6 ms. Ties us
  on next-word and beats us by 5.2 / 10.8 on completion, after 67
  minutes of CPU training.

Numbers and method: `czech-lm-research.md`, `word-prediction-research.md`,
`prediction-game-analysis.md`.

## Directions from here

**1. Fix the completion scorer. Done 2026-08-27, partly.** Built to
`completion-scorer-plan.md`; measured numbers for every stage, kept or
reverted, in `word-prediction-research.md`, "Completion scorer
smoothed". Per-context backoff weights shipped (table format v3, one
weight per stored head and context, scaled by 0.5 at decode time), the
bigram cap went 24 to 32 and the trigram cap 4 to 8. Interpolation was
measured and reverted as a wash. Result: prefix-2 +3.8 / +3.0 EN and
+2.6 / +3.2 CS, with next-word and typo-2 held. That is about half of
the estimated gap to KenLM.

What is left of this direction, in order of evidence: the two
simplifications Stage 1 named (divide the backoff mass by the unigram
mass of the unseen words, then a continuation distribution as the
backoff target, stored as a second value and never as a change to
`words-*.js`), and bigram cap 48, which regresses nothing and buys more
per byte than cap 32 but needs 701 KiB of first-paint precache against
the 550 KiB budget.

**2. Close the last game-analysis item.** The language floor still
ignores prefix length. With one typed letter there is no typing evidence
yet, and 0.05 times an English giant still beats a small Czech word.

**3. Go deeper on personalization.** This is where SwiftKey's reputation
comes from, and where the user's own typing history becomes a moat. Game
case 12 is the argument in one line: a greeting is followed by a name,
and no corpus holds either the greeting form or the nickname. The
store itself is now well built, so two pieces remain. Seed the model from
chat exports (`tools/build-personal.py`, still unwritten), then tune the
blend weight, which has never been tuned against held-out data. The
public Enron personalization set unblocks the tuning today. Published
target: about 10% keystroke savings and 36% fewer word errors over a
static model.

One thing the store now provides for free: the commit history and the
typo queue are the corrections log that direction 4 needs for per-user
calibration. Half of that data pipeline already exists.

**4. Build a gesture-aware input model.** The largest untouched axis, and
the one nobody else can copy. Our errors are not neighbour taps. They are
crossing-count slips and sector misses, and `gesture-decoder.js` already
computes the continuous quantities that predict them. Full analysis and
staged plan: `gesture-input-model.md`.

**5. Add a small neural re-ranker.** The mini model, trained on a joint
English and Czech vocabulary, sitting over the n-gram candidate set. Both
SwiftKey's design and our own measurement point the same way. The n-gram
stays the generator and the fallback.

Measured against the biggest model we can reach, and it failed
(`served-model-research.md`, 2026-08-29). A 27B scored our own six chips
with exact probabilities and reordered them, and its order is worse than
ours on every task in both languages: English prefix-2 goes 63.5 to 21.9
hit@1. A blend sweep from our order to the model's found no weight that
beats using our order alone. The candidate set was ours and the interface
loss was zero, so this is a result about re-ranking itself, not about
access. A small model trained on our own register might still work where
a general 27B does not, but this direction now starts from a negative.

**6. Two-word chips.** Never built, and step 4 of the original build
order. A gesture letter costs more than a tap letter, so a chip that
inserts two words saves more here than on any other keyboard.

**7. A tail lexicon tier.** Cheapest fix for cause F on real Czech
words, and it needs no linguistics. The aspell expansion we already
download is 3.14M forms and contains the word game case 12 wanted. Fold
the `ne` and `nej` prefixes, bucket the rest by three letters, fetch one
bucket only when the ranked tiers come up empty. A true morphological
generator is the expensive alternative and measured badly: 4.8% precision
on the diminutive rule, because our list carries no part of speech. Full
numbers: `word-prediction-research.md`, "The out-of-vocabulary tail".

Game case 14 sharpened the argument on 2026-08-27: `algoritmus` is in
the vocabulary and `algoritmu`, the genitive the sentence needed, is
not. A missing case form of a word we already have is the cheapest
thing this tier fixes, and no cap sweep or scorer change can reach it.

**8. A big model beside the small one, optional and off by default.**
User idea, 2026-08-27, recorded in `ideas.md`. A general second opinion
on the strip, not a fix for one cause. It runs in parallel with the
local engine, over the network or on a system-hosted model, and it is
absent by design when there is no network.

The measurements split by task, not by vocabulary. The big model loses
at per-keystroke next-word ranking, where frequency decides and counting
is already good and free. It wins wherever meaning decides. The XL model
scored 7 of 11 on the game and answered both Czech cases our tables
cannot reach at any size, which is why game cases 9 and 10 are in the
"stop revisiting" list below. It reads the whole context, where the
n-gram reads a two-word window. Unknown words are one case of that
advantage, not the boundary of it.

Game session 4 split the win into three tiers, not two (2026-08-27).
Frequency: counting wins and is free. Register and vocabulary: any
web-trained Czech model wins, the 124M ones included, because our
subtitle tables hold no technical Czech at all; all three answered case
13 at ranks 3, 5 and 6 by size. Meaning and context: the XL alone, the
only engine to reach case 14. The middle tier costs 248 MB and ~350 ms
locally and may need no network; only the top tier does. Direction 7
covers part of that middle tier offline and cheaper still.

Two specialist models, not one multilingual model (user decision,
2026-08-27). Czech-GPT-2-XL answers Czech, GPT-2 XL answers English,
and a layer above them merges. Measured on the 14 game cases, that pair
scores 12/14 where the best single model scores 10/14, because each one
wins its own language's everyday speech. The merge is not a language
switch: `langPosterior()` already weighs both languages every keystroke
for the n-gram tables, and the same weights apply one level up.

Two things are settled, and the rest is open. It can never sit in the
per-keystroke loop: 2.3 seconds per strip locally, and a round trip per
letter even on a server GPU. And whatever it contributes and the user
accepts goes into the personal model, so it teaches the small engine
instead of becoming a permanent dependency.

A 27B model, served over the user's own network, was measured on
2026-08-29 and 2026-08-30 at three levels of access:
`served-model-research.md`. It loses every held-out score column to our
tables, in both languages, at all three levels. That is not the number
that decides this direction (user, 2026-08-30). The number that decides
it is how much of what we miss the model answers.

It answers 23.9% of them in English. On 200 held-out next-word rows the
engine misses 109 and the beam rescues 26, which lifts coverage at a
strip of six from 45.5% to 58.5%. Czech rescues 10.3%, half as often,
which supports the two-specialist plan again. On the 14 game cases the
engine answers 7, and engine plus this model answers 11.

The rescues are semantic, and they are exactly the ceiling named at the
end of this file. `"it's no place for a"` wants `woman` and our tables
offer `while, long, minute`, because `for a while` is what counting
knows. Only the sentence says otherwise.

Three constraints on the merge, all measured. It must add candidates and
never replace ours: the same beam loses 31 rows the engine had for the
26 it rescues, so trusting the model wherever it disagrees costs more
than it gains. It cannot be a re-ranker, which is the finding recorded
under direction 5. And the decision rule for which candidates to show,
once both sets are on the table, is unmeasured and is the open work.

Game case 13 belongs to direction 7. It wants `predikčního`, a word our
vocabulary does not hold at any tier, and the beam put it at rank 1. The
held-out pairs cannot see that case at all, because the pair dump keeps
only in-vocabulary targets, so the rescue rates above are a floor. A
pair set built without that filter is the next measurement, and it
decides how much of direction 7 a served model could replace.

Reasoning mode is worse than useless: 160 times the latency, no better
score, and empty strips when the model loops inside its own thinking
block.

The iOS half of this direction is now researched:
`apple-foundation-models-research.md` (2026-08-29). Four findings change
the plan. The framework hands out words and never numbers, so there is
no probability to merge and no way to constrain the output to our
lexicon. Czech is unsupported in both model generations, and the 2026
list added Polish, Russian and Ukrainian while skipping it. The model's
memory is hosted by the OS and does not count against the extension's
48 to 60 MB, which is the only reason a 3B model is thinkable inside a
keyboard. And jKey, the one shipping keyboard that used this API for
prediction, removed it in 2026.1 and shipped its own model, because
predictions were slow, needed newer devices, and were often the wrong
words. So the two specialist arms split by platform as well as by
language: English can run free and local on Apple's model, and Czech
still needs a provider we choose. Three device tests come before any
code, listed at the end of that note.

Directions 7 and 8 overlap only on cause F, and there they split by
what the word is. Direction 7 covers real dictionary forms our tiers
cut, offline and free. Direction 8 covers what no dictionary holds:
names, nicknames and coinages. Build 7 first for that overlap, because
it is cheaper and it shrinks how often 8 has to fire. Everything else
in 8 is its own axis.

**9. Word-boundary inference.** Typing a phrase without committing
spaces, then splitting it. Valuable here because space is a gesture.
Microsoft holds patents on their version, so it needs its own design from
the general prior art.

## What to stop revisiting

A pretrained Czech LM as the engine. A browser LLM. Per-language
switching. Chasing game cases 9 and 10 with table tuning: both need
meaning, and only a 1.5B model reached them.

## The one honest ceiling

Counting models rank words by how often they followed. They cannot know
that "vykoupat a" wants another infinitive. No amount of table tuning
reaches that, so directions 1, 3 and 7 all stop below it. Direction 8 is
the only route past it, and the price is that the knowledge costs
seconds per strip today. On iOS the route is the system-hosted model at
phrase level, not a bundled GPT-2, and not the per-keystroke strip.
