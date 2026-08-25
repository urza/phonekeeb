# Ideas

A raw idea dump, not a roadmap. Nothing here is committed work. The
quoted lines are urza's original notes; the names and the italic notes
are Claude's.

## Gestures

### Typewise-style hold-to-delete (implemented 2026-08-25)
> delete like Typewise - right segment, hold down (glide) to center -
> then keep deleting or (while still touching down) more right to
> undelete - Typewise speed and animation is very satisfying

*Note: the Typewise keyboard's signature delete. This fits
the prototype unusually well. A tap in the right sector already
deletes, and moving gestures that start outside the center are exactly
the input space we reserved when we enforced center-start. An undelete
buffer is cheap.*

*Shipped: E-sector hold-glide, 14 px per character, drag back to
undelete. Spec in features.md "Hold-glides".*

### Cursor movement (implemented 2026-08-25)
> move cursor.. how? - similar to Typewise delete but start from
> different segment?

*Note: same reserved gesture space. A hold in another sector plus
glide could move the caret by character, with distance as speed.*

*Shipped: N-sector hold-glide moves a real caret; all edits apply at
the caret. Distance maps to position, not speed. The N tap (shift)
was removed to free the sector.*

### Double space (implemented 2026-08-25)
> double space gesture.. for what? to write dot?

*Note: double-space-for-period is the standard phone convention, so it
matches user reflexes. It also fits the new direction: qwerty-8pen has
no punctuation in the letter slots, so punctuation needs gestures.*

*Shipped: two center taps within 350 ms turn "word " into "word. ".
Dip-spaces never arm it.*

### Long press in a segment
> long press segment gestures.. for?

*Note: open slot. The original 8pen used long-press for accent popups,
which we still need for Czech diacritics.*

### Delete last word
> gesture to delete last word?

*Note: high value while gesture typing, since a bad glide often makes
a whole wrong letter sequence. Could be the hold-delete with a
stronger motion, or a dedicated sector.*

## Feel and feedback

### Letter commit celebration
> success when letter is written.. animation of placing it? make it
> feel micro celebrated that letter was typed

*Note: the video praised the original for feeling like handwriting.
A small commit animation (letter flying to the output line, a pulse of
the center ring) plus later haptics on iOS would add the missing
feedback the 8pen reviews complained about.*

## Layout real estate

### Drop the shift segment (implemented 2026-08-25, in part)
> no shift as main segment, instead smart capitalize option and use
> this estate for something else

*Note: auto-capitalize after sentence ends covers most uses, and the
capital loop already exists for manual capitals. That frees the whole
top-sector tap for something better, for example delete-last-word or
cursor mode.*

*Shipped: the shift tap is gone and the N sector went to cursor mode.
Smart auto-capitalize is still open; capitals are capital-loop only.*

### Colored segments and letters (implemented 2026-08-25, in part)
> colored segments + letters in its segment color to indicate where it
> belongs (to which color i will need to drag this).. and optionally
> let me set color for each letter manually.. fg/bg/circle around

*Note: color would encode the entry sector at a glance, a learning
aid the glide preview does not give. The theme system already carries
per-role CSS variables and contrast tests, so this slots in cleanly.*

*Shipped: quadrant tints plus letters colored by LANDING sector (the
user's call: the color says where to drag to, matching "to which
color i will need to drag this"). Manual per-letter colors are still
open. Toggle in settings.*

### KALQ
> what is kalq letter placement

*Note: KALQ is a research layout (Oulasvirta et al., 2013) for
two-thumb tablet typing. It splits letters between hands so the thumbs
alternate and one thumb travels while the other taps. Different
mechanics from us, same spirit as our flow score: optimize the motion,
not the alphabet order.*

## Language and correction

### Harper integration
> integrate harper?

*Note: Harper is a local, open-source grammar checker (Rust, by
Automattic) with a WASM build that runs in the browser, so the web
prototype could try it without a server. English only, last I knew,
so Czech needs a separate answer.*

### Contraction auto-fix
> auto fix : its ->it's etc

*Note: the word lists now keep real contractions, so the prediction
layer already has the data to offer "it's" when "its" is typed.*

### Autocorrect policy
> autocorrect automatically or not

*Note: open decision. Gesture keyboards lean on correction more than
tap keyboards, but silent changes cost trust. A visible, tappable
correction (chip style) is the middle road.*

### Mixed languages
> mix both languages (en+cz), not switching, like swiftkey does - smar
> words suggestion - should be mostly from one language after first
> word, but not as a hard rule

*Note: recorded as a project constraint in CLAUDE.md already: one
layout for both languages. For prediction this means one blended
ranking with a soft per-sentence language prior, which the current
predictor structure can grow into.*

## Beyond letters

### Word completion inside the glide
> writing more than letters - same mechanism but predict part of words
> or whole words as typing progresses inside glider

*Note: the biggest idea on the page. The decoder already publishes a
live preview each frame; a predictor could rank likely continuations
and the preview could offer a whole word ending as one extra glide
target. This is where prediction, the glide preview, and the macro
idea meet.*

### Symbols, emoji, numbers, clipboard
> emojis, special chars (symbols), numberpad, clipboard - regular
> buttons on left? 8VIM has there something like that

*Note: 8VIM keeps a conventional side strip for exactly this. Honest
approach: not everything deserves a gesture. The reserved W-sector tap
(number and symbol layer) can open such a panel.*
