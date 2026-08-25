# Features

The living reference of what the prototype does. Update this file when
behavior changes. The concept, prior art, and research live in
`gesture-keyboard-handoff.md`; sources are listed in `CLAUDE.md`.

## Gesture alphabet

- The screen is a center circle with four boundary lines (arms) on the
  diagonals, forming an X exactly like the original 8pen. The sectors
  between them are up (N), right (E), down (S), and left (W).
- A letter is (entry sector, rotation direction, crossings). Crossings
  is how many arms the finger crosses before returning to the center,
  from 1 to 4. That gives 4 x 2 x 4 = 32 letter slots.
- Letters are drawn along the arms, on the side facing their start
  sector. Radial position shows the crossing count. The innermost
  letter is the cheapest gesture.
- **Every letter gesture must start in the center circle.** A press that
  starts out in a sector never types letters. Stationary presses there
  are function taps (below); moving gestures from outside are reserved
  for future features, such as user-defined word macros, which is what
  the original 8pen used them for.
- The crossing count is net: rotating backward un-counts an arm. Only
  touching the center commits.

## Space, three original behaviors

- Tap the center circle: space.
- Dip: from the center, out into a sector and back with no arm
  crossed: space. This keeps a whole sentence in one continuous stroke.
- Lift the finger outside the center with no letter pending: the word
  ends without a space.
- Double-tap the center (two taps within 350 ms): the trailing space
  becomes ". ", the standard phone double-space convention. Only
  tap-spaces arm this; dip-spaces never do, and the character before
  the space must be a letter or digit.

## Capitals

- One extra full loop before returning (crossings 5 to 8): the same
  letter, uppercase. This is the original 8pen mechanic and now the
  only capitals mechanism. The one-shot shift tap was removed; its top
  sector hosts the caret glide instead.

## Cancel and correction

- Backtrack: if you crossed lines and rotate back to zero net crossings,
  returning to the center types nothing. This diverges from the
  original, which typed a space on any zero-crossing return.
- Exit hysteresis: leaving the center needs 15% more distance than
  returning, so jitter at the circle edge cannot spray spaces.
- A sloppy start (press outside, drag around without a stationary tap)
  types nothing.

## Function taps

A stationary press-and-release out in a sector:

- Right (E): backspace.
- Bottom (S): enter.
- Top (N): nothing on a tap; the sector hosts the caret glide.
- Left (W): reserved for a number and symbol layer.

The E and S taps follow the 8VIM successor project's assignment. The
original 8pen had no function taps.

## Hold-glides (press out in a sector, then drag)

The decoder reserves moving outside-start presses; two now have a
meaning, implemented in main.js so the decoder stays a pure
gesture-to-letter machine:

- Right (E), Typewise-style delete: drag toward the center to delete
  one character per 14 px step. Drag back to restore from the glide's
  own buffer, while the finger is still down. Lifting keeps the result
  and drops the buffer.
- Top (N), caret move: drag right or left to walk the caret through
  the text, one character per step. The caret is a blinking bar in the
  output box, and letters, spaces, deletes, and suggestions all apply
  at the caret.
- Bottom (S) and left (W) drags stay silent and reserved.

## Live glide preview

While a stroke is active:

- Each adjacent sector shows one big letter in its middle: the letter
  you get by gliding there and then returning to the center.
- The opposite sector is reachable both ways around, so until the
  rotation direction exists it shows both candidate letters at nearly
  full size. Each sits toward the side its path arrives from, with a
  small arrow that enters across that arm and points along the travel
  direction into the letter. Once a direction exists, the sector shows
  one big letter for continuing that direction.
- The backtrack sector shows a small x: gliding there cancels.
- The center shows what returning right now does: the pending letter, a
  space mark for a fresh dip, or a cancel mark.
- The static letter map dims during a stroke so the live letters stand
  out, except the families still reachable from the entry sector: those
  stay readable at their true map positions (both families until the
  first crossing fixes the direction, then only the matching one).
- The finger trail fades from its tail over about 0.7 seconds, so a
  long continuous stroke shows only the recent motion. Green over the
  center, blue in the sectors, gray for ignored outside-start drags.
- Preview letters show true case: lowercase normally, uppercase under
  the capital loop.

This is the first deliberate divergence from 8pen: the layout is
readable during use instead of memorized. Future hook: give visual
weight to the glide targets the language model expects next.

## Word prediction

- Up to five suggestion chips, centered, between the output and the
  canvas while a word is in progress. Tapping a chip replaces the
  partial word before the caret and adds a space.
- The prediction prefix is the run of letters and in-word apostrophes
  just before the caret, derived from the text on every change. So
  punctuation ends the word, an apostrophe continues it ("don'" keeps
  predicting), and deletes or caret moves re-aim prediction at the
  word under the caret.
- Static frequency lists: top 3000 English and top 3000 Czech words,
  generated by tools/build-wordlists.py from the OPUS OpenSubtitles
  2018 dump (attribution: opensubtitles.org). One-letter words ("i",
  "a"; Czech a/i/o/u/s/z/v/k) and contractions ("don't", "i'm") are
  real entries.
- Matching runs on diacritics- and apostrophe-stripped keys: typing
  plain "rek" can suggest "řekl", and "dont" suggests "don't". The
  display keeps the real spelling.
- Planned: a personal n-gram model blended over the default lists, then
  fuzzy gesture repair (SymSpell-style).

## Layouts and languages, behind flags

Layouts are data. The registry in `layouts.js` is the only file to
edit when adding or changing one: the dropdown, the validation, and
the tests read from it. A console warning reports duplicate letters or
a short alphabet after hand edits.

- `qwerty-region`: letters grouped by their QWERTY screen region (top
  row split N/E by keyboard half, lower-left block W, lower-right block
  S), then ordered inside each sector by frequency.
- `frequency`: pure frequency placement, crossing-major, so the most
  common letters need one crossing everywhere. The ranking is a
  hand-written approximation of published letter-frequency tables, not
  corpus-derived.
- `qwerty-8pen`: letters only, original 8pen gesture costs, QWERTY
  directions. Punctuation is deliberately absent; it will get its own
  gesture mechanism. The freed slots backfill by frequency promotion:
  n and s rise to ring 1, c and m to ring 2, v and j to ring 3, so six
  common letters are cheaper than in the original and every other
  letter keeps its crossing count. Ring 4 keeps only q and z (far left,
  matching QWERTY) plus six empty reserved slots. Within each ring,
  slots go to the letters whose direction from the QWERTY keyboard
  center best matches the slot direction, derived by
  `tools/generate-qwerty8pen.mjs`. Worst compromises: a and o at
  under 60 degrees off. A unit test locks the ring-or-promoted rule
  and the letters-only rule.
- `original-8pen`: transcribed from a screenshot
  of the original app (`8pen.png` in the repo root). The geometry now
  matches the original directly, X arms and all, so the transcription
  is a plain copy: top sector to N, right to E, bottom to S, left to W.
  All 26 letters plus 6 punctuation marks (. , ' ? ! @) fill the 32
  slots exactly. The frequent marks sit innermost, and y sits at one
  crossing, unlike the frequency mode's ranking.
- `qwerty-8pen` is the default on first load. The layout and language
  dropdown choices persist in the browser (localStorage) and survive
  reloads, like the theme.
- Slots can hold punctuation. A typed mark ends the prediction word.
- Languages: English and Czech letter frequencies, affecting the two
  generated layouts and prediction. Static layouts ignore language.
  Diacritics input is not built yet; the plan is an accent popup or
  combining swipes.
- The end goal is one layout that serves English and Czech together;
  the language switch is a prototype experiment tool, and the final
  layout optimization runs on combined en+cs statistics.

## Color themes

- A theme dropdown in the header. The default is Auto, which follows
  the device light or dark setting.
- Twelve fixed themes: Light, Dark, Black (true black for OLED), Grey,
  Solarized Dark, Solarized Light, Nord, Dracula, Gruvbox Dark,
  Monokai, One Dark, and Catppuccin Mocha.
- Themes are data, like layouts. The registry in `themes.js` sets
  seven CSS variables. The page and the canvas read the same
  variables, so one map colors everything, trail included.
- A unit test enforces contrast floors against the canvas background:
  letters 4.5:1, dim letters 3:1, trail colors 2.2:1. A theme that
  makes the letters hard to read fails the test.
- The choice is saved in the browser (localStorage) and survives
  reloads.
- Sector learning colors: each quadrant carries a light tint of its
  own hue (N blue, E orange, S green, W purple), and every letter is
  drawn in the hue of the sector its glide starts from. During a
  stroke the entry sector's tint brightens, the others fade, and the
  big preview letters take the entry sector's hue. One palette per
  scheme (light and dark) in `themes.js`; the unit test enforces 4.5:1
  contrast against every same-scheme panel. A settings checkbox turns
  the colors off, and the choice persists.

## Phone-keyboard page layout

- Top to bottom: compact header, typed text, suggestion row, canvas.
  The canvas fills the rest of the screen down to the bottom edge,
  where a phone keyboard sits.
- The top bar holds only the name, Clear, and a Settings toggle. The
  hint text and all controls (layout, language, theme, dead zone) sit
  inside the collapsed settings block, so the touch area keeps most of
  a phone screen. The open state is remembered (localStorage).
- The typed-text box has a fixed two-line height and scrolls, with the
  newest line kept in view. The suggestion row height is fixed too.
  Nothing above the canvas changes size mid-gesture, so the decoder
  center stays under the finger.

## Debug and test surface

- HUD line: state, sector, direction, crossing count, and
  the loaded build number (`bN`, from the `?v=` asset pinning in
  `index.html`). A stale phone cache is visible as an old `bN`.
- Dead zone radius slider.
- Tests in `tests/`: unit (decoder math, preview, space, cancel, taps)
  and Playwright end-to-end flows (hello in one stroke, prediction
  chips, function taps).
