// Generates the qwerty-8pen layout: letters only, original 8pen rings
// with frequency promotion, QWERTY directions.
//
// Rules, in order:
// 1. Start from the original-8pen rings and drop all punctuation
//    (punctuation will get its own gesture mechanism later).
// 2. Backfill each freed slot by promotion: the most frequent letter
//    (English ranking) of the next ring out moves one ring in. This
//    cascades: rings 1-3 end up full (8 letters), ring 4 keeps the two
//    leftovers and six empty slots, reserved real estate.
// 3. Within each ring, assign letters to the eight (sector, direction)
//    slots so each letter's direction from the QWERTY keyboard center
//    best matches the slot's on-screen direction. Exact assignment by
//    brute force (8! options per ring); empty slots cost nothing.
//
// Run: node tools/generate-qwerty8pen.mjs
// Paste the printed block into layouts.js (entry 'qwerty-8pen').

import { FREQUENCY } from '../layouts.js';

// On-screen direction of each slot: its arm angle nudged 13 degrees
// toward the start sector, same numbers main.js draws with.
const SPOKES = {
  'N CW': 302, 'N CCW': 238,
  'E CW': 32, 'E CCW': 328,
  'S CW': 122, 'S CCW': 58,
  'W CW': 212, 'W CCW': 148,
};

// QWERTY key coordinates: column x with the standard row stagger,
// row y downward.
const KEYS = {
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
const CENTER = [4.5, 1];
const Y_SCALE = 1.5;

// The rings of the original 8pen (layouts.js 'original-8pen'),
// ring index = crossings - 1. Punctuation included here so the ring
// derivation is visible; step 1 strips it.
const ORIGINAL = {
  N: { CW: ['i', 'd', 'g', 'z'], CCW: ['y', 'x', 'k', "'"] },
  E: { CW: ['o', 'u', 'w', '!'], CCW: ['a', 'r', 'f', '?'] },
  S: { CW: ['e', 'l', 'p', 'q'], CCW: ['t', 'h', 'b', '@'] },
  W: { CW: ['.', 's', 'c', 'v'], CCW: [',', 'n', 'm', 'j'] },
};

const isLetter = (ch) => typeof ch === 'string' && /\p{L}/u.test(ch);
const rank = (ch) => FREQUENCY.en.indexOf(ch);
const angleOf = (ch) => {
  const [x, y] = KEYS[ch];
  const deg = (Math.atan2((y - CENTER[1]) * Y_SCALE, x - CENTER[0]) * 180) / Math.PI;
  return (deg + 360) % 360;
};
const angDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

function* permutations(arr) {
  if (arr.length <= 1) { yield arr; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

// Step 1: rings without punctuation.
const rings = [0, 1, 2, 3].map((ring) => {
  const out = [];
  for (const sector of ['N', 'E', 'S', 'W']) {
    for (const direction of ['CW', 'CCW']) {
      const ch = ORIGINAL[sector][direction][ring];
      if (isLetter(ch)) out.push(ch);
    }
  }
  return out;
});

// Step 2: frequency promotion, ring by ring from the inside out.
const promoted = [];
for (let r = 0; r < 3; r++) {
  while (rings[r].length < 8 && rings[r + 1].length > 0) {
    rings[r + 1].sort((a, b) => rank(a) - rank(b));
    const up = rings[r + 1].shift();
    rings[r].push(up);
    promoted.push(`${up} (ring ${r + 2} -> ${r + 1})`);
  }
}
console.log('promoted:', promoted.join(', '));

// Step 3: per-ring assignment, nulls padding the empty slots.
const slotNames = Object.keys(SPOKES);
const result = { N: { CW: [], CCW: [] }, E: { CW: [], CCW: [] }, S: { CW: [], CCW: [] }, W: { CW: [], CCW: [] } };

for (let ring = 0; ring < 4; ring++) {
  const items = [...rings[ring]];
  while (items.length < 8) items.push(null);
  let best = null;
  let bestCost = Infinity;
  for (const perm of permutations(items)) {
    let cost = 0;
    for (let s = 0; s < slotNames.length; s++) {
      if (perm[s] !== null) cost += angDist(angleOf(perm[s]), SPOKES[slotNames[s]]);
    }
    if (cost < bestCost - 1e-9) { bestCost = cost; best = perm; }
  }
  console.log(`ring ${ring + 1} cost ${bestCost.toFixed(1)}`);
  for (let s = 0; s < slotNames.length; s++) {
    const [sector, direction] = slotNames[s].split(' ');
    result[sector][direction][ring] = best[s];
    if (best[s] !== null) {
      console.log(`  ${slotNames[s].padEnd(6)} ${best[s]}  slot ${SPOKES[slotNames[s]]}°  qwerty ${angleOf(best[s]).toFixed(0)}°  off ${angDist(angleOf(best[s]), SPOKES[slotNames[s]]).toFixed(0)}°`);
    }
  }
}

console.log('\nstatic: {');
for (const sector of ['N', 'E', 'S', 'W']) {
  const fmt = (arr) => arr.map((c) => (c === null ? 'null' : `'${c}'`)).join(', ');
  console.log(`  ${sector}: { CW: [${fmt(result[sector].CW)}], CCW: [${fmt(result[sector].CCW)}] },`);
}
console.log('},');
