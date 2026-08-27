# Prediction game

Date: 2026-08-25

A manual probe of next-word prediction. The user types a sentence
fragment. The model offers up to 5 candidate next words. The user
picks one by number, or names the word the model missed.
Suggestions are sorted by likelihood, most likely first.

Purpose: these exchanges show what the user expects from the
keyboard suggestion strip. They double as test cases for the
prediction algorithm (see `tools/eval-prediction.mjs`). An LLM as
the engine is the quality target, not the implementation. The
keyboard app must reach for it with small local methods.

## Exchanges

### 1
- Input: `you are am`
- Suggestions: 1. amazing 2. among 3. ambitious 4. amazed 5. amusing
- Chosen: 1 (amazing), hit at rank 1

### 2
- Input: `how`
- Suggestions: 1. are 2. do 3. to 4. can 5. much
- Chosen: 1 (are), hit at rank 1

### 3
- Input: `do i e`
- Suggestions: 1. even 2. ever 3. eat 4. explain 5. enter
- Chosen: 1 (even), hit at rank 1

### 4
- Input: `future is`
- Suggestions: 1. bright 2. now 3. here 4. uncertain 5. unknown
- Chosen: 2 (now), hit at rank 2

### 5
- Input: `its`
- Suggestions: 1. a 2. time 3. not 4. been 5. like
- Chosen: none, miss. The user wanted `it's` as a correction of the
  typed word itself, not a next word. Lesson: the suggestion strip
  must also offer apostrophe corrections of the current word
  (its -> it's, dont -> don't, im -> I'm).

### 6
- Input: `I`
- Suggestions: 1. am 2. don't 3. have 4. was 5. think
- Chosen: none, miss. The user wanted `love`.

### 7
- Input: `I w`
- Suggestions: 1. want 2. will 3. was 4. would 5. wish
- Chosen: 4 (would), hit at rank 4

## Session summary (2026-08-25)

- 7 exchanges: 5 hits, 2 misses.
- Hits by rank: 3 at rank 1, 1 at rank 2, 1 at rank 4.
- Miss 1 (`its`): the strip must offer apostrophe corrections of
  the current word (its -> it's), not only next words.
- Miss 2 (`I` -> love): frequent-verb continuations after `I`
  compete hard; five slots fill fast. `love` lost to auxiliaries.
- Inputs mix two modes: next-word prediction (`how`, `future is`)
  and current-word completion (`you are am`, `do i e`, `I w`).
  The engine must serve both from one strip.

## Session 2 (2026-08-26)

### 8
- Input: `deliberat`
- Suggestions: 1. deliberately 2. deliberate 3. deliberation
  4. deliberating 5. deliberated
- Chosen: 1 (deliberately), hit at rank 1

### 9
- Input: `paja se šla vykoupat a zapla` (Czech)
- Suggestions: 1. si 2. televizi 3. topení 4. světlo 5. rádio
- Chosen: none, miss. The user wanted `zaplavat`. `zapla` reads as
  a complete word (colloquial past of zapnout), but here it was a
  prefix. Lesson: a valid word can still be a prefix. The strip
  must mix both readings. Context argues for the prefix here: after
  `vykoupat a` a parallel infinitive is likely (vykoupat a
  zaplavat), and the same trick failed the other way in exchange 5.

### 10
- Input: `mam hlad dam si k` (Czech)
- Suggestions: 1. obědu 2. večeři 3. kuře 4. snídani 5. koláč
  (mixed readings: `k` as preposition -> next word, `k` as prefix
  -> completion)
- Chosen: 3 (kuře), hit at rank 3. The prefix reading won over the
  preposition reading.

### 11
- Input: `smoo`
- Suggestions: 1. smooth 2. smoothie 3. smoothly 4. smoother
  5. smoothed
- Chosen: 1 (smooth), hit at rank 1

## Session 2 summary (2026-08-26)

- 4 exchanges: 3 hits, 1 miss.
- Hits by rank: 2 at rank 1, 1 at rank 3.
- Miss (`zapla` -> zaplavat): a valid word can still be a prefix.
  The strip must offer both readings at once.
- Czech entered the game (exchanges 9, 10). Exchange 10 confirmed
  the mixed strip: the prefix reading (kuře) beat the preposition
  reading (obědu).

## Session 3 (2026-08-27)

### 12
- Input: `ahojky zebricko` (Czech)
- Wanted: `zebřičko`, the vocative of `zebřička`, a coined pet name
  from `zebra` ("hi, little zebra"). Short i, so not `žebříčko`.
- Engine strip: `zebricko` (the verbatim chip alone). One letter
  earlier, at `zebric`, it offered `žebříčku`.
- Chosen: none, miss.

Two separate failures in one exchange:

- `ahojky` is not in the vocabulary at all. Only `ahoj` is. So the
  strip had no context word to score against and the whole burden fell
  on the prefix.
- No form of `zebřička` exists in the 40000 Czech forms. The only word
  whose stripped key starts with `zebric` is `žebříčku`.

Lesson: a greeting is followed by a name. Subtitle corpora carry
neither the playful greeting forms nor anyone's nickname, so no
counting model can ever answer this exchange, at any table size. This
one belongs to the personal model, and it is the clearest argument yet
for seeding it from chat exports.

A separate lesson about the word itself: `zebřičko` is derivable from
`zebra`, which IS in the vocabulary, by two productive Czech rules
(diminutive `-a` to `-ička` with r/ř palatalization, then vocative
`-a` to `-o`). A model that knows Czech morphology, or one that works
below the word, can reach it without ever having seen it. Measured
2026-08-27 with the harness of `czech-lm-research.md`, strip of 8:

```
Czech-GPT-2-XL    ahojky |zebricko -> zebřičko, zebřičkové, ...     rank 1
CzeGPT-2          ahojky |zebricko -> zebřičkové, zebřičko, ...     rank 2
czech-gpt2-oscar  ahojky |zebricko -> žebříčkové, žebříčková,
                                      žebřičko, ...                 rank 3, wrong z
shipped engine    ahojky |zebricko -> zebricko                      miss
```

The greeting helps the big model: without any context it ranks
`zebřičko` eighth, and with `ahojky` in front it ranks it first.

## Session 4 (2026-08-27)

Played right after the completion scorer shipped (per-context backoff
weights, caps 32 and 8). The user typed one Czech sentence about the
keyboard itself.

### 13
- Input: `zkouška nového predik`
- Suggestions: 1. prediktoru 2. prediktivního 3. predikčního
  4. prediktora 5. predikce
- Chosen: 3 (predikčního), hit at rank 3. `predikce` was ranked last
  despite being the commoner word, because `nového` is genitive
  masculine/neuter and `predikce` is feminine.

### 14
- Input: `zkouška nového predikčního`
- Suggestions: 1. modelu 2. algoritmu 3. systému 4. enginu
  5. nástroje
- Chosen: 2 (algoritmu), hit at rank 2.

### 15
- Input: `zkouška nového predikčního algoritmu`
- Suggestions: 1. proběhla 2. v 3. na 4. dopadla 5. je
- Chosen: none; the user closed the session here.

## Session 4 summary (2026-08-27)

- 2 exchanges answered: 2 hits, at ranks 3 and 2.
- The shipped engine misses both. Replayed with
  `node tools/eval-game.mjs` (cases 13 and 14 are in it now):

```
#13 "zkouška nového predik"       strip: predik
#14 "zkouška nového predikčního"  strip: to | se | je | a | na | jsem
```

Neither miss is a ranking failure. Both are cause A, vocabulary, in
two flavors this game had not separated before:

- **Topical register.** No form of `predikce`, `prediktor` or
  `predikční` is in the 40000 Czech forms. Subtitles are people
  talking, and people in films do not discuss prediction algorithms.
  The English tail does carry `prediction` and `predictable`, so the
  gap is Czech-side and topical, not a size problem. Typing `pred`
  reaches `před, prezidenta, předtím, představit, předpokládám`:
  the neighbourhood is full, the word is simply not in it.
- **Inflection coverage.** `algoritmus` IS in the vocabulary;
  `algoritmu`, the genitive the sentence needs, is not. One lemma,
  one case form short. This is the Czech half of the extension tier
  doing its job and still missing, which no cap sweep can fix.

Two things the engine got right and the strip never showed:

- After `nového` it offers `světa, přítele, o, roku, v, života`:
  genitive masculine and neuter nouns. The agreement is correct. The
  engine knew the shape of the answer and lacked the word.
- A known word can still carry no context. `zkouška` is in the
  vocabulary, yet its next-word strip is the same generic
  `to | se | je | a | na | jsem` as an unknown word's, because no pair
  headed by it clears the floor of 20. For the strip, rare-but-known
  and unknown behave alike.

Exchange 15 was never answered, so it is not in the harness. Worth
noting anyway: its strip is byte-identical to 14's, because `algoritmu`
is out of vocabulary too, so the context contributes nothing either
time.

### Would the GPT models suggest it?

The same question case 12 asked, measured the same way
(`python3 tools/lm-predict.py --model M --game --dtype bfloat16`; cases
13 and 14 are in that harness now). Strip of 6:

```
case 13   zkouška nového |predik   -> wanted predikčního
  Czech-GPT-2-XL    prediktivního, prediktoru, predikčního, predikátu, ...   rank 3
  czech-gpt2-oscar  predikátu, prediktoru, prediktora, predikce,
                    predikčního, ...                                         rank 5
  CzeGPT-2          prediktoru, prediktora, predikátu, prediktivního,
                    predikce, predikčního                                    rank 6
  shipped engine    predik                                                   miss

case 14   zkouška nového predikčního -> wanted algoritmu
  Czech-GPT-2-XL    modelu, systému, nástroje, algoritmu, softwaru, modulu   rank 4
  czech-gpt2-oscar  období, modelu, plánu, programu, kurzu, termínu          miss
  CzeGPT-2          zákona, předpisu, papíru, materiálu, řádu, listu         miss
  shipped engine    to, se, je, a, na, jsem                                  miss
```

Yes, and the reason is the register argument running backwards. These
models were rejected as the engine because they are trained on web
crawl and the strip has to predict chat (`czech-lm-research.md`). This
sentence is not chat. It is technical Czech, the one register web crawl
has and subtitles do not, so all three models hold the `predik*` family
that our tables lack entirely. Case 13 orders them by size, ranks 3, 5,
6. Only the XL reaches `algoritmu`, and even the misses are the right
shape: `oscar` offers `modelu` at rank 2 and `CzeGPT-2` offers a whole
legal-document register (`zákona, předpisu`), both correctly genitive.

Full-harness scores with cases 12 to 14 included: Czech-GPT-2-XL 10/14,
CzeGPT-2 5/14, czech-gpt2-oscar 5/14, shipped engine 7/14. The earlier
n/11 numbers are not comparable to these.

### And the English side of the same idea

`ideas.md` left one question open under "A big model beside the small
one": Czech-GPT-2-XL is Czech only, so English needs a second model or
a multilingual one. Measured 2026-08-27 on the same 14 cases, strip of
6, same harness:

| Model | English 9 | Czech 5 | total |
|---|---|---|---|
| Czech-GPT-2-XL-133k, 1.58B | 5 | 5 | 10/14 |
| Qwen3-1.7B-Base, 2025, multilingual | 6 | 2 (+1 fold) | 9/14 |
| GPT-2 XL, 1.5B, 2019 | 7 | 0 | 8/14 |

`openai-community/gpt2-xl` is the literal equivalent: Czech-GPT-2-XL
IS GPT-2 XL, 48 layers and 1600 hidden, adapted to Czech. It reads
English better than the Czech adaptation does (7 of 9 against 5) and
is useless in Czech, which is the expected shape.

The better answer is one model instead of two. `Qwen3-1.7B-Base` beats
Czech-GPT-2-XL on both technical Czech cases, `predikčního` at rank 1
against 3 and `algoritmu` at rank 3 against 4, while also reading
English. It loses cases 9 and 10, the two colloquial spoken-Czech ones
(`zaplavat`, `kuře`), where the Czech-only model that trained on Czech
web text still wins. Register again, on a smaller scale.

So the split is the same one this project keeps meeting. A model
trained on the target language's everyday speech wins at everyday
speech; a modern multilingual model wins at everything technical and
costs one model instead of two. Two models also mean a language switch
at the call site, which the one-layout, one-model constraint rules out
everywhere else in this engine.

Sizes and speed on this machine, bfloat16: Qwen3-1.7B-Base 3.4 GB and
1.4 to 4.1 s per strip, GPT-2 XL 3.1 GB and 1.8 to 7.2 s,
Czech-GPT-2-XL 3.5 GB and 1.7 to 12.2 s.
