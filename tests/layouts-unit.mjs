// Unit test of the layout registry: every layout builds for every
// language, has no duplicate letters, and the generated ones place the
// full alphabet. Guards hand-edited entries in layouts.js against
// typos. Run: node tests/layouts-unit.mjs

import { LAYOUTS, buildLayout } from '../layouts.js';
import { validateLayout, SECTORS, DIRECTIONS } from '../layout.js';

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
  if (!ok) failures++;
}

for (const id of Object.keys(LAYOUTS)) {
  for (const language of ['en', 'cs']) {
    const layout = buildLayout(id, language);

    // Shape: all 4 sectors, both directions, exactly 4 slots each.
    const shapeOk = SECTORS.every(
      (s) => DIRECTIONS.every((d) => Array.isArray(layout[s]?.[d]) && layout[s][d].length === 4)
    );
    check(`${id}/${language} shape`, shapeOk, 'missing sector/direction or wrong slot count');

    const { problems, letterCount } = validateLayout(layout);
    check(`${id}/${language} no duplicates`, problems.length === 0, problems.join('; '));

    // Generated layouts must place the full alphabet. Static layouts may
    // be partial while their data is being transcribed.
    if (LAYOUTS[id].build) {
      check(`${id}/${language} places 26 letters`, letterCount === 26, `placed ${letterCount}`);
    }
  }
}

// The transcribed original: 26 letters + 6 punctuation = all 32 slots,
// and spot checks against the 8pen.png screenshot.
import { letterAt } from '../layout.js';
const l8 = buildLayout('original-8pen', 'en');
check('original-8pen fills all 32 slots', validateLayout(l8).letterCount === 32, `got ${validateLayout(l8).letterCount}`);
check('original-8pen e innermost S CW', letterAt(l8, 'S', 'CW', 1) === 'e', letterAt(l8, 'S', 'CW', 1));
check('original-8pen y innermost N CCW', letterAt(l8, 'N', 'CCW', 1) === 'y', letterAt(l8, 'N', 'CCW', 1));
check('original-8pen period innermost W CW', letterAt(l8, 'W', 'CW', 1) === '.', letterAt(l8, 'W', 'CW', 1));
check('original-8pen z outermost N CW', letterAt(l8, 'N', 'CW', 4) === 'z', letterAt(l8, 'N', 'CW', 4));

process.exit(failures ? 1 : 0);
