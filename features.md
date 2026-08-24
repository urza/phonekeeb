# Features

The living reference of what the prototype does. Update this file when
behavior changes. The concept, prior art, and research live in
`gesture-keyboard-handoff.md`; sources are listed in `CLAUDE.md`.

## Gesture alphabet

- The screen is a center circle with four quadrants (NW, NE, SW, SE)
  separated by four boundary lines (arms).
- A letter is (entry quadrant, rotation direction, crossings). Crossings
  is how many boundary lines the finger crosses before returning to the
  center, from 1 to 4. That gives 4 x 2 x 4 = 32 letter slots.
- Letters are drawn along the arms, on the side facing their start
  quadrant. Radial position shows the crossing count. The innermost
  letter is the cheapest gesture.
- **Every letter gesture must start in the center circle.** A press that
  starts out in a quadrant never types letters. Stationary presses there
  are function taps (below); moving gestures from outside are reserved
  for future features, such as user-defined word macros, which is what
  the original 8pen used them for.
- The crossing count is net: rotating backward un-counts a line. Only
  touching the center commits.

## Space, three original behaviors

- Tap the center circle: space.
- Dip: from the center, out into a quadrant and back with no line
  crossed: space. This keeps a whole sentence in one continuous stroke.
- Lift the finger outside the center with no letter pending: the word
  ends without a space.

## Capitals

- One extra full loop before returning (crossings 5 to 8): the same
  letter, uppercase. This is the original 8pen mechanic.
- One-shot shift: tap the top-left quadrant. The next letter is
  uppercase. The shift glyph brightens while armed, and the live preview
  shows uppercase letters.

## Cancel and correction

- Backtrack: if you crossed lines and rotate back to zero net crossings,
  returning to the center types nothing. This diverges from the
  original, which typed a space on any zero-crossing return.
- Exit hysteresis: leaving the center needs 15% more distance than
  returning, so jitter at the circle edge cannot spray spaces.
- A sloppy start (press outside, drag around without a stationary tap)
  types nothing.

## Function taps

A stationary press-and-release out in a quadrant:

- Top-right (NE): backspace.
- Bottom-right (SE): enter. Matches the iOS return-key corner.
- Top-left (NW): one-shot shift.
- Bottom-left (SW): reserved for a number and symbol layer.

The tap idea comes from the 8VIM successor project. The original 8pen
had no function taps.

## Live glide preview

While a stroke is active:

- Each adjacent quadrant shows one big letter in its middle: the letter
  you get by gliding there and then returning to the center.
- The opposite quadrant shows both direction options until rotation
  direction exists, at nearly full size, each placed toward the side the
  finger would travel through to reach it. Once a direction exists, it
  shows one big letter for continuing that direction.
- The backtrack quadrant shows a small x: gliding there cancels.
- The center shows what returning right now does: the pending letter, a
  space mark for a fresh dip, or a cancel mark.
- The static letter map dims to 30% so the live letters stand out.
- The finger trail fades from its tail over about 0.7 seconds, so a
  long continuous stroke shows only the recent motion. Green over the
  center, blue in the quadrants, gray for ignored outside-start drags.
- Preview letters show true case: lowercase normally, uppercase under
  the capital loop or an armed shift.

This is the first deliberate divergence from 8pen: the layout is
readable during use instead of memorized. Future hook: give visual
weight to the glide targets the language model expects next.

## Word prediction

- Up to five suggestion chips above the output while a word is in
  progress. Tapping a chip replaces the partial word and adds a space.
- Static frequency lists: top 3000 English and top 3000 Czech words
  (OpenSubtitles 2018 corpus, CC-BY-SA-4.0).
- Matching runs on diacritics-stripped keys: typing plain "rek" can
  suggest "řekl". The display keeps the real spelling.
- Planned: a personal n-gram model blended over the default lists, then
  fuzzy gesture repair (SymSpell-style).

## Layouts and languages, behind flags

Layouts are data. The registry in `layouts.js` is the only file to
edit when adding or changing one: the dropdown, the validation, and
the tests read from it. A console warning reports duplicate letters or
a short alphabet after hand edits.

- `qwerty-region`: letters grouped by their QWERTY screen region, then
  ordered inside each quadrant by frequency.
- `frequency`: pure frequency placement, crossing-major, so the most
  common letters need one crossing everywhere. The ranking is a
  hand-written approximation of published letter-frequency tables, not
  corpus-derived.
- `original-8pen`: transcribed from a screenshot of the original app
  (`8pen.png` in the repo root). The original's arms form an X, so its
  sectors map to ours by a 45-degree rotation: top to NW, right to NE,
  bottom to SE, left to SW. All 26 letters plus 6 punctuation marks
  (. , ' ? ! @) fill the 32 slots exactly. The frequent marks sit
  innermost, and y sits at one crossing, unlike the frequency mode's
  ranking.
- Slots can hold punctuation. A typed mark ends the prediction word,
  and an armed shift waits for an actual letter.
- Languages: English and Czech letter frequencies, affecting the two
  generated layouts and prediction. Static layouts ignore language.
  Diacritics input is not built yet; the plan is an accent popup or
  combining swipes.

## Debug and test surface

- HUD line: state, quadrant, direction, crossing count, shift state.
- Gesture log: the last 15 commits with their decoded parameters.
- Dead zone radius slider.
- Tests in `tests/`: unit (decoder math, preview, space, cancel, taps)
  and Playwright end-to-end flows (hello in one stroke, prediction
  chips, function taps).
