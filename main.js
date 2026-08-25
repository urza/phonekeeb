import { GestureDecoder, angleToSector } from './gesture-decoder.js';
import { letterAt, validateLayout, SECTORS, DIRECTIONS, FIRST_ARM } from './layout.js';
import { LAYOUTS, buildLayout, DEFAULT_LAYOUT } from './layouts.js';
import { THEMES, THEME_VARS, DEFAULT_THEME, SECTOR_COLORS } from './themes.js';
import { Predictor } from './prediction.js';
import { WORDS as WORDS_EN } from './words-en.js';
import { WORDS as WORDS_CS } from './words-cs.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const output = document.getElementById('output');
const suggestionsEl = document.getElementById('suggestions');
const layoutModeEl = document.getElementById('layoutMode');
const languageEl = document.getElementById('language');
const deadZoneEl = document.getElementById('deadZone');
const themeEl = document.getElementById('theme');
const sectorColorsEl = document.getElementById('sectorColors');
const clearButton = document.getElementById('clearText');
const settingsEl = document.getElementById('settings');
const settingsToggle = document.getElementById('settingsToggle');

const predictors = { en: new Predictor(WORDS_EN), cs: new Predictor(WORDS_CS) };

// The build number this script was loaded under, taken from the ?v=
// query that index.html pins on every asset. Shown in the HUD so a
// phone stuck on a cached build is diagnosable at a glance.
const BUILD = new URL(import.meta.url).searchParams.get('v') ?? '?';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

// Canvas colors come from the same CSS variables the page uses, so one
// theme map in themes.js colors everything. Cached because draw() runs
// on every pointer move; refreshed on theme change and on system
// light/dark flips (which only matter for the auto theme).
function readColors() {
  const style = getComputedStyle(document.documentElement);
  const v = (name) => style.getPropertyValue(name).trim();
  return {
    line: v('--line'), letter: v('--fg'), muted: v('--muted'),
    path: v('--trail'), pathCenter: v('--trail-center'), hud: v('--fg'),
  };
}
let colors = readColors();

const THEME_KEY = 'phonekeeb.theme';

function applyTheme(id) {
  const def = THEMES[id] ?? THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  // Inline variables override both the stylesheet and its dark-mode
  // media query; clearing them returns auto to the system setting.
  for (const name of THEME_VARS) root.style.removeProperty(name);
  root.style.colorScheme = '';
  if (def.vars) {
    for (const [name, value] of Object.entries(def.vars)) root.style.setProperty(name, value);
    root.style.colorScheme = def.scheme;
  }
  colors = readColors();
  draw();
}

// The layout dropdown is generated from the registry, so adding a
// layout means editing layouts.js only. Layout and language choices
// persist like the theme, so a phone reload keeps the experiment
// settings.
const LAYOUT_KEY = 'phonekeeb.layout';
const LANG_KEY = 'phonekeeb.language';
for (const [id, def] of Object.entries(LAYOUTS)) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = def.label;
  layoutModeEl.appendChild(option);
}
let savedLayout = null;
try { savedLayout = localStorage.getItem(LAYOUT_KEY); } catch {}
layoutModeEl.value = LAYOUTS[savedLayout] ? savedLayout : DEFAULT_LAYOUT;
let savedLanguage = null;
try { savedLanguage = localStorage.getItem(LANG_KEY); } catch {}
if (savedLanguage === 'en' || savedLanguage === 'cs') languageEl.value = savedLanguage;

// Same pattern for themes: the dropdown mirrors the THEMES registry.
for (const [id, def] of Object.entries(THEMES)) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = def.label;
  themeEl.appendChild(option);
}

let center = { x: 0, y: 0 };
let deadZoneRadius = Number(deadZoneEl.value);
let layout = buildLayout(layoutModeEl.value, languageEl.value);
let decoder = new GestureDecoder({ center, deadZoneRadius });
let typedText = '';
let caret = 0; // insertion point in typedText, moved by the N hold-glide
let currentWord = ''; // word-character run just before the caret
let currentSnapshot = decoder.snapshot();

// The finger trail is a visual, not decoder state (the decoder is the
// Swift-bound piece and knows nothing about it). Points carry their
// birth time and the decoder state they were drawn under; segments fade
// out over TRAIL_MS so a long continuous stroke shows only the recent
// motion instead of accumulating a tangle.
const TRAIL_MS = 700;
const trail = []; // { x, y, t, state }
let trailRaf = null;

function pushTrail(x, y) {
  trail.push({ x, y, t: performance.now(), state: currentSnapshot.state });
}

// Keeps redrawing while any trail remains, so the tail fades even when
// the finger holds still or has lifted. Stops itself once the trail is
// gone; pointer moves restart it via draw().
function scheduleTrailFade() {
  if (trailRaf !== null) return;
  trailRaf = requestAnimationFrame(() => {
    trailRaf = null;
    if (trail.length) draw();
  });
}

// Function taps: a stationary press-and-release in a sector. Right
// deletes and bottom is enter, as in the 8VIM successor project. The
// top tap used to be shift; it was dropped (the capital loop covers
// capitals) and the N sector now hosts the caret hold-glide instead.
// Left is reserved for a future number/symbol layer. The N glyph hints
// the glide, not a tap.
const FUNCTION_KEYS = { E: 'backspace', S: 'enter', N: null, W: null };
const FUNCTION_GLYPHS = { E: '⌫', S: '⏎', N: '↔' };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  center = { x: rect.width / 2, y: rect.height / 2 };
  decoder.center = center;
  draw();
}

function rebuildLayout() {
  layout = buildLayout(layoutModeEl.value, languageEl.value);
  const { problems, letterCount } = validateLayout(layout);
  for (const p of problems) console.warn(`layout ${layoutModeEl.value}: ${p}`);
  if (letterCount < 26) console.warn(`layout ${layoutModeEl.value}: only ${letterCount} letters placed`);
  draw();
}

function toLocalPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function insertAtCaret(s) {
  typedText = typedText.slice(0, caret) + s + typedText.slice(caret);
  caret += s.length;
}

// Removes up to n characters before the caret and returns them, so the
// Typewise-style delete glide can restore them while the finger is
// still down.
function deleteBeforeCaret(n) {
  const cut = Math.min(n, caret);
  const removed = typedText.slice(caret - cut, caret);
  typedText = typedText.slice(0, caret - cut) + typedText.slice(caret);
  caret -= cut;
  return removed;
}

// The prediction prefix is derived from the text, not accumulated:
// deletes, caret moves, and glide edits would all have to maintain an
// accumulator. Letters and in-word apostrophes only, so punctuation
// still ends the word (the word lists keep real apostrophes; see
// word-prediction-research.md).
function syncCurrentWord() {
  currentWord = typedText.slice(0, caret).match(/[\p{L}'’]*$/u)[0];
}

// Double-tap-the-center writes a period, the standard phone
// double-space convention. Armed only by tap-spaces, never dip-spaces:
// a dip is part of a flowing stroke, not a deliberate double tap.
const DOUBLE_TAP_MS = 350;
let lastSpaceTapAt = 0;

function commitGesture(commit) {
  if (!commit) return;
  if (commit.type === 'space') {
    const now = performance.now();
    const afterWordChar = /[\p{L}\p{N}]/u.test(typedText[caret - 2] ?? '');
    if (
      commit.via === 'tap' &&
      now - lastSpaceTapAt < DOUBLE_TAP_MS &&
      typedText[caret - 1] === ' ' &&
      afterWordChar
    ) {
      // Second quick tap: "word " becomes "word. ".
      deleteBeforeCaret(1);
      insertAtCaret('. ');
      lastSpaceTapAt = 0;
    } else {
      insertAtCaret(' ');
      lastSpaceTapAt = commit.via === 'tap' ? now : 0;
    }
  } else if (commit.type === 'function') {
    applyFunction(commit.sector);
    lastSpaceTapAt = 0;
  } else {
    let letter = letterAt(layout, commit.sector, commit.direction, commit.crossings);
    // Slots can hold punctuation (the original 8pen layout does); the
    // capital loop only uppercases actual letters.
    const isLetter = letter ? /\p{L}/u.test(letter) : false;
    if (isLetter && commit.capital) letter = letter.toUpperCase();
    if (letter) insertAtCaret(letter);
    lastSpaceTapAt = 0;
  }
  syncCurrentWord();
  renderSuggestions();
}

function applyFunction(sector) {
  const fn = FUNCTION_KEYS[sector];
  if (fn === 'backspace') deleteBeforeCaret(1);
  else if (fn === 'enter') insertAtCaret('\n');
}

function renderSuggestions() {
  const words = predictors[languageEl.value].predict(currentWord, 5);
  suggestionsEl.innerHTML = words
    .map((w) => `<button type="button" data-word="${w}">${w}</button>`)
    .join('');
}

// Our own caret element: #output is a div, so there is no browser
// caret to reuse. Rebuilt on every render; the empty span adds nothing
// to textContent, so tests keep reading the plain text.
const caretEl = document.createElement('span');
caretEl.className = 'caret';

// The output box has a fixed height (see #output in style.css), so long
// text scrolls. Keep the caret in view after every change.
function renderOutput() {
  if (!typedText) {
    output.textContent = '(draw from the center)';
    return;
  }
  output.replaceChildren(
    document.createTextNode(typedText.slice(0, caret)),
    caretEl,
    document.createTextNode(typedText.slice(caret)),
  );
  caretEl.scrollIntoView({ block: 'nearest' });
}

suggestionsEl.addEventListener('click', (e) => {
  const word = e.target.dataset?.word;
  if (!word) return;
  // Replace the partial word before the caret with the suggestion,
  // then a space. Text after the caret stays put.
  typedText = typedText.slice(0, caret - currentWord.length) + word + ' ' + typedText.slice(caret);
  caret += word.length + 1 - currentWord.length;
  syncCurrentWord();
  renderSuggestions();
  renderOutput();
});

// Display string a commit would type, with its real case: lowercase
// normally, uppercase when the capital loop is in effect. The static map
// draws uppercase for looks; the live preview must not lie about case.
function letterOf(commit) {
  if (!commit) return null;
  const l = letterAt(layout, commit.sector, commit.direction, commit.crossings);
  if (!l) return null;
  return commit.capital ? l.toUpperCase() : l;
}

const SECTOR_MID = { E: 0, S: 90, W: 180, N: 270 };

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const armLength = Math.min(rect.width, rect.height) * 0.44;
  const pv = currentSnapshot.preview;

  // Sector learning colors: the auto theme has no scheme of its own,
  // so it follows the device light/dark setting like its palette does.
  const scheme = THEMES[themeEl.value]?.scheme ?? (darkQuery.matches ? 'dark' : 'light');
  const sectorHue = sectorColorsEl.checked ? SECTOR_COLORS[scheme] : null;

  // Quadrant tints, one hue per entry sector: the learning aid that
  // says "this letter's glide starts in the same-colored region".
  // During a stroke the entry sector's wedge brightens and the rest
  // fade, mirroring the letter dimming below.
  if (sectorHue) {
    for (const sector of SECTORS) {
      const a0 = ((SECTOR_MID[sector] - 45) * Math.PI) / 180;
      const a1 = ((SECTOR_MID[sector] + 45) * Math.PI) / 180;
      ctx.globalAlpha = !pv ? 0.08 : sector === currentSnapshot.sector ? 0.14 : 0.04;
      ctx.fillStyle = sectorHue[sector];
      ctx.beginPath();
      ctx.arc(center.x, center.y, armLength, a0, a1);
      ctx.arc(center.x, center.y, deadZoneRadius, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The four boundary arms on the diagonals (the original 8pen's X
  // orientation), drawn from the dead zone edge outward.
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1.5;
  for (const armAngle of [45, 135, 225, 315]) {
    const rad = (armAngle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(center.x + deadZoneRadius * Math.cos(rad), center.y + deadZoneRadius * Math.sin(rad));
    ctx.lineTo(center.x + armLength * Math.cos(rad), center.y + armLength * Math.sin(rad));
    ctx.stroke();
  }

  // Letters along each arm, on the side facing their start sector, the
  // way 8pen displayed its alphabet: radial position = how many lines to
  // cross. Innermost letter = 1 crossing = cheapest gesture. Dimmed while
  // a stroke is active so the live preview letters stand out.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rInner = deadZoneRadius + 24;
  const rStep = (armLength - rInner - 10) / 3;
  for (const sector of SECTORS) {
    for (const direction of DIRECTIONS) {
      // While a stroke is active, the families reachable from the entry
      // sector stay readable (both until the first crossing fixes the
      // rotation direction, then only the matching one); the rest dims
      // hard so the big preview letters stand out. This keeps "which
      // letters can I still reach" visible at their true map positions.
      let baseAlpha = 1;
      if (pv) {
        const reachable = sector === currentSnapshot.sector &&
          (!currentSnapshot.direction || direction === currentSnapshot.direction);
        baseAlpha = reachable ? 0.6 : 0.22;
      }
      const armAngle = FIRST_ARM[sector][direction];
      // Nudge letters off the line toward the start sector. For a CW
      // slot the sector sits on the smaller-angle side of its arm; for
      // CCW the larger-angle side.
      const nudge = direction === 'CW' ? -13 : 13;
      const rad = ((armAngle + nudge) * Math.PI) / 180;
      layout[sector][direction].forEach((letter, i) => {
        if (!letter) return;
        const r = rInner + i * rStep;
        // Emphasize cheap letters: biggest at 1 crossing. With sector
        // colors on, one hue per sector carries the grouping and the
        // outer rings de-emphasize through alpha instead of the muted
        // color.
        ctx.font = `${20 - i * 2}px sans-serif`;
        if (sectorHue) {
          ctx.fillStyle = sectorHue[sector];
          ctx.globalAlpha = i === 0 ? baseAlpha : baseAlpha * 0.65;
        } else {
          ctx.fillStyle = i === 0 ? colors.letter : colors.muted;
          ctx.globalAlpha = baseAlpha;
        }
        ctx.fillText(letter.toUpperCase(), center.x + r * Math.cos(rad), center.y + r * Math.sin(rad));
      });
    }
  }

  // Faint sector names at the edges, for talking about the layout and
  // matching the log lines (e.g. "S CCW lines:1").
  ctx.globalAlpha = pv ? 0.3 : 1;
  ctx.font = '10px sans-serif';
  ctx.fillStyle = colors.line;
  const cornerR = armLength * 0.92;
  for (const sector of SECTORS) {
    const rad = (SECTOR_MID[sector] * Math.PI) / 180;
    ctx.fillText(sector, center.x + cornerR * Math.cos(rad), center.y + cornerR * Math.sin(rad));
  }

  // Function hints: tap glyphs for E and S, the caret-glide glyph for N.
  ctx.font = '15px sans-serif';
  ctx.fillStyle = colors.muted;
  const fnR = armLength * 0.78;
  for (const [sector, glyph] of Object.entries(FUNCTION_GLYPHS)) {
    const rad = (SECTOR_MID[sector] * Math.PI) / 180;
    ctx.fillText(glyph, center.x + fnR * Math.cos(rad), center.y + fnR * Math.sin(rad));
  }
  ctx.globalAlpha = 1;

  // Fading finger trail, drawn before the preview letters so they stay
  // readable on top of it. Each segment's opacity and width follow its
  // age, and points past TRAIL_MS are dropped.
  const now = performance.now();
  while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
  if (trail.length > 1) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < trail.length; i++) {
      const p = trail[i];
      const alpha = Math.max(0, 1 - (now - p.t) / TRAIL_MS);
      // Outside-start drags are ignored input (reserved for future
      // gestures); a muted trail signals that nothing will be typed.
      ctx.strokeStyle =
        p.state === 'active' ? colors.path
        : p.state === 'outside' ? colors.muted
        : colors.pathCenter;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.5 + 2.5 * alpha;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (trail.length) scheduleTrailFade();

  // Live glide preview: big letters in the segment middles showing what
  // gliding there (then returning to center) would type. All preview
  // letters belong to the entry sector, so they carry its color too.
  const previewColor = sectorHue && currentSnapshot.sector
    ? sectorHue[currentSnapshot.sector]
    : colors.letter;
  if (pv) {
    const bigR = armLength * 0.6;
    const posOf = (sector) => {
      const rad = (SECTOR_MID[sector] * Math.PI) / 180;
      return [center.x + bigR * Math.cos(rad), center.y + bigR * Math.sin(rad)];
    };

    for (const [sector, commit] of Object.entries(pv.adjacent)) {
      const letter = letterOf(commit);
      const [x, y] = posOf(sector);
      if (commit === null) {
        // Gliding here returns the count to zero: it cancels the letter.
        ctx.font = '22px sans-serif';
        ctx.fillStyle = colors.muted;
        ctx.fillText('×', x, y);
      } else if (letter) {
        ctx.font = 'bold 38px sans-serif';
        ctx.fillStyle = previewColor;
        ctx.fillText(letter, x, y);
      }
      // commit without a letter = unassigned slot: draw nothing.
    }

    // Opposite sector: two ways around until rotation direction exists.
    const opp = pv.opposite;
    if (opp.established) {
      const letter = letterOf(opp.established === 'CW' ? opp.cw : opp.ccw);
      if (letter) {
        const [ox, oy] = posOf(opp.sector);
        ctx.font = 'bold 38px sans-serif';
        ctx.fillStyle = previewColor;
        ctx.fillText(letter, ox, oy);
      }
    } else {
      // Both options, as big as the neighbors' letters, each placed
      // toward the side the finger would travel through to reach it:
      // the clockwise option sits on the clockwise-arrival side. Screen
      // angles grow clockwise (y axis points down), so that is the
      // lower-angle side of the opposite sector.
      const oppMid = SECTOR_MID[opp.sector];
      const posAt = (deg, r = bigR) => {
        const rad = (deg * Math.PI) / 180;
        return [center.x + r * Math.cos(rad), center.y + r * Math.sin(rad)];
      };
      const cwLetter = letterOf(opp.cw);
      const ccwLetter = letterOf(opp.ccw);
      // Two letters share this segment, one per rotation direction.
      // Beside each, a small arrow enters from the arm that path
      // crosses and points along the travel direction into the letter,
      // so the pair reads as two flows instead of two misplaced keys.
      // Tangent direction: position angle +90 for clockwise travel
      // (canvas angles grow clockwise), -90 for counterclockwise.
      const flowArrow = (deg, tangentSign) => {
        const [x, y] = posAt(deg, bigR);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(((deg + tangentSign * 90) * Math.PI) / 180);
        ctx.font = '16px sans-serif';
        ctx.fillStyle = colors.muted;
        ctx.fillText('→', 0, 0);
        ctx.restore();
      };
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = previewColor;
      if (cwLetter) {
        ctx.fillText(cwLetter, ...posAt(oppMid - 22));
        flowArrow(oppMid - 38, 1);
        ctx.font = 'bold 30px sans-serif';
        ctx.fillStyle = previewColor;
      }
      if (ccwLetter) {
        ctx.fillText(ccwLetter, ...posAt(oppMid + 22));
        flowArrow(oppMid + 38, -1);
      }
    }
  }

  // Dead zone circle: also a glide target. During a stroke it shows the
  // letter that returning to center right now would commit.
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, deadZoneRadius, 0, Math.PI * 2);
  ctx.stroke();
  const commitNowLetter = pv ? letterOf(pv.commitNow) : null;
  if (commitNowLetter) {
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = previewColor;
    ctx.fillText(commitNowLetter, center.x, center.y);
  } else if (pv) {
    // No letter pending: returning now is either a dip-space (fresh
    // excursion) or a silent cancel (backtracked letter).
    ctx.fillStyle = colors.muted;
    ctx.font = '18px sans-serif';
    ctx.fillText(currentSnapshot.dipWouldSpace ? '␣' : '×', center.x, center.y);
  } else {
    ctx.fillStyle = colors.muted;
    ctx.font = '10px sans-serif';
    ctx.fillText('space', center.x, center.y);
  }

  // HUD.
  ctx.fillStyle = colors.hud;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  const hud = `state:${currentSnapshot.state}  sector:${currentSnapshot.sector ?? '-'}  dir:${currentSnapshot.direction ?? '-'}  lines:${currentSnapshot.crossings ?? 0}  b${BUILD}`;
  ctx.fillText(hud, 10, 16);
}

function handleResult(result, point) {
  currentSnapshot = result;
  if (point) pushTrail(point.x, point.y);
  if (result.committed) commitGesture(result.committed);
  renderOutput();
  draw();
}

canvas.style.touchAction = 'none';

// Hold-glides: a press that lands out in a sector and then drags. The
// decoder keeps such presses in its 'outside' state and commits nothing
// once they move past the tap threshold; main.js gives two of them a
// text-editing meaning (the decoder stays pure gesture-to-letter):
//   E: Typewise-style delete. Dragging toward the center deletes one
//      character per step; dragging back restores from this glide's
//      buffer. Lifting keeps the result.
//   N: caret move. Dragging right/left walks the caret through the
//      text, one character per step.
const GLIDE_TAP_PX = 18; // keep in sync with the tap threshold in gesture-decoder.js pointerUp
const GLIDE_STEP_PX = 14;
let glide = null; // { sector, x0, y0, active, deleted, caret0 }

function updateGlide(x, y) {
  if (!glide.active) {
    if (Math.hypot(x - glide.x0, y - glide.y0) < GLIDE_TAP_PX) return;
    if (glide.sector !== 'E' && glide.sector !== 'N') {
      glide = null; // S and W drags stay reserved, silent
      return;
    }
    glide.active = true;
  }
  if (glide.sector === 'E') {
    // Toward the center is leftward from the E sector.
    const want = Math.max(0, Math.floor((glide.x0 - x) / GLIDE_STEP_PX));
    while (glide.deleted.length < want && caret > 0) {
      glide.deleted = deleteBeforeCaret(1) + glide.deleted;
    }
    while (glide.deleted.length > want) {
      insertAtCaret(glide.deleted[0]);
      glide.deleted = glide.deleted.slice(1);
    }
  } else {
    const steps = Math.round((x - glide.x0) / GLIDE_STEP_PX);
    caret = Math.max(0, Math.min(typedText.length, glide.caret0 + steps));
  }
  syncCurrentWord();
  renderSuggestions();
  renderOutput();
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = toLocalPoint(e);
  const result = decoder.pointerDown(x, y);
  if (result.state === 'outside') {
    const angle = (Math.atan2(y - center.y, x - center.x) * 180) / Math.PI;
    glide = { sector: angleToSector(angle), x0: x, y0: y, active: false, deleted: '', caret0: caret };
  }
  handleResult(result, { x, y });
});

canvas.addEventListener('pointermove', (e) => {
  if (!canvas.hasPointerCapture(e.pointerId)) return;
  const { x, y } = toLocalPoint(e);
  if (glide) updateGlide(x, y);
  handleResult(decoder.pointerMove(x, y), { x, y });
});

canvas.addEventListener('pointerup', (e) => {
  const { x, y } = toLocalPoint(e);
  const result = decoder.pointerUp(x, y);
  // A wiggle can end within the decoder's tap threshold even after the
  // glide activated; the glide already edited the text, so the tap must
  // not fire a second edit on top.
  const suppressTap = glide?.active && result.committed?.type === 'function';
  glide = null;
  if (result.committed && !suppressTap) commitGesture(result.committed);
  currentSnapshot = decoder.snapshot();
  renderOutput();
  draw();
});

deadZoneEl.addEventListener('input', () => {
  deadZoneRadius = Number(deadZoneEl.value);
  decoder.deadZoneRadius = deadZoneRadius;
  draw();
});

layoutModeEl.addEventListener('change', () => {
  rebuildLayout();
  try { localStorage.setItem(LAYOUT_KEY, layoutModeEl.value); } catch {}
});
languageEl.addEventListener('change', () => {
  rebuildLayout();
  renderSuggestions();
  try { localStorage.setItem(LANG_KEY, languageEl.value); } catch {}
});

// Sector colors default to on: they are a learning aid and the page is
// in the learning phase. The off state is for testing the plain look.
const SECTOR_COLORS_KEY = 'phonekeeb.sectorColors';
try { sectorColorsEl.checked = localStorage.getItem(SECTOR_COLORS_KEY) !== '0'; } catch {}
sectorColorsEl.addEventListener('change', () => {
  try { localStorage.setItem(SECTOR_COLORS_KEY, sectorColorsEl.checked ? '1' : '0'); } catch {}
  draw();
});

clearButton.addEventListener('click', () => {
  typedText = '';
  caret = 0;
  currentWord = '';
  renderOutput();
  renderSuggestions();
});

// The hint and all controls collapse behind the settings toggle so the
// canvas keeps most of the phone screen. Toggling resizes the canvas;
// the ResizeObserver re-centers the decoder, so this is safe between
// gestures. State persists like the theme choice.
const SETTINGS_KEY = 'phonekeeb.settingsOpen';

function setSettingsOpen(open) {
  settingsEl.hidden = !open;
  settingsToggle.setAttribute('aria-expanded', String(open));
}
let settingsOpen = false;
try { settingsOpen = localStorage.getItem(SETTINGS_KEY) === '1'; } catch {}
setSettingsOpen(settingsOpen);
settingsToggle.addEventListener('click', () => {
  settingsOpen = !settingsOpen;
  setSettingsOpen(settingsOpen);
  try { localStorage.setItem(SETTINGS_KEY, settingsOpen ? '1' : '0'); } catch {}
});

themeEl.addEventListener('change', () => {
  applyTheme(themeEl.value);
  // Saving can throw in private browsing; the theme still applies.
  try { localStorage.setItem(THEME_KEY, themeEl.value); } catch {}
});

darkQuery.addEventListener('change', () => {
  colors = readColors();
  draw();
});
// ResizeObserver instead of window resize: the canvas box also changes
// when the header wraps or fonts finish loading, and a stale buffer size
// leaves the drawing stretched.
new ResizeObserver(resize).observe(canvas);
resize();
let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch {}
themeEl.value = THEMES[savedTheme] ? savedTheme : DEFAULT_THEME;
applyTheme(themeEl.value);
rebuildLayout(); // also validates the initial layout
renderOutput();
