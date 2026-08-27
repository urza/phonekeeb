# Inspirations

Sources from the initial what-exists research, merged from several
chat messages and deduplicated. Reference material, not a task list.
Deep 8pen research notes live in `CLAUDE.md`.

## The big three

### 8pen (2010)
The gesture-loop pioneer this project studies. The most radical
rethink, commercially dead, historically the purest "burn it all
down" attempt. No official page.

- Demo video: https://www.youtube.com/watch?v=q3OuCR0EpGo

### 8VIM
Open-source Android successor of the 8pen concept, adds Vim-style
editing. Good docs, somewhat active userbase, and its function-tap
assignment is what our prototype copies.

- Docs: https://8vim.github.io/docs/guides/overall
- Repo: https://github.com/8VIM/8VIM
- Issues: https://github.com/8VIM/8VIM/issues

Its layer system, which is how it types diacritics, is taken apart in
`8vim-layers-research.md`.

Community (checked 2026-08-25):

- GitHub Issues is where the community actually talks: 82 open, real
  threads with recent activity (updates through 2026-07). The one
  channel with 2026 life.
- Matrix room `#8vim:matrix.org` ("8vim lobby"): the official chat,
  linked from the docs navbar. 46 members, public. How alive it is
  could not be verified from outside.
  https://app.element.io/#/room/#8vim/lobby:matrix.org
- GitHub Discussions: enabled, 43 threads (Q&A, Ideas, layouts),
  quiet for about a year.
  https://github.com/8VIM/8VIM/discussions
- No Discord (proposed in discussion #390, community preferred
  Matrix). No subreddit found.
- Health: 582 stars, effectively a solo maintainer (flide), last
  commit 2026-03, last stable release 2024-06. Active users, slow
  development.

### Typewise
Hexagonal keys with larger targets, QWERTY-ish order, so a different
kind of keyboard, but with an active userbase and some features worth
stealing (the hold-to-delete with undelete, swipe for space). The
company later pivoted to enterprise AI; the app is still on the
stores.

- Site: https://www.typewise.app/
- Feature suggestions forum, kept for inspiration:
  https://suggestions.typewise.app/
- Android: https://play.google.com/store/apps/details?id=ch.icoaching.typewise
- iOS: https://apps.apple.com/us/app/typewise-custom-keyboard/id1470215025

## Thumb-native grids and flicks

- **MessagEase** (2002): the original 9-key thumb keyboard. Tap the
  nine most common letters, slide in 8 directions for the rest.
  Closed-source, moved to a subscription, barely maintained, which is
  why Thumb-Key exists. https://www.exideas.com/ME/
- **Thumb-Key**: open-source Android living successor of MessagEase,
  3x3 grid, tap plus drag. https://github.com/dessalines/thumb-key ·
  https://f-droid.org/packages/com.dessalines.thumbkey/
- **Wurstfinger**: open-source iOS take on the same idea.
  https://github.com/cl445/wurstfinger
- **Unexpected Keyboard**: each key is a hub, tap the letter, swipe a
  corner for the symbol there. Built for Termux and coding on a phone.
  https://github.com/Julow/Unexpected-Keyboard/ ·
  https://f-droid.org/packages/juloo.keyboard2/
- **Japanese flick input**: 12-key pad, flick in four directions. The
  one thumb-native system that shipped at national scale.
  https://en.wikipedia.org/wiki/Japanese_input_method

## Optimized and research layouts

- **KALQ** (2013): split layout computed by optimizing thumb travel
  and left/right alternation, about 37 WPM in the paper. The Android
  beta died around 2013.
  https://en.wikipedia.org/wiki/KALQ_keyboard ·
  https://dl.acm.org/doi/10.1145/2470654.2481383 ·
  https://www.mpi-inf.mpg.de/news/press-release-articles/2013/new-keyboard-for-touchscreens
- **Dvorak / Colemak mobile ports**: gains mostly evaporate on glass,
  because the phone bottleneck is alternation and error correction,
  not finger travel.

## Gesture-typing lineage

- **ShapeWriter**: the original gesture-typing startup (Per Ola
  Kristensson, who later co-authored KALQ), commercialized 2007,
  acquired by Nuance 2010. The ancestor of all swipe typing.
- **Swype**: made trace-a-path typing famous. Dead as a product, but
  the idea won and lives in every mainstream keyboard.
- **Gboard / SwiftKey**: the mainstream heirs. Not radical redesigns,
  but the reason most people never feel the layout problem.
- **Fleksy**: kept QWERTY, made autocorrect so aggressive that tap
  precision barely mattered. Later sold and open-sourced.

## Other rethinks

- **Minuum**: QWERTY crushed into one fuzzy row, prediction does the
  work. Dead product, site still parked. https://minuum.com/
- **Dasher**: zooming text entry driven by a language model, browser
  demo on the site. https://dasher.at
- **CharaChorder**: chorded input, press combinations instead of
  sequences, 200+ WPM ceiling. Hardware for enthusiasts, not a phone
  keyboard.
- **FUTO Keyboard**: privacy-first Android keyboard (offline swipe,
  voice, autocorrect). Standard layout by default, but people run
  Thumb-Key layouts and Japanese flick on it. https://keyboard.futo.org/
- **Original iPhone keyboard** (Ken Kocienda): kept the QWERTY
  picture, secretly resized hitboxes after each tap, invented
  autocorrect. The cheat that won. Story in *Creative Selection*.
  https://9to5mac.com/2018/08/08/excerpt-iphone-software-keyboard-design/
