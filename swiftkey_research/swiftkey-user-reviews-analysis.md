# Microsoft SwiftKey: what users say (Reddit, Hacker News, app store reviews)

Researched: 2026-08-27
Scope: user sentiment and recurring complaints/praise about Microsoft SwiftKey, collected
from Hacker News (2014-2026), Reddit (2025 sample), and Google Play / App Store reviews (2025-2026).

## Bottom line

- **The product users loved is not the product users get today.** Praise on HN and Reddit
  consistently describes pre-2016 SwiftKey (TouchType): fast, accurate, private, one-time
  purchase. Everything after the Microsoft acquisition is measured against that benchmark.
- **The core praise is specific and stable:** prediction accuracy, tap tolerance, swipe
  (Flow) typing, multi-language mixing (up to 5 languages at once), and the pinnable
  clipboard. These are the features users say no other keyboard matches.
- **The core complaints are specific and stable:** (1) forced Microsoft account + OneDrive
  data move (2026), (2) injected Bing/Copilot/AI features, (3) privacy/telemetry distrust,
  (4) iOS instability (crashes, silent reverts to the stock keyboard), (5) quality
  regressions in autocorrect after updates.
- **Sentiment split: loyal fans vs. leavers.** Fans still call it the best mobile keyboard.
  Leavers go to FUTO (open source), HeliBoard (open source, zero network), Gboard, or
  Samsung Galaxy AI. Community migration tools appeared (SwiftKey2HeliBoard, Mar 2026).
- **Ratings stay high despite the anger:** Google Play 4.6 stars from 4.58M reviews
  (1B+ downloads, "Contains ads", still updated as of Aug 2026). But the most-upvoted
  recent Play reviews are negative (a 1-star review on AI "gibberish" corrections has 458
  "helpful" votes, Apr 2026).
- **For a recreation project:** the feature list users demand is (a) fast accurate
  prediction, (b) swipe input, (c) multi-language, (d) pinnable clipboard, (e) theming.
  The design properties users demand are local-only, no account, no ads, no forced AI.
  Every Microsoft-era change violated at least one of those and drove measurable churn.

## 1. Sources and coverage

| Source | Coverage | Notes |
|---|---|---|
| HN Algolia comment search (2014-2015, 50 hits) | Pre-acquisition era | Praise + first privacy debates (iOS 8 Full Access, Sept 2014) |
| HN story 35597152 "Microsoft deleted the public support forums for SwiftKey" (2023-04, 313 pts / 313 comments; 100 newest analyzed) | Mid-Microsoft era | Why forums vanished; Bing/GPT pivot; ~40% of thread derails into other topics |
| HN Algolia comment search (post-2024, 100 hits) | 2024-2026 | Shutdown reactions, account requirement, AI injection, iOS complaints |
| HN thread "Swiftkey will soon require a Microsoft account" (2026-03, story 47428424) | Shutdown | 4 comments, all critical or pragmatic (migration guide) |
| Reddit via pullpush.io (top 50 submissions + 100 comments) | 2025-01 to 2025-05 | Dominated by r/Swiftkey (60% of posts). Pullpush archive does not hold 2026 data |
| Google Play listing (fetched 2026-08-27) | Current state | 4.6 stars, 4.58M reviews, "Microsoft SwiftKey AI Keyboard", updated 2026-08-19 |
| App Store | n/a | App removed from the store (iTunes lookup returns 0 results). Last rating cited by press: 4.6/5 (Windows Central, Mar 2026) |
| Windows Central article (2026-03-18) | Shutdown announcement | Account retirement, OneDrive move, export portal |
| SwiftKey2HeliBoard GitHub guide (Mar 2026) | Migration | Export procedure, what does/does not transfer, FOSS alternatives |

Caveats: the Reddit sample is one window (Jan-May 2025) and skews to r/Swiftkey, which is
a support-style subreddit (many bug questions). HN skews to technical, privacy-minded
users. App Store review text is no longer accessible (app delisted on iOS). Treat
percentages as directional, not statistical.

## 2. Event timeline (as tracked by user discussion)

- 2010-2015: SwiftKey (TouchType) era. HN users call it "the best keyboard I've used on any
  phone". iOS launch Sept 2014 sparks the first privacy debate (Full Access, cloud learning).
- 2015: NowSecure exploit - preinstalled SwiftKey on Samsung phones fetched language packs
  over HTTP; zip path traversal gave system-level RCE.
- 2016: Microsoft acquires SwiftKey for ~$250M. Later that year SwiftKey leaks users'
  email addresses and phone numbers (HN story, 48 pts).
- 2022-09/10: Microsoft pulls SwiftKey from the iOS App Store (Oct 5); reverses itself in
  November, citing "customer feedback". Users interpret the reversal as strategic, not
  benevolent.
- 2023-04: Microsoft deletes the public SwiftKey support forums. 313-point HN thread.
  Leading theory: the product sits under the Bing org and the forums hosted backlash.
  Users note the app now upsells Bing; a GPT text-rewrite feature is being trialed.
- 2025: AI push. Copilot button appears (on by default, disabling settings does not remove
  the button). "Search Bing" item added to the long-press context menu without consent.
  App rebranded toward "AI Keyboard". Some users report AI turning typing into gibberish;
  SwiftKey support replies to a 1-star review (Jan 2025): "we've removed the AI
  integration with recent updates".
- 2026-02: iOS app drops from the App Store ("Even Swiftkey dropped from iOS" - HN).
- 2026-03: Microsoft announces: standalone SwiftKey accounts retire 2026-05-31; a Microsoft
  account becomes required; typing data moves to OneDrive; 1000 Microsoft Rewards points
  as an incentive. Export only via data.swiftkey.com with a Microsoft account.
- 2026-05-31: legacy SwiftKey account data permanently deleted (per announcement).
- 2026-08 (now): Android app alive as "Microsoft SwiftKey AI Keyboard" on Google Play
  (updated 2026-08-19), 4.6 stars / 4.58M reviews, "Contains ads", collects "Location,
  Personal info and 4 others" per its data-safety declaration.

## 3. What users praise

### 3.1 Prediction and autocorrect quality

The most repeated praise across all three eras.

- "SwiftKey's suggestions are still a lot better in my opinion." - nh2, HN 2026, 10-year user
- "faster than I can even reach my thumb up to type the next word there are already
  excellent suggestions available." - sparrc, HN 2023
- "SwiftKey on Android is magical, I just randomly punch keys in the vicinity of the
  letter I want and it figures out what I mean." - stavros, HN 2024
- "the auto-correct working incredibly well (garbage like witjoit is correctly
  transformed to without, which Apple Keyboard can't)" - Kovah, HN 2026
- "I've used SwiftKey for over a decade and the predictive text is incredible." - mkt-trail,
  Reddit r/GooglePixel 2025
- "I'm a big fan of the SwiftKey keyboard... Very customizable, good at predicting words
  and haptic feedback can be adjusted." - -CL4MP-, Reddit 2025 (top-scored comment in sample)
- Tap tolerance (mistouch correction) is named repeatedly; one user keeps SwiftKey offline
  "for which I have a data folder with over a decade of training in it" (Aachen, HN).

### 3.2 Multi-language support

- Unique two-simultaneous-languages feature, called irreplaceable by long-time users
  (martinml, HN 2014: "it has something that I can't find in any other keyboard").
- Mid-sentence language switching with a unified dictionary: "if you're going along in,
  say, French, but then need to reference a word in Hebrew, you can swipe over to Hebrew,
  bang out a word, then swap back to French." - indrora, HN 2023
- Low-resource language users (Arabic, Sinhala, Finnish, Swedish, Japanese) name SwiftKey
  as their only workable option; e.g. "I use it mainly because it is the only keyboard app
  that supports arabic well" (elashri, HN). Current Play listing claims up to 5 languages
  at once and 700+ languages.
- Caveat from the same side: a 5-star App/Play reviewer cut to 3 stars (Apr 2026) because
  the 5-languages-in-one-keyboard update "destroys the prediction capability".

### 3.3 Swipe (Flow) typing

- "I love swipe typing. I find it so much faster and easier." - AKASetekh, Reddit 2025
- Accessibility: SwiftKey enabled Stephen Hawking's communication system (2014); swipe
  typing is also the reason RSI users keep it ("My keyboard does feel a sort of limb" -
  maxbond, HN 2023).
- Users miss specific gestures when leaving: swipe-left-to-delete-word, shift-after-word
  capitalization, touch heatmap (all named as gaps in FUTO/HeliBoard on HN).

### 3.4 Clipboard

- Pinnable, searchable clipboard is a named keeper feature (wejick, HN 2023; BG-0, Reddit).
- Complaint variant: the 2025 clipboard UI redesign is "hugely bloated" (Reddit r/Swiftkey).

### 3.5 The iOS escape hatch

- On iOS, SwiftKey is repeatedly the default recommendation because Apple's stock keyboard
  is disliked and Gboard stagnated on iOS: "Gboard is garbage on iOS. No updates. SwiftKey
  on the other hand is probably the best." - milan187, Reddit 2025.
- "I can only bear ios because I am using SwiftKey" - djaychela, HN 2025.
- Counterpoint: iOS third-party keyboards are "severely kneecapped by Apple" (seiggy,
  Reddit), so even SwiftKey "still not nearly as good as it should be".

### 3.6 Cross-device sync (the minority positive view of the account)

- "logging into my SwiftKey account ensures my typing experience doesn't change almost at
  all" across phone changes - Mattified, HN 2025. This is the standard pro-account argument.

## 4. What users complain about

### 4.1 Forced Microsoft account and OneDrive (2026)

The sharpest recent pain point.

- "Why does a keyboard require an account in the first place?" - croes, HN 2026
- "Next step, age verification if you want to type four letter words" - cobertos, HN 2026
- "it reads like MS is interested in consolidating all digital accounts data to onedrive.
  i would be concerned there is keylogging and analysis going on." - rolph, HN 2026
- "they introduced a requirement to be logged in 'for data backup', you get a banner on
  top of the keyboard that cannot be permanently turned off." - jwr, HN 2026
- "I was a SwiftKey fan over a decade ago, but wait... you have to log onto an account for
  it now? Sigh" - gausswho, HN 2025
- "the hook is... I would be concerned about everything being gathered into a one hack
  account" - rolph, HN 2026
- Practical fallout: export required a Microsoft account (a non-account holder had to
  create a throwaway account per the SwiftKey2HeliBoard guide); legacy data was deleted
  2026-05-31; the learned model does not transfer at all - only the word list does.

### 4.2 Bing / Copilot / AI injection

- "it became too much of an ad vector for 'you should use Mobile Edge and have you tried
  our new Bing Mobile app yet'" - WorldMaker, HN 2025
- Copilot button after an update: "Disabling the copilot options in settings is necessary
  as they are on by default, disabling does not remove the button." - x______________, HN 2025
- Reddit r/Swiftkey post: "Swiftkey adds a 'Search Bing' context menu (long press menu)
  item to Android" - poster recommends FOSS FUTO and calls SwiftKey a keylogger.
- "M$ has been shoving AI features on it that I am definitely not interested in." -
  vulkoingim, HN 2026
- Play review (May 2025, 458 "helpful"): "The Ai isn't even pretending anymore... it turns
  my typing, whether accurate or bad at the moment, into gibberish."
- The rebrand to "AI Keyboard" is read as hostile: "I've switched to FUTO keyboard away
  from Microsoft's SwiftKey recently rebranded as an 'AI Keyboard'." - ForHackernews, HN 2025
- The app now literally advertises "Create unique AI-powered images and memes" (Play listing).

### 4.3 Privacy and telemetry distrust

- 2014 iOS 8 era: "it's a keylogger with benefits" (spindritf); users left for Swype over
  the Full Access requirement (boynamedsue, unfamiliar, ctdonath).
- 2016: email/phone-number leak to strangers (HN story).
- 2024-2025: users with network-blocked SwiftKey found "years and years of queued
  telemetry reports" (Aachen, HN, twice).
- "Swiftkey was bought by Microsoft some years ago. Data you type (passwords, personal
  texts, emails, search data, and so on) at being send and shared with Microsoft." - naggert,
  Reddit r/degoogle 2025
- Play data-safety declaration: collects "Location, Personal info and 4 others".
- Creepiness anecdotes persist: bank account number offered as a suggestion (2014);
  "SwiftKey is guessing my cold wallet keywords, should I be worried?" (Reddit, Mar 2025);
  "Can Swiftkey read my screen?" (Reddit, Mar 2025).
- Reddit summary formula: "Privacy-oriented: futo. Non-privacy-oriented: SwiftKey."
  - cryptoadopter2077, r/degoogle 2025

### 4.4 Quality and stability regressions

- iOS: "SwiftKey also crashes daily." - httpsterio, HN 2026; "It crashes all the time" -
  owenthejumper, HN 2026; iOS 18 silently reverts to the stock keyboard (at least 8 Reddit
  posts in the 2025 sample; e.g. "Ios 18.4.2 crashes", "Glitch after recent update?").
- "It just seems like Microsoft never got it to feature parity." - Someone1234, HN 2026
- "Swiftkey was miles better than Gboard, but Microsoft acquired it and made it crap." -
  globular-toast, HN 2024
- Play review (Apr 2026, 43 helpful): swipe recognition "very inaccurate and shows only
  three options which typically do not include the correct word."
- Voice typing regressions tracked across multiple updates (beta 9.10.49.17 broke auto
  punctuation; 9.10.59.20 broke voice-to-text accuracy) - Reddit r/Swiftkey, 2025.
- "The 'don't predict this' button that clearly doesn't actually do that" - coldpie, HN 2023
- Dictionary complaints: "the dictionary has the vocabulary of a first grader" (BrawndoOhnaka,
  Reddit 2025); autocorrect "then" -> "the" (llTrash, Reddit 2025); "corrected 'blow' to
  'blpw'" (abustamam, HN 2026).
- "Autocorrect is useless. I'm giving up on SwiftKey after 15+ years of use." - Reddit r/Swiftkey,
  Feb 2025.

### 4.5 Bloat, ads, monetization shift

- Play listing: "Contains ads". "SwiftKey pushes you to use OneDrive." - a2128, HN 2026.
- "SwiftKey got annoying with pushing Ai image Gen and sometimes pop-ups." - Mashimo, HN 2026.
- Licensing shift resented: "Bought it when software licensing used to be lifelong. Now
  companies charge the same price for just a month." - Laorock, Reddit r/degoogle 2025.
- Enshittification framing: "It happened to Skype (rip), it happened to Swiftkey, it's
  happening to Plex... it's called enshitification." - Sorrylols, Reddit 2025.

## 5. User behavior patterns

1. **Long-loyalty base.** Many users date use to 2010-2015, one-time purchase,
   "bought it when licensing was lifelong". This base is the reason sentiment has so much
   weight: they are power users with a decade of personal typing data.
2. **Churn destination map (2025-2026):**
   - FUTO: open source, offline, swipe; the most common named successor on HN.
   - HeliBoard: open source, zero network permission; the SwiftKey2HeliBoard guide exists
     to move the learned word list there (what does NOT transfer: learned model, themes,
     clipboard history).
   - Gboard: speed and fresh engineering win some (Jenkinson: "I type faster on Gboard
     than I do on SwiftKey... I prefer the look and feel of SwiftKey").
   - Samsung keyboard + Galaxy AI: won at least one ex-SwiftKey user (IllegitimateDuck,
     Reddit 2025).
   - Pastiera: one HN user runs it alongside SwiftKey on a foldable.
3. **Emotional register.** "This one hurts... I think this hurts worse than Musk
   buying/poisoning/killing Twitter. A keyboard feels like an extension of your body."
   (unpopularopp, HN 2023). RSI and non-native-language users give the app prosthetic-limb
   status for them.
4. **Nostalgia as benchmark.** Pre-Microsoft SwiftKey is the reference object. "I had a
   way better experience using SwiftKey on my android phone 15 years ago." - cmckn, HN 2025.
   Users compare every 2025-2026 regression to that benchmark.
5. **Skeptic minority.** "The SwiftKey keyboard is still fully functional... What is the
   big fuzz exactly?" - nitrammm, HN 2023. A small camp treats the drama as overblown.
6. **Workarounds culture.** Blocking the app's network access on Android (HN, repeatedly),
   keeping a decade of local training data after rooting, building export/convert scripts
   when no official export exists.

## 6. What this implies for a from-scratch keyboard (user context)

The research project's goal is potentially recreating the on-device predictor in an own
keyboard (no Microsoft account). User sentiment gives a direct spec:

Features users say are worth it:
- Fast, accurate next-word suggestions that arrive before the user finishes the word.
- Personal dictionary that learns from actual typing (this is the "decade of training"
  moat users defend and lose on every switch).
- Tap tolerance: mistouch prediction (press near a key, get the right word).
- Swipe/flow typing with whole-word output.
- Two or more simultaneous languages with mid-sentence switching and one shared
  personal dictionary across languages.
- Pinnable, searchable clipboard that persists.
- Theme/layout customization, haptic tuning.
- Shift-after-word capitalization; swipe-left-to-delete-word (small gestures users name
  when leaving).

Non-negotiable properties users now demand (and SwiftKey now violates):
- No account, no login, no sync requirement.
- No network access at all, or network access that is visibly optional and off by default.
- No ads, no third-party upsells (Bing/Edge/Copilot), no injected context-menu items.
- No forced AI; if AI exists it must be removable completely.
- No regressions shipped silently; the "don't predict this" button that does nothing and
  the AI feature that turned off itself are cited as trust-destroyers.
- Predictions must survive app updates (learned data is the asset users fear losing).

Design note from the migration guides: a plain exportable personal word list
(e.g. `sync_words.json`-like format) is the one artifact users can carry between
keyboards. A custom keyboard that exports its personal dictionary in an open format
would remove the single biggest switching cost users complain about.

## 7. Key source list

- HN story 35597152 (2023-04-17): "Microsoft deleted the public support forums for SwiftKey",
  313 points, 313 comments. https://news.ycombinator.com/item?id=35597152
- HN story 47428424 (2026-03-18): "Swiftkey will soon require a Microsoft account - data to
  be moved to OneDrive". https://news.ycombinator.com/item?id=47428424
- Windows Central (2026-03-18): "Swiftkey will soon require a Microsoft account - data to be
  moved to OneDrive". https://www.windowscentral.com/software-apps/swiftkey-will-soon-require-a-microsoft-account-data-to-be-moved-to-onedrive
- Google Play: "Microsoft SwiftKey AI Keyboard" listing, 4.6 stars, 4.58M reviews, updated
  2026-08-19. https://play.google.com/store/apps/details?id=com.touchtype.swiftkey
- guilamu/SwiftKey2HeliBoard (Mar 2026): migration guide, export procedure, FOSS comparison.
  https://github.com/guilamu/SwiftKey2HeliBoard
- Reddit r/Swiftkey posts/comments, Jan-May 2025 (via pullpush.io; representative posts:
  "Autocorrect is useless. I'm giving up on SwiftKey after 15+ years of use" Feb 2025;
  "Swiftkey adds a 'Search Bing' context menu item to Android" Apr 2025;
  "SwiftKey is guessing my cold wallet keywords, should I be worried?" Mar 2025;
  "Can Swiftkey read my screen?" Mar 2025).
- HN historical threads: "Keyboards Club" (Sept 2014 privacy debate), TechCrunch acquisition
  story (Feb 2016), Telegraph leak story (Jul 2016), NowSecure exploit coverage (2015).
