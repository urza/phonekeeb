# iOS deployment research

What it takes to run phonekeeb as a native iOS keyboard on a real iPhone.
Three phases: your own phone without the App Store, TestFlight beta, public
App Store. Researched 2026-08-25 with four parallel research agents. The
load-bearing facts were then checked by hand against live Apple pages on the
same day. Hand-checked facts are marked **(verified)**.

Phone-readable twin: https://urza.github.io/phonekeeb/ios-deployment-research.html

## TL;DR

- iOS has no APK-style install. Every install path ends in an Apple-issued
  signature plus a provisioning profile that lists your device.
- The closest analog to Android sideloading is signing with a free Apple ID.
  The build then runs for 7 days and needs a re-sign.
- Phase 1 costs $0 and no longer strictly needs a Mac. The no-Mac routes
  work, but each adds friction.
- TestFlight and the App Store both need the Apple Developer Program at
  $99 per year.
- Guideline 4.4.1 demands a keyboard that works fully without network and
  without Full Access. The current on-device design already matches this.

## Phase 1: your own iPhone, no App Store

### Why there is no APK equivalent

iOS runs only signed code. The signature must chain to an Apple certificate.
For dev installs, the provisioning profile must also list your device UDID.
You cannot open an `.ipa` on the phone and install it. Xcode, Sideloadly,
AltStore, and TestFlight all end at the same Apple signing service. One more
gate exists since iOS 16: the phone must have Developer Mode on
(Settings > Privacy & Security > Developer Mode, one restart).

### Free Apple ID ("Personal Team") limits **(verified)**

| Limit | Value |
|---|---|
| Build validity | 7 days, then re-sign and reinstall |
| App IDs | 10 per rolling 7 days |
| Test devices | 3 per platform |
| Sideloaded apps installed at once | 3 |
| TestFlight, App Store, ad hoc | not available |
| Push notifications | not available |
| App Groups | **available** (see below) |

Checked 2026-08-25 against Apple's membership comparison page and against
the raw HTML of Apple's capability table.

App Groups matter here. The container app and the keyboard extension share
settings through an App Group. Two research passes claimed free teams lack
App Groups. That is wrong today. In the raw HTML of Apple's capability
table, the "App groups" row has the free-tier checkmark **(verified)**.
Control rows (App Attest, Push notifications) lack that checkmark, so the
read is trustworthy. Old community threads with failures exist, mostly from
macOS. Treat it as: works, but confirm in Xcode on day one.

Mind the slot math. The keyboard extension consumes its own App ID and its
own sideload slot. Container plus keyboard take 2 of the 3 free slots.

### Install routes, cheapest first

| Route | Needs | Iteration loop | Verdict |
|---|---|---|---|
| Xcode on a Mac | any Mac + free Apple ID | seconds | reference path, debugger, Instruments |
| xtool on Linux/WSL | Windows PC + WSL + free Apple ID | minutes | promising, keyboard extension unproven |
| CI build + Sideloadly | GitHub Actions + Windows | 10-25 min | workable, blind (no debugger) |
| AltStore / SideStore | Windows for setup | installs prebuilt IPAs | good for auto re-sign every 7 days |
| Cloud Mac burst | ~3 EUR per day | seconds while rented | rent Xcode when unavoidable |
| Paid dev account | $99/yr | same as above | 1-year profiles, 100 devices, no 7-day churn |
| TrollStore | iOS 14.0-16.6.1 / 17.0 only | n/a | dead on current iOS 26.x |
| EU DMA marketplaces | 1M installs or $1M letter of credit | n/a | not for solo developers |

Route details:

- **Sideloadly (Windows)** signs any IPA with your Apple ID. It needs the
  standalone iTunes and iCloud installers, not the Microsoft Store builds.
  It has a "remove app extensions (PlugIns)" option. Keep that off. It
  would delete the keyboard from the app.
- **AltServer / AltStore** does the same with Wi-Fi auto-refresh, so the
  7-day expiry hurts less. SideStore needs one pairing file from a PC and
  then refreshes on the phone through a local VPN trick.
- **xtool** (https://github.com/xtool-org/xtool, v1.17.0, active project)
  builds, signs, and installs iOS apps from Linux or WSL, with a free
  Apple ID. Setup: Swift 6.3, a downloaded `Xcode.xip` for the SDK,
  `usbmuxd`, plus USBIPD passthrough under Windows. App extensions are
  supported since v1.14 through `xtool.yml`. A keyboard extension should
  fit that mechanism, but no published example exists yet. Budget a
  weekend for the experiment. No debugger, no simulator on Linux.
- **CI route**: this repo is public, so GitHub Actions macOS runners are
  free. Build with code signing disabled, zip `Payload/` into an IPA, and
  let Sideloadly sign at install time with the free Apple ID.

### Keyboard-extension facts that shape phase 1

- The extension is a native `UIInputViewController`. A WKWebView does load
  inside a keyboard, but JavaScript stalls or renders blank without Full
  Access, and web content eats the memory budget. The plan to port
  `gesture-decoder.js` to Swift stays right. Flutter and React Native are
  also not practical for keyboards.
- Memory: plan for a 40-60 MB ceiling (reports range 48-66 MB, Apple does
  not document a number). iOS kills the extension silently (jetsam). No
  dialog appears, and iOS 17+ leaves no crash log on the device. The
  system then swaps back to the previous keyboard.
- Full Access (`RequestsOpenAccess`) gates network, the system pasteboard,
  and writes to the shared App Group container. The keyboard must stay
  fully usable with Full Access off. Settings inside the keyboard (the
  current gear toggle) reduce the need for the shared container.
- You must enable the keyboard by hand after install:
  Settings > General > Keyboard > Keyboards > Add New Keyboard. Sometimes
  it appears only after the container app ran once, or after a restart.
- Debugging without Xcode: use `os_log` in code, then stream the device
  log with `pymobiledevice3 syslog live` from Windows or Linux. A jetsam
  kill shows up as the log stream stopping. Xcode's attach-to-extension
  flow exists but is flaky even on a Mac.

## Phase 2: TestFlight

TestFlight needs the paid Apple Developer Program, $99 per year. An
individual enrolls with an Apple ID, two-factor auth, and a credit card.
No D-U-N-S number is needed. Your personal legal name becomes the visible
seller name. Apple promises enrollment confirmation within 24 hours. Real
reports from 2025-2026 say 1 to 4 weeks.

Two tiers **(tester numbers verified)**:

| | Internal | External |
|---|---|---|
| Who | your App Store Connect team | anyone via email invite or public link |
| Max testers | 100 | 10,000 |
| Review | none | Beta App Review on the first build of each version |
| Wait | testable right after processing (5-30 min typical) | ~10 h queue + ~1 h review (measured 2026-08) |

Other limits: builds expire after 90 days. Up to 100 builds can be shared.
Each tester covers up to 30 devices. At most 6 builds per 24 hours can go
into beta review. Testers install through the TestFlight app, read
per-build "What to Test" notes, and can send screenshots plus up to 4,000
characters of feedback. Crashes report automatically.

Keyboard specifics: Beta App Review applies the normal guidelines, 4.4.1
included, so the keyboard must already work without Full Access. Put the
enable-the-keyboard steps into the "What to Test" notes, because the
extension stays inert until the tester adds it in Settings. TestFlight-only
distribution does not trigger the EU DSA trader requirements.

## Phase 3: App Store

### Submission checklist

- App record: name (30 chars), subtitle (30), keywords (100), description
  (4,000), promo text (170), category, age rating (2025 tiers: 4+, 9+,
  13+, 16+, 18+).
- Screenshots: one 6.9-inch iPhone set is required (1260x2736, 1290x2796,
  or 1320x2868). Ship iPhone-only to skip the iPad set (13-inch,
  2064x2752, required only if the app runs on iPad).
- App icon 1024x1024, no transparency.
- Privacy policy URL, also reachable from inside the app.
- App Privacy labels: Apple counts only data that leaves the device. A
  keyboard that keeps everything on device can declare "Data Not
  Collected". For a keyboard, that label is a real selling point.
- Privacy manifest (`PrivacyInfo.xcprivacy`). If the app reads the active
  keyboard list, declare `NSPrivacyAccessedAPICategoryActiveKeyboards`
  with reason `3EC4.1`.
- Export compliance: set `ITSAppUsesNonExemptEncryption` to `false`
  (HTTPS-only apps are exempt) to skip the per-upload questionnaire.
- EU DSA trader declaration. A trader gets name, address, phone, and email
  published on the EU product pages. A free app with no revenue can
  normally declare non-trader. Decide at submission time.

### Keyboard rules, Guideline 4.4.1

Keyboards must:

- provide typing;
- provide a way to switch to the next keyboard (honor
  `needsInputModeSwitchKey`, show a globe key);
- stay fully functional without network and without Full Access;
- collect typing data only to improve the keyboard, on the device.

Keyboards must not:

- launch other apps (Settings is the exception);
- repurpose keys for unrelated actions;
- show ads or purchases inside the extension.

The containing app must do something useful on its own (tutorial, settings,
practice area). A bare launcher fails minimum functionality (4.2). The old
explicit rule about number and decimal layouts is gone from the text, but
reviewers reportedly still check them. Build those layers anyway. A hard
precedent exists: Apple rejected the FlickType keyboard repeatedly over
"does not work without Full Access", and the developer gave up. Design for
the no-permissions state first.

### Review and updates

Apple reports that over 90% of reviews finish within 24 hours. First
submissions realistically take 2-5 days and fail more often. The top
rejection is Guideline 2.1, app completeness (crashes, placeholder content,
broken links). Privacy-label mismatches follow. Every binary update goes
through review again. Phased release rolls an update out over 7 days (1% to
100%) and can pause for up to 30 days.

## Costs

| Item | Cost |
|---|---|
| Phase 1, free route | $0, plus 7-day re-signs |
| Cloud Mac burst | ~3 EUR per day (Scaleway M1, 24 h minimum) or $1/h (MacinCloud) |
| Used M1 Mac mini | ~$450-500 one time, break-even ~6 months vs cloud |
| Apple Developer Program | $99 per year (needed for phases 2 and 3) |
| Commission on a free app | none |

## Recommended path for phonekeeb

1. Stay on the web prototype until the layout and decoder stabilize. It
   iterates in seconds and costs nothing.
2. Do the first native spike with a free Apple ID. With any reachable Mac
   (borrowed, or a ~3 EUR cloud-Mac day), use Xcode. Without one, try
   xtool under WSL, with CI + Sideloadly as the fallback. Spike goals:
   gesture feel at real touch latency, and the decoder's memory footprint.
3. Buy the $99 membership when native becomes the main track. It ends the
   7-day churn and phases 2 and 3 need it anyway. Reconsider a used M1
   mini then. Instruments is the only good tool against the 60 MB ceiling.
4. TestFlight with a few friends, internal group first, then a public
   link. Put the keyboard-enable steps into the test notes.
5. Submit to the App Store once the 4.4.1 self-check passes. Aim for the
   "Data Not Collected" privacy label. It fits the on-device design and it
   is rare among keyboards.

## Sources

Apple, hand-checked:

- Membership comparison (free limits): https://developer.apple.com/support/compare-memberships/
- Capabilities per membership (App Groups row): https://developer.apple.com/help/account/reference/supported-capabilities-ios
- TestFlight overview: https://developer.apple.com/testflight/

Apple, via research agents:

- App Review Guidelines (4.4.1, 4.2, 2.1): https://developer.apple.com/app-store/review/guidelines/
- Custom keyboard guide: https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html
- Open access configuration: https://developer.apple.com/documentation/uikit/configuring-open-access-for-a-custom-keyboard
- App privacy details ("collect" = leaves device): https://developer.apple.com/app-store/app-privacy-details/
- Screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications
- EU DSA trader status: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/
- Apps in the EU (marketplace eligibility): https://developer.apple.com/support/apps-in-the-eu/
- Phased release: https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases
- TestFlight / App Store Connect help: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/

Community and tooling:

- Sideloadly FAQ (free ID limits, PlugIns option): https://sideloadly.io/faq.html
- AltStore FAQ: https://faq.altstore.io/
- SideStore FAQ: https://docs.sidestore.io/docs/faq
- xtool (Linux/Windows iOS toolchain): https://github.com/xtool-org/xtool
- TrollStore support matrix: https://theapplewiki.com/wiki/TrollStore
- Review time tracker: https://www.runway.team/appreviewtimes
- Keyboard memory ceiling measurement: https://dev.to/tbds_2dadf2b626f315902eae/the-three-hard-constraints-of-an-ios-keyboard-extension-46af
- React Native keyboard memory issue: https://github.com/facebook/react-native/issues/31910
- FlickType rejection case: https://9to5mac.com/2021/08/16/flicktype-discontinuing-iphone-keyboard-app-due-to-app-store-hurdles/
- GitHub Actions billing (macOS multiplier): https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Scaleway Apple silicon pricing: https://www.scaleway.com/en/pricing/apple-silicon/
