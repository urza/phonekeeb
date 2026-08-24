// Unit test of the live glide preview math, plain node, no browser.
// Run: node tests/preview-unit.mjs

import { GestureDecoder } from '../gesture-decoder.js';

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
  if (!ok) failures++;
}

const d = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });

// Enter SE (mid-quadrant, 45 deg), no crossing yet.
d.pointerDown(100, 100);
d.pointerMove(142, 142);
let pv = d.preview();
check('current is SE', pv.current, 'SE');
check('commitNow is cancel', pv.commitNow, null);
check('CW neighbor SW -> (SE,CW,1)', pv.adjacent.SW, { type: 'letter', quadrant: 'SE', direction: 'CW', crossings: 1, capital: false });
check('CCW neighbor NE -> (SE,CCW,1)', pv.adjacent.NE, { type: 'letter', quadrant: 'SE', direction: 'CCW', crossings: 1, capital: false });
check('opposite is NW, direction open', [pv.opposite.quadrant, pv.opposite.established], ['NW', null]);
check('opposite cw -> (SE,CW,2)', pv.opposite.cw.crossings, 2);

// Cross into SW (one CW crossing).
for (let deg = 45; deg <= 110; deg += 8) {
  const rad = (deg * Math.PI) / 180;
  d.pointerMove(100 + 60 * Math.cos(rad), 100 + 60 * Math.sin(rad));
}
pv = d.preview();
check('current is SW', pv.current, 'SW');
check('commitNow -> (SE,CW,1)', pv.commitNow, { type: 'letter', quadrant: 'SE', direction: 'CW', crossings: 1, capital: false });
check('continue CW to NW -> (SE,CW,2)', pv.adjacent.NW, { type: 'letter', quadrant: 'SE', direction: 'CW', crossings: 2, capital: false });
check('backtrack to SE cancels', pv.adjacent.SE, null);
check('opposite NE via established CW -> crossings 3', [pv.opposite.quadrant, pv.opposite.established, pv.opposite.cw.crossings], ['NE', 'CW', 3]);

// A full extra loop from here: capital territory. 1 + 4 = 5 crossings.
for (let deg = 110; deg <= 110 + 360; deg += 8) {
  const rad = (deg * Math.PI) / 180;
  d.pointerMove(100 + 60 * Math.cos(rad), 100 + 60 * Math.sin(rad));
}
pv = d.preview();
check('after extra loop commitNow is capital (SE,CW,1)', [pv.commitNow.capital, pv.commitNow.crossings], [true, 1]);

// Dip from center, no crossing: a space, as in the original 8pen.
const d2 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d2.pointerDown(100, 100);
d2.pointerMove(160, 160);
check('dip types space', d2.pointerMove(100, 100).committed, { type: 'space', via: 'dip' });

// Crossed a line, rotated back to zero, returned: a silent cancel.
const d3 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d3.pointerDown(100, 100);
for (let deg = 45; deg <= 115; deg += 8) d3.pointerMove(100 + 60 * Math.cos((deg * Math.PI) / 180), 100 + 60 * Math.sin((deg * Math.PI) / 180));
for (let deg = 115; deg >= 45; deg -= 8) d3.pointerMove(100 + 60 * Math.cos((deg * Math.PI) / 180), 100 + 60 * Math.sin((deg * Math.PI) / 180));
check('backtracked letter cancels, not a space', d3.pointerMove(100, 100).committed, null);

// Stationary press-and-release in a quadrant: a function tap.
const d4 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d4.pointerDown(160, 40);
check('quadrant tap is a function', d4.pointerUp(161, 41).committed, { type: 'function', quadrant: 'NE' });

// A moved, crossing-less lift outside: silence (end word without space).
const d5 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d5.pointerDown(160, 40);
d5.pointerMove(170, 70);
check('dragged crossing-less lift is silent', d5.pointerUp(170, 70).committed, null);

process.exit(failures ? 1 : 0);
