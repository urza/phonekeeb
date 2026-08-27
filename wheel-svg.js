// The one-gesture wheel drawing, as a standalone SVG string. Shared by
// the study cards (cards.js) and the practice game's reveal panel
// (game.js), so a stroke can never be drawn two different ways on the
// two pages that teach it.
//
// The geometry mirrors the main.js proportions (dead zone ~0.24 of the
// arm length, rings between dead zone and arm tip), but the values are
// fixed to the 200x200 viewBox here, not tied to the live canvas.
//
// The caller owns the CSS. Every part carries a class (.arm, .dead,
// .wedge, .preview, .stroke, .start, .head, .maplet) plus a
// .hue-{sector} class for the landing-sector color; see cards.html.

import { FIRST_ARM, landingSector } from './layout.js';

export const SIZE = 200;
const C = SIZE / 2;
const ARM = 90; // arm length

// The frame `strokePoints` returns points in, so a caller can map them
// onto a differently sized wheel: scale by (their arm / ARM) about C.
// game.js uses this to lay the stroke over its live pad as a path to
// trace.
export const VIEW = { C, ARM };
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

// One-crossing letters are drawn as a true little circle, not the wide
// petal (user request 2026-08-25: that is how the thumb really moves).
// The circle centers on the arm the letter crosses and overlaps the
// center circle, so the visible stroke leaves the rim near the line,
// loops around past the letter, and comes back near the line on the
// other side.
const LOOP_D = 29; // circle center, along the arm from the wheel center
const LOOP_R = 12; // circle radius; reach = LOOP_D + LOOP_R = 41, just past ring 1
const LOOP_EXTRA = 16; // degrees past the rim, so the arrow dips into the center

function loopPoints(sector, direction) {
  const a = FIRST_ARM[sector][direction];
  const sign = direction === 'CW' ? 1 : -1;
  const sx = C + LOOP_D * Math.cos(rad(a));
  const sy = C + LOOP_D * Math.sin(rad(a));
  // Angle at the loop center between the inward direction and the two
  // rim intersections (triangle wheel center / loop center / rim
  // crossing). The visible arc runs from one intersection the long way
  // around, through the outer point on the arm, to the other.
  const phi = (Math.acos((LOOP_D ** 2 + LOOP_R ** 2 - DEAD ** 2) / (2 * LOOP_D * LOOP_R)) * 180) / Math.PI;
  const sweep = 360 - 2 * phi + LOOP_EXTRA;
  const n = Math.ceil(sweep / 6);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const psi = rad(a + 180 + sign * (phi + (sweep * i) / n));
    pts.push([sx + LOOP_R * Math.cos(psi), sy + LOOP_R * Math.sin(psi)]);
  }
  return pts;
}

// The stroke as sampled points: leave the center circle at the start
// sector's middle, swell to the letter's ring over the first 45 deg,
// hold the ring across every arm crossing, then sink back into the
// center over the last 45 deg. Crossing k happens at 45 + (k-1)*90 deg
// of rotation, always at ring radius, so the curve passes exactly
// through the letter's map position on its first crossing. The three
// pieces join with zero radial slope (smoothstep ends flat), so the
// sampled polyline reads as one smooth curve.
export function strokePoints(sector, direction, crossings) {
  if (crossings === 1) return loopPoints(sector, direction);
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

export function cardSvg({ letter, sector, direction, crossings }) {
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
    `<path class="stroke hue-${landing}" d="${curve}" />` +
    `<circle class="start hue-${landing}" cx="${px(sx)}" cy="${px(sy)}" r="4.5" />` +
    `<path class="head hue-${landing}" d="${arrowPath(pts)}" />` +
    // Painted last, with a panel-colored halo (cards.html), because the
    // one-crossing loop runs right past the letter's position.
    `<text class="maplet hue-${landing}" x="${px(lx)}" y="${px(ly)}" dy=".36em">${esc(letter.toUpperCase())}</text>` +
    `</svg>`;
}
