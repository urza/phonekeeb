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

// letter -> its slot, the inverse of letterAt. Null for a letter the
// layout cannot type.
export function slotOf(layout, letter) {
  for (const s of SECTORS) {
    for (const d of DIRECTIONS) {
      const i = (layout[s]?.[d] ?? []).indexOf(letter);
      if (i >= 0) return { sector: s, direction: d, crossings: i + 1 };
    }
  }
  return null;
}

// How one letter's stroke flows into the next one's, the shape the
// finger draws at the center between two loops. The vocabulary is the
// one in layout-tuning.md.
//
// A letter ends by sweeping into the center from its landing sector,
// and the next letter leaves the center into its entry sector. Two
// independent things decide the shape of the join:
//
//   shape: 'through' when those two sectors are opposite, so the
//     finger runs in and straight out the far side. 'turn' when they
//     are adjacent, a 90 degree corner. 'reverse' when they are the
//     same sector, so the finger doubles back over itself.
//   curl: 'counter' when the two rotations differ, so the second loop
//     falls on the far side of the center and the stroke crosses
//     itself. 'co' when they match, so the loops share a sector and
//     retrace, drawing a circle instead.
//
// A figure eight needs both: through AND counter. That is the flow
// objective from the original 8pen demo video (see CLAUDE.md). Only
// the combination reads as an eight; either half alone does not.
//
// Pure and DOM-free, like the rest of this file, so tools/score-flow.mjs
// and tests/flow-unit.mjs measure the same model the app describes.
export function flowJoin(from, to) {
  const landing = landingSector(from.sector, from.direction, from.crossings);
  const gap = (((SECTOR_ORDER_CW.indexOf(to.sector) - SECTOR_ORDER_CW.indexOf(landing)) % 4) + 4) % 4;
  const shape = gap === 2 ? 'through' : gap === 0 ? 'reverse' : 'turn';
  const curl = from.direction === to.direction ? 'co' : 'counter';
  return { shape, curl, key: `${shape}/${curl}`, eight: shape === 'through' && curl === 'counter' };
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
