# A big model behind an API, measured

Researched 2026-08-29 and 2026-08-30 on the user's own hardware: a 27B model
(`unsloth/Qwen3.8-27B-NVFP4`) served by vLLM on the local network. This is
the first measurement of prediction-roadmap direction 8, "a big model beside
the small one", against a model that is actually big and actually reachable.

The question that decides direction 8 is not whether a big model scores
higher. It is whether it answers what our tables miss (user, 2026-08-30). A
model that only repeats our own good answers is worth nothing beside us,
however good its average looks. So the centre of this note is the rescue
rate: rows where the target is absent from the engine's whole strip and
present in the model's.

`czech-lm-research.md` measured models we load ourselves. This one measures a
model over a network, at three levels of access, because the level of access
changes the answer.

| Level | What the model gets to do | Why it is here |
|---|---|---|
| `--chat` | asked in words, answers with a list | all Apple's framework allows |
| `--beam` | constrained beam over top-20 logprobs | what `lm-predict.py` does locally |
| `--rerank` | scores our own six chips exactly | roadmap direction 5, the neural re-ranker |

Harness: `tools/api-lm-predict.mjs`, any OpenAI-compatible endpoint. The 14
game cases live in `tools/game-cases.mjs`, shared with `tools/eval-game.mjs`,
so the model and the shipped engine answer the same list. The held-out pairs
come from `tools/dump-eval-pairs.mjs`, and each row carries the engine's own
strip for the same context, so both columns of every table below are one run
of one sample.

## Summary

1. **The model rescues about a quarter of what we miss, and that is the
   result worth having.** On English next-word the engine misses 109 of 200
   rows; the beam answers 26 of those, 23.9%. Coverage at a strip of six goes
   from 45.5% to 58.5%. Czech rescues less, 10.3%.
2. **It does not beat our tables anywhere.** Every hit@1 and hit@3 column
   goes to the engine, in both languages, at all three access levels. Nothing
   here supports replacing any part of the strip.
3. **The rescues are semantic, and they read that way.** `"it's no place for
   a"` wants `woman`; our tables offer `while, long, minute, few`, because
   they know `for a while`. `"so now it's off my"` wants `chest`; we offer
   `back, head, clothes`. `"make your favorite"` wants `dinner`; we offer
   `color, food, show`. This is the ceiling `prediction-roadmap.md` calls the
   honest one, and a big model is over it.
4. **A merge must add, never replace.** On the same rows the beam loses 31
   English next-word answers the engine had. The union of the two is worth 13
   points of coverage; swapping one for the other is worth less than nothing.
5. **The re-ranker adds nothing, and cannot.** Its candidates are our own six
   chips, so its rescue rate is zero by construction, and its ordering is
   worse than ours at every blend weight. Direction 5 gets a negative result
   from the model most likely to give it a positive one.
6. **Reasoning is a loss at every price.** Thinking mode cost 160 times the
   latency, dropped two answers inside its own scratchpad, and scored no
   better. Greedy decoding made it loop: on the case `smoo` it wrote 10306
   tokens, most of them the line `"smoothe" no.` repeated, then ended with no
   answer at all.

## What was measured

Server: vLLM, one 27B model in NVFP4, on the LAN. Strip of 6, temperature 0,
non-thinking unless the row says otherwise. Latency is the whole round trip
from this machine, including the network.

**Run-to-run spread.** This server does not repeat itself exactly. The same
200 English rows, next-word by beam, over six runs: 17.5, 17.5, 18.0, 18.5,
19.0, 20.0 hit@1 and 31.5 to 33.5 hit@3. Chat mode is tighter, 20.0 to 20.5.
Treat every number below as plus or minus one point. One early run returned
37.0 hit@3 and no repeat has come near it, including repeats of that exact
code; it was an outlier and the "win over the engine" it seemed to show is
withdrawn.

### Complementarity: what the model rescues

A rescue is a row where the target is missing from the engine's whole strip
of six and present in the model's. "Union" is the coverage of both together,
which is what a merge could reach if it always chose correctly.

English:

| Task | engine hit@6 | mode | rescues | rescue rate | engine-only | union |
|---|---|---|---|---|---|---|
| next-word | 45.5% | beam | 26 of 109 | **23.9%** | 31 | **58.5%** |
| next-word | 45.5% | chat | 16 of 109 | 14.7% | 32 | 53.5% |
| prefix-2 | 83.9% | beam | 5 of 31 | 16.1% | 55 | 86.5% |
| prefix-2 | 83.9% | chat | 6 of 31 | 19.4% | 28 | 87.0% |

Czech:

| Task | engine hit@6 | mode | rescues | rescue rate | engine-only | union |
|---|---|---|---|---|---|---|
| next-word | 46.5% | beam | 11 of 107 | 10.3% | 49 | 52.0% |
| next-word | 46.5% | chat | 5 of 107 | 4.7% | 62 | 49.0% |
| prefix-2 | 80.6% | beam | 5 of 37 | 13.5% | 51 | 83.2% |
| prefix-2 | 80.6% | chat | 2 of 37 | 5.4% | 61 | 81.7% |

Four readings:

- **Next-word is where the rescue lives.** It is also the task this keyboard
  values most, because a gesture letter costs more than a tap letter, so the
  chip after a space saves more here than on a normal keyboard.
- **The beam rescues more than chat, and the gap is the interface.** 26
  against 16 in English. Probabilities let the model answer the question we
  actually asked; a chat list is the model answering a different one.
- **Czech rescues half as often as English.** Same finding as every other
  study here: this model reads English everyday speech well and Czech
  everyday speech badly.
- **Prefix-2 barely moves.** The engine already covers 84% of those rows, and
  what it misses is mostly not a meaning problem.

Rescued rows, English, beam:

```
...come on we're going to be     -> late
    engine: a | the | in | here | with | your
    model:  late | friends | here | in | on | the
...it's no place for a           -> woman
    engine: while | long | minute | few | second | moment
    model:  woman | man | child | young | kid | girl
...so now it's off my            -> chest
    engine: back | head | clothes | fucking | table | case
    model:  chest | mind | plate | desk | list | hands
...tonight and i'll make your favorite -> dinner
    engine: color | food | show | actor | thing | movie
    model:  dinner | pizza | pasta | soup | salad | sandwich
...walk you over to uncle and    -> aunt
    engine: i | the | you | a | then | he
    model:  aunt | auntie | grandma | grandpa | mom | dad
```

Rescued rows, Czech, beam:

```
...chceš něco                    -> jíst
    engine: říct | k | vidět | vědět | udělat | slyšet
    model:  říct | vědět | jiného | udělat | jíst | prozkoumat
...jen když mě budeš             -> milovat
    engine: potřebovat | muset | chtít | mít | poslouchat | mě
    model:  milovat | brát | mít | chtít | potřebovat | držet
...říct že v tomhle městě platí  -> zákon
    engine: i | pro | za | to | se | že
    model:  jiná | zvláštní | pravidla | jiné | zákon | pravidlo
```

Every one of those is a sentence where the last two words decide nothing and
the whole clause decides everything. `for a` really is followed by `while`
most of the time. Only the sentence says otherwise.

**Two limits on these numbers, both pushing the same way.** The pair dump
keeps only targets that are inside our vocabulary, so this measurement cannot
see the out-of-vocabulary tail at all, and the game says that tail is where
this model is strongest. And each figure is one run, at plus or minus a
point. The true rescue rate is not lower than this; it is probably higher.

### The prediction game, 14 cases

| Engine | Score | EN 9 | CS 5 | Per strip |
|---|---|---|---|---|
| shipped `prediction.js` | 7/14 | 6 | 1 | under 1 ms |
| 27B `--chat`, no thinking | 8/14 | 7 | 1 | 0.2 s |
| 27B `--chat`, thinking, temp 0.6 | 7/14, a floor | 5 | 2 | 32 s |
| 27B `--rerank` over our chips | 7/14 | 7 | 0 | 0.1 s |
| 27B `--beam` over logprobs | 2/14 | 0 | 2 | 0.6 s |
| **engine plus this 27B** | **11/14** | 8 | 3 | |
| Czech-GPT-2-XL 1.58B, beam | 10/14 | 5 | 5 | 1.7 to 12 s |
| two specialist models merged | 12/14 | 7 | 5 | seconds |

The union row is the point. Of the seven cases the engine misses, the model
answers four: case 1 `amazing` and case 9 `zaplavat` by chat, case 13
`predikčního` and case 14 `algoritmu` by beam. Case 13 is the sharpest result
in this whole study: rank 1, for a word that is not in our vocabulary at any
tier, so no table work of any kind reaches it.

The three it does not rescue are case 6 (`I` wants `love`, which is a
personal habit, not a fact about English), case 10 (`kuře`, colloquial Czech)
and case 12 (`zebřičko`, a nickname). Two of those three belong to the
personal model, direction 3.

### Re-measured 2026-08-30 with case 16, and a warning about the chat row

The game gained case 16, `listening to playl` wanting `playlists`, so the
denominator is 15 and the English half is 10. Same server, model named
`Qwen3.8-27B NVFP4`. Case 16 by level:

```
--chat    playlists | playlist | playl                                    rank 1
--beam    playlits | playlsts | playl | playlilst | playluts | playlisy   miss
--rerank  playing | plays | played | play | player | playl                miss
engine    play | playing | played | plays | player | playl                miss
```

The re-ranker cannot answer this case, and the reason is structural, not
statistical: it reorders the engine's own chips, and no chip holds the
word. Direction 5 stays closed. The beam spends all six slots on
misspellings of the word it is trying to reach.

The totals moved down, and not because of the new case:

| Level | 2026-08-29 | 2026-08-30 |
|---|---|---|
| `--chat`, no thinking | 8/14 (EN 7, CS 1) | 6/15 (EN 6, CS 0) |
| `--beam` | 2/14 (EN 0, CS 2) | 3/15 (EN 1, CS 2), a floor |
| `--rerank` | 7/14 (EN 7, CS 0) | 7/15 (EN 7, CS 0) |

Case 16 is a new chat hit, so the chat level lost three of the cases it
answered the day before. It now misses `smoo` -> `smooth`, answering
`smooch, smoochy, smoothe, smoothish`, and `I w` -> `would`. Either the
served build changed, or one run of the chat level carries more spread
than a single number can carry. Treat the 8/14 above as one sample, not
as this model's score. The re-ranker reproduced its earlier result
exactly, which is expected: it can only permute a deterministic strip.

`tools/api-lm-predict.mjs` also had the per-language denominators
hardcoded as `/9` and `/5`. Fixed to count them from `LANG`.

### Held-out pairs: the score columns

Strip of 6, hit@1 / hit@3, 200 pairs per language. The engine column is the
shipped `prediction.js` on the same pairs. These are not comparable to the
300-pair tables in `czech-lm-research.md`.

English:

| Task | our engine | `--beam` | `--chat` | `--rerank` |
|---|---|---|---|---|
| next-word | **22.5 / 35.0** | 17.5 / 32.5 | 20.0 / 31.0 | 12.0 / 26.5 |
| prefix-2 | **63.5 / 78.6** | 50.5 / 56.8 | 50.0 / 67.7 | 21.9 / 56.8 |
| corrupted prefix | **35.4 / 51.6** | not run | 3.1 / 9.4 | 17.7 / 39.1 |

Czech:

| Task | our engine | `--beam` | `--chat` | `--rerank` |
|---|---|---|---|---|
| next-word | **19.0 / 33.0** | 11.5 / 18.5 | 12.0 / 16.5 | 9.0 / 26.0 |
| prefix-2 | **63.9 / 73.8** | 48.7 / 53.9 | 36.1 / 46.1 | 29.3 / 55.5 |
| corrupted prefix | **34.6 / 53.4** | not run | 3.1 / 5.2 | 19.9 / 38.7 |

0.19 to 0.81 s per request, four at a time. The beam costs the most, because
one strip is one request per beam step.

The engine wins every cell, and the corrupted prefix is a collapse: 3.1
against 35.4. Two letters with one of them wrong is a job for edit distance
over a known lexicon, not for meaning. The re-ranker column is discussed
below.

**A correction about the beam.** The first version of this harness put the
typed letters into the prompt, so the beam only ever saw the distribution
after `"you are am"` and never the one after `"you are"`. That cost it 35
points of English prefix hit@1, and the note first blamed the server's
20-logprob cap for it. Measured properly, the cap is mostly not the problem:
the top 20 after the context holds a prefix-compatible token in 84 of 100
rows, and the exact target word in 51 of 100 English rows. The beam now
filters by the prefix during the search, which is what `lm-predict.py` does,
and keeps the mid-word prompt only as recall padding underneath.

### The re-ranker, blended

Replacing our order with the model's is one extreme and keeping ours is the
other. SwiftKey's fifth layer is described as a mixture, so the sweep blends
two posteriors over the same six chips: a softmax over the model's log
P(word | context), and a 1/rank prior standing in for the engine's own scores,
which the pair dump does not carry.

English, hit@1 / hit@3 against the weight on the model:

| Task | a=0 | a=0.2 | a=0.4 | a=0.6 | a=0.8 | a=1 |
|---|---|---|---|---|---|---|
| next-word | **22.5 / 35.0** | 22.0 / 34.0 | 16.5 / 32.5 | 14.5 / 34.0 | 12.5 / 32.0 | 12.0 / 26.5 |
| prefix-2 | **63.5 / 78.6** | 62.5 / 75.0 | 42.2 / 73.4 | 29.2 / 72.4 | 22.4 / 66.7 | 21.9 / 56.8 |
| corrupted | **35.4 / 51.6** | 32.3 / 50.5 | 24.5 / 50.0 | 21.4 / 47.9 | 18.8 / 42.7 | 17.7 / 39.1 |

Czech behaves the same way. Every row falls as the model's weight rises, and
the two places it does not are inside the noise of 200 pairs.

The result is clean and negative, and it is structural rather than about this
model. A re-ranker sees only what the generator already found, so it cannot
rescue a single row; and on the rows the generator got right, three tables of
counts already order them better than a 27B does. The value of a big model
here is entirely in the candidates it adds.

One caveat sits with it. The engine side of the blend is a 1/rank stand-in,
not the engine's real scores, so a mixture tuned against real scores could
behave differently. It would have to overturn a loss of 10 points at a=0.2.

## What this changes for direction 8

**The direction is confirmed, in the shape the roadmap already gave it, and
the price is now known.** A second opinion that answers 24% of our English
next-word misses is worth having. One that ranks the strip is not.

**The merge must be additive and selective.** The beam loses 31 rows the
engine had for every 26 it rescues. A merge that trusts the model wherever it
disagrees would lose more than it gains. What the numbers support is adding
the model's candidates to ours, never replacing ours, and then needing a
decision rule for which of the twelve to show. That rule is the open work of
direction 8, and nothing here tells us what it should be.

**English and Czech are not the same problem.** 23.9% against 10.3%. The
two-specialist plan (`prediction-roadmap.md`, direction 8) is supported
again: a general model of this size covers English and does not cover Czech
everyday speech.

**Direction 5 loses its most likely candidate.** A re-ranker is what SwiftKey
puts on top of its n-gram, and the biggest model this project can reach
fails to reorder six chips better than the tables that produced them.

**Reasoning models are the wrong tool here.** Not slower for a gain; slower
for nothing, with a failure mode that returns an empty strip. Use the
non-thinking path or a base model.

## What is still open on this hardware

**Measure the rescue rate on the tail, where it should be highest.** The pair
dump excludes out-of-vocabulary targets by construction, which cuts out
exactly the case the game says this model wins. A pair set built without that
filter would give the number this study is missing, and it decides how much
of direction 7 a served model could replace.

**Raise the server's logprob cap and re-measure the beam.** vLLM's
`--max-logprobs` defaults to 20. The 84% figure says the cap is not the main
limit, but the remaining 16% of rows are invisible to the beam today, and the
rescue rate is the number that would grow. This needs a server restart, no
new model and no new code.

**Find the decision rule.** The union of engine and beam is 58.5% where the
engine alone is 45.5%. Everything between those two numbers depends on
knowing when to trust the model, and that is unmeasured.

## Reproducing

The server address is the user's own machine and is deliberately not recorded
in this repo. Give it on the command line:

```sh
node tools/dump-eval-pairs.mjs en 200 > /tmp/pairs-en.json

# words only, the iOS shape
node tools/api-lm-predict.mjs --base http://HOST:PORT --game --no-think
node tools/api-lm-predict.mjs --base http://HOST:PORT --pairs /tmp/pairs-en.json \
    --tasks next,prefix --no-think --concurrency 4 --max-tokens 300
node tools/api-lm-predict.mjs --base http://HOST:PORT --pairs /tmp/pairs-en.json \
    --tasks typo --no-think --fuzzy-prefix --concurrency 4 --max-tokens 300

# logprobs: constrained beam, and the re-ranker with its blend sweep
node tools/api-lm-predict.mjs --base http://HOST:PORT --game --beam [--verbose]
node tools/api-lm-predict.mjs --base http://HOST:PORT --pairs /tmp/pairs-en.json \
    --tasks next,prefix --beam --concurrency 4
node tools/api-lm-predict.mjs --base http://HOST:PORT --pairs /tmp/pairs-en.json \
    --tasks next,prefix,typo --rerank --concurrency 4
```

Every pairs run prints the complementarity table and up to twelve rescued
rows. A sandbox reaches a LAN address only after the host allows it:
`sbx policy allow network HOST:PORT`.
