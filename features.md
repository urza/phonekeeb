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
the press becomes a hold-glide or a South punctuation drag (next two
sections) or, in an unassigned sector, silence:

- Right (E): backspace.
- Bottom (S): enter.
- Top (N): nothing on a tap; the sector hosts the caret glide.
- Left (W): reserved for a number and symbol layer.

The E and S taps follow the 8VIM successor project's assignment. The
original 8pen had no function taps.

## South punctuation drags

A press out in the S sector that slides into another region and lifts
there types one punctuation mark (user request 2026-08-26):

- S to E: question mark (?).
- S to N: exclamation mark (!).
- S to W: comma (,).

Only the press point and the lift point matter; the path between them
does not. The N target is deliberately generous: a lift anywhere
inside the center circle also counts as N, so "!" does not demand a
drag all the way through to the top. The drag activates at the same
18 px threshold that ends tap eligibility; below it the press is the
S function tap (enter). A drag that lifts back in the S sector stays
silent and reserved.

Mechanically, the decoder commits `{ type: 'drag', from, to }` for any
outside-start press that moves 18 px or more and lifts in a different
region (`to` is a sector or `C` for the center circle). main.js maps
only S starts to characters; E and N starts already act live as
hold-glides, and W starts stay reserved.

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
- Bottom (S) drags type punctuation on lift (previous section); left
  (W) drags stay silent and reserved.

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
  center, blue in the sectors, gray for outside-start drags.
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
- Scored candidates (2026-08-26, replacing the ordered-list ranking):
  chips are ranked by probability. Candidates come from a scan of the
  merged vocabulary against the prefix; each scores
  P(word | previous word) by stupid backoff: the stored bigram
  conditional when the pair is in the table, else 0.4 x the word's
  unigram probability. Next-word chips are the same mechanism with an
  empty prefix. The context word counts only when just spaces separate
  it from the prefix; punctuation or a newline drops it. With the
  caret sitting before an existing word ("help |here"), a chip tap
  replaces that word, the same whole-word rule as above.
- One mixed English+Czech model, no switching. Both vocabularies live
  in one predictor with per-language probabilities (counts normalized
  inside each language). A sentence-language posterior over the last
  6 words (nearest weighted most, decay 0.65 per step, per-word
  log-odds clamped to 2.5) scales each language's scores, so Czech
  chips sink mid-English-sentence and the reverse. The prior never
  drops below 0.05 for either language, and a fresh strip with no
  context serves both at 50/50.
- Trigram layer (2026-08-26): `trigrams-en.js` / `trigrams-cs.js`
  hold two-word contexts ("co se" leads to "děje"); the score walks
  trigram, then bigram, then unigram with stupid backoff, and the
  discount applies only when a known context misses the word, so
  absent tables change nothing. The ~1.5 MB of data lazy-loads after
  first paint (typing runs on bigrams meanwhile; a body marker
  `data-trigrams` flips when live) and hides behind the "Trigram
  data" toggle for mobile-data saving. The shipped pruning tier keeps
  contexts seen 200+ times with top 4 successors seen 6+ times: the
  eval measured ~70% of the full tables' gain at a quarter of their
  bytes.
- Extension vocabulary (2026-08-26): `words-ext-en.js` /
  `words-ext-cs.js` grow the candidate pool past the core top-3000
  lists, to 20000 combined English and 40000 combined Czech forms
  (Czech inflection spreads one lemma over many forms, so it gets
  more). Built by `tools/build-wordlists.py` ext mode from a 400 MiB
  corpus prefix; a tail word must be in the aspell dictionary for its
  language (clitic bases accepted: driver's, this'll), which removes
  the transcription junk and misspellings that flood deep subtitle
  ranks. Counts are rescaled to the core corpus scale, so the core
  sum stays the one probability denominator. Ext words are unigram
  completion candidates only: never typo hypotheses (a one-edit jump
  to a rare tail word is nearly always wrong, and skipping the edit
  check keeps the 10x bigger scan cheap), never n-gram heads or
  successors. The ~0.9 MB raw lazy-loads after first paint like the
  trigrams (body marker `data-ext-words`) but not behind the data
  toggle: coverage is core behavior. Fixes the prediction game's
  pure-coverage misses (deliberately, zaplavat, smooth).
- Diacritics and apostrophe restoration: matching runs on stripped
  keys, so "rek" suggests "řekl" and a fully typed "tata" offers
  "táta"; likewise "its" offers "it's" and "dont" offers "don't" (the
  prediction game's recorded miss). One mechanism serves both. The
  display keeps the real spelling.
- Typo tolerance: prefixes within one edit (substitution, missing or
  extra letter; 2+ typed letters) admit candidates at a 0.005
  multiplier, tuned by the eval harness: it lifts corrupted-prefix
  hit@3 from 0% to ~45% while exact prefixes stay above the
  pre-scoring baseline.
- Verbatim chip: when the typed word (2+ letters) earned no chip, it
  takes the last slot as typed, so an out-of-vocabulary word is always
  acceptable and, in the future, learnable.
- Bigram tables v2: `bigrams-en.js` / `bigrams-cs.js`, generated by
  `tools/build-ngrams.py` from the same OpenSubtitles dump as the word
  lists (one corpus, one attribution). Per head: the total adjacency
  count plus the top 12 successors with pair counts, log-quantized
  (code = round(ln(count) x 8), decode exp(code/8), ~13% steps); a
  pair needs 4 occurrences and both words in the 3000-word
  vocabulary. Clause punctuation (.!?…) and out-of-vocabulary tokens
  break adjacency; every 100th corpus line is held out for the eval
  harness, so the tables never train on it. Lookup is by the head's
  stripped key, so gesture-typed "dekuji" finds the successors of
  "děkuji"; when two heads share a key ("hell", "he'll") the more
  frequent head owns it.
- Measured on held-out subtitles (tools/eval-prediction.mjs, hit@3,
  mixed model with the shipped trigram tables): next-word 36% EN /
  33% CS, two-letter prefix 75% EN / 71% CS, corrupted prefix 50% EN /
  44% CS. Without trigrams (the toggle off): 29 / 28, 74 / 70, and
  44 / 39. The single-language ceilings sit at most 0.3 points above
  the mixed rows, so the posterior makes mixing nearly free. The
  bigram successor cap 12 / floor 4 trades ~2 points of prefix hit@3
  for half the bytes (measured against cap 24 / floor 3); the trigram
  layer buys the quality back and more.
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
- Personal learning (2026-08-26): the keyboard learns the user's own
  words and word pairs while typing, on this device only
  (localStorage; UserDefaults on iOS). A word is learned when a
  separator lands right behind it, one rule for every commit path
  (space, enter, punctuation, accepted chips); backspaces and delete
  glides never learn. Each learned word records its previous word,
  or a start-of-message token when it opens the text or follows a
  newline, so the model also predicts first words. Scores blend as
  0.7 x static + 0.3 x personal, with stupid backoff inside the
  personal store too; the personal share carries no language prior
  (the user's words are their language). A small store makes
  personal probabilities large, so a twice-typed phrase already
  outranks any corpus word. Out-of-vocabulary words enroll as
  candidates after 2 sightings (before that only the verbatim chip
  offers them); all counts halve past 50000 learned tokens, so old
  habits fade and the store stays bounded. Saves are write-behind
  (every 20th word, plus leaving or hiding the page). Settings:
  "Learn my typing" (default on, stops future learning only) and
  "Forget learned words" (immediate, permanent).
- Planned: seeding the personal model from chat exports
  (tools/build-personal.py in the research doc).

## Layouts

Layouts are data. The registry in `layouts.js` is the only file to
edit when adding or changing one: the dropdown, the validation, and
the tests read from it. A console warning reports duplicate letters or
a short alphabet after hand edits. Every layout is a static map. The
generated experiment layouts (`qwerty-region`, `frequency`) and the
per-layout language switch were removed 2026-08-26, because the end
goal is one layout that serves English and Czech together, optimized
on combined en+cs statistics. Git history keeps them.

- `qwerty-8pen`: letters only, original 8pen gesture costs, QWERTY
  directions. Punctuation is deliberately absent; it will get its own
  gesture mechanism. The freed slots backfill by frequency promotion:
  n and s rise to ring 1, c and m to ring 2, v and j to ring 3, so six
  common letters are cheaper than in the original and every other
  letter keeps its crossing count. Ring 4 keeps only q and z (far left,
  matching QWERTY) plus six empty reserved slots. Within each ring,
  slots go to the letters whose direction from the QWERTY keyboard
  center best matches the slot direction, derived by
  `tools/generate-qwerty8pen.mjs`. This layout stays pure script
  output, the reproducible baseline for comparison; hand tuning
  happens in `urza-layout`. Worst compromises: a and o at under 60
  degrees off. A unit test locks the ring-or-promoted rule and the
  letters-only rule.
- `urza-layout`: the hand-owned layout and the default. Its map in
  `layouts.js` is the source of truth; no script regenerates it.
  Seeded 2026-08-26 from the qwerty-8pen generator output with one
  change: a and s traded ring-1 slots, so the word "is" traces a
  figure eight (i exits the center from N; s at S CW passes straight
  through it with reversed rotation). Every hand tweak gets a dated
  entry with its reasoning in `layout-tuning.md`, and a unit test
  locks the tuned slots.
- `original-8pen`: transcribed from a screenshot
  of the original app (`8pen.png` in the repo root). The geometry now
  matches the original directly, X arms and all, so the transcription
  is a plain copy: top sector to N, right to E, bottom to S, left to W.
  All 26 letters plus 6 punctuation marks (. , ' ? ! @) fill the 32
  slots exactly. The frequent marks sit innermost, and y sits at one
  crossing, unlike a pure frequency ranking.
- `urza-layout` is the default on first load. The layout dropdown
  choice persists in the browser (localStorage) and survives reloads,
  like the theme. A stale `phonekeeb.language` key from before the
  language switch was removed is simply ignored.
- Slots can hold punctuation. A typed mark ends the prediction word.
- Diacritics input is not built yet; the plan is an accent popup or
  combining swipes, and the prediction chips already restore them.

## Letter study cards

- `cards.html` is a separate study page, linked from the settings
  panel as "Letter cards". It draws one card per filled slot: the
  wheel with only that card's letter on it, and the whole gesture as
  one curve. One letter at a time is the point; the full 32-slot map
  stays on the keyboard page.
- For 2 to 4 crossings, the curve leaves the center circle at the
  start sector's middle (marked with a dot), swells to the letter's
  ring over the first eighth turn, crosses every arm at ring radius,
  and sinks back just inside the center over the last eighth turn
  (marked with an arrowhead). So the curve passes through the letter's
  map position at its first crossing, and the arrowhead says "finish
  by touching the center".
- One-crossing letters are drawn as a true little circle instead,
  because that is how the thumb really moves (user request
  2026-08-25). The circle centers on the arm the letter crosses
  (center at 29, radius 12, reach 41, just past ring 1) and overlaps
  the center circle, so the stroke leaves the rim about 22 degrees
  before the line, loops around past the letter, and returns about
  22 degrees after it, dipping inside for the arrowhead. The letter
  glyph paints last with a thin panel-colored halo, so the loop never
  obscures it.
- The result letter sits in the center, where the keyboard page shows
  the live preview. The map letter keeps its true position (first arm,
  nudged toward the start sector, radius = ring) and its landing-sector
  hue, and the landing sector is tinted, matching the canvas learning
  colors. The hues come from the same `SECTOR_COLORS` table in
  `themes.js`, generated into CSS at load, so they cannot drift.
- Cards sort alphabetically, punctuation last. The layout dropdown
  matches the keyboard page and starts from the same saved
  localStorage choice (read-only: the cards page never writes it).
  The page has no theme dropdown; it follows the device light or dark
  setting with the Light and Dark theme palettes.
- Card geometry mirrors the wheel proportions in a fixed 200 px
  viewBox: arm 90, center circle 22, ring 1 at 35, ring step ~16.3,
  letters 13 degrees off their arm.
- The drawing code lives in `wheel-svg.js`, shared with the practice
  game, so the two teaching pages cannot draw a stroke differently.

## Practice game

- `game.html` is a recall drill, linked from the settings panel as
  "Practice" and from the cards page. It shows a target letter, hides
  the map, and asks for the stroke. The rationale is in
  `learnability-research.md`: every account of learning an 8pen-style
  keyboard says drawing a loop is easy and knowing which loop is not,
  so a learner who can see the map is practising the wrong half. The
  prior art is Palm's Graffiti game and 8pen's own practice game.
- The pad is a centered wheel with arms, center circle, and the live
  finger trail. It deliberately paints **no letters**. It runs the real
  `GestureDecoder`, so a stroke commits exactly as it does on the
  keyboard: on returning to the center, or on lift.
- Grading is exact: same sector, same direction, same crossing count,
  and not a capital. A capital is called out by name ("one full loop
  too many") because the extra-loop rule is easy to trip. A wrong
  answer names the letter that was actually typed.
- Spaced repetition, Leitner boxes 0 to 5, due after 0/2/4/9/20/45
  prompts. A correct unaided answer moves up one box, a miss resets to
  0, and a correct answer after a hint holds the box (the letter was
  read, not recalled). Among due letters the pick is weighted by
  English frequency (rank 1 to 26 mapped to weight 26 down to 1), so
  the letters that carry most text become automatic first. The
  immediately previous letter is never repeated.
- Ring progression. The pool starts at ring 1 (8 letters, most of
  typing) and the next ring unlocks only when every letter in the pool
  reaches box 3. Widening earlier floods the learner.
- **Hint** shows the QWERTY mnemonic without the answer: a mini QWERTY
  with the target key lit, plus a compass carrying two rays, solid for
  the letter's direction from the QWERTY center and dashed for the
  direction its stroke leaves the wheel. The caption gives the angle
  between them and says plainly whether this letter can be guessed or
  needs rote memory. Angles come from `qwerty-map.js`, the same table
  `tools/generate-qwerty8pen.mjs` optimizes against, so the hint can
  never teach an association the generator did not build.
- **Show me** reveals the answer and counts as a miss, so a stuck
  learner is never trapped and the boxes stay honest.
- Per-letter time to first answer is recorded (median of the last 12)
  and shown in a mastery strip under the drill, one chip per letter in
  the pool, bordered by box. Untouched letters get their own "new"
  style; box 0 alone would open a fresh install as a wall of red. The
  times are an empirical difficulty measure, meant to be checked later
  against the predicted difficulty in `qwerty-map.js`.
- Progress persists in `localStorage` under `phonekeeb.game.v1`, keyed
  by layout id: muscle memory for one letter map says nothing about
  another. The layout dropdown starts from the keyboard page's saved
  choice, read-only, like the cards page. "Reset progress" clears the
  current layout after a confirm.

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

- Top to bottom: compact header, typed text, canvas. The canvas fills
  the rest of the screen down to the bottom edge, where a phone
  keyboard sits.
- The suggestion row is an absolute overlay on the canvas, parked with
  its bottom edge 4 px above the wheel rim, so the chips sit in thumb
  reach (user request 2026-08-26). Empty parts of the strip pass
  presses through to the canvas; only the chips catch taps. On a short
  canvas the row clamps so it cannot cover the typed-text box.
- A copy button sits fixed in the bottom-right corner (48 x 40 px,
  12 px inset plus the safe-area inset), in the pocket the wheel disk
  leaves free. It copies the finger-selected text if a selection
  exists, otherwise the whole text, and flashes a check mark in the
  trail accent for 0.9 s. With nothing to copy it does nothing. The
  selection is read at pointer down, before the click can collapse it.
- The top bar holds only the name, Clear, and a Settings toggle. The
  hint text and all controls (layout, theme, dead zone) sit
  inside the collapsed settings block, so the touch area keeps most of
  a phone screen. The open state is remembered (localStorage).
- Inside settings, the how-to text sits behind its own collapsible
  ("How to type", a native details element), closed by default and
  not remembered. It matters in the first sessions only; open
  settings usually means reaching for the controls.
- The typed-text box has a fixed two-line height and scrolls, with the
  newest line kept in view. The suggestion row height is fixed and the
  row sits outside the flex flow. Nothing above the canvas changes
  size mid-gesture, so the decoder center stays under the finger.
- The wheel anchors to the bottom of the canvas, 12 px margin. On a
  touch screen (primary pointer coarse) it also hugs the right edge,
  under a right thumb; with a mouse (desktop testing) it centers
  horizontally. Arm length is 0.44 x the smaller canvas dimension. A
  left-hand anchor option is future work.

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
- Offline support: `sw.js` is a service worker that precaches one
  build's pinned assets (cache name `phonekeeb-b<N>`, where `<N>` is
  the same number as the `?v=` pins; the two are bumped together).
  The worker is designed around the `?v=` pinning, not against it:
  - Navigations are network-first with `cache: 'no-cache'`, which
    revalidates GitHub Pages' 10-minute HTTP cache. An online launch
    therefore gets the newest build immediately; the cached page is
    served only when the network fails.
  - Pinned assets are cache-first. Because cache keys carry `?v=`,
    two builds can never mix. Activating a new worker deletes every
    older cache.
  - The trigram tables are not precached (they are lazy behind the
    "Trigram data" toggle, which exists to save mobile data); they
    are cached at runtime once actually fetched. Offline with the
    toggle on but the tables never yet fetched falls back to bigrams.
- "Force update" button in settings: deletes all worker caches,
  unregisters the worker, refetches the page past the HTTP cache
  (`fetch(location.href, {cache: 'reload'})`), and reloads. The
  escape hatch for a phone stuck on an old `bN` when a normal app
  restart did not pick up a new build.

## Persisted settings

Saved in the browser (localStorage) and restored on load; the iOS
equivalent is UserDefaults. Key, values, default:

- `phonekeeb.theme`: theme id, default `auto`.
- `phonekeeb.layout`: layout id, default `urza-layout`.
- `phonekeeb.settingsOpen`: `1`/`0`, default closed.
- `phonekeeb.sectorColors`: `1`/`0`, default on.
- `phonekeeb.learn`: `1`/`0`, default on (learn from typing).
- `phonekeeb.trigrams`: `1`/`0`, default on (download and use the
  trigram tables).
- `phonekeeb.personal`: the personal model's counts as JSON
  (`{v, uni, bi}`); absent until something is learned, removed by
  "Forget learned words". Never leaves the device.

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
  taps, delete glide with undelete, double-tap period, caret glide,
  letter-cards smoke).
- `tools/eval-prediction.mjs`: the prediction quality harness. It
  scores the real `Predictor` on held-out subtitle lines (every 100th
  line of an 80 MB dump prefix, cached in `tools/corpus/`), reporting
  hit@1 and hit@3 for next-word, 2-letter prefix, and one-edit typo
  modes. Run it before and after every prediction change; the
  baselines live in `word-prediction-research.md`.

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
| Bigram successors per head | top 12, pair count >= 4, in-vocabulary only |
| Trigram contexts | count >= 200; top 4 successors, triple count >= 6 |
| N-gram count quantization | code = round(ln(count) x 8); decode exp(code/8) |
| Stupid backoff | 0.4 x unigram P on a bigram miss |
| Typo edit penalty | 0.005 per edit, one edit max, prefix of 2+, core words only |
| Extension vocabulary | to 20000 en / 40000 cs combined forms; tail must pass aspell; counts rescaled to core scale |
| Language posterior | window 6 words, decay 0.65, log-odds clamp 2.5, floor 0.05 |
| Personal blend | 0.3 x personal + 0.7 x static |
| Personal enrollment | out-of-vocabulary words need 2 sightings |
| Personal decay | halve all counts past 50000 learned tokens |
| Personal save | every 20th learned word, plus pagehide/hidden |
| Learned word length cap | 24 characters |
| Arm length | 0.44 x min canvas dimension |
| Wheel anchor | bottom, 12 px margin; right on touch, x-centered with a mouse |
| South drag targets | E = ?, N = !, W = ,; center circle counts as N |
| Suggestion row gap | bottom edge 4 px above the wheel rim |
| Copy button | 48 x 40 px, 12 px corner inset; copied flash 900 ms |

Pixel values were tuned on a ~390 px wide phone viewport; on iOS
they should scale in points, not pixels.
