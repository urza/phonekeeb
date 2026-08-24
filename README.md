# phonekeeb

A gesture keyboard for iOS. See `gesture-keyboard-handoff.md` for the full
project concept, prior art, and design decisions.

Status: web prototype of the gesture decoder and letter layout. No Swift
code yet.

## Web prototype

Plain HTML, CSS, and JS modules at the repo root. No build step, no
dependencies. This is also what GitHub Pages serves.

### Run it locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` on a laptop for mouse testing.

To test on a phone on the same Wi-Fi network, open
`http://<your-computer-ip>:8080` on the phone instead of `localhost`.

If this is running inside a Claude Code sandbox, ask on the host:

```bash
sbx ports <sandbox-name> --publish 8080:8080/tcp
```

Then reach it from the phone through the host machine's address.

### What is here

- `gesture-decoder.js` — the state machine, modeled on the real 8pen: entry
  quadrant, rotation direction, and crossings (boundary lines crossed
  before returning to the center dot, 1 to 4) from a pointer path. A
  center tap is space. One extra full loop makes a capital. No DOM
  dependency, unit-testable, and the piece meant to port to Swift later.
- `layout.js` — the two letter-placement modes from the handoff doc's open
  design question, filling the 32-slot (quadrant x direction x crossings)
  address space, plus the frequency tables.
- `main.js` — canvas drawing (letters along the boundary lines, plus the
  live glide preview: big letters in segment middles while the finger
  moves), Pointer Events wiring, and the suggestion bar.
- `prediction.js` — word completion over a static frequency list. Matches
  on diacritics-stripped keys, so typing "rek" can suggest "řekl".
- `words-en.js`, `words-cs.js` — top 3000 words per language, generated
  from hermitdave/FrequencyWords (OpenSubtitles 2018, CC-BY-SA-4.0).
- `index.html`, `style.css` — the page shell and controls.
- `tests/hello-flow.mjs` — end-to-end browser test: types "hello " as one
  continuous stroke plus a center tap, asserts the output. Needs
  Playwright installed outside the repo (`~/pw` by default, override with
  `PW_DIR`), because this filesystem does not support npm's symlinks.

### What it does not do yet

No personal model yet (the blended count tables), and no typo repair
(SymSpell layer). Prediction is a plain prefix scan; the trie plus beam
search arrives with the fuzzy stage. No accent long-press popup yet,
which the real 8pen used for accented characters.

### Known rough edges

- Single pointer only. A second finger during a gesture is not handled.
- The Czech frequency table ignores diacritics, matching the handoff doc's
  note that diacritics need a separate plan.
- Dead zone radius is a slider for tuning by feel. There is no saved
  preference yet.
