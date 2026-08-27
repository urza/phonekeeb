# 8VIM layers: how they work, and what they cost

Researched 2026-08-27 from the 8VIM docs, the app source at `master`, all
33 shipped layout files, and the issue threads. Phone twin:
`8vim-layers-research.html`. Background on the project itself is in
`inspirations.md` and `learnability-research.md`.

Layers are how 8VIM answers the question we have not answered yet: where
do the Czech diacritics live. Read this before designing our own answer.

**We do not copy either of the two mechanisms on this page** (user,
2026-08-27). See the last section for what was decided and what stays
open.

## Summary

- A layer is a **second full wheel of 32 characters**, drawn in place of
  the letters. 8VIM has 6 levels: the default plus 5 extra ones.
- You enter a layer with a **prefix gesture**: bottom sector, into the
  circle, back out to bottom. Each further clockwise sector step selects
  the next layer.
- The layer is **momentary**. It resets after every committed character,
  and at every finger down and finger up. There are no sticky layers.
- 32 of the 33 shipped layouts use extra layers. Only English does not.
  The content is almost all **diacritics**, plus currency signs, a few
  digraph macros, and in two layouts a whole second alphabet.
- There is a second, **undocumented and much faster path** to every
  layer character: draw the base letter, then step back one sector
  before returning to the center. One extra step per layer level.
- That fast path costs 8VIM the ability to correct a gesture by rotating
  backward. Our decoder currently spends the same motion on correction.
  **Both are not possible at once.**

## The data model

Source: `ime/layout/models/LayerLevel.kt`,
`ime/layout/models/yaml/versions/common/ExtraLayer.kt`,
`ime/layout/parsers/yaml/YamlParser.kt`.

| level | name | rendered | how you reach it |
|---|---|---|---|
| -1 | `functions` | no | only while the Fn button is on |
| 0 | `hidden` | no | arbitrary movement sequences, written by hand |
| 1 | `default` | yes | the normal wheel |
| 2 to 6 | `extra_layers: first`…`fifth` | yes | the prefix gesture below |

Each visible layer holds the same 32 slots as the default wheel: 4
sectors, 2 parts per sector, 4 crossing depths. Every slot carries a
lower case and an upper case value, so one layer can hold 64 outputs.
Six layers give 192 slots in total.

The `hidden` layer is different in kind. It holds explicit
`movement_sequence` lists instead of positions, so it can define any
path, including paths that start outside the circle or need a finger
lift. The shipped `special_core_gestures.yaml` puts the emoji shortcuts,
the bracket pairs, the suggestion picks and the Fn toggle there.

## How you activate a layer

The documented gesture, from the docs and the wiki:

> To switch to layer selection do: `bottom` -> `circle`. Then go back to
> `bottom` for the second layer. If you turn clockwise you change to the
> other layers.

In movement terms, the prefix per layer is:

| layer | prefix |
|---|---|
| 2 | bottom, circle, bottom |
| 3 | bottom, circle, bottom, left |
| 4 | bottom, circle, bottom, left, top |
| 5 | bottom, circle, bottom, left, top, right |
| 6 | bottom, circle, bottom, left, top, right, bottom |

Then you return to the circle and draw the letter as usual. Three
properties matter:

- **The stroke must start outside the circle**, with the finger down in
  the bottom sector. A layer cannot be entered from the middle of a
  running stroke, because the prefix is matched from the first position
  of the stroke.
- **The wheel re-renders** with the layer's characters while the prefix
  is held. That is the whole point of the feature; it was contributed in
  2023 as "display other layers" (issue #292), and a later regression
  that stopped the redraw was treated as a bug (#418).
- **The layer resets** to default after each committed character, and on
  every finger down and up (`Keyboard.reset()`,
  `KeyboardController.onTouchEventInternal`). A user asked for a
  permanent switch, "as from the local language to English" (#320). The
  code has no such state.

Cost for one accented letter at the first crossing: 5 moves after touch
down, against 3 for the plain letter.

### The fast path nobody documented

`FingerPosition.computeQuickMovementSequence` gives every extra-layer
character a second gesture, and the parser registers both. The rule:

> Draw the base letter's path. Before returning to the center, step back
> one sector. One extra back step per layer level above the first.

Two Czech examples, with the default `cs.yaml` positions:

| char | gesture |
|---|---|
| `a` | center, right, top, center |
| `á` (layer 2) | center, right, top, **right**, center |
| `r` | center, right, top, left, center |
| `ř` (layer 2) | center, right, top, left, **top**, center |

This is the pre-2023 diacritics mechanism. Layers replaced it, users
revolted at the cost, and the maintainer restored it as a hidden
alternative inside the same release (#321). It is not in the docs, not
in the wiki, and not visible on the wheel. The visible layer teaches the
character; the reversal types it quickly once you know it.

## What the shipped layouts put in layers

All 33 layouts in `8vim/src/main/res/raw`, read at `master` on
2026-08-27:

| use | layouts |
|---|---|
| Diacritics and special letters | 28 layouts, `af` through `tr` |
| Currency and extra punctuation | `de`, `es`, `et`, `fi`, `fr`, `it`, `nl`, `pl`, `pt`, `sk` (mostly `€`) |
| Digraph macros | `it`: `ch`, `qu`, `gh` as single slots |
| A whole second alphabet | `he` and `uk` hold the full 32-slot Latin set in a layer |
| Numerals and marks | `ar`: Arabic-Indic digits plus the harakat |
| Punctuation the base wheel lacks | `ru`: `!`, `.`, `…`, `:`, `/`, `—`, `*`, `;`, `"`, `ъ`, `ё` |

Layer counts run from 1 to 5. French uses all five (`éœæç`, then `àùè`,
then `âôûêî`, then `ÿöüëï`, then `€`). Czech uses two: 13 characters in
the first (`ňářýšďťčžíéóú`) and 2 in the second (`ěů`).

English is the only shipped layout with no extra layer at all.

One detail worth copying: **an accented letter sits in the same slot as
its base letter**. In `cs.yaml`, `á` is at the `a` slot, `č` at the `c`
slot, `ě` at the `e` slot one layer deeper. Nothing new must be
memorized, and the fast path falls out of the same rule.

## What is not a layer

- **Numbers and symbols.** A tap on the left sector opens a
  conventional tap keypad. This is the single most repeated complaint
  about the keyboard. Derisis13, after seven months of exclusive use:
  "the worst experience is with symbols and numbers. To type them you
  have to use a numpad, reverting to the old targeting method, instead
  of the gestures." A 2022 request to make numbers a wheel is still open
  (#270). The maintainer wrote in 2023 that layers now make it possible.
  It has not shipped.
- **Emoji and brackets.** Hidden-layer sequences, not a layer.
- **Capitals.** One full rotation toggles shift. The rotation detector
  offsets itself by the layer prefix length, so capitals work inside a
  layer.
- **Selection, clipboard, cursor.** Sector gestures and the Fn layer.

## What users say about layers

The threads are consistent, and all four complaints are about cost, not
about the idea.

> To write `ñ` I need to do 5 gestures, in old method I need to do only
> 3.
> — marcossmtp, #321, 2023

> It is the same situation with the German layout. Since diacritics and
> capital letters are so common that they occur multiple times in almost
> every sentence, the new method of entering them is way too slow.
> — kjoetom, #321, 2023

> Personally, I have a problem with gestures which don't start at C.
> They badly interfere with the "flow". That's also why the Layout
> Switching method for diacritics is not feasible for me.
> — ManDay, #330, 2023

> I can't find anywhere (wiki, source) how to activate the secondary
> layers.
> — flauta, #320, 2023

flauta also names a design smell: the switch gesture ends in the bottom
sector, and many layer characters live in the bottom sector.

The most useful thread for us is #558. A user asked to rotate backward
to fix an overshoot. The answer was no, and the reason is the fast path:

> It is not possible, because reversing is already used to obtain
> variants of a letter (in layouts which have multiple "layers").
> — ManDay, #558, 2024

The maintainer confirmed it. So 8VIM has no backtrack correction, by
design, because the reversal is spent on diacritics.

## What this means for phonekeeb

**Decided by the user, 2026-08-27: we take neither mechanism.** No
layers, and no reversal suffix. Backtrack correction stays as
`features.md` describes it. Both 8VIM paths are recorded here as prior
art, not as options.

The reasons hold up on their own evidence. Their layer prefix starts
outside the circle, and that is the exact property their own experienced
users reject. Their fast path costs them the ability to rotate back out
of a mistake, which they confirmed in #558.

What survives for the open design work:

1. **The problem is smaller than 15 characters.** Czech adds 15 accented
   letters, but they sit on only 13 base letters, and only `e` (é, ě)
   and `u` (ú, ů) are ambiguous. A single modifier decides the other
   eleven: a c d i n o r s t y z.
2. **The open direction is a modifier after the finished letter.** A
   gesture or a tap that follows the letter, not a mode entered before
   it. Nothing is designed yet.
3. **Whatever it is, it must start and end in the center.** That keeps
   the continuous stroke, and it is the single loudest structural
   complaint about 8VIM's answer.
4. **It must not collide with the net crossing count.** Backward
   rotation already means "un-count an arm", and capitals already own
   the extra full loop. The free ground is what happens after the
   commit, not during the letter.
5. **Keep the no-new-memory property.** 8VIM puts the accented letter in
   the base letter's slot, so a user learns nothing new for it. A
   post-letter modifier gets the same property for free, and the study
   cards and the game then extend without a new map.
6. **Symbols carry the same open question.** `symbols-pad.js` is our
   version of the tap keypad that every review of this input family
   complains about. The diacritics answer and the symbols answer should
   at least be considered together.

## Sources

- 8VIM layers guide: https://8vim.github.io/docs/guides/layers/
- Wiki, layout format: https://github.com/8VIM/8VIM/wiki/Adding-a-new-language
- Wiki, usability guide: https://github.com/8VIM/8VIM/wiki/Usability-Guide
- Layout files read at `master`: https://github.com/8VIM/8VIM/tree/master/8vim/src/main/res/raw
- Layer levels and prefixes: `8vim/src/main/kotlin/inc/flide/vim8/ime/layout/models/LayerLevel.kt`
- Fast path: `8vim/src/main/kotlin/inc/flide/vim8/ime/layout/models/FingerPosition.kt`
- Feature request that started layers: https://github.com/8VIM/8VIM/issues/292
- Diacritics too slow, fast path restored: https://github.com/8VIM/8VIM/issues/321
- Layer switch undocumented: https://github.com/8VIM/8VIM/issues/320
- Layers stopped rendering, treated as a bug: https://github.com/8VIM/8VIM/issues/418
- Numbers and symbols as a wheel, still open: https://github.com/8VIM/8VIM/issues/270
- Faster capitals, and flow objections: https://github.com/8VIM/8VIM/issues/330
- No backtrack correction, and why: https://github.com/8VIM/8VIM/issues/558
- Community EN/DE layout built on reversals: https://github.com/8VIM/8VIM/discussions/280
- Mode switch proposal and adaptive cycling counter-proposal: https://github.com/8VIM/8VIM/discussions/186
- Diacritics methods before layers: https://github.com/8VIM/8VIM/discussions/65
