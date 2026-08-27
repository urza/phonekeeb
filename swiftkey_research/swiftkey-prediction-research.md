# Microsoft SwiftKey: prediction/autocorrect engine and data export

Researched: 2026-08-27
Scope: how SwiftKey suggestion/prediction/autocorrect works, which algorithms it uses,
and whether the data it learned from your typing can be exported.

## Bottom line

- **Algorithms.** Two generations.
  1. Classic engine: n-gram word-sequence language model (word frequency counting).
  2. Neural engine (since late 2015): neural network language model with word embeddings
     (SwiftKey calls them word "clusters"). Runs on-device, GPU-accelerated with CPU fallback.
  On top of both, a personalization layer learns your own words, phrases, and emoji.
  Swipe input (SwiftKey Flow) is a separate gesture-to-word layer on top of the same models.
- **Export.** You can export the learned **words** (your personalized dictionary).
  You cannot export the trained neural model (weights) or a raw transcript of everything you typed.
  Current official route (2026): Microsoft account + Backup & Sync -> your own
  OneDrive folder `Apps > SwiftKey` (human-readable dictionary + machine-readable typing model).
  Legacy route: `data.swiftkey.com` portal, "Export All" ZIP containing `sync_words.json`.
  Legacy SwiftKey account data was retired after 2026-05-31, so OneDrive is the path to rely on.

## 1. What SwiftKey is

- Virtual keyboard for Android (since 2010) and iOS (since 2014).
- Made by TouchType (founded 2008, founders Jon Reynolds, Ben Medlock, Chris Hill-Scott).
- Acquired by Microsoft in Feb 2016 for ~$250M. Rebranded "Microsoft SwiftKey" in May 2020.
- Also shipped inside Windows 10 (2018), removed again in the May 2020 Windows update.
- Signature feature: three-word suggestion bar above the keys. The engine
  "learns from your personal language data as you type" (Microsoft support).
- Current builds (2025-2026): Android 9.12.x, iOS 4.2.x. Closed source, proprietary.

## 2. How suggestion / prediction / autocorrect works

### 2.1 Layers

1. Base language model: general-language statistics (n-gram, then neural).
2. Personalization: your personal dictionary + dynamic language model, updated as you type.
3. Input method: tap typing, swipe (SwiftKey Flow), T9. Each produces candidate strings
   that the language model ranks.

### 2.2 Base language model

**Generation 1: n-gram word sequence model (2010-).**
Primary source (SwiftKey blog, Oct 2015): the 2010 engine's suggestion bar "was powered by
our word sequence 'n-gram' technology, an approach now used on more than a billion devices
globally." CTO Ben Medlock (Medium, 2015-10-08) calls n-grams "a sophisticated form of
word frequency counting."

- Predicts the next word from the previous words using n-gram frequency counts
  built from large text corpora (plus your own usage, which is the personalization layer).
- Good for common phrases and for phrases you have personally typed.
- Known limits (SwiftKey's own words): "it can't capture the underlying meaning of words
  and can only accurately predict words that have been seen before in the same word sequence."

**Generation 2: neural network language model (SwiftKey Neural, alpha 2015-10-08;
work started late 2013).**
Primary sources: SwiftKey blog "Introducing the world's first neural network keyboard"
(2015-10-08) and Ben Medlock's Medium post of the same day.

- First smartphone keyboard announced to use an artificial neural network to predict
  and correct language.
- The model "meaningfully capture[s] the relationship between words", understands word
  similarity, and organizes words into "clusters" at varying proximity.
  In modern terms: a trained word-embedding / vector-space representation
  (distributional semantics) inside a neural language model.
- Generalizes: trained on "Let's meet at the airport", it can offer "office" or "hotel"
  as predictions in a new, never-seen context.
- Runs **locally on the phone** (in 2015, NN language models were mostly server-side).
  Inference uses the phone's GPU, with a CPU fallback when no GPU is available.
- Third-party writeup (SwiftKey2HeliBoard guide, Mar 2026) still describes current
  SwiftKey as having a "neural model", consistent with the NN engine staying in the product.

**Honesty note.** Microsoft has never published a technical paper with the exact
architecture (layer types, RNN vs transformer, tokenizer, model size). The statements
above come from SwiftKey's own blog and CTO essays. Treat architecture details as
company claims, not peer-reviewed facts.

### 2.3 Personalization (what it "learns from you")

- The engine continuously learns from your typing in every app: word choice, phrases,
  emoji usage, writing style. This is the on-device "dynamic language model".
- 2011 (SwiftKey X) added a **cloud-based personalization service** that analyzed how the
  user types in Gmail, Twitter, Facebook, and SMS. SwiftKey Cloud (2013) backed up and
  synced "language behavior" and settings to the cloud.
- 2016 incident: cloud sync leaked personal data (email addresses, phone numbers) as
  suggestion words to other users. SwiftKey disabled cloud sync of word suggestions
  and patched. (NowSecure/The Verge/TechCrunch coverage, Jul 2016.)
- Privacy guardrails (Microsoft privacy page): SwiftKey never learns from fields marked
  as password fields, and does not remember long numbers (e.g. credit cards).
  A wrong suggestion can be removed by long-pressing it in the prediction bar.
- By default (no Microsoft account), all personal/language data stays on the device
  and "is never transferred" (Microsoft privacy Q&A).

### 2.4 Swipe input (SwiftKey Flow, 2013)

- Gesture input: glide across keys; a touch model maps the gesture path to candidate
  words, scored by the same language model, with real-time predictions while gliding.
  "Flow Through Space": glide to the space bar to insert a whole sentence.
- Related patent activity: WordLogic sued TouchType in 2014 over its gesture-input
  patent US8552984 (case dismissed; TouchType defended via Finnegan).

## 3. Can you export the data it learned from your typing?

**Yes for the learned words. No for the trained model.**

### 3.1 What "learned data" actually is

- **Personalized dictionary**: the words/terms SwiftKey learned from your typing.
- **Typing model**: the personal dictionary in a machine-readable format SwiftKey uses
  to improve predictions (per Microsoft's Backup & Sync docs).
- It is not a transcript of everything you typed. It is not the neural network weights.
- Noise warning (from the SwiftKey2HeliBoard converter): the exported word list also
  contains URLs, email addresses, numbers, and timestamps. Filtering is needed.

### 3.2 Current official route (2026): OneDrive backup

Per Microsoft support ("SwiftKey Backup and Sync with OneDrive", current page):

1. Sign in to SwiftKey with a Microsoft account.
2. Enable Backup & Sync (Account > Backup & Sync).
3. SwiftKey stores your data in your own OneDrive, folder `Apps > SwiftKey`:
   - personalized dictionary (learned words) - **human-readable format,
     explicitly "to support user transparency"**;
   - typing model (machine-readable personal dictionary).
4. View / export / delete at any time: onedrive.live.com -> Apps > SwiftKey.
- OneDrive backup rolled out in phases, complete by **31 May 2026**.
- Without Backup & Sync: data stays only on the device, no cross-device sync.
- Deletion: delete the files in OneDrive (local model on device is kept),
  or in-app "Delete personalized dictionary backup".

### 3.3 Legacy route: data.swiftkey.com portal (retired ~May 2026)

Documented by the SwiftKey2HeliBoard migration guide (Mar 2026, tested then):

1. SwiftKey requires a Microsoft account for any export ("SwiftKey does not allow a
   local export - you must go through its web portal").
2. data.swiftkey.com -> View Data -> Export All -> ZIP `userdata-{id}-{date}.zip`.
3. ZIP contents: `demographics.json` (telemetry, ignore) and
   `services/sync_words.json` (your dictionary, JSON with a `terms` array).
4. Legacy SwiftKey account data was permanently deleted after **31 May 2026**.
   As of Aug 2026 the portal redirects to the Microsoft OneDrive backup docs,
   so treat this route as retired. OneDrive is the live path.

Historical note: pre-2019 backups went to Google Drive for some users (XDA threads:
users could download the backup as a ZIP but found no way to put it back on a new phone).

### 3.4 Local device data (no account, or in addition)

- Android: app package `com.touchtype.swiftkey`. Personal model lives in the app's
  private data dir (`/data/data/com.touchtype.swiftkey/`). No official local export.
  Getting the files requires root or an ADB/app-data backup. File formats are
  undocumented; community reports exist but no public schema.
- iOS: data in the app sandbox; Apple exposes no file access. In-app options cover
  removing remote data and removing data from the device.
- So without a Microsoft account, your learned data is practically **not exportable**
  by supported means.

### 3.5 What does not transfer / export

- Trained prediction model / neural weights. Another keyboard (e.g. HeliBoard)
  re-learns from scratch; only the word list is portable.
- Clipboard history, themes, settings.
- A clean raw log of every string you typed.

## 4. Practical recipe (if you want your own data out)

1. Phone: SwiftKey -> Account -> sign in with your Microsoft account.
2. Enable Account -> Backup & Sync. Wait for the sync to complete.
3. PC: onedrive.live.com -> sign in -> `Apps` -> `SwiftKey`.
4. Download the files there:
   - the human-readable dictionary = the list of words it learned from you;
   - the machine-readable typing model = the importable personal model for SwiftKey.
5. If you plan to move to another keyboard: strip non-word entries (digits, URLs,
   emails, timestamps) and feed the rest as a plain word list. Expect that the new
   keyboard's predictive quality re-learns over time.
6. Privacy cleanup: delete the OneDrive files or use "Delete personalized dictionary
   backup" in the app. Deleting the Microsoft SwiftKey account erases cloud predictions
   but keeps the on-device model.

## 5. Sources

Primary (SwiftKey / Microsoft):
- SwiftKey blog, "Introducing the world's first neural network keyboard", 2015-10-08:
  https://blog.swiftkey.com/neural-networks-a-meaningful-leap-for-mobile-typing/
  (archive: http://web.archive.org/web/20161227001652/https://blog.swiftkey.com/neural-networks-a-meaningful-leap-for-mobile-typing/)
- Ben Medlock (CTO), "Why Turing's legacy demands a smarter keyboard", Medium, 2015-10-08:
  https://medium.com/@Ben_Medlock/why-turing-s-legacy-demands-a-smarter-keyboard-9e7324463306
  (archive: http://web.archive.org/web/20160326074053/https://medium.com/@Ben_Medlock/why-turing-s-legacy-demands-a-smarter-keyboard-9e7324463306)
- Microsoft support, "SwiftKey Backup and Sync with OneDrive":
  https://support.microsoft.com/en-us/swiftkey-keyboard/swiftkey-backup-and-sync-with-onedrive
- Microsoft support, "Privacy Questions and your Data":
  https://support.microsoft.com/en-gb/topic/microsoft-swiftkey-keyboard-privacy-questions-and-your-data-07e13677-6b38-4ad0-bad0-d41207cab6de
- Microsoft support, "How do I personalize my typing":
  https://support.microsoft.com/en-us/swiftkey-keyboard/how-do-i-personalize-my-typing-with-microsoft-swiftkey-keyboard
- Microsoft support, "How does the prediction bar work":
  https://support.microsoft.com/en-us/swiftkey-keyboard/how-does-the-microsoft-swiftkey-prediction-bar-work

History / context:
- Wikipedia, "Microsoft SwiftKey": https://en.wikipedia.org/wiki/Microsoft_SwiftKey
- The Verge, SwiftKey bug leaked emails/phone numbers (2016-07-29):
  https://www.theverge.com/2016/7/29/12326152/swiftkey-bug-backup-sync-down-error-prediction
- WordLogic v. TouchType patent case (Finnegan):
  https://www.finnegan.com/en/work/experience/wordlogic-et-al-v-touchtype-inc-dba-swiftkey-3-14-cv-2448-sd-cal.html

Export / community:
- guilamu/SwiftKey2HeliBoard migration guide (Mar 2026):
  https://github.com/guilamu/SwiftKey2HeliBoard
  (documents data.swiftkey.com export ZIP + sync_words.json structure,
  local export absence, and what does not transfer)
- XDA, "Move Swiftkey Dictionary to New Phone" (2019):
  https://xdaforums.com/t/move-swiftkey-dictionary-to-new-phone.3965333/
- Reddit r/Swiftkey, "Is there a way to migrate swiftkey learned keywords":
  https://www.reddit.com/r/Swiftkey/comments/wdp0eq/
