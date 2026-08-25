// Letter study cards (cards.html): one card per filled slot. Each card
// draws the wheel with only that card's letter on it, plus the whole
// gesture as one curve, so a learner reads one stroke at a time
// instead of the full 32-slot map.
//
// The wheel geometry mirrors the main.js proportions (dead zone ~0.24
// of the arm length, rings between dead zone and arm tip), but the
// values here are fixed to the 200x200 card viewBox, not tied to the
// live canvas.

import { SECTORS, DIRECTIONS, FIRST_ARM, landingSector } from './layout.js';
import { LAYOUTS, DEFAULT_LAYOUT, buildLayout } from './layouts.js';
import { SECTOR_COLORS } from './themes.js';

const SIZE = 200;
const C = SIZE / 2;
const ARM = 90; // arm length
const DEAD = 22; // center circle radius
const R_INNER = DEAD + 13; // ring 1 = 1 crossing
const R_STEP = (ARM - R_INNER - 6) / 3; // rings 2..4
const NUDGE = 13; // letters sit this many degrees off their arm, as in main.js
const END_R = DEAD - 4; // the stroke ends just inside the center circle

// Same screen-angle convention as main.js: y grows downward, so 90
// points down and 270 points up. CW on screen = increasing angle.
const SECTOR_MID = { E: 0, S: 90, W: 180, N: 270 };

const ringRadius = (crossings) => R_INNER + (crossings - 1) * R_STEP;
const rad = (deg) => (deg * Math.PI) / 180;
const px = (n) => Math.round(n * 10) / 10;
const at = (angleDeg, r) => [C + r * Math.cos(rad(angleDeg)), C + r * Math.sin(rad(angleDeg))];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const ease = (t) => t * t * (3 - 2 * t); // smoothstep: zero slope at both ends

// The stroke as sampled points: leave the center circle at the start
// sector's middle, swell to the letter's ring over the first 45 deg,
// hold the ring across every arm crossing, then sink back into the
// center over the last 45 deg. Crossing k happens at 45 + (k-1)*90 deg
// of rotation, always at ring radius, so the curve passes exactly
// through the letter's map position on its first crossing. The three
// pieces join with zero radial slope (smoothstep ends flat), so the
// sampled polyline reads as one smooth curve.
function strokePoints(sector, direction, crossings) {
  const ring = ringRadius(crossings);
  const sign = direction === 'CW' ? 1 : -1;
  const span = crossings * 90;
  const pts = [];
  for (let t = 0; t <= span; t += 3) {
    let r;
    if (t < 45) r = DEAD + (ring - DEAD) * ease(t / 45);
    else if (t <= span - 45) r = ring;
    else r = END_R + (ring - END_R) * ease((span - t) / 45);
    pts.push(at(SECTOR_MID[sector] + sign * t, r));
  }
  return pts;
}

// Arrowhead at the stroke end, pointing the way the finger travels
// into the center. Built by hand from the last segment's direction:
// an SVG <marker> cannot take the per-card hue without one defs block
// per color (context-stroke is not safe on iOS Safari yet).
function arrowPath(pts) {
  const [x0, y0] = pts[pts.length - 3];
  const [x1, y1] = pts[pts.length - 1];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const tip = [x1 + ux * 5, y1 + uy * 5];
  const left = [x1 - uy * 4.5, y1 + ux * 4.5];
  const right = [x1 + uy * 4.5, y1 - ux * 4.5];
  return `M${px(tip[0])} ${px(tip[1])} L${px(left[0])} ${px(left[1])} L${px(right[0])} ${px(right[1])} Z`;
}

// Faint tint over the landing sector, the same learning hue the main
// canvas uses: the stroke comes back to the center from this region.
function wedgePath(landing) {
  const [ox0, oy0] = at(SECTOR_MID[landing] - 45, ARM);
  const [ox1, oy1] = at(SECTOR_MID[landing] + 45, ARM);
  const [ix0, iy0] = at(SECTOR_MID[landing] - 45, DEAD);
  const [ix1, iy1] = at(SECTOR_MID[landing] + 45, DEAD);
  return `M${px(ox0)} ${px(oy0)} A${ARM} ${ARM} 0 0 1 ${px(ox1)} ${px(oy1)} ` +
    `L${px(ix1)} ${px(iy1)} A${DEAD} ${DEAD} 0 0 0 ${px(ix0)} ${px(iy0)} Z`;
}

function cardSvg({ letter, sector, direction, crossings }) {
  const landing = landingSector(sector, direction, crossings);
  const pts = strokePoints(sector, direction, crossings);
  const curve = 'M' + pts.map(([x, y]) => `${px(x)} ${px(y)}`).join(' L');
  const arms = [45, 135, 225, 315].map((a) => {
    const [x0, y0] = at(a, DEAD);
    const [x1, y1] = at(a, ARM);
    return `<line class="arm" x1="${px(x0)}" y1="${px(y0)}" x2="${px(x1)}" y2="${px(y1)}" />`;
  }).join('');
  // The letter at its true map position: first arm crossed, nudged
  // toward the start sector, radius = its ring. The center shows the
  // result, where the keyboard page shows the live preview.
  const nudge = direction === 'CW' ? -NUDGE : NUDGE;
  const [lx, ly] = at(FIRST_ARM[sector][direction] + nudge, ringRadius(crossings));
  const [sx, sy] = pts[0];
  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${esc(letter)}: ${sector} ${direction}, ${crossings}">` +
    `<path class="wedge hue-${landing}" d="${wedgePath(landing)}" />` +
    arms +
    `<circle class="dead" cx="${C}" cy="${C}" r="${DEAD}" />` +
    `<text class="preview" x="${C}" y="${C}" dy=".36em">${esc(letter)}</text>` +
    `<text class="maplet hue-${landing}" x="${px(lx)}" y="${px(ly)}" dy=".36em">${esc(letter.toUpperCase())}</text>` +
    `<path class="stroke hue-${landing}" d="${curve}" />` +
    `<circle class="start hue-${landing}" cx="${px(sx)}" cy="${px(sy)}" r="4.5" />` +
    `<path class="head hue-${landing}" d="${arrowPath(pts)}" />` +
    `</svg>`;
}

function deck(layout) {
  const cards = [];
  for (const sector of SECTORS) {
    for (const direction of DIRECTIONS) {
      layout[sector][direction].forEach((letter, i) => {
        if (letter) cards.push({ letter, sector, direction, crossings: i + 1 });
      });
    }
  }
  const isLetter = (ch) => /\p{L}/u.test(ch);
  cards.sort((a, b) =>
    isLetter(a.letter) !== isLetter(b.letter)
      ? (isLetter(a.letter) ? -1 : 1)
      : a.letter.localeCompare(b.letter));
  return cards;
}

const layoutEl = document.getElementById('layoutMode');
const languageEl = document.getElementById('language');
const gridEl = document.getElementById('cards');

function render() {
  const layout = buildLayout(layoutEl.value, languageEl.value);
  gridEl.innerHTML = deck(layout).map((card) => `
    <figure class="card">
      ${cardSvg(card)}
      <figcaption><b>${esc(card.letter)}</b><span>${card.sector} · ${card.direction} · ${card.crossings} ${card.crossings === 1 ? 'line' : 'lines'}</span></figcaption>
    </figure>`).join('');
  // Static layouts ignore the language, exactly as on the keyboard page.
  languageEl.disabled = !!LAYOUTS[layoutEl.value].static;
}

for (const [id, def] of Object.entries(LAYOUTS)) layoutEl.add(new Option(def.label, id));

// Start from the keyboard page's saved choices so the deck matches
// what the user practices. Read-only: changing a dropdown here must
// not reconfigure the keyboard.
let savedLayout = null;
let savedLanguage = null;
try { savedLayout = localStorage.getItem('phonekeeb.layout'); } catch {}
try { savedLanguage = localStorage.getItem('phonekeeb.language'); } catch {}
layoutEl.value = savedLayout && LAYOUTS[savedLayout] ? savedLayout : DEFAULT_LAYOUT;
if (savedLanguage === 'en' || savedLanguage === 'cs') languageEl.value = savedLanguage;
layoutEl.addEventListener('change', render);
languageEl.addEventListener('change', render);

// Sector hues as CSS rules generated from themes.js, so the card
// colors can never drift from the main canvas. The SVG parts pick
// them up through currentColor (see cards.html).
const hueCss = (scheme) => SECTORS.map((s) => `.hue-${s} { color: ${SECTOR_COLORS[scheme][s]}; }`).join('\n');
const style = document.createElement('style');
style.textContent = `${hueCss('light')}\n@media (prefers-color-scheme: dark) {\n${hueCss('dark')}\n}`;
document.head.appendChild(style);

render();
