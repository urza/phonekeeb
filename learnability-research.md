# What 8pen and 8VIM users actually said

Researched 2026-08-26 from Hacker News (2010 launch and 2013 repost),
contemporary reviews, and the 8VIM GitHub discussions. Phone twin:
`learnability-research.html`.

The question behind this note: the `original-8pen` layout is unusable
for a beginner because letter placement carries no clue, while
`urza-layout` is QWERTY-derived so the rough direction of a letter is
guessable. Is that a real effect, or a personal quirk? It is real, it
is the single most repeated complaint in fifteen years of discussion,
and nobody in either community has ever measured it.

## The complaint, stated in 2010

`charlief` on the launch thread gave the sharpest diagnosis, and it is
exactly the problem:

> Swype, Graffiti, and the old fashioned keyboard are more intuitive
> because they borrow something core about our usage of inputting
> stuff: how we hand write a character for Graffiti, and everything we
> know about a QWERTY keyboard layout for Swype. [...] I feel the
> keyboard domain doesn't make use of hierarchy properly though. [...]
> Each octant does not have a collection of related things. **The
> letters I D G Z are not related in any way, yet they are all arrived
> to by first moving up and rotating right.**

`mattmaroon` named the mechanism that makes Swype easy, which is the
mechanism `urza-layout` borrows:

> The reason Swype is so easy is that you don't really have to look to
> see where the letters are, it's QWERTY, you already know. You can
> type blind on it after a tiny amount of use once your brain has
> mapped out the keyboard size. I imagine you'd be able to use 8pen
> without looking too, maybe even better after a long while, **it would
> just take you a lot longer to get there.**

`artursapek` explained why the learning cost cannot be paid down with
on-screen labels, which is the part that has no easy fix:

> the keys on a keyboard are labeled, so there is a lower threshold for
> newbies. Imagine what someone would look like typing on a blank
> keyboard. Their fingers would seem to be flying around at random.
> People would be afraid to try learning it. That's what using 8pen is
> like. **And the problem is, there's no way to ever label all the
> loops and have them be visible.**

`JonnieCache`, who bought the app, described the exact failure mode of
staring at the screen mid-gesture:

> the learning process is heavily hindered by the fact that your thumb
> obscures at least one or two of the 'branches' during a gesture,
> which means **when you have to visually consult the screen because
> you have forgotten the unusual spatial model** (the direction matters
> too remember,) your only option is to pivot your thumb without it
> leaving the screen, and hold your phone at an odd angle so your can
> peer beneath your digit and decide where it should go next. Not very
> practical.

That last one matters for us. The prototype's live glide preview exists
precisely to answer "what does committing here type", and it is the
right instinct. The thumb still hides the target.

## Why people quit

The 2013 repost is a graveyard of short attempts. Nobody in it reports
sticking with 8pen.

- `drivebyacct2`: "I tried it for a week or two of heavy frustration."
- `phinnaeus`: "I tried it with an open mind for about a week when it
  first came out a while ago. That was the end of it for me."
- `franklinho`: "I tried this a while ago and could never get used to
  it. It asks for too much learning to be widely adopted. (Think
  dvorak)"
- `Tyr42`: "I tried it for a few weeks. What was a real downside is
  that the tip of my finger got sorta friction burn from swiping too
  much." (`rsaarelm` independently reported thumb friction and used
  talcum powder.)
- `mcbridematt`: "I can type fast enough on a QWERTY layout (even on a
  touchscreen) that any of these fancier input methods just slow me
  down and annoy me."

The ploum.net review, already a project source, is the most complete
firsthand account:

> The learning step is quite high but you can download a very funny and
> addictive game to get started with 8pen. [...] As soon as you leave
> the game, reality becomes a lot more painful. The hand got tired very
> quickly of all the circles.

and the verdict:

> even when being really fast, I didn't managed to get close to any
> virtual keyboard. Making loops is slow and cumbersome

Note what that reviewer switched to. MessagEase, which they learned in
minutes and reached "more than 35WPM in a few weeks".

## The numbers people report

Nothing here is a controlled study except the Quikwriting citation, so
treat the range as indicative.

| source | claim |
|---|---|
| HN 2010, several users | "1-2 days if you work it"; vowel positions in 10 minutes |
| `btn` on HN, citing Quikwriting research | 4 WPM initially, 16 WPM after five hours of practice |
| ploum, 8pen | never approached a normal virtual keyboard |
| ploum, MessagEase | 35+ WPM in a few weeks |
| 8VIM project docs | "over 40 words per minute" once familiar (project claim, not independent) |
| Derisis13, 8VIM, 2024 | one month to plateau, then six months of exclusive use |

8pen is a variant of Perlin's **Quikwriting** (1998), which is worth
knowing: this input family has an academic record, and 4 to 16 WPM over
five hours is the shape of its learning curve.

## 8VIM: what changed, and what did not

`Derisis13`'s 2024 review is the only long-term firsthand account I
found. One month of learning, then six months of exclusive use, then a
return to OpenBoard to compare:

- **Verdict**: "neither faster nor more accurate than OpenBoard". They
  call 8VIM "a party trick".
- **Best part**: navigation gestures, "the best I've experienced", and
  the clipboard history.
- **Blind typing works**: touch typing with vibration feedback let them
  look away from the screen and stay confident. This is the promise of
  the format, and it did deliver.
- **Worst part**: symbols and numbers fall back to a numpad, so the
  blind-typing property breaks exactly where it is most annoying.
  Capitals need "a full turn (which is longer than typing any
  character)".

Two of those land on us directly. Capitals by extra loop is the
mechanism we inherited from 8pen and it is reported as too expensive.
Our punctuation is still unbuilt, and it is the thing that broke 8VIM's
core value.

## Yes, the 8VIM community customizes layouts

Your recollection is right, and it goes further than picking from a
list.

- **Layouts are user files.** A layout is a YAML file imported through
  "Select layout file from device". Users define letters, diacritics,
  characters, and even whole sentences on the pad.
- **There are tools to author them.** A LibreOffice Calc spreadsheet
  generates the YAML (`8VIM/8VIM` Discussion #295), and a community
  Python generator exists (`sslater11/8vim_keyboard_layout_file_generator`).
- **There is a layout optimizer.**
  `Glitchy-Tozier/8vim_keyboard_layout_calculator` searches arrangements
  and scores them.
- **There is a published collection.** Discussion #254 holds optimized
  layouts for a dozen or so languages: Croatian, Danish, English,
  Finnish, French, German, Icelandic, Italian, Polish, Russian,
  Spanish, Swedish. One contributor built a German-English hybrid for
  daily bilingual use.

So 8VIM's answer to "which layout" is "whichever you generate". That is
the opposite of our fixed single-layout constraint, and it is worth
being deliberate about the difference rather than drifting into it.

One piece of their guidance applies straight to our en+cs constraint.
Glitchy-Tozier, releasing the collection:

> Do not choose the layout that is highest up in the list without
> careful consideration [...] test out those layouts, and think about
> which one works best with the other languages you plan to type.

## What they optimize, and the hole in it

The 8VIM optimizer work is the closest prior art to
`layout-flow-analysis.md`. It converged on the same objective from the
same starting point.

- The metric is **bigram flow**: whether consecutive letters produce a
  comfortable continuing motion, scored by direction and distance
  around the wheel.
- It applies **layer penalties** so common letters do not get pushed to
  outer rings, which is our ring-cost concern by another name.
- It treats rotations and mirror images of a layout as equivalent,
  since they type identically.
- Discussion #99 reports optimized layouts scoring about 91% against
  the original's 81% on their scale, and describes results "86% of what
  the perfect (impossible) layout would be". German reached about 77%
  "good bigram" coverage.

Do not compare those percentages to our 21%. Their "good bigram" is a
broad comfort score. Our figure-eight share is the strict
`through`-plus-`counter` case only. Different denominators.

The important part is what is missing. **Across the optimizer repo,
Discussion #99, #138, and #254, there is no learnability metric, no
memorability metric, and no discussion of how a user finds a letter
they have not yet memorized.** Every scoring function is about the
motion between two letters that you already know. The one time
learnability appears at all, it appears as a switching cost argument
against adopting a better layout:

> the small speed increase isn't worth of learning the new layout

That is the hole. Both communities optimized the second hour of use and
never scored the first.

## The counterexample that works

MessagEase is the useful comparison because it solved the same problem
and stayed learnable. Its design:

- Nine large keys in a 3x3 grid. The nine most frequent English letters
  (`ETAONRISH`) are plain taps, and those nine cover about 71% of typed
  letters.
- Everything else is a swipe from the nearest of those nine keys.
- Placement uses letter frequency and digram data, tuned with Fitts's
  law, so `t` and `e` sit adjacent because they follow each other
  often.

The lesson is not the grid. It is that MessagEase paid its optimization
budget on the **common** case and left the rare case discoverable, so a
beginner is never lost, only slow. 8pen made every letter equally
opaque. Our layout is closer to MessagEase in spirit than to 8pen,
because the QWERTY direction gives a beginner a guess for every letter.

## What this means for phonekeeb

1. **Keep the QWERTY direction mapping.** It is the direct answer to
   the most repeated criticism of this entire input family, and you
   arrived at it independently. `mattmaroon`'s 2010 comment describes
   the exact mechanism it buys.
2. **Do not switch to `original-8pen` for its flow.** Its advantage in
   `layout-flow-analysis.md` is turn-smoothness, not figure eights, and
   it draws the fewest eights of the three. Trading a working mnemonic
   for that is a bad deal.
3. **Measure the mnemonic.** The flow score exists now; the
   learnability score does not, in this repo or anywhere else in this
   input family. The raw material is already here:
   `tools/generate-qwerty8pen.mjs` matches slot direction to QWERTY
   direction, and `layout-tuning.md` already records angular error per
   letter ("s is now 58 degrees off, a is 32 degrees off"). Turning
   that into a scored objective next to the flow score would let a
   search optimize both, and would be genuinely new work in this space.
4. **Build the practice game.** 8pen shipped one and ploum called it
   "very funny and addictive". Palm's Graffiti game made people
   proficient in a couple of days. `cards.html` is the seed of this
   already. This is the proven mitigation for "I am totally lost", and
   it is cheaper than any layout change.
5. **Watch capitals and punctuation.** Both 8VIM reviewers flagged
   these, and they are the two mechanisms we have inherited or not yet
   built. Capitals by extra loop is reported as costing more than a
   whole letter.

## Sources

- HN 2010 launch, 123 comments: https://news.ycombinator.com/item?id=1857033
- HN 2013 repost, 44 comments: https://news.ycombinator.com/item?id=5053137
- ploum.net 8pen and MessagEase review: https://ploum.net/writing-on-a-smartphone-review-of-8pen-and-messagease/index.html
- Derisis13, 8VIM review after 7 months: https://derisis13.github.io/2024/07/26/8vim.html
- 8VIM custom layouts by spreadsheet: https://github.com/8VIM/8VIM/discussions/295
- 8VIM better English layout: https://github.com/8VIM/8VIM/discussions/99
- 8VIM layout calculator discussion: https://github.com/8VIM/8VIM/discussions/138
- 8VIM optimized layout collection: https://github.com/8VIM/8VIM/discussions/254
- Layout optimizer: https://github.com/Glitchy-Tozier/8vim_keyboard_layout_calculator
- Layout file generator: https://github.com/sslater11/8vim_keyboard_layout_file_generator
- 8VIM docs: https://8vim.github.io/docs/
- Quikwriting (Perlin 1998), the research ancestor: http://www.mrl.nyu.edu/perlin/demos/quikwriting.html
- MessagEase: https://en.wikipedia.org/wiki/MessagEase
