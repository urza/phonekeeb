import { GestureDecoder } from './gesture-decoder.js';
import { letterAt, validateLayout, SECTORS, DIRECTIONS, FIRST_ARM } from './layout.js';
import { LAYOUTS, buildLayout, DEFAULT_LAYOUT } from './layouts.js';
import { Predictor } from './prediction.js';
import { WORDS as WORDS_EN } from './words-en.js';
import { WORDS as WORDS_CS } from './words-cs.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const output = document.getElementById('output');
const logEl = document.getElementById('log');
const suggestionsEl = document.getElementById('suggestions');
const layoutModeEl = document.getElementById('layoutMode');
const languageEl = document.getElementById('language');
const deadZoneEl = document.getElementById('deadZone');
const clearButton = document.getElementById('clearText');

const predictors = { en: new Predictor(WORDS_EN), cs: new Predictor(WORDS_CS) };

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function palette() {
  return darkQuery.matches
    ? { line: '#444', letter: '#ddd', muted: '#777', path: '#60a5fa', pathCenter: '#4ade80', hud: '#ccc' }
    : { line: '#ccc', letter: '#222', muted: '#999', path: '#2563eb', pathCenter: '#16a34a', hud: '#111' };
}

// The layout dropdown is generated from the registry, so adding a
// layout means editing layouts.js only.
for (const [id, def] of Object.entries(LAYOUTS)) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = def.label;
  layoutModeEl.appendChild(option);
}
layoutModeEl.value = DEFAULT_LAYOUT;

let center = { x: 0, y: 0 };
let deadZoneRadius = Number(deadZoneEl.value);
let layout = buildLayout(layoutModeEl.value, languageEl.value);
let decoder = new GestureDecoder({ center, deadZoneRadius });
let typedText = '';
let currentWord = ''; // letters since the last space or accepted suggestion
let shiftNext = false; // one-shot shift armed by a NW function tap
let currentSnapshot = decoder.snapshot();
const history = [];

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

// Function taps: a stationary press-and-release in a sector. Same
// assignment as the 8VIM successor project: right deletes, bottom is
// enter, top arms a one-shot shift (the capital loop still works too),
// left is reserved for a future number/symbol layer.
const FUNCTION_KEYS = { E: 'backspace', S: 'enter', N: 'shift', W: null };
const FUNCTION_GLYPHS = { E: '⌫', S: '⏎', N: '⇧' };

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

function commitGesture(commit) {
  if (!commit) return;
  if (commit.type === 'space') {
    typedText += ' ';
    currentWord = '';
    history.unshift(commit);
  } else if (commit.type === 'function') {
    applyFunction(commit.sector);
  } else {
    let letter = letterAt(layout, commit.sector, commit.direction, commit.crossings);
    // Slots can hold punctuation (the original 8pen layout does). A
    // punctuation mark ends the word for prediction, and an armed shift
    // waits for an actual letter instead of being wasted on it.
    const isLetter = letter ? /\p{L}/u.test(letter) : false;
    if (isLetter && (commit.capital || shiftNext)) {
      letter = letter.toUpperCase();
      shiftNext = false;
    }
    if (letter) {
      typedText += letter;
      currentWord = isLetter ? currentWord + letter : '';
    }
    history.unshift({ ...commit, letter });
  }
  history.length = Math.min(history.length, 15);
  renderLog();
  renderSuggestions();
}

function applyFunction(sector) {
  const fn = FUNCTION_KEYS[sector];
  if (fn === 'backspace') {
    typedText = typedText.slice(0, -1);
    // The word being typed may have shrunk, or a deleted space may have
    // rejoined us to the previous word.
    currentWord = typedText.match(/[^\s]*$/)[0];
  } else if (fn === 'enter') {
    typedText += '\n';
    currentWord = '';
  } else if (fn === 'shift') {
    shiftNext = !shiftNext;
  } else {
    return; // unassigned sector, no history entry
  }
  history.unshift({ type: 'function', fn });
}

function renderSuggestions() {
  const words = predictors[languageEl.value].predict(currentWord, 5);
  suggestionsEl.innerHTML = words
    .map((w) => `<button type="button" data-word="${w}">${w}</button>`)
    .join('');
}

suggestionsEl.addEventListener('click', (e) => {
  const word = e.target.dataset?.word;
  if (!word) return;
  // Replace the partial word with the suggestion, then a space.
  typedText = typedText.slice(0, typedText.length - currentWord.length) + word + ' ';
  currentWord = '';
  renderSuggestions();
  output.textContent = typedText;
});

function renderLog() {
  logEl.innerHTML = history
    .map((h) => {
      if (h.type === 'space') return `<div class="log-row"><b>&middot;</b> <span>space (${h.via})</span></div>`;
      if (h.type === 'function') return `<div class="log-row"><b>&#9670;</b> <span>${h.fn} (tap)</span></div>`;
      const letter = h.letter ?? '?';
      const cap = h.capital ? ' capital' : '';
      return `<div class="log-row"><b>${letter}</b> <span>${h.sector} ${h.direction} lines:${h.crossings}${cap}</span></div>`;
    })
    .join('');
}

// Display string a commit would type, with its real case: lowercase
// normally, uppercase when the capital loop is in effect. The static map
// draws uppercase for looks; the live preview must not lie about case.
function letterOf(commit) {
  if (!commit) return null;
  const l = letterAt(layout, commit.sector, commit.direction, commit.crossings);
  if (!l) return null;
  return commit.capital || shiftNext ? l.toUpperCase() : l;
}

const SECTOR_MID = { E: 0, S: 90, W: 180, N: 270 };

function draw() {
  const rect = canvas.getBoundingClientRect();
  const colors = palette();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const armLength = Math.min(rect.width, rect.height) * 0.44;
  const pv = currentSnapshot.preview;

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
  ctx.globalAlpha = pv ? 0.3 : 1;
  const rInner = deadZoneRadius + 24;
  const rStep = (armLength - rInner - 10) / 3;
  for (const sector of SECTORS) {
    for (const direction of DIRECTIONS) {
      const armAngle = FIRST_ARM[sector][direction];
      // Nudge letters off the line toward the start sector. For a CW
      // slot the sector sits on the smaller-angle side of its arm; for
      // CCW the larger-angle side.
      const nudge = direction === 'CW' ? -13 : 13;
      const rad = ((armAngle + nudge) * Math.PI) / 180;
      layout[sector][direction].forEach((letter, i) => {
        if (!letter) return;
        const r = rInner + i * rStep;
        // Emphasize cheap letters: biggest at 1 crossing.
        ctx.font = `${20 - i * 2}px sans-serif`;
        ctx.fillStyle = i === 0 ? colors.letter : colors.muted;
        ctx.fillText(letter.toUpperCase(), center.x + r * Math.cos(rad), center.y + r * Math.sin(rad));
      });
    }
  }

  // Faint sector names at the edges, for talking about the layout and
  // matching the log lines (e.g. "S CCW lines:1").
  ctx.font = '10px sans-serif';
  ctx.fillStyle = colors.line;
  const cornerR = armLength * 0.92;
  for (const sector of SECTORS) {
    const rad = (SECTOR_MID[sector] * Math.PI) / 180;
    ctx.fillText(sector, center.x + cornerR * Math.cos(rad), center.y + cornerR * Math.sin(rad));
  }

  // Function tap hints: a stationary tap in a sector triggers these.
  ctx.font = '15px sans-serif';
  const fnR = armLength * 0.78;
  for (const [sector, glyph] of Object.entries(FUNCTION_GLYPHS)) {
    const rad = (SECTOR_MID[sector] * Math.PI) / 180;
    // Only the shift glyph brightens while armed; the rest stay muted.
    ctx.fillStyle = sector === 'N' && shiftNext ? colors.letter : colors.muted;
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
  // gliding there (then returning to center) would type.
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
        ctx.fillStyle = colors.letter;
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
        ctx.fillStyle = colors.letter;
        ctx.fillText(letter, ox, oy);
      }
    } else {
      // Both options, as big as the neighbors' letters, each placed
      // toward the side the finger would travel through to reach it:
      // the clockwise option sits on the clockwise-arrival side. Screen
      // angles grow clockwise (y axis points down), so that is the
      // lower-angle side of the opposite sector.
      const oppMid = SECTOR_MID[opp.sector];
      const posAt = (deg) => {
        const rad = (deg * Math.PI) / 180;
        return [center.x + bigR * Math.cos(rad), center.y + bigR * Math.sin(rad)];
      };
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = colors.letter;
      const cwLetter = letterOf(opp.cw);
      const ccwLetter = letterOf(opp.ccw);
      if (cwLetter) ctx.fillText(cwLetter, ...posAt(oppMid - 22));
      if (ccwLetter) ctx.fillText(ccwLetter, ...posAt(oppMid + 22));
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
    ctx.fillStyle = colors.letter;
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
  const hud = `state:${currentSnapshot.state}  sector:${currentSnapshot.sector ?? '-'}  dir:${currentSnapshot.direction ?? '-'}  lines:${currentSnapshot.crossings ?? 0}${shiftNext ? '  SHIFT' : ''}`;
  ctx.fillText(hud, 10, 16);
}

function handleResult(result, point) {
  currentSnapshot = result;
  if (point) pushTrail(point.x, point.y);
  if (result.committed) commitGesture(result.committed);
  output.textContent = typedText || '(draw from the center)';
  draw();
}

canvas.style.touchAction = 'none';

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = toLocalPoint(e);
  handleResult(decoder.pointerDown(x, y), { x, y });
});

canvas.addEventListener('pointermove', (e) => {
  if (!canvas.hasPointerCapture(e.pointerId)) return;
  const { x, y } = toLocalPoint(e);
  handleResult(decoder.pointerMove(x, y), { x, y });
});

canvas.addEventListener('pointerup', (e) => {
  const { x, y } = toLocalPoint(e);
  const result = decoder.pointerUp(x, y);
  if (result.committed) commitGesture(result.committed);
  currentSnapshot = decoder.snapshot();
  output.textContent = typedText || '(draw from the center)';
  draw();
});

deadZoneEl.addEventListener('input', () => {
  deadZoneRadius = Number(deadZoneEl.value);
  decoder.deadZoneRadius = deadZoneRadius;
  draw();
});

layoutModeEl.addEventListener('change', rebuildLayout);
languageEl.addEventListener('change', () => {
  rebuildLayout();
  renderSuggestions();
});

clearButton.addEventListener('click', () => {
  typedText = '';
  currentWord = '';
  shiftNext = false;
  history.length = 0;
  output.textContent = '(draw from the center)';
  renderLog();
  renderSuggestions();
});

darkQuery.addEventListener('change', draw);
// ResizeObserver instead of window resize: the canvas box also changes
// when the header wraps or fonts finish loading, and a stale buffer size
// leaves the drawing stretched.
new ResizeObserver(resize).observe(canvas);
resize();
rebuildLayout(); // also validates the initial layout
output.textContent = '(draw from the center)';
