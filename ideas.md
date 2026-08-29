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

### A big model beside the small one
> Looks like Czech-GPT-2-XL or CzeGPT-2 might be good addition later,
> running in parallel as optional probably remote models, enriching the
> local suggestion engine. Just an idea..

*Note (2026-08-27): the measurements say where it fits and where it
does not. Full numbers in `czech-lm-research.md`.*

*Correction (2026-08-27, later the same day, after the user pushed
back). The first version of this note said the big model is for unknown
words only. That reads the measurement too narrowly. What the numbers
show is a split by TASK, not by vocabulary.*

*Where it loses: per-keystroke next-word ranking on held-out
subtitles. The 124M models score about half our tables there, and even
the 1.58B model only ties. That is the register problem, and a remote
call does not fix it. Frequency questions are already answered well by
counting, and counting is free.*

*Where it wins: everything that needs meaning. The XL model scored 7 of
11 on the prediction game and answered both Czech cases that our tables
cannot reach at any size. Game cases 9 and 10 sit in the roadmap's
"stop revisiting" list for exactly this reason. A counting model cannot
know that "vykoupat a" wants another infinitive, that a question wants
an answer form, or that the sentence turned to a new topic three words
ago. The big model carries the whole context, not a two-word window.
Unknown words (cause F, game case 12) are one case of this, not the
whole of it.*

*So the scope is general. It is a second opinion on the strip, wherever
the local engine is uncertain, and it may add candidates or reorder
ours. The trigger is a confidence question, not a vocabulary question.
Weak local strip is one trigger. A long context the n-gram window
cannot see is another. Detail is open work.*

*Never per keystroke. 2.3 s per strip locally on 14 desktop cores, and
even a server GPU leaves a round trip per letter. Fire on a word
boundary, or on demand behind a "think harder" chip, and let the answer
arrive late and replace chips when it lands.*

*The compounding version, which is the best part of the idea: anything
the big model contributes and the user accepts gets learned by the
PersonalModel. Then the remote call is needed once per new word, ever.
The big model becomes a teacher for the small one, not a permanent
dependency. That also means the feature gets cheaper the longer it runs.*

*Refinement (2026-08-27, game session 4). Two technical-Czech cases
split the win further, into three tiers rather than two. Frequency
questions: counting wins, free. Register and vocabulary questions: ANY
web-trained Czech model wins, including the two 124M ones, because
subtitles hold no form of `predikce` or `prediktor` and web crawl holds
all of them. All three answered case 13 (`zkouška nového predik`), at
ranks 3, 5 and 6 in order of size. Meaning-and-context questions: the XL
alone. Only it reached case 14 (`algoritmu` after `predikčního`), and
the 124M models answered in the wrong register instead (`zákona`,
`předpisu`). That matters for cost: the middle tier is 248 MB and ~350
ms locally, not 3.46 GB and 2.3 s, and it may not need the network at
all. Only the top tier does.*

*Two practical notes. Pick the XL model, not CzeGPT-2: CzeGPT-2 is
CC-BY-NC-SA, so no commercial use. Both are Czech only, so English needs
a second model or a multilingual one.*

*The English half, measured 2026-08-27 (`prediction-game.md`, session 4).
The literal equivalent of Czech-GPT-2-XL is GPT-2 XL itself, since the
Czech model is that model adapted. Three candidates on the 14 game
cases: Czech-GPT-2-XL 10/14 (5 of 5 Czech, 5 of 9 English), GPT-2 XL
8/14 (7 of 9 English, 0 Czech), Qwen3-1.7B-Base 9/14 (6 English, 2
Czech).*

*Decision (user, 2026-08-27): two specialist models, Czech and English,
combined in a layer above them. Not the multilingual single model.
The measurement agrees. Route each language to its own specialist and
the pair scores 12 of 14, better than any single model here and better
than the 10/14 of the best one. Each model wins its own language's
everyday speech, which is the register lesson this project keeps
meeting; the multilingual model won only the technical Czech cases and
lost the colloquial ones.*

*The combining layer is not a language switch, and it already exists one
level down. `Predictor.langPosterior()` scores P(language | recent
words) and scales each language's candidates by it. Two big models
answer, and the same posterior weighs their strips before the merge.
That keeps the one-model, no-switching constraint: nothing chooses a
language, the evidence weighs both. Open detail: whether the posterior
comes from the local tables (free, already computed every keystroke) or
from the models' own likelihoods.*

*The privacy cost is the real objection, and
`swiftkey_research/swiftkey-user-reviews-analysis.md` is fifteen years of
users saying so. Their non-negotiable is network access that is visibly
optional and off by default. So: opt-in, off by default, send the current
word prefix and one context word rather than the text, never from a
password field, self-hosting possible, and the keyboard works exactly as
it does today when the call fails or the phone is offline.*

*On the iOS target this may not need a network at all. The iOS 26
Foundation Models framework hosts a ~3B multilingual model in the OS, and
its memory does not count against the keyboard extension. Same
capability, no server, no data leaving the phone. Remote is the way to
test the idea now, in the web prototype; it may not be the way to ship
it.*

*Researched properly 2026-08-29 (`apple-foundation-models-research.md`),
and it holds for English only. The free memory is real and it is the one
thing no other big-model route offers. But the framework returns words
and never probabilities, so its answer cannot enter the score merge, and
it cannot be constrained to our lexicon. Czech is unsupported in both
model generations; the 2026 list added Polish, Russian and Ukrainian and
skipped Czech. jKey, the one shipping keyboard that used this API for
prediction, removed it in 2026.1 and shipped its own model instead. So:
English free and local on Apple's model, Czech still needs a provider we
choose. iOS 27 makes that one code path, because its new `LanguageModel`
protocol puts Apple's local model and the cloud providers behind one
interface.*

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

*Partially shipped 2026-08-26: a copy-to-clipboard button sits in the
bottom-right corner pocket outside the wheel. It copies the selection
if one exists, otherwise the whole text. Symbols, emoji, and the
numberpad stay open. The same day added South punctuation drags
(S to E = ?, S to N = !, S to W = comma), the first gesture
punctuation the double-space note above pointed toward.*

*Emoji shipped 2026-08-27: a button in the wheel's other free corner
pocket opens an emoji picker over the wheel, with 925 emoji in one
continuous scroll across ten categories plus a recently-used section,
and tabs along the bottom edge. Data comes from the user's own C#
project (`emojis/EmojiData.cs`). It follows the note above
rather than the W-sector tap: not everything deserves a gesture, and a
grid is what a phone user already knows.*

*Numbers and symbols shipped the same day: a "123" button in the
wheel's top-left corner pocket, the mirror of the emoji one, opens a
pad with 67 symbols in five sections, a three-column numeric keypad,
and a bar carrying backspace, space and enter. Both panels share one
shape (`.pad-*` in `style.css`), so a clipboard panel is now a third
module and a third corner. The W-sector tap that was reserved for this
layer stays reserved.*

### Harper for grammar and dictionaries
> for english could we use harper? its opensource and its engine for
> fixing typos so it must have all the english words.. we could just
> download it and use the words for our needs. And maybe we can also
> integrate harper itself later for grammar check.

*Note (2026-08-26): the extension vocabulary shipped with aspell as
the tail filter instead: it was already installed and expands affixed
forms with a built-in command, while Harper's dictionary.dict is
affix-compressed and needs Harper's own expansion logic. Harper stays
interesting for the native phase: the Rust core is portable to iOS,
and a grammar layer is beyond anything the n-gram tables can give. If
aspell rejects too many real words, a Harper union filter is the
first upgrade to try.*
