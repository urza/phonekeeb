# Layout tuning log

The dated trail of hand changes to `urza-layout`, newest first. Each
entry records what changed, why, and what it cost, so future tuning
has a trail to reason against. The `urza-layout` map in `layouts.js`
is the source of truth; no script regenerates it. The `qwerty-8pen`
entry stays pure generator output, the baseline to compare against.
`tests/layouts-unit.mjs` locks the tuned slots.

The vocabulary below is now executable. `flowJoin()` in `layout.js`
classifies any letter pair, `tools/score-flow.mjs` scores a whole
layout against real letter bigrams, and `layout-flow-analysis.md`
holds the measured results. Check a proposed swap with the tool before
writing an entry here. Hand reasoning is still welcome, but the tool
catches the side effects that hand reasoning misses.

Vocabulary used in the reasoning (see the 8pen research notes in
`CLAUDE.md`):

- A letter's stroke ends by sweeping into the center from its exit
  sector (the sector after the last crossing).
- When the next letter starts in the sector opposite that exit, the
  finger passes straight through the center. Call this a pass-through.
- A pass-through where the rotation direction also reverses traces a
  figure eight, the smoothest two-letter motion (like cursive
  handwriting). This is the flow objective from the original 8pen
  demo video.
- When the next letter starts in the exit sector itself, the finger
  must double back. Call this a reversal, the worst case.

## 2026-08-26: swap a and s

- Before: a at S CW ring 1, s at W CCW ring 1.
- After: s at S CW ring 1, a at W CCW ring 1.
- Reason: "is" is one of the most common English words. The letter i
  (E CCW) exits the center from N. A figure eight then needs the next
  letter to start at S with CW rotation, exactly the slot a held.
  With the swap, "is" is an exact figure eight. Before, s started at
  W, unrelated to the N exit, with no direction change.
- Side effects, checked by hand:
  - "at" gains a pass-through: a now exits from S, and t starts at N.
  - "es" gains a pass-through: e exits from N, and s now starts at S.
  - "st" loses its pass-through: s now exits from W, and t starts at N.
  - "as" is a reversal before and after the swap.
  - Direction fit: the two letters trade their offsets from the
    generator's QWERTY-direction objective (s is now 58 degrees off,
    a is 32 degrees off; before it was the reverse).
  - Both letters stay in ring 1, so no gesture gets more crossings.
- Measured 2026-08-26, after the fact, by `tools/score-flow.mjs`. All
  five hand-checked side effects above are confirmed, and
  `tests/flow-unit.mjs` locks them. The verdict on the swap itself:
  clearly right for Czech (13.9% to 16.1% of weighted bigram mass
  drawing a figure eight) and neutral for English (+0.3 points on
  subtitles, -0.4 on the Norvig table, the same 19 pairs either way).
  It also made "this" three consecutive eights, the most common word
  in the list that flows unbroken. Full numbers in
  `layout-flow-analysis.md`.

## 2026-08-26: seed from the qwerty-8pen generator

- `urza-layout` forked from the output of
  `tools/generate-qwerty8pen.mjs`: rings from the original 8pen,
  punctuation dropped, frequency promotion, QWERTY direction
  matching per ring.
- From this point the generator only maintains the `qwerty-8pen`
  baseline. This layout evolves by hand, one logged entry per change.
