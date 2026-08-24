# Gesture Keyboard Web Prototype

Plain HTML, CSS, and JS modules. No build step, no dependencies.

## Run it

```bash
cd web-prototype
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

## What is here

- `gesture-decoder.js` — the state machine. Sector, rotation direction, and
  loop count from a pointer path. No DOM dependency, unit-testable, and the
  piece meant to port to Swift later.
- `layout.js` — the two letter-placement modes from the handoff doc's open
  design question, plus the frequency tables.
- `main.js` — canvas drawing and Pointer Events wiring.
- `index.html`, `style.css` — the page shell and controls.

## What it does not do yet

No word prediction, no trie, no personal model, no typo repair. This phase
is steps 1 to 3 of the build order in `../gesture-keyboard-handoff.md`:
gesture decoding and layout only. Prediction is the next phase.

## Known rough edges

- Single pointer only. A second finger during a gesture is not handled.
- The Czech frequency table ignores diacritics, matching the handoff doc's
  note that diacritics need a separate plan.
- Dead zone radius is a slider for tuning by feel. There is no saved
  preference yet.
