// Core geometry and lookup for the 32-slot address space (4 sectors x
// 2 directions x crossings 1-4) that gesture-decoder.js produces. The
// arms sit on the screen diagonals, so the sectors are up (N), right
// (E), down (S), and left (W), matching the original 8pen's X
// orientation. The actual letter placements live in layouts.js as
// data; this file only knows the shape.

import { SECTOR_ORDER_CW } from './gesture-decoder.js';

export const SECTORS = ['N', 'E', 'S', 'W'];
export const DIRECTIONS = ['CW', 'CCW'];

// The sector a letter's gesture returns to the center from: entry
// shifted by the signed crossing count around the CW ring. The canvas
// and the study cards color letters by this landing sector, not the
// entry one, so the color answers "toward which region do I drag
// before coming back".
export function landingSector(entry, direction, crossings) {
  const idx = SECTOR_ORDER_CW.indexOf(entry);
  const d = direction === 'CW' ? crossings : -crossings;
  return SECTOR_ORDER_CW[(((idx + d) % 4) + 4) % 4];
}

// The arm a gesture crosses first, per (sector, direction), as the
// arm's screen angle in degrees (y grows downward, so 90 points down
// and 270 points up). This is where each slot's letters are drawn, on
// the side of the arm facing the start sector, which is exactly how
// 8pen displayed its alphabet.
export const FIRST_ARM = {
  E: { CW: 45, CCW: 315 },
  S: { CW: 135, CCW: 45 },
  W: { CW: 225, CCW: 135 },
  N: { CW: 315, CCW: 225 },
};

export function emptyLayout() {
  const layout = {};
  for (const s of SECTORS) layout[s] = { CW: [null, null, null, null], CCW: [null, null, null, null] };
  return layout;
}

// crossings is 1-based (1-4), matching the decoder's commit payload.
export function letterAt(layout, sector, direction, crossings) {
  return layout[sector]?.[direction]?.[crossings - 1] ?? null;
}

// Sanity report for hand-edited layouts: duplicate letters and the
// distinct-letter count. Shown as console warnings by main.js, so a
// typo in layouts.js is visible immediately instead of as a silently
// untypeable letter.
export function validateLayout(layout) {
  const seen = new Map();
  const problems = [];
  let count = 0;
  for (const s of SECTORS) {
    for (const d of DIRECTIONS) {
      (layout[s]?.[d] ?? []).forEach((letter, i) => {
        if (!letter) return;
        count++;
        const where = `${s} ${d} crossing ${i + 1}`;
        if (seen.has(letter)) problems.push(`duplicate "${letter}": ${seen.get(letter)} and ${where}`);
        else seen.set(letter, where);
      });
    }
  }
  return { problems, letterCount: count };
}
