# Suggestion engine: where we are and where we can go

Written 2026-08-27, after the language-model study. Refreshed the same
day, after the learned-words page landed. This is the standing overview
of the prediction work: what the engine does, what has been tried, what
each route returned, and which directions are open. It is a map, not a
plan of record. The detail lives in the research files it points to.

## Where the engine stands

`prediction.js` holds one mixed English and Czech model, with no language
switch. Candidates come from a scan of the merged vocabulary against the
typed prefix. Scores come from stupid backoff down trigram, bigram, then
unigram counts. On top sit a sentence-language posterior, one-edit typo
hypotheses, a verbatim chip, and a personal model that learns while you
type.

The personal side is now the most finished layer of the engine. It keeps
its own trigram, bigram and unigram counts, halves them every 30 days as
well as past 50000 tokens, and holds the user's own decisions: a blocked
list, a pinned list, and the last 500 committed words. `dictionary.html`
makes all of it readable and editable, including a review queue for
learned typos.

Measured on held-out subtitles, strip of 6 (hit@1 / hit@3):

| Mode | EN | CS |
|---|---|---|
| next-word | 21.4 / 36.4 | 19.3 / 33.4 |
| 2-letter prefix | 61.4 / 75.0 | 57.1 / 70.6 |
| corrupted prefix | 36.8 / 53.0 | 33.0 / 47.8 |

Prediction game: 6 of 12. The LLM that played it live scored 8 of the
first 11.

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
- **Table depth.** Successor depth 12 to 24 gave the whole gain. A five
  times bigger corpus with a scaled floor gave nothing. Depth, not data.
- **Scoring constants.** Edit penalty, backoff, context-miss discount and
  typo slots are all swept and tuned. Small headroom left.
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

**1. Fix the completion scorer.** Cheapest and best evidenced. Two
independent engines beat us at the same byte budget, so the loss is in
how we score, not in what we store. Levers in order: the top-24 successor
cap, real Kneser-Ney discounting instead of the flat backoff, and
interpolation instead of backoff. `tools/eval-prediction.mjs` decides it.

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

**4b. A big model beside the small one, optional and off by default.**
User idea, 2026-08-27, recorded in `ideas.md`. Not for next-word ranking,
where the measurements say it loses. For cause F only: a word no corpus
ever held. Trigger it when the local strip is weak, let it add
candidates, and feed whatever the user accepts into the personal model,
so the call is needed once per new word rather than forever.

**5. Add a small neural re-ranker.** The mini model, trained on a joint
English and Czech vocabulary, sitting over the n-gram candidate set. Both
SwiftKey's design and our own measurement point the same way. The n-gram
stays the generator and the fallback.

**6. Two-word chips.** Never built, and step 4 of the original build
order. A gesture letter costs more than a tap letter, so a chip that
inserts two words saves more here than on any other keyboard.

**7. Word-boundary inference.** Typing a phrase without committing
spaces, then splitting it. Valuable here because space is a gesture.
Microsoft holds patents on their version, so it needs its own design from
the general prior art.

## What to stop revisiting

A pretrained Czech LM as the engine. A browser LLM. Per-language
switching. Chasing game cases 9 and 10 with table tuning: both need
meaning, and only a 1.5B model reached them.

## The one honest ceiling

Counting models rank words by how often they followed. They cannot know
that "vykoupat a" wants another infinitive. That knowledge costs seconds
per strip today. On iOS the route to it is the system-hosted model at
phrase level, not a bundled GPT-2, and not the per-keystroke strip.
