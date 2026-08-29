# A big model behind an API, measured

Researched 2026-08-29 on the user's own hardware: a 27B model
(`unsloth/Qwen3.8-27B-NVFP4`) served by vLLM on the local network. This is
the first measurement of prediction-roadmap direction 8, "a big model beside
the small one", against a model that is actually big and actually reachable.

It answers a question the earlier studies could not. `czech-lm-research.md`
measured models we load ourselves, with logits and a constrained beam.
This one measures a model we can only talk to in words. That is the shape iOS
forces on us: Apple's Foundation Models framework returns text and never
numbers (`apple-foundation-models-research.md`). So the ranking here is the
model's own ordering of a list, and the strip is whatever it writes.

Harness: `tools/api-lm-predict.mjs`, any OpenAI-compatible endpoint. The 14
game cases live in `tools/game-cases.mjs`, shared with `tools/eval-game.mjs`,
so the model and the shipped engine answer the same list. The held-out pairs
come from `tools/dump-eval-pairs.mjs`, and each row carries the engine's own
strip for the same context, so both columns of every table below are one run
of one sample.

## Summary

1. **The 27B loses to our tables on every held-out task, in both
   languages.** Next-word, prefix completion, corrupted prefix: three losses
   out of three, and the closest one is next-word in English, 19.5 against
   22.5 hit@1.
2. **It wins the prediction game, 8 of 14 against 7.** The game rewards
   meaning; the pairs reward frequency. The split is the same one this
   project keeps finding, now at 27B.
3. **Reasoning is a loss at every price.** Thinking mode cost 160 times the
   latency, dropped two answers inside its own scratchpad, and scored no
   better. Greedy decoding made it loop: on the case `smoo` it wrote 10306
   tokens, most of them the line `"smoothe" no.` repeated, then ended with no
   answer at all.
4. **A text-only interface is worse than a small model with logits.** The
   1.58B Czech-GPT-2-XL scores 10 of 14 on the game with a constrained beam.
   This 27B scores 8 while being 17 times larger. The missing piece is not
   knowledge. It is that a chat answer carries no probabilities, no way to
   force the typed prefix, and no way to rank against our lexicon.

## What was measured

Server: vLLM, one 27B model in NVFP4, on the LAN. Strip of 6, temperature 0,
non-thinking unless the row says otherwise. Latency is the whole round trip
from this machine, including the network.

### The prediction game, 14 cases

| Engine | Score | EN 9 | CS 5 | Per strip |
|---|---|---|---|---|
| shipped `prediction.js` | 7/14 | 6 | 1 | under 1 ms |
| Qwen3.8-27B, no thinking | **8/14** | **7** | 1 | 0.2 s |
| Qwen3.8-27B, thinking, temp 0.6 | 7/14, a floor | 5 | 2 | 32 s |
| Czech-GPT-2-XL 1.58B, beam | 10/14 | 5 | 5 | 1.7 to 12 s |
| two specialist models merged | 12/14 | 7 | 5 | seconds |

The 27B answers English everyday speech well and Czech everyday speech badly,
1 of 5. Cases 9, 10 and 12 (`zaplavat`, `kuře`, `zebřičko`) are colloquial
Czech, and a model trained mostly on English and technical text does not hold
them. Case 14 is the exception in the other direction: it put `algoritmu` at
rank 3, and before today only the 1.58B Czech model reached that case.

### Held-out subtitle pairs, 200 per language

Strip of 6, hit@1 / hit@3. The engine column is the shipped `prediction.js`
on the same 200 pairs, so these numbers are internally comparable but not
comparable to the 300-pair tables in `czech-lm-research.md`.

| Task | EN model | EN engine | CS model | CS engine |
|---|---|---|---|---|
| next-word | 19.5 / 30.0 | **22.5 / 35.0** | 11.5 / 16.5 | **19.0 / 33.0** |
| prefix-2 | 49.5 / 67.2 | **63.5 / 78.6** | 35.6 / 46.1 | **63.9 / 73.8** |
| corrupted prefix | 3.1 / 9.4 | **35.4 / 51.6** | 3.1 / 5.2 | **34.6 / 53.4** |

0.34 to 0.38 s per request, four at a time.

Three readings:

- **Next-word is the closest call and still a loss.** English 19.5 against
  22.5, Czech 11.5 against 19.0. The roadmap said a big model loses where
  frequency decides. It does, and 27B does not change it.
- **Prefix completion is a large loss, which is new.** A pretrained model
  reading its own language usually wins this task; the 124M Czech models did.
  This one loses it by 14 points in English and 28 in Czech. The reason is
  the interface, not the knowledge: asked for six words starting with `fi`,
  the model writes six plausible words, in no particular frequency order, and
  our tables know which one people actually type.
- **The corrupted prefix is a collapse.** The first run scored 0.5 hit@1
  because the prompt made the typed letters a rule, and the model obeyed, and
  the wanted word does not start with those letters. The `--fuzzy-prefix`
  prompt states the engine's real rule, that a letter can be wrong. That
  lifts English from 0.5 to 3.1 and Czech from 0.5 to 3.1, and it leaves the
  engine eleven times ahead in both languages. Two
  letters, one of them wrong, is a job for edit distance over a known
  lexicon, not for meaning.

## What this changes for direction 8

The direction survives, and its shape narrows.

**A big model is not a better strip.** It is worse at the per-keystroke job
in both languages, and the gap is not a matter of size or of Czech. Nothing
here supports letting a big model rank the strip.

**The win is phrase level and meaning level, which the game shows and the
pairs cannot.** 8 of 14 against 7 is a thin win, and it is the only win.

**The text-only interface costs more than it seemed.** Direction 8 assumed a
big model contributes candidates that the merge weighs by `langPosterior()`.
That plan needs numbers. A chat model gives an order and nothing else, and
this measurement is what an order alone is worth. On iOS there is no choice
about that. On a server there is.

**Reasoning models are the wrong tool here.** Not slower for a gain; slower
for nothing, with a failure mode that returns an empty strip. Any future work
on this axis should use the non-thinking path or a base model.

## The open lead: logprobs

This server allows logprobs (`allow_logprobs: true` in `/v1/models`). vLLM
returns the top-N alternatives per generated token on `/v1/completions`, which
is enough to build the same constrained beam `tools/lm-predict.py` runs
locally, but against a 27B we could never load here. That measurement would
separate the two causes this study confounds: what the model does not know,
and what the chat interface throws away. It is the cheapest next experiment
on this hardware, and it needs no new model.

## Reproducing

The server address is the user's own machine and is deliberately not recorded
in this repo. Give it on the command line:

```sh
node tools/api-lm-predict.mjs --base http://HOST:PORT --game --no-think
node tools/dump-eval-pairs.mjs en 200 > /tmp/pairs-en.json
node tools/api-lm-predict.mjs --base http://HOST:PORT --pairs /tmp/pairs-en.json \
    --tasks next,prefix --no-think --concurrency 4 --max-tokens 300
node tools/api-lm-predict.mjs --base http://HOST:PORT --pairs /tmp/pairs-en.json \
    --tasks typo --no-think --fuzzy-prefix --concurrency 4 --max-tokens 300
```

A sandbox reaches a LAN address only after the host allows it:
`sbx policy allow network HOST:PORT`.
