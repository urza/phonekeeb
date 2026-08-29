# A big model behind an API, measured

Researched 2026-08-29 on the user's own hardware: a 27B model
(`unsloth/Qwen3.8-27B-NVFP4`) served by vLLM on the local network. This is
the first measurement of prediction-roadmap direction 8, "a big model beside
the small one", against a model that is actually big and actually reachable.

It answers a question the earlier studies could not. `czech-lm-research.md`
measured models we load ourselves, with logits and a constrained beam. This
one measures a model over a network, at three levels of access, because the
level of access turns out to matter as much as the model.

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

1. **Logprobs buy exactly one win, and it is a real one.** With a beam over
   the raw endpoint the model reaches 37.0 hit@3 on English next-word, past
   our engine's 35.0. That is the first time any model in this project has
   beaten the shipped tables on a held-out task. The same model asked in
   words scores 30.0 on the same rows, so 7 points of hit@3 were being thrown
   away by the interface alone.
2. **Everything else stays a loss, at every access level.** Czech next-word,
   prefix completion and the corrupted prefix all go to the tables, most of
   them by a wide margin.
3. **The re-ranker adds nothing.** Scoring our own six chips and reordering
   them is worse than our order, and no blend weight between the two beats
   using our order alone. Direction 5 gets a negative result from the model
   most likely to give it a positive one.
4. **The beam is capped by the server, not by the model.** vLLM returns at
   most 20 logprobs per step, and `" amazing"` is not in the top 20 after
   `"you are"`. So prefix completion by beam collapses to 15.6 hit@1 where
   asking in words gets 49.5. Raising `--max-logprobs` on the server is the
   one cheap thing that could move this.
5. **It wins the prediction game, 8 of 14 against 7, in chat mode.** The game
   rewards meaning; the pairs reward frequency. Same split as always.
6. **Reasoning is a loss at every price.** Thinking mode cost 160 times the
   latency, dropped two answers inside its own scratchpad, and scored no
   better. Greedy decoding made it loop: on the case `smoo` it wrote 10306
   tokens, most of them the line `"smoothe" no.` repeated, then ended with no
   answer at all.

## What was measured

Server: vLLM, one 27B model in NVFP4, on the LAN. Strip of 6, temperature 0,
non-thinking unless the row says otherwise. Latency is the whole round trip
from this machine, including the network.

### The prediction game, 14 cases

| Engine | Score | EN 9 | CS 5 | Per strip |
|---|---|---|---|---|
| shipped `prediction.js` | 7/14 | 6 | 1 | under 1 ms |
| 27B `--chat`, no thinking | **8/14** | **7** | 1 | 0.2 s |
| 27B `--chat`, thinking, temp 0.6 | 7/14, a floor | 5 | 2 | 32 s |
| 27B `--rerank` over our chips | 7/14 | **7** | 0 | 0.1 s |
| 27B `--beam` over logprobs | 2/14 | 0 | 2 | 0.4 s |
| Czech-GPT-2-XL 1.58B, beam | 10/14 | 5 | 5 | 1.7 to 12 s |
| two specialist models merged | 12/14 | 7 | 5 | seconds |

The 27B answers English everyday speech well and Czech everyday speech badly,
1 of 5. Cases 9, 10 and 12 (`zaplavat`, `kuře`, `zebřičko`) are colloquial
Czech, and a model trained mostly on English and technical text does not hold
them. Case 14 is the exception in the other direction: it put `algoritmu` at
rank 3, and before today only the 1.58B Czech model reached that case.

The beam's 2 of 14 is the most interesting bad score here. Both hits are the
technical Czech cases, and one of them is a result no other engine has
produced: case 13 wants `predikčního`, the beam puts it at **rank 1**, and
the word is not in our vocabulary at all. Its nine English misses are the
20-logprob cap, not the model. Read the two together and the beam is a tail
generator, not a strip.

### Held-out subtitle pairs, 200 per language

Strip of 6, hit@1 / hit@3. The engine column is the shipped `prediction.js`
on the same 200 pairs, so these numbers are internally comparable but not
comparable to the 300-pair tables in `czech-lm-research.md`.

English:

| Task | our engine | `--beam` | `--chat` | `--rerank` |
|---|---|---|---|---|
| next-word | **22.5** / 35.0 | 19.5 / **37.0** | 19.5 / 30.0 | 12.0 / 26.5 |
| prefix-2 | **63.5 / 78.6** | 15.6 / 20.8 | 49.5 / 67.2 | 21.9 / 56.8 |
| corrupted prefix | **35.4 / 51.6** | not run | 3.1 / 9.4 | 17.7 / 39.1 |

Czech:

| Task | our engine | `--beam` | `--chat` | `--rerank` |
|---|---|---|---|---|
| next-word | **19.0 / 33.0** | 10.5 / 19.0 | 11.5 / 16.5 | 9.0 / 26.0 |
| prefix-2 | **63.9 / 73.8** | 34.6 / 37.7 | 35.6 / 46.1 | 29.3 / 55.5 |
| corrupted prefix | **34.6 / 53.4** | not run | 3.1 / 5.2 | 19.9 / 38.7 |

0.19 to 0.57 s per request, four at a time. The beam costs the most, because
one strip is one request per beam step.

Four readings:

- **The one win is English next-word at hit@3: 37.0 by beam, against our
  35.0.** It is worth naming plainly, because no model in this project had
  beaten the shipped tables on held-out data before. It also measures the
  interface: 30.0 in words, 37.0 with logprobs, same model, same rows. That
  gap of 7 points is what a text-only API throws away.
- **Next-word hit@1 stays ours in both languages.** 22.5 against 19.5, and
  19.0 against 10.5. The model finds the right word more often than we do at
  a strip of three, and puts it first less often. The roadmap said a big
  model loses where frequency decides; that still holds at rank 1.
- **Prefix completion by beam collapses, and the cause is the server.** vLLM
  returns 20 logprobs per step. After `"you are"` the top 20 does not contain
  `" amazing"`, so the beam cannot reach it. The recovery that does work is
  the mid-word prompt: `"you are am"` puts `" amazing"` in the top 20 as one
  token, and the harness accepts that as another path to the same word.
  Czech survives better (34.6 hit@1) because its morphology puts the
  continuations inside the top 20 more often.
- **The corrupted prefix is a collapse in every mode.** In chat the first
  run scored 0.5 because the prompt made the typed letters a rule and the
  model obeyed. `--fuzzy-prefix` states the engine's real rule, that a letter
  can be wrong, and lifts it only to 3.1. The re-ranker does better, 17.7,
  because our own typo layer built the candidates. Two letters with one
  wrong is a job for edit distance over a known lexicon.

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
the two places it does not (Czech next-word 19.5 at a=0.2, Czech prefix-2
hit@3 75.4 at a=0.2) are inside the noise of 200 pairs.

The result is clean and negative. A 27B scoring our own candidates, with
exact probabilities and no interface loss, does not rank them better than
three tables of counts. Direction 5 should not be built on this shape.

One caveat sits with it. The engine side of the blend is a 1/rank stand-in,
not the engine's real scores, so a mixture tuned against real scores could
behave differently. It would have to overturn a loss of 10 points at a=0.2,
which is a long way to come back.

## What this changes for direction 8

The direction survives, and its shape narrows.

**A big model is not a better strip, and access does not save it.** Three
levels, six held-out measurements, one win. Nothing here supports letting a
big model rank the strip per keystroke.

**The win is phrase level and meaning level, which the game shows and the
pairs mostly cannot.** 8 of 14 against 7 in chat mode, and the beam's rank-1
answer on a Czech word we do not even hold.

**The text-only interface costs a measurable 7 points.** Direction 8 assumed
a big model contributes candidates that the merge weighs by
`langPosterior()`. Now that assumption has a price attached. On iOS there is
no choice about the interface. On a server there is, and it is worth taking.

**Reasoning models are the wrong tool here.** Not slower for a gain; slower
for nothing, with a failure mode that returns an empty strip. Any future work
on this axis should use the non-thinking path or a base model.

**Direction 5 loses its most likely candidate.** A re-ranker is what SwiftKey
puts on top of its n-gram, and the biggest model this project can reach fails
to reorder six chips better than the tables that produced them.

## What is still open on this hardware

**Raise the server's logprob cap.** vLLM's `--max-logprobs` defaults to 20,
and that single number is what breaks prefix completion by beam. With 100 or
200 the beam sees the tokens it is missing, and the one measurement that
already beats our engine is the one that would grow. This needs a server
restart by the user, no new model and no new code.

**Use the beam where it won, not where it lost.** It answered a Czech word
outside our vocabulary at rank 1. That is roadmap direction 7's job, the
out-of-vocabulary tail, and direction 7 currently plans to solve it with an
aspell bucket file. A beam over a served model is the other way to reach the
same words, and the two should be measured against each other on the tail
cases alone.

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

A sandbox reaches a LAN address only after the host allows it:
`sbx policy allow network HOST:PORT`.
