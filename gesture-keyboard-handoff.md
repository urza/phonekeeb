# Gesture Keyboard for iOS: Project Handoff

Status: concept. No code exists yet.
Author context: senior .NET developer, native Czech speaker, Brno. Swift is new territory.

## Motivation

Typing on a phone QWERTY is the single worst part of my digital life.

The root problem is target size. Two thumbs must hit about 30 small keys.
Nobody hits them reliably, so autocorrect papers over the errors.
Autocorrect works well enough that nobody fixes the real problem.

I do not want a slightly better QWERTY. I want a different input model.

## What I want, in priority order

1. Flow input. One continuous finger movement, like SwiftKey or 8pen. No hunt and peck.
2. Prediction that becomes genuinely mine. It starts from a default corpus, then
   learns my sentences and shifts its weight toward them over time.
3. Strictly offline. No network, ever. Not a promise, an architectural guarantee.
4. Typo repair by near-string search, so sloppy gestures still land.

## Prior art we researched

I surveyed the field before writing any code. Summary of what exists:

| Project | Idea | State |
|---|---|---|
| MessagEase | 9 big keys, letter picked by tap or drag direction | unmaintained, closed source, the original |
| Thumb-Key | open-source Android reimplementation of the above | active, 1.5k stars, YAML-configurable keys |
| Wurstfinger | same idea for iOS, SwiftUI | active, on the App Store, MIT license |
| 8pen | draw loops around a center point, 4 sectors | dead, pulled from stores |
| 8VIM | open-source 8pen successor plus Vim editing | active, Android only |
| Typewise | hexagonal keys, no QWERTY order | still on stores, company moved to enterprise AI |
| Minuum | collapse the keyboard to one row, let prediction do the work | dead since about 2017 |
| KALQ | split layout optimized for two thumbs, from St Andrews | research prototype only |
| Dasher | zooming interface, language model steers the letters | active, open source, accessibility focus |
| Japanese flick | 12-key grid, swipe direction picks the vowel | mainstream in Japan, the existence proof |

Links:

- https://github.com/dessalines/thumb-key
- https://github.com/cl445/wurstfinger
- https://github.com/8VIM/8VIM
- https://www.exideas.com/ME/
- https://dasher.at
- https://minuum.com/

Two conclusions from the survey.

First, the survivors converge on one design. Fewer and larger keys, with
direction as a second input channel. That is not a coincidence.

Second, nobody has combined 8pen-style flow with a personal offline
language model. Minuum had the prediction and a boring layout. 8pen had the
gesture and no prediction. That gap is the project.

## The concept

Start from 8pen mechanics, confirmed by research rather than assumed. The
real 8pen used a circle with 4 quadrants around a center dot, and the center
dot was the spacebar. A letter is (entry quadrant, rotation direction,
crossings), where crossings is how many quadrant boundary lines you cross
before returning to the dot, from 1 to 4: 4 x 2 x 4 = 32 addressable
letters. The most frequent letters need only 1 crossing. The minimum of 1
matters: it makes rotation direction unambiguous, and an out-and-back that
crosses nothing types nothing, which forgives accidental exits. Letters are
displayed along the boundary lines themselves, on the side facing their
start quadrant, with radial position showing the crossing count. Capitals
need one extra full loop before completing the letter, and accents used a
long-press popup.
Sources: [ploum.net review](https://ploum.net/writing-on-a-smartphone-review-of-8pen-and-messagease/index.html),
[OSnews review](https://www.osnews.com/story/23988/8pen-good-but-not-for-everybody/).

The web prototype implements the 32-slot mechanism, the arm-side letter
display, center-tap-for-space, and capitals via the extra loop. The accent
popup is not built.

8pen is the starting point, not the target. The goal is a keyboard that is
better than 8pen and personal to its user.

Planned additions the original never had:

1. Word prediction that runs during the gesture, not after it.
2. A personal n-gram model that starts from a default corpus and learns to
   prefer the user's own text.
3. Fuzzy matching, so a gesture that misses still resolves.

What the prototype already does, including the deliberate divergences
from the original, is documented in `features.md`. Keep that file
current; this document stays the concept and research record.

## Open design question: letter placement

I wanted to place letters by their QWERTY position, so the layout feels
familiar on day one.

Counterargument we discussed: QWERTY skill is 2D spatial memory. A radial
layout destroys that geometry. Almost nothing transfers except a vague sense
that Q lives on the left. Meanwhile gesture cost varies a lot. A short swing
is cheap, a triple loop is expensive. Frequency-based placement is exactly
where 8pen and MessagEase earn their speed.

Proposed compromise, to be measured rather than argued:

- Assign sectors by QWERTY region, so the eye finds letters in week one.
- Order gesture depth inside each sector by letter frequency.

Build both layouts behind a flag. Measure WPM and error rate on myself.
Czech letter frequency differs from English, so measure in both languages.
Diacritics need a plan too. Thumb-Key handles them with combining characters
on swipes, which is worth copying.

## Technical approach

**Gesture decoding.** A small state machine over quadrant crossings. Track
entry quadrant, rotation direction, and how many boundary lines are crossed
before the finger returns to the center dot (1 to 4, plus 4 more for a
capital). This produces a discrete symbol stream, which is much cleaner
than SwiftKey's continuous finger paths. No machine learning needed here.

**Prediction.** Walk a trie of candidate words with beam search, rescored by
the language model. Emit candidates while the finger still moves.

**Personal model.** Two count tables: a default corpus and a personal one
built from everything I type. Score a candidate by blending both counts,
with the personal weight rising as personal counts accumulate. New devices
still predict well from the default table on day one. Counts update in
constant time. A few MB compressed. Start simple. A count table beats a
neural model at this size and fits the memory budget.

**Typo repair.** Look at SymSpell. It does delete-based fuzzy lookup in
microseconds. The reference implementation is C#, so I can read the original
before porting the idea to Swift.
https://github.com/wolfgarbe/SymSpell

## iOS constraints, verified

Custom keyboards are app extensions, supported since iOS 8. That is how
Wurstfinger and Typewise ship. The sandbox rules help us here:

- By default a keyboard extension has no network access. The sandbox blocks
  the APIs that could exfiltrate typing data.
- Network requires the user to enable "Allow Full Access" by hand.
- App Review requires every keyboard to stay functional with no network.
- The extension gets roughly 60 MB of RAM. No background execution.
- Keyboards never appear in password fields or secure text views.
- The keyboard must offer a way to switch to another keyboard. This is a
  review requirement.
- The containing app must do something real, such as settings or a tutorial.
  An empty host app gets rejected.

Design consequence: keep the corpus and the model in the extension's own
sandbox container, and never set RequestsOpenAccess. Then the offline
guarantee is structural. The Full Access toggle does not even exist for the
app, which any user can verify in Settings.

Reference: https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html

## Web prototype phase

Before any Swift code, build the gesture decoder and prediction logic as a
web page. This gives fast iteration on layout and gesture feel, on a laptop
and on a real phone, without the extension constraints getting in the way.

- A canvas draws the center circle, the sectors, and the live finger path.
- The Pointer Events API (`pointerdown`, `pointermove`, `pointerup`) reads
  the gesture. It covers touch on iOS Safari and mouse input on desktop
  with one code path.
- `touch-action: none` on the canvas stops the page from scrolling or
  zooming during a gesture.
- The gesture decoder, the trie and beam search, and the blended default
  and personal count tables can all run in JavaScript first. Only once the
  design proves out does any of it need a Swift port.

## Suggested build order

1. Web prototype: canvas plus pointer events, decode sector, direction, and
   loop count. Draw the path live for debugging.
2. Layout definitions as data, not code, so alternatives are swappable.
3. Trie plus beam search over a static Czech and English word list, in the
   web prototype.
4. Blended default and personal count model, updated on every committed
   word.
5. SymSpell-style fuzzy layer.
6. Port the proven gesture decoder to a pure Swift module. Unit test it
   hard.
7. A throwaway host app that draws the sectors and prints decoded letters.
8. Move it all into a real keyboard extension. Watch the memory ceiling.
9. Self-measurement harness: WPM, error rate, per-layout.

The web prototype phase (1 through 5) needs no Apple hardware and no
extension constraints. Only step 8 hits those, so delay that pain until the
core works.

## Notes for whoever picks this up

The gesture layout is the fun part. The personal offline model is the actual
differentiator, and it is the part that will take longest to get right.

Do not start with a neural language model. Get counts working first.

Watch the 60 MB limit early. It is the constraint most likely to force a
redesign late.
