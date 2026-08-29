# Apple's Foundation Models framework: what a keyboard can get from it

Researched 2026-08-29. `prediction-roadmap.md` direction 8 wants a big model
beside the small one, and it says that on iOS the route is "the system-hosted
model at phrase level, not a bundled GPT-2". This note tests that sentence.

The question is narrow. Not "what is Apple Intelligence", but: what does the
Foundation Models framework hand a third-party keyboard extension, what does
it refuse to hand over, and what does that cost.

Read `word-prediction-research.md` and `czech-lm-research.md` first. They hold
the measurements this note compares against. `ios-deployment-research.md`
holds the extension memory ceiling and the App Store rules.

Provenance: facts marked **(Apple)** come from Apple's own machine learning
research pages, developer forums, newsroom, or the documentation shipped with
Xcode. Facts marked **(third party)** come from developer write-ups or
reverse engineering, and they are weaker.

## Summary

1. **The framework gives you words, never numbers.** There is no logits API,
   no per-token probability, and no way to constrain the output to a lexicon.
   Both mechanisms that make `tools/lm-predict.py` work (marginalization over
   tokenizations, and a prefix mask inside the beam) are impossible here. You
   can only ask in prose for a list of words, and take what comes back.
2. **Czech is not supported.** Not in the 23 locales of the 2025 model, and
   not in the 25 languages of the 2026 one. That list added Polish, Russian
   and Ukrainian and still skipped Czech. Direction 8 exists because of two
   Czech game cases. This framework cannot answer them.
3. **Memory is free, and that is the one real gift.** The OS hosts the model
   and shares it across all Apple Intelligence features, so it does not count
   against the extension's Jetsam limit **(Apple, forum 795044)**. That is why
   a 3B model is thinkable inside a keyboard at all. Nothing else we measured
   has this property.
4. **Latency puts it exactly where the roadmap already put it.** About 30
   tokens per second on the first-generation model. A six-chip strip is one
   to two seconds. That is the same order as Czech-GPT-2-XL's 2.3 s locally.
   Phrase level, on a word boundary or behind a chip. Never per keystroke.
5. **The one shipping precedent removed it.** jKey is the accessible keyboard
   that used Foundation Models for next-word prediction, and
   `word-prediction-research.md` cites it. In jKey 2026.1 the developer threw
   that engine away and shipped a model inside the keyboard instead. Stated
   reasons: predictions were slow, worked only on newer devices, and often
   were not the words the user asked for **(third party, AppleVis)**.
6. **iOS 27 changes the shape of direction 8, not the verdict.** The new
   `LanguageModel` protocol makes Apple's local model, Claude, and Gemini one
   interchangeable interface. That is the two-specialist design from
   2026-08-27, handed to us as an OS API.

Verdict: use it as the **English** arm of direction 8, where it is free, needs
no network, and costs no extension memory. It is not an answer for the Czech
arm, and Czech is why direction 8 was opened.

## The model behind the API

Two generations exist now. Third-party apps get the on-device text model.

| | 2025 (iOS 26) | 2026 (iOS 27) |
|---|---|---|
| On-device model | ~3B dense | AFM 3 Core, 3B dense |
| Second on-device tier | none | AFM 3 Core Advanced, 20B sparse, 1 to 4B active |
| Decoder quantization | 2 bits per weight, QAT | not published |
| Embedding / KV cache | 4 bits / 8 bits | not published |
| Session context window | 4,096 tokens | not published |
| Model context capability | up to 65K tokens | not published |
| Languages | 23 locales | 25 languages |

All **(Apple)**. Two architecture details are worth keeping, because they
explain the speed. The model splits into two blocks at a 5:3 depth ratio, and
block 2 reuses block 1's final-layer KV cache, which cuts KV memory by 37.5%.
The 2026 model stores the full 20B in NAND flash and swaps routed experts
into DRAM per prompt, which is how a 20B model fits a phone at all.

Reverse engineering of the shipped bundle **(third party, fguzman82)** adds
numbers Apple does not publish: the text model is `AFMTextV7`, 3.18B
parameters over 56 layers (35 standard, 21 KV-reuse), hidden size 2048, a
153,600-token vocabulary, and about 1.0 to 1.1 GB on disk at production
quantization. A separate 48.8M-parameter draft model does speculative
decoding. LoRA adapters are rank 32, alpha 16, across 1,173 attachment
points.

Two of those numbers matter to us. **1 GB** is what the OS is holding for
free on our behalf, against an extension budget of 48 to 60 MB. And **153,600
tokens** is a vocabulary six times larger than GPT-2's, which is a real cost
for any prefix-constrained decode, if we could do one, which we cannot.

## What the API exposes

The whole surface, from the documentation shipped with Xcode **(Apple)**:

| Piece | What it does |
|---|---|
| `SystemLanguageModel.default` | the model handle |
| `.availability` | `.available`, or `.unavailable(reason)` |
| `.supportedLanguages` | `[Locale.Language]`, checked at runtime |
| `LanguageModelSession(instructions:)` | one context, one transcript |
| `session.respond(to:)` | whole answer, one call |
| `session.streamResponse(to:)` | partial snapshots as they generate |
| `session.prewarm()` | load weights before the user needs them |
| `@Generable` / `@Guide` | structured output, typed, with field constraints |
| `Tool` protocol | the model calls your Swift code mid-generation |
| `GenerationOptions` | `temperature`, `sampling`, `maximumResponseTokens` |

`sampling` accepts `.greedy`, `.random(top:seed:)`, and
`.random(probabilityThreshold:seed:)`. So you can pick top-k or top-p, and
you can make generation deterministic. You still never see the distribution
those options operate on.

Three availability failures, and each needs a different response **(Apple)**:
`deviceNotEligible` is permanent, so fall back forever; `appleIntelligenceNotEnabled`
is a user setting, so one prompt is fair; `modelNotReady` means it is still
downloading, so retry quietly. A keyboard must handle all three, because the
local engine has to keep working in every one of them.

## What it does not expose, and why each one hurts here

This is the section that decides the answer.

**No logits, no per-token probabilities.** Confirmed as a current limitation
**(third party, several developer write-ups; no Apple API exists)**. Our
engine merges evidence by multiplying and weighing scores. `langPosterior()`
weighs two languages every keystroke. A big model that returns six strings
and no scores cannot enter that merge. It can only replace or append. That
turns a principled combination into a heuristic one.

**No lexicon constraint.** `tools/lm-predict.py` masks the vocabulary at
every beam step to the tokens still compatible with the typed letters. That
needs access to the vocabulary. Through this API you can only write "words
beginning with zapla" in the prompt and hope. `czech-lm-research.md` already
measured what happens without a constraint: the small models invented
"smool", "smoop", "smoola". Guided generation with `@Generable` fixes the
*shape* of the answer, a list of six strings, and says nothing about whether
those strings are words.

**4,096-token session context.** Generous for a keyboard, which sees a
sentence. Not a limit that bites us.

**Guardrails you do not control.** Benign prompts draw `guardrailViolation`,
and developers report it appearing and disappearing across OS betas with no
change to their code **(third party, Apple forum 792908)**. A keyboard types
what the user types, including things a safety classifier dislikes. A
suggestion strip that silently empties on some sentences is worse than one
that is merely wrong. The Python SDK exposes a `PERMISSIVE_CONTENT_TRANSFORMATIONS`
guardrail mode, which suggests the Swift API has the same escape hatch, and
that needs checking before anything is built.

**No control over the model version.** Adapters must be retrained for each
new base model **(Apple)**. Any tuning we do has an OS-release-shaped
expiry date.

## Availability

**Devices.** iPhone 15 Pro and newer (A17 Pro and up), Apple silicon Macs,
M-series iPads. Everything older gets nothing. jKey named this as one of its
three reasons for leaving.

**Languages.** The 2025 framework covers 23 locales: English (US, GB, AU),
French (FR, CA), German, Italian, Spanish (ES, US, 419), Portuguese (BR, PT),
Dutch, Danish, Norwegian, Swedish, Turkish, Vietnamese, Chinese (CN, TW, HK),
Japanese, Korean. The 2026 model adds Arabic, Finnish, Hebrew, Hindi,
Indonesian, Malay, Polish, Russian, Thai and Ukrainian **(Apple, footnote to
the third-generation announcement)**.

**Czech appears in neither list.** The 2026 list is the sharper evidence,
because it added three Slavic languages and skipped Czech. Check
`supportedLanguages` at runtime rather than trusting any hardcoded list, but
plan for absence.

The model is multilingual, so it will emit Czech if pushed. Unsupported means
untested and untuned, and `czech-lm-research.md` is 545 lines of evidence
that a model's behavior outside its trained register is not guessable. If
this route is ever taken for Czech, it has to be measured on our 14 game
cases first, exactly like every other engine in that study.

**Europe.** Apple Intelligence reached the EU in April 2025 with iOS 18.4, so
the framework works here today. The June 2026 newsroom post delays **Siri AI**
in the EU for iOS 27 and iPadOS 27, and its wording is narrow: the dedicated
conversations app, Visual Intelligence, writing tools, Camera Siri mode, and
"other Siri AI capabilities announced at WWDC26" **(Apple)**. It says nothing
about the Foundation Models framework, and macOS 27 keeps Siri AI even in the
EU. One third-party summary reads this as the whole framework being absent on
EU iPhones at launch. That reading is not supported by Apple's text, and it
is not settled either. For a Czech user this is a real risk on the 2026 model
and no risk at all on the 2025 one.

## Cost: memory, speed, and the extension rate limit

**Memory: zero, effectively.** An Apple Frameworks Engineer confirmed that
the model and its inference resources are managed centrally by the OS, shared
across all Apple Intelligence features, and do not count against the app's
Jetsam limit; the increase to your own footprint is "very minimal"
**(Apple, forum 795044)**. Multiple sessions in parallel are supported and
run serially on the Neural Engine.

This is the whole argument for the route. Compare:

| Option | In-extension memory | Fits 48-60 MB? |
|---|---|---|
| shipped `prediction.js` tables | 1.81 MB | yes |
| mini model from scratch | 1.3 MB int8 | yes |
| CzeGPT-2, 124M | 124 MB int8 | no |
| Czech-GPT-2-XL, 1.58B | ~790 MB int4 | no |
| **Foundation Models, 3B** | **~0** | **yes** |

Every local neural option above 100 MB is dead inside a keyboard extension.
This one is not, and it is 3B parameters.

**Speed.** Apple published about 30 tokens per second and roughly 0.6 ms
time-to-first-token per prompt token on an iPhone 15 Pro for the first
generation **(Apple, 2024)**. Third-party testing puts short answers at 30 to
50 tokens per second, and notes the rate falls when another Neural Engine
workload runs. Six candidate words as a structured list is perhaps 30 to 60
tokens, so one strip is roughly one to two seconds, before prompt processing.
Our budget for the per-keystroke strip is about 20 ms. The gap is two orders
of magnitude, which is the same conclusion the local XL model reached at
2.3 s per strip.

**The rate limit is the risk nobody documents.** Apple's engineer states that
rate limiting applies when the device is on battery **and** the process runs
in the background, and that it surfaces as a misleading "Safety guardrail was
triggered after consecutive failures during streaming" error. One developer
hit it with four requests at 30-second intervals. Advice given: do not stream
in background contexts, use `respond` instead **(Apple, forum 789788)**.

Whether a keyboard extension counts as background is unanswered in that
thread and unanswered anywhere else we found. It is visible on screen and it
is not the foreground app. A keyboard that fires one request per word
boundary would be far above four requests per two minutes. **This needs a
device test before any design depends on it**, and it may be the real reason
jKey found the route slow.

**Full Access.** No source says whether the framework is reachable from a
keyboard extension that lacks Full Access. It is a local XPC service, not
network, so it should be. App Store guideline 4.4.1 requires the keyboard to
work fully without Full Access, and `ios-deployment-research.md` records that
our design already meets that. Test it, and treat the answer as a gate: if
the framework needs Full Access, this route is a secondary feature at best.

## The one shipping precedent

jKey is an accessible keyboard for VoiceOver users, five large letter
clusters, and the keyboard works out the intended word. That is a harder
decoding problem than ours and the same shape: many candidate letters, a
lexicon, and a strip.

Its prediction ran on Apple Intelligence. In jKey 2026.1 the developer
replaced it with a language model shipped inside the keyboard, and listed
three reasons **(third party, AppleVis and the App Store listing)**:

- predictions were slow,
- they only worked on newer devices,
- they often were not the words users had asked for.

The stated gains after the change: no networking code and no AI service of
any kind, so nothing typed can leave the device; the engine works on every
supported device rather than only Apple Intelligence ones; and one engine now
drives word completion, next-word prediction, and sentence capitalization.

That is our architecture, arrived at independently, by the only other keyboard
that tried this API for this job. The third reason is the interesting one. It
is not a speed complaint or a hardware complaint. It says a 3B general model
asked in prose for word suggestions returns the wrong words, which is exactly
what `czech-lm-research.md` measured for every pretrained model at
next-word: 10.0 hit@1 for a 124M model against 17.3 for 1.8 MB of counts.

## What WWDC 2026 changed

Four things, from Apple's developer guide and the third-generation
announcement **(Apple)**:

- **Image input.** Prompts take images, and Vision framework tools (OCR,
  barcodes) are callable by the model. Nothing for us.
- **The `LanguageModel` protocol.** Third-party providers ship Swift packages
  conforming to it. Anthropic and Google shipped implementations on day one.
  You swap the provider by changing a package dependency, and the rest of the
  app keeps using `LanguageModelSession`.
- **Free Private Cloud Compute.** Apps in the App Store Small Business
  Program with fewer than 2 million lifetime first-time downloads get the
  server model free. Above that line Apple has not published pricing.
  Routing to Claude or Gemini is metered separately.
- **Dynamic Profiles**, an `fm` CLI, a Python SDK, an evaluations framework,
  and Instruments support for profiling model calls.

The protocol is the piece that matters here. Direction 8 decided on 2026-08-27
to run two specialist models, one per language, merged by the posterior we
already compute. iOS 27 turns that into one interface with two providers
behind it: Apple's local model for English, something else for Czech. The
keyboard writes one code path.

The free PCC tier does not solve Czech. The cloud model is the same family
and presumably the same language list, and any cloud call is exactly the
network dependency `swiftkey_research/swiftkey-user-reviews-analysis.md` says
users will not forgive unless it is visibly optional and off by default.

## What this means for phonekeeb

**Keep direction 8 as written, and split it by language.**

The English arm gets a strong answer. Apple's model is free, local, needs no
network, costs no extension memory, and reaches quality our tables cannot at
phrase level. Cost: one to two seconds, iPhone 15 Pro and newer, and an
untested rate limit.

The Czech arm gets no answer here. Czech is unsupported in both model
generations, and the two game cases that opened direction 8, `zaplavat` and
`kuře`, are Czech. Options, in order of cost: wait for Czech support and
re-measure; route Czech through a provider package at metered cost, off by
default; or accept that the Czech arm stays local and capped.

**Three things to do before any code.**

1. **Measure Apple's model on the 14 game cases.** The `fm` CLI and the
   Python SDK make this the same shape as `tools/lm-predict.py`, so the
   harness already exists in outline. It needs a Mac.
   `ios-deployment-research.md` prices a cloud Mac at about 3 EUR per day,
   and this is a one-day job. Run English cases as the real test, and Czech
   cases to price the unsupported-language question with numbers instead of a
   language list. Do this before building anything, exactly as the LM study
   did.
2. **Test the rate limit from a real keyboard extension.** One request per
   word boundary, on battery, for two minutes. If it throttles, the feature
   is a "think harder" chip and not an automatic second opinion.
3. **Test whether it works without Full Access.** Guideline 4.4.1 makes this
   a gate, not a detail.

**One thing not to do.** Do not let this route touch the per-keystroke strip.
Two orders of magnitude of latency, no probabilities to merge, no lexicon
constraint, and a shipping keyboard that already tried and reverted. The
1.3 MB mini model of `czech-lm-research.md` remains the right answer for the
strip, and the compounding design in `ideas.md` still holds: whatever the big
model contributes and the user accepts goes into `PersonalModel`, so the big
model teaches the small one and is needed once per new word, ever.

## Sources

- Foundation Models framework: https://developer.apple.com/documentation/foundationmodels
- 2025 model update, sizes and quantization: https://machinelearning.apple.com/research/apple-foundation-models-2025-updates
- Third generation (AFM 3), 2026: https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models
- Tech report 2025: https://arxiv.org/abs/2507.13575
- Memory is OS-managed, not charged to the app: https://developer.apple.com/forums/thread/795044
- Rate limiting in app extensions: https://developer.apple.com/forums/thread/789788
- Guardrail violations on benign prompts: https://developer.apple.com/forums/thread/792908
- Supported languages, enumerated: https://rudrank.com/exploring-foundation-models-supported-languages-internationalization
- WWDC26 machine learning guide: https://developer.apple.com/wwdc26/guides/machine-learning/
- Siri AI delayed in the EU: https://www.apple.com/newsroom/2026/06/due-to-dma-siri-ai-delayed-in-eu-for-ios-27-and-ipados-27/
- Xcode 27 shipped documentation, API surface: https://github.com/artemnovichkov/xcode-27-system-prompts
- Model internals, reverse engineered: https://github.com/fguzman82/apple-foundation-model-analysis
- Adapter training toolkit (rank-32 LoRA, draft model): https://github.com/scouzi1966/AFMTrainer
- Python SDK: https://apple.github.io/python-apple-fm-sdk/
- jKey 2026.1, why it dropped Apple Intelligence: https://www.applevis.com/forum/ios-ipados/jkey-20261-cluster-typing-real-language-model-behind-it-no-ai
- jKey on the App Store: https://apps.apple.com/us/app/jkey-accessible-keyboard/id6746700520
