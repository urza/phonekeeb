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


