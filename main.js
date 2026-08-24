import { GestureDecoder } from './gesture-decoder.js';
import { buildLayout, letterAt, QUADRANTS } from './layout.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const output = document.getElementById('output');
const logEl = document.getElementById('log');
const layoutModeEl = document.getElementById('layoutMode');
const languageEl = document.getElementById('language');
const deadZoneEl = document.getElementById('deadZone');
const clearButton = document.getElementById('clearText');

let center = { x: 0, y: 0 };
let deadZoneRadius = Number(deadZoneEl.value);
let layout = buildLayout(layoutModeEl.value, languageEl.value);
let decoder = new GestureDecoder({ center, deadZoneRadius });
let typedText = '';
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
    history.unshift({ type: 'space' });
  } else {
    const letter = letterAt(layout, commit.quadrant, commit.direction, commit.depth);
    if (letter) typedText += letter;
    history.unshift({ ...commit, letter });
  }
  history.length = Math.min(history.length, 15);
  renderLog();
}

function renderLog() {
  logEl.innerHTML = history
    .map((h) => {
      if (h.type === 'space') return `<div class="log-row"><b>&middot;</b> <span>space (center tap)</span></div>`;
      const letter = h.letter ?? '?';
      return `<div class="log-row"><b>${letter}</b> <span>${h.quadrant} ${h.direction} depth:${h.depth}</span></div>`;
    })
    .join('');
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const radius = Math.min(rect.width, rect.height) * 0.4;

  // Quadrant divider cross.
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(center.x - radius, center.y);
  ctx.lineTo(center.x + radius, center.y);
  ctx.moveTo(center.x, center.y - radius);
  ctx.lineTo(center.x, center.y + radius);
  ctx.stroke();

  // Quadrant labels: depth-0-first letter order for each rotation
  // direction, so the shallowest (most reachable) letters read first.
  ctx.fillStyle = '#888';
  ctx.textAlign = 'center';
  const labelOffsets = {
    NW: { x: -radius * 0.6, y: -radius * 0.6 },
    NE: { x: radius * 0.6, y: -radius * 0.6 },
    SW: { x: -radius * 0.6, y: radius * 0.6 },
    SE: { x: radius * 0.6, y: radius * 0.6 },
  };
  for (const quadrant of QUADRANTS) {
    const { x, y } = labelOffsets[quadrant];
    const cw = layout[quadrant].CW.filter(Boolean).join(' ').toUpperCase();
    const ccw = layout[quadrant].CCW.filter(Boolean).join(' ').toUpperCase();
    ctx.font = '14px sans-serif';
    ctx.fillText(quadrant, center.x + x, center.y + y - 14);
    ctx.font = '11px sans-serif';
    ctx.fillText(`cw  ${cw}`, center.x + x, center.y + y + 2);
    ctx.fillText(`ccw ${ccw}`, center.x + x, center.y + y + 15);
  }

  // Dead zone / spacebar circle.
  ctx.strokeStyle = '#999';
  ctx.beginPath();
  ctx.arc(center.x, center.y, deadZoneRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#bbb';
  ctx.font = '10px sans-serif';
  ctx.fillText('space', center.x, center.y + 3);

  // Live finger path.
  if (currentSnapshot.path && currentSnapshot.path.length > 1) {
    ctx.strokeStyle = currentSnapshot.state === 'active' ? '#2563eb' : '#16a34a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    currentSnapshot.path.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  // HUD.
  ctx.fillStyle = '#111';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  const hud = `state:${currentSnapshot.state}  quadrant:${currentSnapshot.quadrant ?? '-'}  dir:${currentSnapshot.direction ?? '-'}  depth:${currentSnapshot.depth ?? '-'}`;
  ctx.fillText(hud, 12, rect.height - 12);
}

function handleResult(result) {
  currentSnapshot = result;
  if (result.committed) commitGesture(result.committed);
  output.textContent = typedText || '(start a gesture from the center)';
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
  output.textContent = typedText || '(start a gesture from the center)';
  draw();
});

deadZoneEl.addEventListener('input', () => {
  deadZoneRadius = Number(deadZoneEl.value);
  decoder.deadZoneRadius = deadZoneRadius;
  draw();
});

layoutModeEl.addEventListener('change', rebuildLayout);
languageEl.addEventListener('change', rebuildLayout);

clearButton.addEventListener('click', () => {
  typedText = '';
  history.length = 0;
  output.textContent = '(start a gesture from the center)';
  renderLog();
});

window.addEventListener('resize', resize);
resize();
output.textContent = '(start a gesture from the center)';
