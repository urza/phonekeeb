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
- Left (W): still reserved. The number and symbol layer it was held for
  shipped as a corner button instead (see "Numbers and symbols pad"):
  not everything deserves a gesture, and a grid is what a phone user
  already knows.

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

- Up to six suggestion chips in two rows of three, an overlay parked
  just above the wheel rim (2026-08-27, replacing the single
  scrollable row that could hide chips). Rank 1 sits bottom-right,
  in thumb reach next to the wheel; likelihood falls leftward along
  the bottom row, then rank 4 opens the upper row at its right end.
  Every chip is a fixed third of the strip wide (long words
  ellipsize), so nothing ever scrolls or hides. Tapping a chip
  replaces the whole
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
  P(word | previous word) by backoff: the stored bigram conditional
  when the pair is in the table, else the head's backoff weight times
  the word's unigram probability (see the smoothing bullet below).
  Next-word chips are the same mechanism with an
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
  trigram, then bigram, then unigram with backoff, and the
  discount applies only when a known context misses the word, so
  absent tables change nothing. The ~8.7 MB of data (3.2 MB over the
  wire, 67430 en and 52484 cs contexts since the 2026-08-30 rebuild put
  both n-gram tiers on the same 400 MiB corpus) lazy-loads after
  first paint (typing runs on bigrams meanwhile; a body marker
  `data-trigrams` flips when live) and hides behind the "Trigram
  data" toggle for mobile-data saving. The shipped pruning tier keeps
  contexts seen 200+ times with top 8 successors seen 6+ times. The
  cap was 4 until the smoothing below made the tail worth more; these
  tables cost nothing at first paint, so the deeper cap was free.
- Per-context backoff weights (2026-08-27, table format v3): each
  stored head and context carries its own backoff weight gamma
  instead of sharing one flat discount. The builders compute it by
  absolute discounting: an absolute discount D, estimated once per
  order from the count-of-counts of the unfiltered pair counts
  (D = n1 / (n1 + 2 n2)), comes off every kept successor's count, and
  gamma = (D x kept + dropped) / T is what the discount and the
  pruned tail leave for words the list does not hold. The kept
  probabilities and gamma then sum to 1. This is what the flat 0.15
  could not express: "thank" keeps gamma 0.005 because almost all of
  its mass is on "you", while "the" keeps 0.779 because its top
  successors cover little. The runtime scales every stored gamma by
  0.5, because the level it hands down to is a weak estimator (a
  plain unigram, not a continuation distribution); unscaled gammas
  measured worse on next-word and typo rows. The flat 0.15 survives
  for the two cases with no stored gamma: the cross-language guard,
  and a cached v2 table with no weight in its head token.
- Extension vocabulary (2026-08-26, resourced 2026-08-30):
  `words-ext-en.js` / `words-ext-cs.js` grow the candidate pool past
  the core top-3000 lists, to 50000 combined English and 150000
  combined Czech forms (Czech inflection spreads one lemma over many
  forms, and it stays good far deeper: `vocabulary-depth-analysis.md`).
  Both tiers now come from `tools/build-wordlists.py` wordfreq mode.
  Which words the list holds is a geometric blend, half wordfreq's
  merged large list and half the OpenSubtitles counts, because neither
  source alone covers a keyboard's vocabulary: subtitles have no
  `playlist` and wordfreq demotes `uh` and `pojď`. How those words rank
  is the OpenSubtitles probability alone, add-one smoothed, so the strip
  ranks in the register it is typed in. A tail word must be in the aspell dictionary
  for its language (clitic bases accepted: driver's, this'll), with
  three exceptions: a word the other language's dictionary holds is
  rejected as a cross-language leak, an apostrophe-less contraction
  (`didnt`) is rejected so the strip can offer the real form, and above
  rank 15000 an aspell reject is admitted anyway (`lmao`, `kámo`).
  Counts put the core sum on a fixed scale, so the core sum stays the
  one probability denominator. Ext words are unigram
  completion candidates only: never typo hypotheses (a one-edit jump
  to a rare tail word is nearly always wrong, and skipping the edit
  check keeps the 10x bigger scan cheap), never n-gram heads or
  successors. The ~0.9 MB raw lazy-loads after first paint like the
  trigrams (body marker `data-ext-words`) but not behind the data
  toggle: coverage is core behavior. The words feed in chunks of
  4000 with a frame between slices; one big batch blocked the main
  thread long enough to eat a stroke drawn during the load
  (2026-08-27). Fixes the prediction game's pure-coverage misses
  (deliberately, zaplavat, smooth).
- Diacritics and apostrophe restoration: matching runs on stripped
  keys, so "rek" suggests "řekl" and a fully typed "tata" offers
  "táta"; likewise "its" offers "it's" and "dont" offers "don't" (the
  prediction game's recorded miss). One mechanism serves both. The
  display keeps the real spelling.
- Typo tolerance: prefixes within one edit (substitution, missing or
  extra letter; 2+ typed letters) admit core-vocabulary candidates at
  a 0.005 multiplier. At most 2 strip slots go to such one-edit
  hypotheses while exact-prefix candidates exist (2026-08-27, the
  game's cause B: giant words one edit away, "a"/"all"/"my" for "am",
  crowded out real completions like "amazing"). A fully mistyped word
  still fills the strip: capped entries return when exact candidates
  run out. Swept: 1 slot costs 4pp of corrupted-prefix hit@3, 3 slots
  cost a real game hit.
- Context-miss discount (2026-08-27, the game's cause C): when a
  stored successor list exists for the context but does not hold the
  candidate, the backoff multiplier is 0.15, not the classic 0.4: a
  known context that lacks the word is real evidence against it.
  The discount is cross-language: if ANY language knows the context,
  a language without it takes the discount on that level too,
  otherwise wrong-language unigram giants float up ("know" outranked
  every Czech word after "si"). Absent tables (trigrams not loaded)
  discount nothing, so lazy loading still changes nothing. Swept
  0.4 / 0.15 / 0.08 on the eval; 0.15 wins next-word and typo rows
  and gives up the least prefix accuracy.
- Verbatim chip: when the typed word (2+ letters) earned no chip, it
  takes the last slot as typed, so an out-of-vocabulary word is always
  acceptable and, in the future, learnable.
- Bigram tables v3: `bigrams-en.js` / `bigrams-cs.js`, generated by
  `tools/build-ngrams.py` from the same OpenSubtitles dump as the word
  lists (one corpus, one attribution). Per head: the total adjacency
  count and the head's backoff weight, plus the top 32 successors with
  discounted pair counts, log-quantized
  (code = round(ln(value) x 8), decode exp(code/8), ~13% steps); a
  pair needs 20 occurrences in the 400 MiB corpus prefix and both
  words in the 3000-word core vocabulary (2026-08-27; the earlier
  tier was top 12 / floor 4 on an 80 MiB prefix, then top 24, and the
  sweep showed the corpus size alone changes nothing when the floor
  scales with it: the gain is pure successor depth, and it was still
  paying at top 48, which only the first-paint byte budget stopped.
  502 KiB gzipped against 229 at the first tier). Clause punctuation (.!?…)
  and out-of-vocabulary tokens break adjacency; every 100th corpus
  line is held out for the eval harness, so the tables never train on
  it. Lookup is by the head's stripped key, so gesture-typed "dekuji"
  finds the successors of "děkuji"; when two heads share a key
  ("hell", "he'll") the more frequent head owns it.
- Measured on held-out subtitles (tools/eval-prediction.mjs, hit@3,
  mixed model, trigram tables on, 2026-08-27 smoothing): next-word 36%
  EN / 33% CS, two-letter prefix 78% EN / 74% CS, corrupted prefix 56%
  EN / 49% CS. The single-language ceilings sit within a point of the
  mixed rows, so the posterior makes mixing nearly free.
- The prediction prefix is the run of letters and in-word apostrophes
  just before the caret, derived from the text on every change. So
  punctuation ends the word, an apostrophe continues it ("don'" keeps
  predicting), and deletes or caret moves re-aim prediction at the
  word under the caret.
- Static frequency lists: top 3000 English and top 3000 Czech words,
  generated by tools/build-wordlists.py from wordfreq blended with the
  OPUS OpenSubtitles 2018 dump (attribution: opensubtitles.org, and
  wordfreq's CC-BY-SA data with its SUBTLEX credit). One-letter words ("i",
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
- Personal trigrams (2026-08-27): three words typed in a row also store
  a (word1 word2 -> word3) count, under the same rule the strip uses to
  address the static trigram tables (spaces alone separate the three).
  The start-of-message token never leads one, because first words
  already have their own bigram level under it. The personal chain is
  now trigram, then bigram, then unigram, with the 0.4 backoff applied
  only where a level that exists misses the word; with no second
  context word the chain starts at the bigram and scores exactly as it
  did before.
- Time decay (2026-08-27): every 30 days since the last sweep, all
  counts halve once. The 50000-token limit only fires for heavy
  typists, so this retires words a light typist stopped using: "old"
  means old in time, not in keystrokes. Repeated halving is
  exponential forgetting, so a word you keep typing is re-incremented
  and stays, while a word you dropped decays away. A long absence
  applies the sweeps it missed, capped at 24 (past every real count).
  A clock moved backwards never sweeps. The sweep runs at load and at
  every learn.
- The user's own decisions (2026-08-27): past the counts, the store
  holds a blocked list, a pinned list, and a bounded history of the
  last 500 committed words. They exist because editing a count does
  not survive on its own. Deleting a learned typo is undone by typing
  it twice more, so a delete blocks the word: never suggested from any
  table, never learned again. Blocking is also the only way to stop
  the static list offering a corpus word. Pinning holds a word at a
  floor count of 3 that decay cannot take below, and pinning a word
  never typed is how one is added by hand. The verbatim chip is
  deliberately exempt from the block list: it echoes what was just
  typed rather than proposing anything.
- Planned: seeding the personal model from chat exports
  (tools/build-personal.py in the research doc).

## Learned words page (dictionary.html)

Everything the keyboard learned, readable and editable. Reached from
"Learned words" in the settings. A separate page, not a settings
panel: the settings block already costs half the touch area, and a
full page load is also the synchronisation mechanism. index.html
flushes its write-behind buffer on pagehide, this page reads the store
fresh, and going back re-reads it, so the two pages need no live sync.
(index.html also re-reads on a back/forward-cache restore, or its next
flush would undo the edits.) Every mutation happens in PersonalModel,
which stays DOM-free and ports to Swift; the page only decides what to
show.

- Search sits above the tabs and outside them, because finding one bad
  word is the main reason the page gets opened.
- **Recent** is the default view, since "it just learned something
  wrong" is the common reason to open it. Consecutive commits render
  as one line of text, so the feed reads like what was actually typed;
  a run breaks after 5 minutes of silence, at a day boundary, or when
  a word does not follow the one before it. Grouped by local date with
  Today and Yesterday named. A search keeps whole runs, never single
  words, because removing the context would make them unreadable.
- **Words** lists learned words by count, with a bar that makes weight
  readable without reading the numbers. Filters: All, Typos, Pinned,
  Blocked. Blocked words live only in that filter, which is also where
  unblocking is. Searching for a word the store lacks offers to add it.
- **Typos** is a review queue, not a search job. A learned word the
  static vocabulary does not know, typed at most 3 times, at least 3
  letters, and within one edit of a common word is flagged with the
  word it was probably meant to be. "One edit" includes a swap of two
  neighbouring letters, because that is the typo the check exists for
  (teh for the, thsi for this): plain edit distance scores a swap as
  two edits and would miss it. One tap per word, or one tap for all.
- **Phrases** lists the pairs and triples flat, sorted by count, not
  as a tree of heads. A flat list is far easier to scan on a phone.
  The start-of-message token shows as a named marker.
- Tapping any row, or any word in the feed, expands one detail panel
  in place. No swipe actions: swipe is invisible and fires by accident
  on a page scrolled with a thumb. The panel shows the count, when the
  word was last seen, the typo note, and the pairs before and after
  it, each pair deletable on its own (a bad pair does not always mean
  a bad word). Actions are Delete, Pin, and Unblock.
- Every edit is undoable from a toast for 6 seconds, including a bulk
  typo delete. The undo snapshot is the whole store serialized, a few
  milliseconds per tap, in exchange for an undo that cannot drift out
  of step with the model.
- The gear panel holds the store's size, Copy JSON, Download, Import
  file, Clear history, Forget everything, and an Advanced section with
  the raw JSON editable by hand. Import and hand-editing are why every
  field of a loaded store is sanitized: junk counts are dropped and a
  broken container degrades to empty instead of throwing.
- Views cap at 300 rows with a line saying how many were left out;
  search reaches the tail. An expanded word shows at most 8 pairs per
  direction.
- The page follows the device light or dark setting only, like the
  cards and practice pages.

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
- Diacritics input is not built yet. The prediction chips already
  restore them, so this is a second path, not the only one.
  Two mechanisms are ruled out (user, 2026-08-27):
  - **No layers.** 8VIM switches to a second wheel with a prefix
    gesture that starts outside the circle. Its own users report that
    this breaks the stroke flow. See `8vim-layers-research.md`.
  - **No reversal suffix.** 8VIM types the accented letter by rotating
    one sector back before the center, which is why it has no backtrack
    correction. We keep backtrack correction. See "Cancel and
    correction" above.
  The open direction is a modifier that follows the finished letter,
  because in Czech only `e` (é, ě) and `u` (ú, ů) carry two diacritics.
  The other eleven base letters (a c d i n o r s t y z) have exactly
  one, so a single gesture or tap decides them. Not designed yet.

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
- **Trace it**, offered after a miss only (a learner who drew it right
  has already made the motion). It clears the answer panel and lays the
  correct stroke over the pad as a path to follow: the card's own curve
  scaled about the wheel centre by pad arm / card arm, at 38% opacity
  and 8 px wide, with a start dot and an arrowhead. Direction is half
  of what a letter is, so a path without them is half an answer.
  Drawing along it says whether the stroke matched, and the learner can
  repeat it as often as they like. It is **deliberately unscored**: the
  answer was already given away, so credit would be meaningless, and
  the practice must cost nothing to repeat. Doing the motion is what
  builds the memory; watching it does not.
- The answer panel (verdict, reveal card, hint) is drawn **over the
  pad**, not below it. Stacked below, on a phone it fell past the fold
  and answering looked like nothing happening; the pad is dead space
  once the question is answered, and it is where the eye already is.
  The panel scrolls internally if a short screen cannot fit it.
  `tests/game-flow.mjs` asserts every answer path leaves the panel
  inside the viewport at scroll position 0.
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

## Panels over the wheel

Two panels can take the wheel's place: the emoji picker and the number
and symbol pad. They share a shape, and the rules below hold for both.

- Each has a button parked in one of the wheel's free corner pockets,
  emoji top-right and numbers top-left. Both are copy-button twins:
  same 48 x 40 px size, border and 12 px inset. Their top edge meets
  the top of the disk's bounding box, the way the copy button's bottom
  edge meets the bottom, so all three sit the same distance from the
  rim.
- A panel covers the canvas; it does not replace it. Hiding the canvas
  would resize it to zero and move the decoder's center through a
  resize cycle. The overlay leaves the wheel untouched underneath and
  swallows every pointer event by itself.
- One panel at a time. Opening one closes the other, and pressing an
  open panel's own button closes it.
- While a panel is open, the suggestion strip, the copy button and the
  other panel's button are hidden. Suggestions mean nothing there, the
  copy button sits exactly where the panel's bottom bar goes, and the
  other button would float over the grid with nothing to open.
- The open panel's button drops to the right end of that bottom bar,
  which reserves a 60 px slot for it, so it can cover neither a cell
  nor a bar key. Its icon becomes a wheel, and it then closes the
  panel.
- The contents scroll as one list, with a heading per section that
  sticks to the top edge for as long as its section lasts. That
  heading is also what tells you where the scroll has got to.
- A key types at the caret and leaves the panel open, so a run of them
  takes one open. What it types ends the current word for prediction
  and disarms the double-tap period, the same as punctuation.
- Each panel's module loads on the first press of its button, not at
  startup. The service worker precaches both, so they work offline on
  their first open.

## Emoji picker

- 925 emoji in ten categories (smileys, people, animals, nature, food,
  activities, travel, objects, symbols, flags), plus a recently-used
  section first. The scroll runs from the recent section to the flags
  with no switching.
- Tabs sit along the bottom bar, in thumb reach, one per section. A
  tab jumps the scroll to its section, and scrolling by hand lights the
  tab of the section at the top edge. The last section is the exception
  that needs care: a jump to it stops short of its offset, because
  there is nothing below it to scroll into, so the tab press sets the
  active tab itself rather than leaving it to the scroll handler.
- There is no search field: a text field would open the phone's own
  keyboard over a keyboard prototype.
- The learner ignores emoji: an emoji is not a word character.
- The recently-used list holds 16 emoji (two rows), newest first, in
  `localStorage` on this device only. The picker opens scrolled to it
  once it has content; a first run opens at smileys instead, past the
  empty section.
- That section is rebuilt on open, never on a pick. Rebuilding it as
  you pick would move every category down the scroll, under a finger
  that is picking a second emoji.
- Data path: `emojis/EmojiData.cs` (the upstream source, from another
  project of the author's) to `emoji-data.js`, by
  `tools/convert-emoji.py`. The same `.cs` file holds 907 search
  keywords; the converter emits them (`--keywords`) only when a search
  field exists to use them.

## Numbers and symbols pad

- The button reads "123" and sits in the wheel's top-left corner
  pocket, level with the emoji button in the top-right one.
- Three parts, top to bottom: a scroll of symbol keys, a numeric
  keypad, and the bottom bar.
- 67 symbols in five sections: punctuation (16), brackets (8), math
  (16), money (6) and signs (21). Punctuation and math are sized to
  fill exactly two rows of eight on a phone, so no key is left alone
  on a third. Both Czech quote marks („ “) and both English ones (“ ”)
  are there: one keyboard serves both languages, which is the same
  rule the letter layout follows.
- The keys are bordered, unlike the emoji picker's borderless cells. A
  symbol is a small mark, and without a key around it the grid reads
  as scattered glyphs rather than something to press.
- A key types a string, not a character: the Kč key types two.
- The keypad is three columns: 1-9, then the two decimal separators
  around the zero. English writes 3.14 and Czech writes 3,14, so both
  are there. It is centered, and pushed under the right thumb on a
  touch screen, the same reason the wheel hugs the right edge there.
- The bottom bar holds backspace, space and enter. The wheel carries
  all three (center tap, East tap, South tap), but they are
  unreachable while the pad covers it, and a number is rarely the last
  thing typed.
- The pad always opens at the top of its scroll. Unlike the emoji
  picker there is no recent section to return to, and the punctuation
  is what most presses are after.
- The pad repeats the wheel's own South-drag punctuation (? ! ,) on
  purpose: it is where a user who has not learned those drags comes
  looking.

## Phone-keyboard page layout

- Top to bottom: compact header, typed text, canvas. The canvas fills
  the rest of the screen down to the bottom edge, where a phone
  keyboard sits.
- The suggestion row is an absolute overlay on the canvas, parked with
  its bottom edge 4 px above the wheel rim, so the chips sit in thumb
  reach (user request 2026-08-26). Empty parts of the strip pass
  presses through to the canvas; only the chips catch taps. On a short
  canvas the row clamps so it cannot cover the typed-text box.
- A copy button sits in the bottom-right corner (48 x 40 px, 12 px
  above the canvas bottom), in the pocket the wheel disk leaves free.
  It copies the finger-selected text if a selection exists, otherwise
  the whole text, and flashes a check mark in the trail accent for
  0.9 s. With nothing to copy it does nothing. The selection is read at
  pointer down, before the click can collapse it.
- Two more buttons sit in the wheel's other free corner pockets, at the
  top-left and top-right of the disk's bounding box: numbers and emoji
  (see "Panels over the wheel"). All three corner buttons follow the
  disk's bounding box, not the canvas edges: the two on the right keep
  a 12 px inset while the wheel hugs the right edge, and move inward
  with the wheel when it is centered. Their distance from the bottom
  follows the arm length, so main.js places all of them in `resize()`.
  A panel under them starts at the
  canvas top edge, which the CSS derives from the typed-text box's
  height, kept in one variable (`--output-h`) that the box and the
  panels both read.
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
- From 520 px of window width the page stops stretching: the body holds
  a 480 px column in the middle, with a hairline down each side. The
  practice and dictionary pages take the same column (without the
  lines, because they scroll). The cards page keeps the full width: it
  is a reference sheet, and its grid auto-fills, so a wide window shows
  the whole alphabet at once. A phone in portrait never reaches the
  query, so this is a desktop-only rule.

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
- `phonekeeb.emojiRecent`: the recently used emoji as a JSON array of
  strings, newest first, at most 16, absent until the first pick.
  Anything else in the slot is dropped rather than trusted: the list
  is rendered as DOM text.
- `phonekeeb.personal`: the personal model as JSON, absent until
  something is learned and removed by "Forget learned words". Never
  leaves the device. Shape v2:
  `{v: 2, day, uni: {word: count}, seen: {word: day}, bi: {head:
  {word: count}}, tri: {"w1 w2": {word: count}}, blocked: [word],
  pinned: [word], log: [[word, prev, timestamp]]}`. `day` is the whole
  UTC day of the last decay sweep. `seen` is the day each word was
  last learned. `log` is the last 500 committed words, the only field
  holding text rather than counts, which is why it is bounded and why
  "Clear history" exists separately from "Forget everything". A v1
  store (`{v: 1, uni, bi}`) loads unchanged, arrives with the new
  fields empty, and is written back as v2.

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
  letter-cards smoke, emoji picker, number and symbol pad).
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
| Suggestions | at most 6 chips, two rows of 3; rank 1 bottom right, likelihood falls leftward then to the upper row |
| Suggestion strip | 88 px tall (two 40 px lines + 8 px gap); chips a fixed third wide |
| Bigram successors per head | top 32, pair count >= 20 (400 MiB corpus), core vocabulary only |
| Trigram contexts | count >= 200; top 8 successors, triple count >= 6 |
| N-gram count quantization | code = round(ln(value) x 8); decode exp(code/8) |
| Absolute discount D | per order, n1 / (n1 + 2 n2) over the unfiltered counts: 0.481 en / 0.474 cs bigrams, 0.497 en / 0.540 cs trigrams |
| Backoff weight gamma | per stored head or context, (D x kept + dropped) / T; emitted as the head token "T\|g" |
| Backoff weight scale | 0.5 x every stored gamma at decode time |
| Context-miss discount | 0.15 x next level, only where no stored gamma exists: another language knows the context, or a legacy v2 table |
| Personal-model backoff | 0.4 x personal unigram on a personal bigram miss |
| Typo edit penalty | 0.005 per edit, one edit max, prefix of 2+, core words only |
| Typo strip slots | at most 2 while exact-prefix candidates exist; capped entries refill a short strip |
| Extension vocabulary | to 50000 en / 150000 cs combined forms; tail must pass aspell, with the three exceptions above; core sum scaled to 1e9 |
| Data file form | `export const X = JSON.parse(\`...\`)`, never a literal: Safari's parser overflows its stack on a 147000-entry array literal |
| Vocabulary membership | wordfreq^0.5 x OpenSubtitles^0.5, add-one smoothed on the subtitle side |
| Vocabulary counts | OpenSubtitles probability alone, add-one smoothed; the core sum is the denominator |
| Candidate scan | first-letter bucket for a typed prefix, core tier only for an empty one |
| Extension load chunk | 4000 words per frame |
| Language posterior | window 6 words, decay 0.65, log-odds clamp 2.5, floor 0.05 |
| Personal blend | 0.3 x personal + 0.7 x static |
| Personal enrollment | out-of-vocabulary words need 2 sightings |
| Personal decay | halve all counts past 50000 learned tokens |
| Personal time decay | halve everything once per 30 days since the last sweep; at most 24 catch-up sweeps |
| Pinned floor count | 3 (above the enrollment threshold, so a pin also adds a word) |
| Learned history | last 500 committed words, as (word, previous word, timestamp) |
| Personal save | every 20th learned word, plus pagehide/hidden |
| Learned word length cap | 24 characters |
| Typo suspect | not in the static vocabulary, count <= 3, length >= 3, one edit (swap included) from a known word |
| Dictionary rows | 300 per view, 8 pairs per expanded word |
| Dictionary undo | 6 seconds, whole-store snapshot |
| Feed run break | 5 minutes of silence, a day boundary, or a broken word chain |
| Arm length | 0.44 x min canvas dimension |
| Wheel anchor | bottom, 12 px margin; right on touch, x-centered with a mouse |
| South drag targets | E = ?, N = !, W = ,; center circle counts as N |
| Suggestion row gap | bottom edge 4 px above the wheel rim |
| Copy button | 48 x 40 px, 12 px above the canvas bottom, right edge on the wheel box; copied flash 900 ms |
| Panel buttons | 48 x 40 px, edges on the wheel box's top and side, or the panel's bottom bar while it is open |
| Desktop column | 480 px wide, centered, from a window 520 px wide; not on the cards page |
| Panel bar | 40 px tall keys, 60 px right slot for the button |
| Emoji picker | 925 emoji, 10 categories, one continuous scroll; cells 44 px, columns auto-fill from 44 px, 2 px gap |
| Emoji tabs | 11, recent first |
| Emoji scroll-to-tab tolerance | 4 px |
| Symbol pad | 67 symbols in 5 sections; keys 44 px, columns auto-fill from 38 px, 6 px gap |
| Numeric keypad | 3 columns, 1-9 then . 0 , ; block max width 320 px, right-aligned on a touch screen |
| Recently used emoji | 16, newest first, localStorage |

Pixel values were tuned on a ~390 px wide phone viewport; on iOS
they should scale in points, not pixels.
