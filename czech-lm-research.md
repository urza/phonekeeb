# Czech language models for the suggestion strip

Researched 2026-08-27. The user's question: are the small Czech neural models
on Hugging Face (CzeGPT-2, czech-gpt2-oscar, gpt2-small-czech-cs,
Czech-GPT-2-XL), a KenLM n-gram, or a from-scratch nanoGPT-class mini model a
viable prediction engine for this keyboard?

Every option here was downloaded, wired to a suggestion strip, and measured
on this project's own eval pairs and on the prediction game. Nothing is
scored from a model card. At the user's request the iOS keyboard rules are
relaxed: instead of asking what an extension is allowed to do, each option
gets a list of what it would need. Those lists are in "What each option would
need to ship".

Read `word-prediction-research.md` first. It holds the shipped engine's
design, its tuned constants, and the numbers this study compares against.

Every model here is one we load ourselves, with logits and a constrained
beam. A model we can only talk to in words is measured separately, on the
same game and the same held-out pairs: `served-model-research.md`, a 27B
served over the network, 2026-08-29.

## Summary

1. **The 124M Czech GPT-2 models lose to the shipped tables at next-word
   prediction, by about half.** CzeGPT-2 scores 10.0 / 18.3 (hit@1 / hit@3)
   where the shipped engine scores 17.3 / 31.3 on the same held-out pairs.
   They win at completing a typed prefix (54.2 / 72.9 against 52.8 / 65.6),
   which is where their Czech morphology shows.
2. **Scale does not fix next-word on this text.** Czech-GPT-2-XL is 1.58B
   parameters trained on 15.6B tokens, and it still only ties the tables on
   held-out subtitles (17.3 / 28.3). Every one of these models was trained on
   web crawl or Wikipedia. The strip has to predict chat and subtitle
   dialogue. This project already measured that gap once, when Norvig's web
   bigrams lost to OpenSubtitles bigrams by 30% relative
   (`word-prediction-research.md`, "Register matters").
3. **On the user's own sentences, though, the XL model is the only engine
   that reaches the quality target.** It scores 7 of 11 on the prediction
   game against the shipped engine's 6, and it is the only engine that
   answers both Czech cases: `zaplavat` at rank 1 and `kuře` at rank 5. No
   counting model, ours or KenLM's, gets either. The cost is 2.3 seconds per
   strip in bfloat16 on a 16-core desktop CPU, from 3.46 GB of weights.
4. **The best value per byte is a mini model trained from scratch over our
   own lexicon.** 1.30M parameters, 1.3 MB quantized, 67 minutes of CPU
   training on 15.4M tokens: it matches the shipped tables on next-word
   (17.7 / 30.7) and beats them on prefix-2 by 5.2 and 10.8 points
   (58.0 / 76.4), answering in 0.6 ms on one thread. It was still improving
   when training stopped.
5. **KenLM says the same thing from the other direction.** A modified
   Kneser-Ney trigram over the same subtitle corpus, pruned to 1.86 MB
   (the shipped Czech tables are 1.81 MB), scores 61.8 / 81.6 on prefix-2.
6. So the open work is not to adopt a pretrained Czech LM. It is that
   **`prediction.js` leaves 5 to 9 points of prefix-2 hit@1 and 11 to 16
   points of hit@3 on the table**, and two independent engines at the same
   byte budget just proved it.

## How this was measured

Six harnesses, all in `tools/`, all committed with this note:

- `tools/dump-eval-pairs.mjs` writes the held-out eval pairs of
  `tools/eval-prediction.mjs` to JSON, together with the shipped Predictor's
  own six chips for each pair. Every engine in this study is scored on
  exactly those pairs against exactly those chips, so the two columns of
  every table come from the same 300 questions.
- `tools/lm-predict.py` turns a GPT-2 class model into a suggestion strip.
- `tools/kenlm-predict.py` does the same for a KenLM binary.
- `tools/build-kenlm-corpus.py` writes the KenLM training text from the same
  dump, with the same tokenization and the same held-out lines as
  `tools/build-ngrams.py`.
- `tools/train-mini-lm.py` trains and scores the from-scratch arm.
- `tools/lm-perplexity.py` reports per-word perplexity, so models with
  different tokenizers stay comparable.

To reproduce, from the repo root, with the 400 MiB corpus prefix already in
`tools/corpus/` (the eval harness downloads it):

```bash
node tools/dump-eval-pairs.mjs cs 1000 > pairs-cs.json

# pretrained models
python3 tools/lm-predict.py --model MU-NLPC/CzeGPT-2 --game --dtype bfloat16
python3 tools/lm-predict.py --model MU-NLPC/CzeGPT-2 --pairs pairs-cs.json \
    --limit-pairs 300 --dtype bfloat16

# KenLM (needs lmplz and build_binary built from kpu/kenlm; on Boost 1.69
# and newer, drop the "system" component from its CMakeLists, because Boost
# stopped shipping boost_system as a separate library)
python3 tools/build-kenlm-corpus.py \
    tools/corpus/os-cs-419430400.txt.gz kenlm-cs.txt
python3 -c "import re;print('\n'.join(w for f in ['words-cs.js','words-ext-cs.js'] \
    for w in re.findall(r'\[\"([^\"]+)\",', open(f, encoding='utf-8').read())))" \
    > vocab-cs.txt
lmplz -o 3 --prune 0 200 400 --limit_vocab_file vocab-cs.txt \
    < kenlm-cs.txt > cs.arpa
build_binary -a 22 -q 8 -b 8 trie cs.arpa cs.bin
python3 tools/kenlm-predict.py --lm cs.bin --pairs pairs-cs.json --game

# the mini model
python3 tools/train-mini-lm.py --corpus kenlm-cs.txt --out mini-cs.pt \
    --dim 96 --layers 3 --block 24 --batch 128 --steps 5000
python3 tools/train-mini-lm.py --eval mini-cs.pt --pairs pairs-cs.json
```

### A language model is not a suggestion strip

This is the part no model card mentions. A GPT-2 gives a distribution over
subword tokens. The strip needs whole words, and a typed prefix constrains
the word, not the tokens. Two mechanisms bridge the gap in
`tools/lm-predict.py`:

- **Marginalization over tokenizations.** "zaplavat" can be `Ġzapla`+`vat` or
  `Ġzap`+`lavat`. Both spellings of one word sum into one candidate, so a
  word is not punished for being cut in an unlucky place.
- **The prefix constraint inside the beam.** Filtering after generation
  returns an empty strip almost every time. The beam instead masks the
  vocabulary at every step to the tokens still compatible with the letters
  already typed.

A beam ends a word when the next token opens a new word or is punctuation.
The two branches (end here, continue) partition the vocabulary, so no
probability is counted twice. Beam width 24, at most 6 subword tokens per
word. Any real deployment of a pretrained LM in a keyboard needs this same
layer, so its cost belongs to the measurement.

The mini model needs none of it. Its output layer is the lexicon, so one
forward pass gives a score for every candidate word and a typed prefix is a
mask over that vector. That is the whole argument for the from-scratch arm.

### Fairness notes

- The transformer sees the whole left context of the line. The shipped engine
  sees `prev`, `prev2`, and the last 8 words as language evidence. That
  favors the transformer, deliberately: a real port would hand it
  `documentContextBeforeInput`.
- The eval text is lowercase, with punctuation stripped, because that is what
  the corpus pipeline and the gesture alphabet produce. Web-trained models
  never saw text in that shape. This is a real handicap, and it is part of
  the register problem rather than separate from it.
- Targets are core-vocabulary Czech words, the same set the shipped engine's
  eval uses. An open-vocabulary model gets no credit for words the test set
  cannot contain, and no penalty either.
- The mini model ranks 10,002 candidates where the shipped engine ranks
  58,743. The extension tier is worth 0 to 0.1 points in every mode
  (`word-prediction-research.md`, "Extension vocabulary shipped"), so the
  smaller pool is not what makes the mini model look good.
- All four pretrained models are reported in bfloat16, which this machine
  (Ryzen 9 9950X, AVX512-BF16) runs 2 to 20 times faster than float32.
  Float32 was checked against it before the switch: the game replay agreed
  for CzeGPT-2 and for the XL model (same score, same strips up to tie
  order), and the pair eval agreed for CzeGPT-2 and czech-gpt2-oscar within
  0.3 points in every cell.
- The `--cap` rows restrict a transformer's chips to words the shipped
  lexicon knows. It is a post-filter over the beam output, not a
  lexicon-constrained decode, so those rows are a lower bound.

## The models

| Model | Params | Trained on | License |
|---|---|---|---|
| MU-NLPC/CzeGPT-2 | 124M | 5 GB csTenTen17 (web) | CC-BY-NC-SA-4.0 |
| lchaloupsky/czech-gpt2-oscar | 124M | 21 GB OSCAR (web crawl) | MIT |
| spital/gpt2-small-czech-cs | 124M | ~1 GB Czech Wikipedia | CC-BY-SA-4.0 |
| BUT-FIT/Czech-GPT-2-XL-133k | 1.58B | 78 GB / 15.6B tokens web | MIT |

Facts that matter for this project:

- CzeGPT-2 is the only one trained from scratch on Czech. Its card reports
  perplexity 42.12 on a csTenTen17 slice, that is, in its own domain.
- czech-gpt2-oscar and gpt2-small-czech-cs are the English GPT-2 small
  adapted to Czech: new tokenizer, new embeddings, then fine-tuned. The
  Wikipedia one had about 1 GB of text, and it shows.
- Czech-GPT-2-XL is GPT-2 XL adapted the same way (48 layers, 1600 hidden,
  64k vocabulary) and trained for 139B tokens. Its own card says it had not
  converged when the experiment ended.
- **CzeGPT-2's licence forbids commercial use.** That rules it out of a
  shipped product whatever the numbers say. Two of the others carry
  share-alike duties.
- All four are Czech-only. The project constraint is one engine for Czech and
  English together (`CLAUDE.md`, user constraint 2026-08-25), so each needs a
  second model or a bilingual replacement. The XL model is the exception in
  practice, because 1000 English embeddings were copied into it and Czech web
  text carries a lot of English; it answered the English game cases.

## Result 1: held-out subtitle pairs

300 held-out Czech pairs, strip of 6, hit@1 / hit@3. "shipped" is the current
`prediction.js` with bigrams, trigrams, and the extension vocabulary, on the
same pairs. Every pretrained model is bfloat16.

| Engine | Weights | next-word | prefix-2 |
|---|---|---|---|
| shipped `prediction.js` (baseline) | 1.81 MB | 17.3 / 31.3 | 52.8 / 65.6 |
| mini word-level model | 1.3 MB int8 | 17.7 / 30.7 | 58.0 / 76.4 |
| KenLM order 3, 1.86 MB tier | 1.86 MB | 18.7 / 30.7 | 61.8 / 81.6 |
| KenLM order 5, full | 175.6 MB | **28.7 / 42.7** | **71.5 / 89.6** |
| CzeGPT-2 | 248 MB bf16 | 10.0 / 18.3 | 54.2 / 72.9 |
| czech-gpt2-oscar | 248 MB bf16 | 12.0 / 18.0 | 54.9 / 71.9 |
| gpt2-small-czech-cs | 248 MB bf16 | 5.0 / 10.7 | 41.0 / 58.3 |
| Czech-GPT-2-XL | 3.46 GB bf16 | 17.3 / 28.3 | 58.7 / 78.5 |

Three readings:

- **Next-word is the strip's hardest and most valuable job on this keyboard**,
  because a gesture letter costs more than a tap letter, so the chip after a
  space saves more here than on a normal keyboard. Every pretrained model
  loses it. Twelve times more parameters (the XL row) buys a tie, not a win.
- **Prefix completion is where reading Czech pays.** Given two typed letters,
  a model that has read billions of Czech words knows which inflected form
  follows. But the mini model and the KenLM tier reach the same place for
  1/50th of the bytes, so this is not an argument for a pretrained model. It
  is an argument that the shipped scorer ranks completions badly.
- **Capping the transformers to the shipped lexicon changes nothing.**
  Measured in float32: CzeGPT-2 stays at 9.7 / 18.0 on next-word and moves
  from 54.5 / 72.6 to 54.9 / 72.9 on prefix-2; czech-gpt2-oscar does not move
  at all. So they are not losing next-word by spending slots on invented
  words. They are ranking real words in the wrong order for this register.

## Result 2: the prediction game

The 11 exchanges of `prediction-game.md`, replayed through each engine.
`prediction-game-analysis.md` holds the shipped engine's replay, currently
6 of 11. The LLM that played the game live scored 8 of 11, and that is the
quality target this project set for itself.

| Engine | game score |
|---|---|
| the LLM in the live game (the target) | 8/11 |
| **Czech-GPT-2-XL** | **7/11** |
| shipped `prediction.js` | 6/11 |
| KenLM order 3 and order 5 | 4/11 |
| CzeGPT-2 | 3/11 |
| czech-gpt2-oscar | 3/11 |
| gpt2-small-czech-cs | 2/11 |

Read the totals with care. Seven of the eleven exchanges are English, and a
Czech-only model answers them in Czech, so it cannot score them. The totals
for the three 124M models say more about the test set than about the models.
The XL number is real, because that model does answer English.

Re-measured 2026-08-27 with cases 12 to 14 added to the harness (the
denominators moved, so these are not the rows above): Czech-GPT-2-XL 10/14,
CzeGPT-2 5/14, czech-gpt2-oscar 5/14, shipped `prediction.js` 7/14. Cases 13
and 14 are the first exchanges in technical Czech, and they run the register
argument the other way: subtitles hold no form of `predikce` or `prediktor`,
web crawl holds all of them. All three web-trained models answer case 13
(ranks 3, 5, 6 by size); only the XL answers case 14, at rank 4. See
`prediction-game.md`, session 4.

The two Czech cases are the evidence worth reading:

```
case 9   paja se šla vykoupat a |zapla        wanted: zaplavat
  shipped     zaplatit, zaplatila, zaplatil, zaplaceno, ...      miss
  KenLM o3    zaplatil, zaplatit, zaplatím, zaplatí, ...         miss
  spital      zaplatit, zaplatila, zaplatí, zaplatil, ...        miss
  CzeGPT-2    zaplatit, zaplavat, zaplatila, zaplatili, ...      hit@2
  oscar       zaplavat, zaplatit, zaplavala, zaplatila, ...      hit@1
  XL          zaplavat, zaplavala, zaplatila, zaplatit, ...      hit@1
```

`prediction-game-analysis.md` already named this case: "a valid word can
still be a prefix", and the right answer needs the sense of the sentence
(after "vykoupat a", a parallel infinitive is likely). Frequency puts the
`zaplat*` payment cluster first, and every counting model does the same.
Three of the four transformers put `zaplavat` first or second, because they
read the context.

```
case 10  mam hlad dam si |k                   wanted: kuře
  shipped     když, k, kdo, kde, ...                             miss
  KenLM o3    k, každý, když, kvůli, ke, koupit                  miss
  CzeGPT-2    k, kousek, koupit, kafe, kus, kávu                 miss
  oscar       k, koupit, ke, kafe, kávu, kousek                  miss
  XL          kousek, kafe, kuřecí, k, kuře, kus                 hit@5
```

The counting models answer with Czech function words that start with k. The
124M models answer with food and drink (kousek, kafe, kávu, koupit): they
understood "mám hlad", they just do not reach `kuře`. The XL model reaches
it. This is the one place in the study where parameter count clearly buys
the right answer.

Two more notes from the replay:

- On case 5 (`its` -> `it's`) CzeGPT-2 and czech-gpt2-oscar score a hit that
  is not a hit. They offer "its", which folds to the same match key but
  inserts the wrong string. The shipped engine, gpt2-small-czech-cs, and the
  XL model all offer "it's" itself.
- The small models invent words. `smoo` produces "smool, smoop, smoola" from
  CzeGPT-2 and "smoonie, smoopu, smooka" from gpt2-small-czech-cs. An
  open-vocabulary LM has no lexicon, so this needs a lexicon-constrained
  decode, which the `--cap` rows only approximate.

## Result 3: KenLM, the classic n-gram done properly

The shipped engine is stupid backoff over top-24 successor lists with
log-quantized counts. KenLM is modified Kneser-Ney over full counts, and it
is what every pre-neural keyboard used. Trained here on the same 400 MiB
OpenSubtitles prefix (199M tokens), the same tokenization, and the same
held-out split, so nothing but the model differs.

| Model | Binary | next-word | prefix-2 | ppl/word | OOV |
|---|---|---|---|---|---|
| shipped tables (cs) | 1.81 MB | 17.3 / 31.3 | 52.8 / 65.6 | n/a | 7.6% |
| order 3, prune 0/200/400, 40k vocab | 1.86 MB | 18.7 / 30.7 | 61.8 / 81.6 | 1428 | 7.6% |
| order 3, prune 0/20/40, 40k vocab | 5.56 MB | 19.7 / 34.3 | 66.0 / 85.4 | 932 | 7.6% |
| order 3, prune 0/3/3, 40k vocab | 34.1 MB | 23.3 / 39.7 | 70.8 / 87.8 | 344 | 7.6% |
| order 3, prune 0/3/3, open vocab | 96.8 MB | 22.7 / 39.7 | 70.5 / 87.5 | 228 | 0.2% |
| order 5, prune 0/1/3/5, open vocab | 175.6 MB | 28.7 / 42.7 | 71.5 / 89.6 | 104 | 0.2% |

Sizes are the quantized trie (`build_binary -a 22 -q 8 -b 8`), the form a
phone would mmap. The 40k vocabulary is the shipped Czech list (3000 core
plus 37000 extension), so those rows and the shipped row miss the same 7.6%
of held-out tokens. Perplexity is per word over 400 held-out lines, and the
two open-vocabulary rows are not comparable with the rest for that reason:
a 40k-word model pays an OOV penalty the open model does not.

The second row is the one that matters. **At the same byte budget as the
shipped Czech tables, KenLM adds 9 points of prefix-2 hit@1 and 16 points of
hit@3.** Next-word is a wash (+1.4 / -0.6).

Where does the prefix-2 gap come from? Two diagnostics on the same pairs:

- **Not the mixed-language design.** A Czech-only shipped Predictor scores
  within 0.7 points of the mixed one in every cell. The language posterior is
  doing its job; it is not the leak.
- **Partly the typo slots.** Setting `TYPO_SLOTS` to 0 lifts prefix-2 by
  2.8 points of hit@1 and 4.8 of hit@3 on the same pairs (50.7 / 66.7 to
  53.5 / 71.5 in that run, which uses bigram context only, so read the delta
  and not the level). That is the known trade against the typo-2 row, now
  priced in Czech.

So the typo slots explain about a third of the hit@1 gap. The rest is
smoothing and successor depth: KenLM keeps every pair above the prune floor,
while the shipped tables keep the top 24 per head and back off to a
discounted unigram for everything else.

(Acted on the same day. The tables now carry a per-context backoff
weight and keep the top 32, which took about half of the remaining gap;
see `word-prediction-research.md`, "Completion scorer smoothed".)

Two limits of this arm, both real and both fixable:

- The KenLM harness has **no typo hypotheses**, so its typo-2 row is 0.0%
  against the shipped engine's 30.6 / 43.8. Candidate generation is
  orthogonal to scoring; the one-edit branch of `prediction.js` bolts
  straight on.
- The model is Czech-only. Serving both languages needs a mixed-corpus model
  or two models behind the existing language posterior.

## Result 4: a mini model trained from scratch

`tools/train-mini-lm.py`. A word-level transformer over this project's own
Czech vocabulary, sized on Gboard's published federated model (10k words,
embedding 96, about 1.4M parameters), trained on the same subtitle corpus
with the same held-out lines.

| | |
|---|---|
| Shape | 3 layers, 96 hidden, 4 heads, 24-word context, tied embedding |
| Vocabulary | 10,000 Czech words plus `<unk>` and `<s>` |
| Parameters | 1.30M (1.3 MB int8, 5.2 MB float32) |
| Training | 5000 steps, batch 128, 15.4M tokens, 67 minutes on 6 CPU threads |
| Final loss | 4.77 (per-word perplexity 117 over in-vocabulary tokens) |

| Mode | mini | shipped |
|---|---|---|
| next-word | 17.7 / 30.7 | 17.3 / 31.3 |
| prefix-2 | 58.0 / 76.4 | 52.8 / 65.6 |

It ties the shipped tables on next-word and beats them by 5.2 / 10.8 on
prefix completion, from 1.3 MB of quantized weights and one forward pass.

Two things make this the interesting arm:

- **The output layer is the lexicon.** No beam search, no invented words, and
  a typed prefix is a mask over the output vector. Latency is one forward
  pass for the whole strip, whatever the user has typed.
- **It is not finished.** The loss was still falling when the run ended at
  15.4M tokens, which is 13% of the 120M tokens encoded for it and 8% of the
  corpus. This measurement is a floor, produced on a CPU-only machine at
  about 2,500 training tokens per second. A single consumer GPU would run the
  same 5000 steps in a few minutes and could see 100 times more text in an
  afternoon.

The honest caveats: it is Czech-only, its vocabulary is 10k against the
shipped 58k candidate pool (worth 0 to 0.1 points, see the fairness notes),
and it has no typo branch, so it was not measured on typo-2.

## Result 5: cost

Measured on a Ryzen 9 9950X, batch 1, one strip at a time, on an otherwise
idle machine. Pretrained models in bfloat16.

| Engine | Weights | Per strip |
|---|---|---|
| mini word-level model (1 thread) | 1.3 MB int8, 5.2 MB f32 | 0.6 ms |
| shipped `prediction.js` (node, 1 thread) | 1.81 MB | 4.0 ms |
| KenLM order 3, 1.86 MB tier (Python, 1 thread) | 1.86 MB | 6.7 ms |
| CzeGPT-2 / oscar / spital, 124M (14 threads) | 248 MB | 324 / 369 / 339 ms |
| Czech-GPT-2-XL, 1.58B (10 threads) | 3.46 GB | 2326 ms |

The transformer numbers are the cost of a strip, not of one token: six
sequential forward passes over a batch of 24 beams. The budget this project
inherited from Gboard's paper is about 20 ms per keystroke
(`word-prediction-research.md`).

Per-word perplexity on the same 400 held-out subtitle lines. This is the
register argument as one number. Perplexity is normalized per word, not per
token, because a byte-level BPE and a word vocabulary cut a sentence into
different numbers of pieces.

| Model | ppl / word |
|---|---|
| KenLM order 5, 175.6 MB | 104 |
| KenLM order 3, 96.8 MB | 228 |
| KenLM order 3, 34.1 MB | 344 |
| **Czech-GPT-2-XL, 1.58B** | **799** |
| KenLM order 3, 5.56 MB | 932 |
| **KenLM order 3, 1.86 MB** | **1428** |
| czech-gpt2-oscar, 124M | 2899 |
| CzeGPT-2, 124M | 3202 |
| gpt2-small-czech-cs, 124M | 23094 |

Read the two bold rows together. **A 1.86 MB table of subtitle counts models
this text more than twice as well as a 124M-parameter transformer**, and the
1.58B model needs 1900 times the weights to beat it. CzeGPT-2's own card
reports perplexity 42.12 on a csTenTen17 slice. That number is per token, on
cased and punctuated web text, so it is not this number; but the distance
between 42 in its own domain and 3202 in ours is the whole finding of this
study in one line.

The three 124M rows also rank the training corpora exactly as expected:
21 GB of web crawl beats 5 GB of web text, and both beat 1 GB of Wikipedia by
an order of magnitude. Wikipedia is the furthest thing from chat.

## What each option would need to ship

Written with the iOS keyboard rules relaxed, as asked. Where a rule would
bite, it is noted, but it is not the filter here.

### Pretrained Czech GPT-2, 124M

- A word-level decoder like `tools/lm-predict.py`, ported. Real work, and it
  sits on the critical path of every keystroke.
- int8 quantization (about 124 MB) and a runtime: CoreML, ONNX Runtime, or
  llama.cpp. None is a small dependency.
- Fine-tuning on conversational Czech, or the register problem stays. Budget:
  a few GPU-hours on subtitle plus chat data. Note that once you are
  fine-tuning on our corpus anyway, the mini model arm does the same job for
  1/200th of the weights.
- A second model or a bilingual replacement, for English.
- A licence that permits the product. CzeGPT-2's does not.
- Would break the iOS rule: an extension gets roughly 48 to 60 MB of memory
  (`ios-deployment-research.md`), so int8 weights alone do not fit. The
  containing app or an OS-hosted model is the only route.

### Czech-GPT-2-XL, 1.58B

- Everything above, plus int4 quantization (about 790 MB) and a device with
  the memory to hold it outside the extension.
- 2.3 seconds per strip on a 16-core desktop CPU. A phone NPU with int4
  weights would improve that, but not by the two orders of magnitude a
  per-keystroke strip needs. This is a phrase-level feature: a "complete this
  sentence" chip, or a proofread pass, not the strip.
- On iOS the honest form of this option is not this model. It is the iOS 26
  Foundation Models framework, where the OS hosts a ~3B model and its memory
  does not count against the extension (`word-prediction-research.md`, Apple
  section). That model is multilingual, which also answers the
  Czech-and-English constraint.

### KenLM

- A build tier from the table above. 1.86 MB matches today's budget; 5.56 MB
  is the cheapest real jump.
- The C++ library, mmap-loaded, or a reimplementation of the trie query in
  Swift. **KenLM is LGPL**, which constrains static linking in an App Store
  binary. A clean-room reader over the same file format avoids that.
- The one-edit candidate branch of `prediction.js`, moved over, or the typo
  row stays at zero.
- A mixed Czech-English corpus, or two models behind the existing language
  posterior.
- This is the only option in the study that needs no new runtime, no GPU, and
  no change to the keyboard's shape. It is also the least interesting one,
  because the mini model reaches the same place with a smaller file.

### The mini model

- A GPU for training. On a rented card the run above is minutes, and a proper
  run (one or more passes over the 199M-token corpus) is an afternoon.
- A joint Czech and English vocabulary and corpus, which suits this project:
  the one-layout constraint already asks for one blended model.
- Int8 quantization and a tiny inference kernel. A 3-layer, 96-wide
  transformer is a few hundred lines of Swift, or one small CoreML model. No
  llama.cpp, no ONNX.
- The typo branch, the personal model, and the verbatim chip stay where they
  are. This model replaces the scorer, not the candidate generator, so the
  rest of `prediction.js` survives.
- It fits the iOS extension memory budget with room to spare, which none of
  the pretrained options do.

## Where this leaves the project

The user's question was whether a small Czech neural model could be the
prediction engine. The measured answer is no for the pretrained ones, and the
reason is not the one that was expected. Size and speed are real problems,
but the deeper problem is that these models were trained on the wrong kind of
Czech. Web crawl and Wikipedia do not teach a model how people talk. Our
1.8 MB of counts, built from exactly the register the strip serves, models
held-out dialogue twice as well as a 124M-parameter transformer does.

Three things came out of the measurement that are worth acting on:

1. **Retune the completion scorer.** Two independent engines at the same byte
   budget beat `prediction.js` by 5 to 9 points of prefix-2 hit@1 and 11 to
   16 of hit@3. The suspects, in order: the top-24 successor cap, the flat
   backoff against real Kneser-Ney discounting, and the 2 typo slots (priced
   at 2.8 / 4.8 above). `tools/eval-prediction.mjs` already decides this.
2. **Train the mini model properly.** It is the one neural shape that fits a
   keyboard, it already ties the tables after 15M training tokens on a CPU,
   and it costs 1.3 MB. Next step: a joint en+cs vocabulary and a full training
   run on a GPU, scored by the same harness.
3. **Keep the big model for phrase-level features only.** Czech-GPT-2-XL
   answered `zaplavat` and `kuře`, and 7 of 11 game cases. That is the
   quality target, at seconds per strip. On iOS the route to it is Foundation
   Models, not a bundled GPT-2.

The two Czech game cases stay on the record as the thing counting cannot do.
When the strip has to know that "vykoupat a" wants another infinitive, only
the transformers got it right.

## Sources

- CzeGPT-2: https://huggingface.co/MU-NLPC/CzeGPT-2
- CzeGPT-2 paper (IEEE Access 2024): https://doi.org/10.1109/ACCESS.2024.3371689
- czech-gpt2-oscar: https://huggingface.co/lchaloupsky/czech-gpt2-oscar
- czech-gpt2-oscar thesis: https://dspace.cuni.cz/handle/20.500.11956/176356
- gpt2-small-czech-cs: https://huggingface.co/spital/gpt2-small-czech-cs
- Czech-GPT-2-XL-133k: https://huggingface.co/BUT-FIT/Czech-GPT-2-XL-133k
- BUT-LCC corpus and the SemANT project: https://www.fit.vut.cz/research/project/1629/.en
- CSTinyLlama-1.2B, Apache-2.0, same group, worth a look if the XL route is
  ever taken: https://huggingface.co/BUT-FIT/CSTinyLlama-1.2B
- KenLM: https://kheafield.com/code/kenlm/
- KenLM trie structures: https://kheafield.com/code/kenlm/structures/
- Modified Kneser-Ney estimation in KenLM: https://aclanthology.org/W13-2201/
- nanoGPT: https://github.com/karpathy/nanoGPT
- Gboard federated LSTM, the 1.4 MB / 10k-vocabulary reference point:
  https://arxiv.org/abs/1811.03604
- OPUS OpenSubtitles 2018: https://opus.nlpl.eu/legacy/OpenSubtitles-v2018.php
