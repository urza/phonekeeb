# Features

The living reference of what the prototype does, and the explicit
feature spec for the future Swift rewrite. Every behavior, rule, and
tuned constant must be stated here in words, not only in code: when
the port happens, this file is the contract. Update it in the same
change set as any behavior change. The concept, prior art, and
research live in `gesture-keyboard-handoff.md`; sources are listed in
`CLAUDE.md`.

## Gesture alphabet

- The screen is a center circle with four boundary lines (arms) on the
  diagonals, forming an X exactly like the original 8pen. The sectors
  between them are up (N), right (E), down (S), and left (W).
- Geometry, in screen angles (y axis points down, angles grow
  clockwise): arms at 45, 135, 225, 315 degrees; sector midlines E=0,
  S=90, W=180, N=270. The clockwise sector ring is E, S, W, N. The
  center circle radius (the "dead zone") defaults to 40 px, slider
  range 20 to 80.
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

A stationary press-and-release out in a sector. "Stationary" means the
lift point is less than 18 px from the press point; at 18 px or more
the press becomes a hold-glide (next section) or, in an unassigned
sector, silence:

- Right (E): backspace.
- Bottom (S): enter.
- Top (N): nothing on a tap; the sector hosts the caret glide.
- Left (W): reserved for a number and symbol layer.

The E and S taps follow the 8VIM successor project's assignment. The
original 8pen had no function taps.

## Hold-glides (press out in a sector, then drag)

The decoder reserves moving outside-start presses; two now have a
meaning, implemented in main.js so the decoder stays a pure
gesture-to-letter machine. A glide activates once total movement from
the press point reaches 18 px (the same threshold that ends tap
eligibility). The acting sector is the one under the press point, and
both glides measure horizontal travel only, one character per 14 px:

- Right (E), Typewise-style delete: drag toward the center (leftward)
  to delete the character before the caret, step by step. Drag back
  to restore from the glide's own buffer, while the finger is still
  down. The count follows the live drag distance in both directions.
  Lifting keeps the result and drops the buffer; only characters
  deleted during the current glide are restorable.
- Top (N), caret move: drag right or left to walk the caret through
  the text, relative to its position at press time, clamped to the
  text ends. The caret is a blinking bar in the output box, and
  letters, spaces, deletes, and suggestions all apply at the caret.
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
  canvas. Tapping a chip replaces the whole
  word around the caret with the suggested word: the prediction prefix
  before the caret plus the letter/apostrophe run after the caret. So
  correcting "wh|ot" with the "what" chip yields "what", never
  "what ot". A trailing space is added only when the word ends the
  text; mid-text the existing following space is kept (no double
  space), and no space is inserted before punctuation or a newline.
  The caret lands after that following space when there is one, else
  right after the word.
- Next-word chips: with an empty prefix (right after a space, or before
  any typing) the strip stays useful instead of going blank. Candidate
  ranking, always: bigram successors of the word before the prefix,
  in rank order and filtered by the prefix, then unigram frequency
  completions fill the remaining slots; duplicates dropped. The
  context word counts only when just spaces separate it from the
  prefix; punctuation or a newline drops context and the strip falls
  back to plain frequency order. With the caret sitting before an
  existing word ("help |here"), a chip tap replaces that word, the
  same whole-word rule as above.
- Bigram tables: `bigrams-en.js` / `bigrams-cs.js`, generated by
  `tools/build-ngrams.py` from the same OpenSubtitles dump as the word
  lists (one corpus, one attribution). Per vocabulary word, the top 5
  successors in rank order, words only, no counts; a pair needs 3
  occurrences and both words in the 3000-word vocabulary. Clause
  punctuation (.!?…) and out-of-vocabulary tokens break adjacency.
  Lookup is by the head's diacritics- and apostrophe-stripped key, so
  gesture-typed "dekuji" finds the successors of "děkuji"; when two
  heads share a key ("hell", "he'll") the more frequent head owns it.
  Measured offline next-word hit@3: 23% EN, 21% CS
  (word-prediction-research.md).
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
  drawn in the hue of its landing sector, the quadrant the glide
  returns to the center from. Landing sector = entry sector shifted by
  the crossing count along the clockwise ring E, S, W, N (backward for
  CCW). The color answers "drag toward this
  region, then come back". During a stroke the quadrant the finger
  would commit from brightens, the others fade, and each big preview
  letter takes the hue of the quadrant it sits in (which is its
  landing sector). One palette per scheme (light and dark) in
  `themes.js`; the unit test enforces 4.5:1 contrast against every
  same-scheme panel. A settings checkbox turns the colors off, and the
  choice persists.

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
- The wheel anchors to the bottom-right corner of the canvas, 12 px
  margin, so the center circle sits under a right thumb instead of
  floating mid-screen. Arm length is 0.44 x the smaller canvas
  dimension. A left-hand anchor option is future work.

## Installable app (PWA)

- The page installs to the home screen: `manifest.webmanifest`
  (standalone display, portrait, dark splash) plus the Apple meta
  tags. On iOS: Safari share menu, then "Add to Home Screen". The
  installed app runs without browser chrome, so the bottom URL bar
  disappears and the wheel gains that space.
- Icons live in `icons/` and are generated by
  `tools/generate-icons.py`: the wheel mark with the four sector-color
  dots. 180 (apple-touch), 192, 512, and a maskable 512 with the
  content shrunk to the safe zone.
- `viewport-fit=cover` plus a `safe-area-inset-bottom` body padding
  keep the wheel above the iOS home indicator in standalone mode; in a
  browser tab the padding is zero. `overscroll-behavior: none` stops
  pull-to-refresh from hijacking a gesture.
- The `theme-color` meta follows the active theme's `--bg` via JS, so
  the installed app's chrome matches all 13 themes.
- Deliberately no service worker: the `?v=` pinning is the freshness
  mechanism and a caching worker would fight it. iOS install works
  without one. Offline support is future work if ever needed.

## Persisted settings

Saved in the browser (localStorage) and restored on load; the iOS
equivalent is UserDefaults. Key, values, default:

- `phonekeeb.theme`: theme id, default `auto`.
- `phonekeeb.layout`: layout id, default `qwerty-8pen`.
- `phonekeeb.language`: `en` or `cs`, default `en`.
- `phonekeeb.settingsOpen`: `1`/`0`, default closed.
- `phonekeeb.sectorColors`: `1`/`0`, default on.

Typed text and the caret are not persisted. Every save is wrapped so a
storage failure (private browsing) never breaks the feature itself.

## Debug and test surface

- HUD line: state, sector, direction, crossing count, and
  the loaded build number (`bN`, from the `?v=` asset pinning in
  `index.html`). A stale phone cache is visible as an old `bN`.
- Dead zone radius slider.
- The canvas exposes the wheel center as a `data-center="x,y"`
  attribute (canvas coordinates), so Playwright tests gesture around
  the anchored wheel without duplicating the anchor math.
- Tests in `tests/`: unit (decoder math, preview, space, cancel, taps,
  layout rules, theme and sector-color contrast) and Playwright
  end-to-end flows (hello in one stroke, prediction chips, function
  taps, delete glide with undelete, double-tap period, caret glide).

## Porting notes (Swift)

- `gesture-decoder.js` is the port target: a pure state machine with
  no DOM, canvas, or timer dependency. Inputs are pointer down, move,
  and up in local coordinates plus a center point and dead zone
  radius; outputs are commits (letter, space, function) and a
  snapshot with a live preview. Port it first and reuse its unit
  tests.
- The text-editing layer in `main.js` is also portable logic: caret
  insert and delete, the two hold-glides, the double-tap period rule,
  and the prediction-prefix derivation (trailing run of letters and
  apostrophes before the caret).
- Layouts (`layouts.js`), themes (`themes.js`), the word lists, and
  the bigram tables are plain data.
- Web-only, do not port: the `?v=` cache pinning, localStorage (use
  UserDefaults), canvas drawing code, the DOM caret span, and the PWA
  shell (manifest, icons, safe-area padding).
- iOS keyboard constraints are researched in
  `ios-deployment-research.md` (memory cap, Full Access, rule 4.4.1).

Tuned constants, one place to read them all:

| Constant | Value |
|---|---|
| Dead zone radius | 40 px default, 20 to 80 |
| Center exit hysteresis | leave at 1.15 x dead zone radius, return at 1.0 x |
| Tap vs glide threshold | 18 px from press point |
| Glide step | 14 px per character (user-validated on phone, 2026-08-25) |
| Double-tap window | 350 ms |
| Trail fade | 700 ms |
| Capital loop | crossings 5 to 8 map to 1 to 4, uppercase |
| Suggestions | at most 5 chips |
| Bigram successors per head | top 5, pair count >= 3, in-vocabulary only |
| Arm length | 0.44 x min canvas dimension |
| Wheel anchor | bottom-right, 12 px margin |

Pixel values were tuned on a ~390 px wide phone viewport; on iOS
they should scale in points, not pixels.
