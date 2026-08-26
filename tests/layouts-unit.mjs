// Unit test of the layout registry: every layout has the full slot
// shape and no duplicate letters. Guards hand-edited entries in
// layouts.js against typos. Run: node tests/layouts-unit.mjs

import { LAYOUTS, buildLayout } from '../layouts.js';
import { validateLayout, SECTORS, DIRECTIONS } from '../layout.js';

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
  if (!ok) failures++;
}

for (const id of Object.keys(LAYOUTS)) {
  const layout = buildLayout(id);

  // Shape: all 4 sectors, both directions, exactly 4 slots each.
  const shapeOk = SECTORS.every(
    (s) => DIRECTIONS.every((d) => Array.isArray(layout[s]?.[d]) && layout[s][d].length === 4)
  );
  check(`${id} shape`, shapeOk, 'missing sector/direction or wrong slot count');

  const { problems } = validateLayout(layout);
  check(`${id} no duplicates`, problems.length === 0, problems.join('; '));
}

// The transcribed original: 26 letters + 6 punctuation = all 32 slots,
// and spot checks against the 8pen.png screenshot.
import { letterAt } from '../layout.js';
const l8 = buildLayout('original-8pen');
check('original-8pen fills all 32 slots', validateLayout(l8).letterCount === 32, `got ${validateLayout(l8).letterCount}`);
check('original-8pen e innermost S CW', letterAt(l8, 'S', 'CW', 1) === 'e', letterAt(l8, 'S', 'CW', 1));
check('original-8pen y innermost N CCW', letterAt(l8, 'N', 'CCW', 1) === 'y', letterAt(l8, 'N', 'CCW', 1));
check('original-8pen period innermost W CW', letterAt(l8, 'W', 'CW', 1) === '.', letterAt(l8, 'W', 'CW', 1));
check('original-8pen z outermost N CW', letterAt(l8, 'N', 'CW', 4) === 'z', letterAt(l8, 'N', 'CW', 4));

// qwerty-8pen: letters only (punctuation gets its own mechanism
// later), all 26 present, and the ring rule holds: every letter keeps
// its original-8pen crossing count, except the six promoted letters,
// which sit exactly one ring closer. Same or cheaper gesture cost.
const lq = buildLayout('qwerty-8pen');
check('qwerty-8pen holds exactly the 26 letters', validateLayout(lq).letterCount === 26, `got ${validateLayout(lq).letterCount}`);
const allGlyphs = (layout) => SECTORS.flatMap((s) => DIRECTIONS.flatMap((d) => layout[s][d])).filter(Boolean);
check('qwerty-8pen has no punctuation', allGlyphs(lq).every((g) => /\p{L}/u.test(g)), allGlyphs(lq).join(''));
const ringOf = (layout, glyph) => {
  for (const s of SECTORS) for (const d of DIRECTIONS) {
    const i = layout[s][d].indexOf(glyph);
    if (i !== -1) return i;
  }
  return -1;
};
const PROMOTED = new Set(['n', 's', 'c', 'm', 'v', 'j']);
const ringBreaks = [];
for (const glyph of allGlyphs(l8)) {
  if (!/\p{L}/u.test(glyph)) continue;
  const shift = ringOf(l8, glyph) - ringOf(lq, glyph);
  const ok = PROMOTED.has(glyph) ? shift === 1 : shift === 0;
  if (!ok) ringBreaks.push(`${glyph}:${shift}`);
}
check('qwerty-8pen ring rule holds', ringBreaks.length === 0, `bad shifts: ${ringBreaks.join(' ')}`);
check('qwerty-8pen e innermost W CW', letterAt(lq, 'W', 'CW', 1) === 'e', letterAt(lq, 'W', 'CW', 1));
check('qwerty-8pen n innermost S CCW', letterAt(lq, 'S', 'CCW', 1) === 'n', letterAt(lq, 'S', 'CCW', 1));
check('qwerty-8pen z outermost W CCW', letterAt(lq, 'W', 'CCW', 4) === 'z', letterAt(lq, 'W', 'CCW', 4));

// urza-layout: the hand-owned fork of qwerty-8pen (layout-tuning.md).
// Locks the letter set and the tuned slots only; the rest may drift
// as tuning continues, and each locked slot changes here in the same
// change set as its log entry.
const lu = buildLayout('urza-layout');
check('urza-layout holds exactly the 26 letters', validateLayout(lu).letterCount === 26, `got ${validateLayout(lu).letterCount}`);
check('urza-layout has no punctuation', allGlyphs(lu).every((g) => /\p{L}/u.test(g)), allGlyphs(lu).join(''));
check('urza-layout s innermost S CW (tuned)', letterAt(lu, 'S', 'CW', 1) === 's', letterAt(lu, 'S', 'CW', 1));
check('urza-layout a innermost W CCW (tuned)', letterAt(lu, 'W', 'CCW', 1) === 'a', letterAt(lu, 'W', 'CCW', 1));

process.exit(failures ? 1 : 0);
