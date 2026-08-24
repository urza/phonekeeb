import { GestureDecoder } from './gesture-decoder.js';
import { buildLayout, letterAt, QUADRANTS, DIRECTIONS, FIRST_ARM } from './layout.js';
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

let center = { x: 0, y: 0 };
let deadZoneRadius = Number(deadZoneEl.value);
let layout = buildLayout(layoutModeEl.value, languageEl.value);
let decoder = new GestureDecoder({ center, deadZoneRadius });
let typedText = '';
let currentWord = ''; // letters since the last space or accepted suggestion
let currentSnapshot = decoder.snapshot();
const history = [];

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
    history.unshift({ type: 'space' });
  } else {
    let letter = letterAt(layout, commit.quadrant, commit.direction, commit.crossings);
    if (letter && commit.capital) letter = letter.toUpperCase();
    if (letter) {
      typedText += letter;
      currentWord += letter;
    }
    history.unshift({ ...commit, letter });
  }
  history.length = Math.min(history.length, 15);
  renderLog();
  renderSuggestions();
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
      if (h.type === 'space') return `<div class="log-row"><b>&middot;</b> <span>space (center tap)</span></div>`;
      const letter = h.letter ?? '?';
      const cap = h.capital ? ' capital' : '';
      return `<div class="log-row"><b>${letter}</b> <span>${h.quadrant} ${h.direction} lines:${h.crossings}${cap}</span></div>`;
    })
    .join('');
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  const colors = palette();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const armLength = Math.min(rect.width, rect.height) * 0.44;

  // The four boundary arms, drawn from the dead zone edge outward.
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1.5;
  for (const armAngle of [0, 90, 180, 270]) {
    const rad = (armAngle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(center.x + deadZoneRadius * Math.cos(rad), center.y + deadZoneRadius * Math.sin(rad));
    ctx.lineTo(center.x + armLength * Math.cos(rad), center.y + armLength * Math.sin(rad));
    ctx.stroke();
  }

  // Letters along each arm, on the side facing their start quadrant, the
  // way 8pen displayed its alphabet: radial position = how many lines to
  // cross. Innermost letter = 1 crossing = cheapest gesture.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rInner = deadZoneRadius + 24;
  const rStep = (armLength - rInner - 10) / 3;
  for (const quadrant of QUADRANTS) {
    for (const direction of DIRECTIONS) {
      const armAngle = FIRST_ARM[quadrant][direction];
      // Nudge letters off the line toward the start quadrant. For a CW
      // slot the quadrant sits on the smaller-angle side of its arm; for
      // CCW the larger-angle side.
      const nudge = direction === 'CW' ? -13 : 13;
      const rad = ((armAngle + nudge) * Math.PI) / 180;
      layout[quadrant][direction].forEach((letter, i) => {
        if (!letter) return;
        const r = rInner + i * rStep;
        // Emphasize cheap letters: biggest at 1 crossing.
        ctx.font = `${20 - i * 2}px sans-serif`;
        ctx.fillStyle = i === 0 ? colors.letter : colors.muted;
        ctx.fillText(letter.toUpperCase(), center.x + r * Math.cos(rad), center.y + r * Math.sin(rad));
      });
    }
  }

  // Faint quadrant names in the outer corners, for talking about the
  // layout and matching the log lines (e.g. "SE CCW lines:1").
  ctx.font = '10px sans-serif';
  ctx.fillStyle = colors.line;
  const cornerR = armLength * 0.92;
  const quadrantMid = { SE: 45, SW: 135, NW: 225, NE: 315 };
  for (const quadrant of QUADRANTS) {
    const rad = (quadrantMid[quadrant] * Math.PI) / 180;
    ctx.fillText(quadrant, center.x + cornerR * Math.cos(rad), center.y + cornerR * Math.sin(rad));
  }

  // Dead zone / spacebar circle.
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, deadZoneRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = colors.muted;
  ctx.font = '10px sans-serif';
  ctx.fillText('space', center.x, center.y);

  // Live finger path.
  if (currentSnapshot.path && currentSnapshot.path.length > 1) {
    ctx.strokeStyle = currentSnapshot.state === 'active' ? colors.path : colors.pathCenter;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    currentSnapshot.path.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  // HUD.
  ctx.fillStyle = colors.hud;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  const hud = `state:${currentSnapshot.state}  quadrant:${currentSnapshot.quadrant ?? '-'}  dir:${currentSnapshot.direction ?? '-'}  lines:${currentSnapshot.crossings ?? 0}`;
  ctx.fillText(hud, 10, 16);
}

function handleResult(result) {
  currentSnapshot = result;
  if (result.committed) commitGesture(result.committed);
  output.textContent = typedText || '(draw from the center)';
  draw();
}

canvas.style.touchAction = 'none';

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = toLocalPoint(e);
  handleResult(decoder.pointerDown(x, y));
});

canvas.addEventListener('pointermove', (e) => {
  if (!canvas.hasPointerCapture(e.pointerId)) return;
  const { x, y } = toLocalPoint(e);
  handleResult(decoder.pointerMove(x, y));
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
output.textContent = '(draw from the center)';
