// Practice game (game.html): drills letter RECALL, which is the thing
// that is actually hard about this keyboard.
//
// Why a drill and not more study cards. Every account of learning an
// 8pen-style keyboard says the same thing: drawing a loop is easy,
// knowing WHICH loop is not. A learner who can see the map is not
// practising the hard part. So this page shows the target letter, hides
// the map, and asks for the stroke. See learnability-research.md; the
// prior art is Palm's Graffiti game, which reportedly made people
// proficient in a couple of days, and 8pen's own practice game.
//
// Three things it does that the cards cannot:
// 1. Spaced repetition, frequency-weighted, so the letters that carry
//    most text become automatic first and q/z never waste a turn.
// 2. Ring progression. Ring 1 is 8 letters and covers most typing, so
//    the pool starts there and widens as boxes fill.
// 3. Teaches the QWERTY mnemonic explicitly (qwerty-map.js), instead
//    of leaving the learner to memorize 26 unrelated facts. This is
//    the one advantage urza-layout has, and nothing else surfaces it.
//
// It also records time-to-first-answer per letter. That is an
// empirical difficulty measure, and it can later be checked against
// the predicted difficulty in qwerty-map.js: if the letters with a
// large angular error are the slow ones, the mnemonic metric is
// validated on real hands.

import { GestureDecoder } from './gesture-decoder.js';
import { SECTORS, DIRECTIONS } from './layout.js';
import { LAYOUTS, DEFAULT_LAYOUT, buildLayout, FREQUENCY } from './layouts.js';
import { SECTOR_COLORS } from './themes.js';
import { cardSvg, strokePoints, VIEW } from './wheel-svg.js';
import { QWERTY_ROWS, QWERTY_KEYS, qwertyAngle, slotAngle, fitDegrees } from './qwerty-map.js';

const $ = (id) => document.getElementById(id);
const canvas = $('pad');
const ctx = canvas.getContext('2d');

// Leitner boxes. The value is how many prompts must pass before the
// letter is due again. Box 0 is "just missed", box 5 is retired but
// still resurfaces so it cannot rot.
const DUE = [0, 2, 4, 9, 20, 45];
const MASTERED = 3; // box at which a letter stops counting as "learning"

const STORE = 'phonekeeb.game.v1';

let layout = null;
let layoutId = DEFAULT_LAYOUT;
let state = null;      // { step, level, letters: {ch: {box, seen, right, wrong, times}} }
let pool = [];         // letters currently drilled
let current = null;    // { letter, slot }
// idle | asking | revealed | tracing | traced.
// tracing/traced are the after-a-miss practice step: the correct
// stroke is laid over the pad and the learner draws along it. Doing
// the motion is what builds the memory; watching it does not. It is
// deliberately unscored, so it can be repeated as often as wanted
// without inflating the boxes.
let phase = 'idle';
let askedAt = 0;
let usedHint = false;
let answered = null;   // what the decoder committed, for the verdict line
let ghost = null;      // the stroke to trace, in canvas coordinates

// --- persistence -----------------------------------------------------
// Progress is per layout: the muscle memory for one letter map says
// nothing about another, so switching layouts must not inherit boxes.
function load() {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch {}
  return all;
}
function save() {
  const all = load();
  all[layoutId] = state;
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch {}
}
function freshState() {
  return { step: 0, level: 1, letters: {} };
}
function entry(ch) {
  if (!state.letters[ch]) state.letters[ch] = { box: 0, seen: -999, right: 0, wrong: 0, times: [] };
  return state.letters[ch];
}

// --- the pool --------------------------------------------------------
// Letters typable on this layout, ordered by English frequency so the
// scheduler can prefer the ones that carry the most text.
function allLetters() {
  const out = [];
  for (const s of SECTORS) {
    for (const d of DIRECTIONS) {
      layout[s][d].forEach((ch, i) => {
        if (ch && /^\p{L}$/u.test(ch)) out.push({ letter: ch, sector: s, direction: d, crossings: i + 1 });
      });
    }
  }
  return out;
}
const freqWeight = (ch) => {
  const r = FREQUENCY.en.indexOf(ch);
  return r < 0 ? 1 : 26 - r; // 26 for 'e' down to 1 for 'z'
};

function rebuildPool() {
  pool = allLetters().filter((c) => c.crossings <= state.level);
  pool.sort((a, b) => freqWeight(b.letter) - freqWeight(a.letter));
}

// Unlock the next ring once every letter in the pool is out of the
// learning boxes. Widening earlier just floods the learner with
// letters they cannot yet place.
function maybeUnlock() {
  if (state.level >= 4) return false;
  if (!pool.length || !pool.every((c) => entry(c.letter).box >= MASTERED)) return false;
  state.level++;
  rebuildPool();
  return true;
}

// --- scheduler -------------------------------------------------------
// Due-first, then frequency-weighted among the due. A letter that is
// not due yet can still be picked when nothing is due, so the drill
// never stalls.
function pickNext() {
  const scored = pool.map((c) => {
    const e = entry(c.letter);
    return { c, over: state.step - e.seen - DUE[e.box], w: freqWeight(c.letter) };
  });
  const due = scored.filter((s) => s.over >= 0 && s.c.letter !== current?.letter);
  const from = due.length ? due : scored.filter((s) => s.c.letter !== current?.letter);
  if (!from.length) return pool[0];
  // Weighted pick, so 'e' comes up far more than 'k' without ever
  // fully starving the rare letters.
  const total = from.reduce((t, s) => t + s.w, 0);
  let r = Math.random() * total;
  for (const s of from) { r -= s.w; if (r <= 0) return s.c; }
  return from[from.length - 1].c;
}

// --- the drawing pad -------------------------------------------------
let center = { x: 0, y: 0 };
let deadZoneRadius = 40;
let armLength = 0;
const decoder = new GestureDecoder({ center, deadZoneRadius });
let trail = [];

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  armLength = Math.min(rect.width, rect.height) * 0.44;
  // Centered, unlike the keyboard: this is a practice pad, not a
  // thumb-anchored keyboard, and both hands are welcome.
  center = { x: rect.width / 2, y: rect.height / 2 };
  deadZoneRadius = Math.max(24, armLength * 0.24);
  decoder.center = center;
  decoder.deadZoneRadius = deadZoneRadius;
  // Read by tests/game-flow.mjs, which must gesture around the real
  // wheel rather than assume the canvas middle.
  canvas.dataset.center = `${center.x},${center.y}`;
  canvas.dataset.arm = String(armLength);
  ghost = computeGhost();
  drawPad();
}

// The reveal card's stroke, mapped onto the live pad. Scaled about the
// wheel centre by (pad arm / card arm), so the path a learner traces is
// the same curve the card shows.
function computeGhost() {
  if (!current || !(phase === 'tracing' || phase === 'traced')) return null;
  const k = armLength / VIEW.ARM;
  const { sector, direction, crossings } = current.slot;
  return strokePoints(sector, direction, crossings)
    .map(([x, y]) => [center.x + (x - VIEW.C) * k, center.y + (y - VIEW.C) * k]);
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawPad() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  const line = css('--line');
  const muted = css('--muted');

  // Arms on the diagonals, matching gesture-decoder.js.
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.5;
  for (const a of [45, 135, 225, 315]) {
    const r = (a * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(center.x + deadZoneRadius * Math.cos(r), center.y + deadZoneRadius * Math.sin(r));
    ctx.lineTo(center.x + armLength * Math.cos(r), center.y + armLength * Math.sin(r));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(center.x, center.y, deadZoneRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Deliberately NO letters on the pad while asking. Showing the map
  // would turn the drill back into copying, which is the part that is
  // already easy. The ghost below appears only AFTER a miss, when the
  // answer is known anyway and the point is the motion.
  if (ghost && ghost.length > 1) {
    ctx.strokeStyle = css('--accent');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A path to follow, not a filled blob: a one-crossing loop is only
    // ~20px across on a phone, so a wide stroke swallows it whole.
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(ghost[0][0], ghost[0][1]);
    for (const [x, y] of ghost.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Start dot and arrowhead. Direction is half of what a letter is,
    // so a path without them is only half the answer.
    ctx.fillStyle = css('--accent');
    ctx.beginPath();
    ctx.arc(ghost[0][0], ghost[0][1], 5, 0, Math.PI * 2);
    ctx.fill();

    const [ax, ay] = ghost[ghost.length - 3] ?? ghost[0];
    const [bx, by] = ghost[ghost.length - 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    ctx.beginPath();
    ctx.moveTo(bx + ux * 9, by + uy * 9);
    ctx.lineTo(bx - uy * 7, by + ux * 7);
    ctx.lineTo(bx + uy * 7, by - ux * 7);
    ctx.closePath();
    ctx.fill();
  }

  if (trail.length > 1) {
    ctx.strokeStyle = css('--accent') || muted;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (const p of trail.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

const toLocal = (e) => {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

// Asking and both trace phases accept a stroke; 'traced' stays open so
// the motion can be repeated as many times as the learner wants.
const drawable = () => phase === 'asking' || phase === 'tracing' || phase === 'traced';

canvas.addEventListener('pointerdown', (e) => {
  if (!drawable()) return;
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = toLocal(e);
  trail = [{ x, y }];
  decoder.pointerDown(x, y);
  drawPad();
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawable() || !canvas.hasPointerCapture(e.pointerId)) return;
  const { x, y } = toLocal(e);
  trail.push({ x, y });
  const res = decoder.pointerMove(x, y);
  drawPad();
  // Returning to the center commits, exactly as on the keyboard. Grade
  // the first letter and stop there, so a wandering finger cannot rack
  // up extra answers.
  if (res.committed?.type === 'letter') {
    if (phase === 'asking') grade(res.committed);
    else gradeTrace(res.committed);
  }
  e.preventDefault();
});

canvas.addEventListener('pointerup', (e) => {
  if (!canvas.hasPointerCapture(e.pointerId)) return;
  const { x, y } = toLocal(e);
  const res = decoder.pointerUp(x, y);
  if (res.committed?.type === 'letter') {
    if (phase === 'asking') grade(res.committed);
    else if (drawable()) gradeTrace(res.committed);
  } else if (drawable()) {
    // A space or a stray tap is not an answer. Clear and wait.
    trail = [];
    drawPad();
  }
});

// Prevent the browser's own scroll/zoom gestures from eating the
// stroke. touch-action in the CSS covers most of it; this covers iOS.
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// --- grading ---------------------------------------------------------
// committed === null means the learner asked to be shown. That has to
// count as a miss: a letter you had to be told is not a letter you
// know, and letting it slide would inflate the boxes into meaningless.
function grade(committed) {
  const want = current.slot;
  const gotLetter = committed && (layout[committed.sector]?.[committed.direction]?.[committed.crossings - 1] ?? null);
  const exact = !!committed && !committed.capital
    && committed.sector === want.sector
    && committed.direction === want.direction
    && committed.crossings === want.crossings;

  const e = entry(current.letter);
  const ms = Date.now() - askedAt;

  if (exact && !usedHint) {
    e.box = Math.min(5, e.box + 1);
    e.right++;
    e.times.push(ms);
    if (e.times.length > 12) e.times.shift();
  } else if (exact) {
    // Right, but only after peeking. Hold the box: the letter is not
    // recalled yet, it was read.
    e.right++;
  } else {
    e.box = 0;
    e.wrong++;
  }
  e.seen = state.step;
  state.step++;

  answered = { committed, gotLetter, exact };
  phase = 'revealed';
  save();
  render();
}

// The trace step is unscored on purpose: the answer was already given
// away, so credit here would be meaningless, and the learner should be
// free to repeat the motion without consequence. It only says whether
// the stroke matched, so the practice is honest.
function gradeTrace(committed) {
  const want = current.slot;
  const ok = !committed.capital
    && committed.sector === want.sector
    && committed.direction === want.direction
    && committed.crossings === want.crossings;
  phase = ok ? 'traced' : 'tracing';
  $('promptNote').textContent = ok
    ? `that is the motion for ${current.letter} — again, or Next`
    : 'not quite, follow the highlighted path';
  if (!ok) { trail = []; drawPad(); }
}

function startTrace() {
  if (phase !== 'revealed') return;
  phase = 'tracing';
  trail = [];
  decoder.reset();
  ghost = computeGhost();
  $('feedback').className = 'feedback idle';
  $('feedback').innerHTML = '';
  $('promptNote').textContent = 'trace the highlighted path';
  $('traceBtn').hidden = true;
  drawPad();
}

// --- rendering -------------------------------------------------------
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// The mnemonic, drawn: a mini QWERTY with the target key lit, and a
// separate compass carrying both directions. The compass is kept OUT
// of the keyboard because rays drawn across the keys strike through
// them and read as crossing letters out rather than pointing.
//
// Solid ray = the letter's direction from the QWERTY centre. Dashed
// ray = the direction its stroke leaves the wheel centre. When the two
// nearly agree, the learner can guess the letter instead of recalling
// it, which is the whole advantage urza-layout has.
function qwertyHintSvg(letter, slot) {
  const qa = qwertyAngle(letter);
  if (qa === null) return '';
  const sa = slotAngle(slot.sector, slot.direction);
  const off = fitDegrees(letter, slot.sector, slot.direction);
  const KW = 16, KH = 19, COLP = 17.5, ROWP = 21;
  const kx0 = 4, ky0 = 12;
  const ccx = 216, ccy = 43, cr = 30; // compass
  let keys = '';
  for (const row of QWERTY_ROWS) {
    for (const ch of row) {
      const [gx, gy] = QWERTY_KEYS[ch];
      const x = kx0 + gx * COLP;
      const y = ky0 + gy * ROWP;
      const on = ch === letter;
      keys += `<rect class="key${on ? ' on' : ''}" x="${x.toFixed(1)}" y="${y}" width="${KW}" height="${KH}" rx="3" />` +
        `<text class="keyt${on ? ' on' : ''}" x="${(x + KW / 2).toFixed(1)}" y="${y + KH / 2}" dy=".35em">${ch}</text>`;
    }
  }
  const ray = (a, cls) => {
    const r = (a * Math.PI) / 180;
    return `<line class="${cls}" x1="${ccx}" y1="${ccy}" ` +
      `x2="${(ccx + (cr - 3) * Math.cos(r)).toFixed(1)}" y2="${(ccy + (cr - 3) * Math.sin(r)).toFixed(1)}" />`;
  };
  return `<svg viewBox="0 0 252 88" class="qhint" ` +
    `aria-label="${letter} on QWERTY, ${Math.round(off)} degrees from its wheel stroke direction">` +
    keys +
    `<circle class="qring" cx="${ccx}" cy="${ccy}" r="${cr}" />` +
    ray(qa, 'ray q') + ray(sa, 'ray s') +
    `<circle class="qc" cx="${ccx}" cy="${ccy}" r="2.5" />` +
    `</svg>` +
    `<p class="qcap"><b class="q">${letter}</b> sits ${dirWord(qa)} of the QWERTY centre. ` +
    `<b class="s">Its stroke</b> starts ${dirWord(sa)}. ` +
    (off <= 45
      ? `Same direction, ${Math.round(off)}° apart, so you can guess this one.`
      : `These disagree by ${Math.round(off)}°, so this one needs rote memory.`) +
    `</p>`;
}

function dirWord(angle) {
  const names = ['right', 'lower right', 'below', 'lower left', 'left', 'upper left', 'above', 'upper right'];
  return names[Math.round(((angle % 360) + 360) % 360 / 45) % 8];
}

function render() {
  const learning = pool.filter((c) => entry(c.letter).box < MASTERED).length;
  $('level').textContent = `Ring ${state.level}`;
  $('poolCount').textContent = `${pool.length - learning}/${pool.length} solid`;
  $('step').textContent = `${state.step} drawn`;

  const box = $('feedback');
  if (phase === 'asking') {
    $('prompt').textContent = current.letter;
    $('promptNote').textContent = usedHint ? 'shown, draw it anyway' : 'draw this letter';
    box.className = 'feedback idle';
    box.innerHTML = '';
    $('hintBtn').disabled = false;
    $('showBtn').disabled = false;
    $('nextBtn').hidden = true;
    $('traceBtn').hidden = true;
  } else if (phase === 'revealed') {
    const { committed, gotLetter, exact } = answered;
    $('promptNote').textContent = '';
    box.className = `feedback ${exact ? 'ok' : committed ? 'bad' : 'hint'}`;
    const e = entry(current.letter);
    const med = median(e.times);
    let verdict;
    if (!committed) verdict = `Shown. <b>${current.letter}</b> goes back to the start of the pile.`;
    else if (exact && usedHint) verdict = `Right, after the hint. <b>${current.letter}</b> stays in the pile.`;
    else if (exact) verdict = `Right. <b>${current.letter}</b> is now box ${e.box} of 5.`;
    else if (committed.capital) verdict = `That was a capital <b>${gotLetter ?? '?'}</b>: one full loop too many.`;
    else if (gotLetter) verdict = `That typed <b>${gotLetter}</b>, not <b>${current.letter}</b>.`;
    else verdict = `That landed on an empty slot.`;
    box.innerHTML =
      `<p class="verdict">${verdict}</p>` +
      `<div class="reveal">${cardSvg({ letter: current.letter, ...current.slot })}</div>` +
      `<p class="spec">${current.slot.sector} · ${current.slot.direction} · ` +
      `${current.slot.crossings} ${current.slot.crossings === 1 ? 'line' : 'lines'}` +
      (med !== null ? ` · your median ${(med / 1000).toFixed(1)}s` : '') + `</p>` +
      qwertyHintSvg(current.letter, current.slot);
    $('hintBtn').disabled = true;
    $('showBtn').disabled = true;
    $('nextBtn').hidden = false;
    // Offered only after a miss. A learner who drew it right has
    // already made the motion, so tracing would just be busywork.
    $('traceBtn').hidden = exact;
    $('nextBtn').focus({ preventScroll: true });
  }
  renderStats();
}

function renderStats() {
  const rows = allLetters()
    .filter((c) => c.crossings <= state.level)
    .sort((a, b) => freqWeight(b.letter) - freqWeight(a.letter))
    .map((c) => {
      const e = entry(c.letter);
      const med = median(e.times);
      // A letter never attempted is "new", not "failed". Box 0 means
      // both, so untouched letters need their own class or the strip
      // opens as a wall of red on a fresh install.
      const cls = e.right + e.wrong === 0 ? 'bnew' : `b${e.box}`;
      return `<li class="${cls}" title="box ${e.box}, ${e.right} right, ${e.wrong} wrong">` +
        `<b>${c.letter}</b><span>${med === null ? '–' : (med / 1000).toFixed(1) + 's'}</span></li>`;
    }).join('');
  $('stats').innerHTML = rows;
}

// --- turn control ----------------------------------------------------
function ask() {
  current = pickNext();
  if (!current) return;
  current = { letter: current.letter, slot: { sector: current.sector, direction: current.direction, crossings: current.crossings } };
  usedHint = false;
  answered = null;
  askedAt = Date.now();
  phase = 'asking';
  trail = [];
  ghost = null;
  decoder.reset();
  drawPad();
  render();
}

function next() {
  const unlocked = maybeUnlock();
  ask();
  if (unlocked) {
    $('promptNote').textContent = `Ring ${state.level} unlocked`;
  }
}

$('nextBtn').addEventListener('click', next);
$('hintBtn').addEventListener('click', () => {
  if (phase !== 'asking') return;
  usedHint = true;
  const box = $('feedback');
  box.className = 'feedback hint';
  box.innerHTML = qwertyHintSvg(current.letter, current.slot);
  $('hintBtn').disabled = true;
  $('promptNote').textContent = 'shown, draw it anyway';
});
$('traceBtn').addEventListener('click', startTrace);
$('showBtn').addEventListener('click', () => {
  if (phase === 'asking') grade(null);
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Clear all progress for this layout?')) return;
  state = freshState();
  rebuildPool();
  save();
  ask();
});

// --- boot ------------------------------------------------------------
const layoutEl = $('layoutMode');
for (const [id, def] of Object.entries(LAYOUTS)) layoutEl.add(new Option(def.label, id));

// Start from the keyboard page's saved choice, like cards.js, so the
// drill matches what the user actually types on. Read-only: changing it
// here must not reconfigure the keyboard.
let saved = null;
try { saved = localStorage.getItem('phonekeeb.layout'); } catch {}
layoutEl.value = saved && LAYOUTS[saved] ? saved : DEFAULT_LAYOUT;

function selectLayout() {
  layoutId = layoutEl.value;
  layout = buildLayout(layoutId);
  state = load()[layoutId] ?? freshState();
  rebuildPool();
  ask();
}
layoutEl.addEventListener('change', selectLayout);

// Sector hues generated from themes.js, as on the cards page, so the
// reveal card can never drift from the main canvas colors.
const hueCss = (scheme) => SECTORS.map((s) => `.hue-${s} { color: ${SECTOR_COLORS[scheme][s]}; }`).join('\n');
const style = document.createElement('style');
style.textContent = `${hueCss('light')}\n@media (prefers-color-scheme: dark) {\n${hueCss('dark')}\n}`;
document.head.appendChild(style);

window.addEventListener('resize', resize);
selectLayout();
resize();
