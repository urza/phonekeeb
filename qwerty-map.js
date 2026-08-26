// The QWERTY mnemonic: where a letter sits on a phone's QWERTY
// keyboard, as a direction from that keyboard's center.
//
// This is the one thing `urza-layout` has that the original 8pen does
// not. Measured over the three layouts, the mean angular error between
// a letter's QWERTY direction and its wheel slot direction is:
//
//   original-8pen   93 degrees (frequency-weighted)
//   qwerty-8pen     24 degrees
//   urza-layout     23 degrees
//
// Random placement scores 90, so the original carries no directional
// information at all. That number is the measured form of the oldest
// complaint about this input family: "The letters I D G Z are not
// related in any way, yet they are all arrived to by first moving up
// and rotating right" (Hacker News, 2010). See
// learnability-research.md.
//
// Shared by tools/generate-qwerty8pen.mjs, which assigns slots by
// minimizing this error, and by game.js, which shows it to the learner
// as a hint. Keeping one table means the hint can never teach an
// association the generator did not actually build.
//
// Pure and DOM-free, like layout.js.

// QWERTY key coordinates: column x with the standard row stagger, row
// y downward.
export const QWERTY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export const QWERTY_KEYS = {
  q: [0, 0], w: [1, 0], e: [2, 0], r: [3, 0], t: [4, 0],
  y: [5, 0], u: [6, 0], i: [7, 0], o: [8, 0], p: [9, 0],
  a: [0.25, 1], s: [1.25, 1], d: [2.25, 1], f: [3.25, 1], g: [4.25, 1],
  h: [5.25, 1], j: [6.25, 1], k: [7.25, 1], l: [8.25, 1],
  z: [0.75, 2], x: [1.75, 2], c: [2.75, 2], v: [3.75, 2], b: [4.75, 2],
  n: [5.75, 2], m: [6.75, 2],
};

// Rows are visually taller than one key width is wide relative to the
// keyboard's 10-column spread; 1.5 keeps top/bottom rows from
// collapsing onto the horizontal axis.
export const QWERTY_CENTER = [4.5, 1];
export const Y_SCALE = 1.5;

// On-screen direction of each slot: its arm angle nudged 13 degrees
// toward the start sector, the same numbers main.js draws letters at.
// Screen convention, y grows downward, so 90 points down.
export const SPOKES = {
  'N CW': 302, 'N CCW': 238,
  'E CW': 32, 'E CCW': 328,
  'S CW': 122, 'S CCW': 58,
  'W CW': 212, 'W CCW': 148,
};

// Direction of a letter from the QWERTY keyboard center, in the same
// screen convention as SPOKES.
export function qwertyAngle(letter) {
  const key = QWERTY_KEYS[letter];
  if (!key) return null;
  const deg = (Math.atan2((key[1] - QWERTY_CENTER[1]) * Y_SCALE, key[0] - QWERTY_CENTER[0]) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export const slotAngle = (sector, direction) => SPOKES[`${sector} ${direction}`];

// Smaller of the two ways around, so the result is 0..180.
export function angDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

// How far the slot's on-screen direction sits from the letter's QWERTY
// direction. 0 is a perfect mnemonic, 90 is what chance gives, 180 is
// the opposite side of the wheel from where the finger expects it.
// Null for a glyph with no QWERTY key (punctuation).
export function fitDegrees(letter, sector, direction) {
  const q = qwertyAngle(letter);
  return q === null ? null : angDist(q, slotAngle(sector, direction));
}
