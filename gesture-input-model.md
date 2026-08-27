# A gesture-aware input model

Design note, 2026-08-27. No code was written for it. It works out what
direction 4 of `prediction-roadmap.md` actually means, why this keyboard
needs it more than a tap keyboard does, and in what order to build it.

Read `gesture-decoder.js` alongside this. Every claim below about what the
decoder knows points at a real line in that file.

## 1. The problem, stated precisely

Every keyboard has an input model: the layer that turns a physical event
into a probability distribution over what the user meant. A tap keyboard
models finger position against key rectangles. SwiftKey calls its version
a KeyPressVector, and its patents make it the first stage of the whole
pipeline: touch data becomes a per-position distribution over characters,
and only then does the language model rank words.

We have no such layer. `gesture-decoder.js` emits a hard commit,
`{sector, direction, crossings, capital}`, and `prediction.js` treats the
resulting letter as certain. The only tolerance we offer is a generic
edit-distance-1 branch over the finished string, at a flat 0.005
multiplier, capped at 2 strip slots.

That branch is a stand-in for an input model, and it is a poor one. It
knows nothing about which letters this keyboard actually confuses, and it
costs 2.8 points of exact-prefix hit@1 and 4.8 of hit@3 to buy its typo
recovery (measured 2026-08-27, `czech-lm-research.md`).

The claim of this note: on a gesture keyboard the input model is worth
more than on a tap keyboard, and we are better placed to build one,
because our errors are not random. They are continuous quantities the
decoder measures and then throws away.

## 2. What actually goes wrong, and why it is measurable

A letter is (entry sector, rotation direction, crossings). Every error
mode below traces to one arithmetic step in the decoder.

**E1. Crossing count off by one.** `signedCrossings` is
`floor((entryShifted + cumulativeAngle) / 90) - floor(entryShifted / 90)`.
The count flips at an exact multiple of 90 degrees in the shifted frame.
A finger that returns to the center while its unwrapped angle sits three
degrees past an arm types one letter; three degrees short, it types the
neighbour. The confusion is always with the same sector and direction at
crossings plus or minus one, which is the next slot along one row of the
layout. **The angular margin to that boundary is known at commit time.**
This is the dominant error and the easiest to model.

**E2. Entry sector wrong.** `activate()` fixes the entry sector from a
single sample: the first one whose distance passes `deadZoneRadius * 1.15`
(`pointerMove`, state `center`). If that sample's angle lands near a
diagonal arm, the entry sector is close to a coin flip, and one noisy
touch reading decides a letter. The confusion is with the adjacent
sector. **The margin from the exit angle to the nearest arm is known.**

**E3. Direction flip.** The direction is the sign of the net crossing
count, so it is fixed by the first crossing. A wobble across the entry
arm reverses it. The confusion is with the mirror letter: same sector,
same crossings, other direction. It is rarer than E1 and E2, and it is
worse, because the mirror letter sits far away in the alphabet.

**E4. Case.** `commitFor` treats raw counts above 4 as capitals of
raw minus 4. An intended 4-crossing lowercase that over-rotates by one
becomes the capital of a 1-crossing letter. That is not an adjacent
letter, it is a different word. Rare, but a hard failure when it happens.

**E5. Dip-space against short letter.** A return to center with no arm
crossed types a space. A 1-crossing letter that falls short becomes a
space instead, and a wobble during an intended space produces a spurious
letter. This is the worst class, because it moves a word boundary, and a
wrong boundary breaks the context the language model depends on.

**E6. Silent cancel.** Crossing arms and then rotating back to net zero
types nothing at all, by design. An over-corrected letter therefore
vanishes: a deletion, in edit-distance terms, with no visible trace.

**E7. Early lift.** Lifting outside the center commits the letter in
progress and ends the word without a space, both at once.

Grouped by what the language model would need to repair them: E1, E2, E3
and E4 are substitutions. E5 and E7 are boundary errors. E6 is a
deletion, and a wobble that adds an unwanted crossing is an insertion.

## 3. The signal the decoder already computes and discards

At commit time the decoder holds all of this and returns none of it:

- `entryShifted`: the exact exit angle. Its distance to the nearest
  multiple of 90 in the shifted frame is the **entry margin**. Small
  margin means an uncertain entry sector (E2).
- `entryShifted + cumulativeAngle`: the final unwrapped angle. Its
  distance to the nearest multiple of 90 is the **commit margin**. Small
  margin means an uncertain crossing count (E1).
- `maxCrossings` against the final `crossings`: how far the finger
  backtracked. Backtracking means the user corrected mid-stroke, or the
  hand wobbled. Either way, confidence should fall.
- **Radius.** Angular noise scales as roughly the touch position noise
  divided by the radius. A three-millimetre contact wobble is about nine
  degrees of angle at 60 px from the center, and about three degrees at
  150 px. A tight loop close to the dead zone is several times noisier
  than a wide one, and the decoder knows the radius at every sample.
- **Speed at commit.** Fast strokes overshoot the intended arm.
- The raw sample path, for anything a learned model wants later.

Two of these deserve emphasis because they are free. The entry margin and
the commit margin are both one subtraction away from numbers the decoder
already stores, and between them they explain the two most common errors.

## 4. The design, in four layers

### Layer A: a posterior over addresses instead of one address

The decoder gains a second output next to `committed`: a short list of
candidate addresses with probabilities, plus the special outcomes `space`
and `cancel`.

The model is two noisy thresholds sharing one noise source.

- Entry angle: treat the observed exit angle as a sample from a normal
  distribution whose width comes from the radius at exit, the speed, and
  a single touch-noise constant. The probability of each entry sector is
  the mass of that distribution inside each 90-degree bin.
- Final angle: the same treatment for the unwrapped angle at commit. The
  crossing count is the difference of two bin indices, and the entry
  angle appears in both, so the two are correlated and must be integrated
  jointly rather than multiplied.
- Direction and case fall out of the same integral, because both are
  functions of the signed count.

Output: usually one address at about 0.98 for a clean stroke, two or
three for a marginal one. Prune below a floor and renormalize.

The property to insist on: **a clean stroke must produce a near-certain
answer**, so that confident typing behaves exactly as it does today.

### Layer B: a word as a sequence of letter distributions

Each address maps through the layout to a letter, so a word in progress
becomes a sequence of per-position letter distributions. That is
SwiftKey's probabilistic string, and it is the interface the predictor
wants.

Version 1 should carry substitutions only. Deletions, insertions and
uncertain word boundaries need a graph rather than a product, and they
can wait. Saying so up front avoids the trap of designing the general
case before the common case pays for itself.

### Layer C: scoring

Today a candidate word must start with the typed prefix, and one-edit
hypotheses enter at a fixed penalty with a slot cap.

With the input model the score becomes

    score(word) = P(observed strokes | word) x P(word | context)

where the first factor is the product of the per-position letter
probabilities, and the second is the existing backoff and personal blend.

This replaces `EDIT_PENALTY`, `TYPO_SLOTS` and the whole one-edit branch
with one principled quantity. Three consequences:

- Clean typing collapses to today's exact-prefix behaviour, because the
  wrong letters carry near-zero mass. The 2.8 and 4.8 points that the
  typo cap currently costs should come back.
- A marginal stroke opens exactly the two plausible letters, weighted by
  how marginal it was, instead of every letter in the alphabet.
- The slot cap disappears. It exists only because the current hypotheses
  are unweighted by real evidence.

Candidate generation needs one change. The scan currently tests
`startsWith(prefix)`. It would instead score each vocabulary word's first
letters against the position distributions. That is roughly prefix-length
times the current cost, on a scan that measures 4 ms today, so measure it
before reaching for a trie or a beam over the top-k prefixes.

### Layer D: the loop back to the screen

The glide preview already draws what committing into each sector would
type. With a posterior it can show uncertainty: dim a marginal commit, or
show both contenders when the finger is riding an arm.

The reverse direction is the "Future hook" already noted in
`features.md`: the language model knows which letters are likely next, so
it could weight the input model. Do the scoring side first and leave the
display alone. A preview that shifts under the finger because of language
statistics would make the keyboard harder to learn, which is the opposite
of what `learnability-research.md` says this input family needs.

## 5. Where the parameters come from

**Geometric prior, no data needed.** Derive the angular width from touch
noise divided by radius. That leaves one constant to tune, the linear
touch noise in millimetres. This version can ship without collecting
anything from anyone.

**Learned from the user, later.** The keyboard already sees ground truth:
accepting a chip, or backspacing and retyping, reveals the intended word.
Logging stroke features against the corrected letter gives a per-user
fit. This is the same learning signal AOSP's user-history dictionary
uses, and the same hierarchy the CHI 2013 adaptive-keyboard work
recommends: global prior, then user, then session. Store it locally and
decay it, like the personal model.

**Simulation, for evaluation.** Sample an address, add angular noise,
synthesize a path, and run the real `GestureDecoder` over it. That gives
a labelled corpus of any size with no user at all, and it is honest about
the floor boundaries, the 1.15 hysteresis, and the dip-space rule,
because it exercises the shipping decoder rather than a model of it.

## 6. Evaluation

A new harness, `tools/eval-gesture.mjs`, over the same held-out subtitle
lines the other harnesses use:

1. Look up each letter of each word in the current layout.
2. Synthesize a stroke per letter at a chosen noise level.
3. Run the real decoder over it.
4. Compare two conditions: hard commits with today's typo branch, and
   posteriors with the new scoring.
5. Report word error rate after prediction, keystroke savings, and the
   existing hit@k rows.
6. Sweep the noise level.

The deliverable is that sweep: a curve of accuracy against sloppiness,
with and without the model. It answers the question a user actually has,
which is how carelessly they can draw before the keyboard stops keeping
up.

This also fixes a flaw in the current harness. The `typo-2` row corrupts
a prefix by substituting a **uniformly random letter**
(`corrupt()` in `tools/eval-prediction.mjs`). That is a tap-keyboard
error model, and not even a good one. No stroke on this keyboard turns a
letter into a random other letter. It turns it into its neighbour by
crossing count, or its neighbour by sector. Every typo number we have
today is measured against errors that cannot happen.

## 7. What this touches elsewhere

**Layout.** The confusable pairs are fixed by the geometry: crossings
plus or minus one within a row, and adjacent sectors. A layout that puts
confusable letters where the language model can separate them would
correct its own errors. That is a fourth layout objective, next to
frequency rings, flow, and the QWERTY mnemonic, and `tools/score-flow.mjs`
is the natural place for it. Worth naming now, not worth doing yet.

**Porting.** The model must stay pure and free of the DOM, like the
decoder, so it ports to Swift with it. Shape: the decoder emits features,
a new pure module turns features into a posterior, and `prediction.js`
consumes the posterior. Three files, one direction of dependency, no
change to the layering the project already has.

**The typo constants.** `EDIT_PENALTY`, `TYPO_SLOTS` and the one-edit
branch all go away if this lands. Keep them until the harness says the
replacement wins, then delete them rather than leaving two mechanisms.

## 8. Risks

- **Boundary errors are excluded from version 1.** E5 and E7 move word
  boundaries, and they may matter more than substitutions. Version 1 will
  not tell us, because it treats space as certain. Accept that, and let
  the harness measure how much of the total error the excluded classes
  hold, so the decision to build the lattice is a measured one.
- **Independence across positions is optimistic.** A shaky hand makes
  several letters marginal at once. Fine for ranking, wrong for absolute
  probabilities. Do not report the product as a calibrated confidence.
- **Over-modelling.** Too wide a noise setting degrades clean typing. The
  harness must gate on exact-prefix hit@1 not falling.
- **Latency.** Scoring letter distributions costs more than a
  `startsWith` test. Measure before optimizing.
- **Calibration is a real test, not a nicety.** If the model says 0.9 it
  should be right nine times in ten. The simulator can check that
  directly, and a model that fails it will mislead the scorer.

## 9. Staged plan

Each stage is separately shippable and separately measurable.

| Stage | What | Ships? | Measured by |
|---|---|---|---|
| 0 | Decoder emits the continuous features it already computes (entry margin, commit margin, radius, backtrack, speed). No behaviour change | Yes, silently | Existing tests stay green |
| 1 | Stroke simulator plus `tools/eval-gesture.mjs`. Baseline sloppiness curve for today's engine | No app change | The curve itself |
| 2 | Geometric posterior as a pure module. One tunable constant | No app change | Calibration against the simulator |
| 3 | Scoring integration: per-position letter distributions replace the one-edit branch | Yes | Sweep on both harnesses. Gate: exact-prefix hit@1 must not fall |
| 4 | Preview shows uncertainty | Yes | Playwright screenshot, user judgement |
| 5 | Per-user calibration from corrections | Yes | Held-out split of the user's own strokes |
| 6 | Boundary lattice: deletions, insertions, uncertain spaces | Later | Word error rate on the sloppiness curve |

Stages 0 to 2 change nothing the user can see and answer the question of
whether the rest is worth building. That is the right place to stop and
look at numbers.

## 10. Why this is the direction with the highest ceiling

The other open directions improve how we rank words we already have.
This one changes what the keyboard knows about what the user did. It is
also the only direction on the list that no other keyboard can copy,
because the error model belongs to this input method and to no other.

And it compounds. A better input model makes sloppy fast gestures work,
which is the thing every 8pen and 8VIM reviewer asked for and never got
(`learnability-research.md`). Speed on this keyboard is limited by how
carefully the user has to draw. That is exactly the constraint this layer
relaxes.

## Sources

- `gesture-decoder.js`, `layout.js`: the geometry this note reasons about.
- `swiftkey_research/swiftkey-on-device-engine-deep-dive.md`: the
  four-stage pipeline, the KeyPressVector idea, and the patent caution.
- Yin, Ouyang, Partridge, Zhai, CHI 2013, "Making touchscreen keyboards
  adaptive to keys, hand postures, and typing styles":
  https://dl.acm.org/doi/10.1145/2470654.2481384
- Adhikary and Vertanen, Interspeech 2023: the word error rate and
  keystroke savings metrics this note borrows.
- `learnability-research.md`: why sloppiness tolerance is the complaint
  that matters in this input family.
