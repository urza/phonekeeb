// Core geometry and lookup for the 32-slot address space (4 quadrants x
// 2 directions x crossings 1-4) that gesture-decoder.js produces. The
// actual letter placements live in layouts.js as data; this file only
// knows the shape.

export const QUADRANTS = ['NW', 'NE', 'SW', 'SE'];
export const DIRECTIONS = ['CW', 'CCW'];

// The boundary line ("arm") a gesture crosses first, per (quadrant,
// direction), as the arm's screen angle in degrees (y grows downward, so
// 90 points down and 270 points up). This is where each slot's letters
// are drawn, on the side of the arm facing the start quadrant, which is
// exactly how 8pen displayed its alphabet.
export const FIRST_ARM = {
  SE: { CW: 90, CCW: 0 },
  SW: { CW: 180, CCW: 90 },
  NW: { CW: 270, CCW: 180 },
  NE: { CW: 0, CCW: 270 },
};

export function emptyLayout() {
  const layout = {};
  for (const q of QUADRANTS) layout[q] = { CW: [null, null, null, null], CCW: [null, null, null, null] };
  return layout;
}

// crossings is 1-based (1-4), matching the decoder's commit payload.
export function letterAt(layout, quadrant, direction, crossings) {
  return layout[quadrant]?.[direction]?.[crossings - 1] ?? null;
}

// Sanity report for hand-edited layouts: duplicate letters and the
// distinct-letter count. Shown as console warnings by main.js, so a
// typo in layouts.js is visible immediately instead of as a silently
// untypeable letter.
export function validateLayout(layout) {
  const seen = new Map();
  const problems = [];
  let count = 0;
  for (const q of QUADRANTS) {
    for (const d of DIRECTIONS) {
      (layout[q]?.[d] ?? []).forEach((letter, i) => {
        if (!letter) return;
        count++;
        const where = `${q} ${d} crossing ${i + 1}`;
        if (seen.has(letter)) problems.push(`duplicate "${letter}": ${seen.get(letter)} and ${where}`);
        else seen.set(letter, where);
      });
    }
  }
  return { problems, letterCount: count };
}
