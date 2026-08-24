// Unit test of the decoder math and live glide preview in the X
// geometry (arms on the diagonals, sectors N/E/S/W). Plain node, no
// browser. Run: node tests/preview-unit.mjs

import { GestureDecoder } from '../gesture-decoder.js';

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
  if (!ok) failures++;
}

const at = (deg, r = 60) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 + r * Math.sin((deg * Math.PI) / 180)];

const d = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });

// Enter S (straight down, 90 deg), no crossing yet.
d.pointerDown(100, 100);
d.pointerMove(...at(90));
let pv = d.preview();
check('current is S', pv.current, 'S');
check('commitNow is cancel', pv.commitNow, null);
check('CW neighbor W -> (S,CW,1)', pv.adjacent.W, { type: 'letter', sector: 'S', direction: 'CW', crossings: 1, capital: false });
check('CCW neighbor E -> (S,CCW,1)', pv.adjacent.E, { type: 'letter', sector: 'S', direction: 'CCW', crossings: 1, capital: false });
check('opposite is N, direction open', [pv.opposite.sector, pv.opposite.established], ['N', null]);
check('opposite cw -> (S,CW,2)', pv.opposite.cw.crossings, 2);

// Cross the 135 arm into W (one CW crossing).
for (let deg = 90; deg <= 160; deg += 8) d.pointerMove(...at(deg));
pv = d.preview();
check('current is W', pv.current, 'W');
check('commitNow -> (S,CW,1)', pv.commitNow, { type: 'letter', sector: 'S', direction: 'CW', crossings: 1, capital: false });
check('continue CW to N -> (S,CW,2)', pv.adjacent.N, { type: 'letter', sector: 'S', direction: 'CW', crossings: 2, capital: false });
check('backtrack to S cancels', pv.adjacent.S, null);
check('opposite E via established CW -> crossings 3', [pv.opposite.sector, pv.opposite.established, pv.opposite.cw.crossings], ['E', 'CW', 3]);

// A full extra loop from here: capital territory. 1 + 4 = 5 crossings.
for (let deg = 160; deg <= 160 + 360; deg += 8) d.pointerMove(...at(deg));
pv = d.preview();
check('after extra loop commitNow is capital (S,CW,1)', [pv.commitNow.capital, pv.commitNow.crossings], [true, 1]);

// Dip from center, no crossing: a space, as in the original 8pen.
const d2 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d2.pointerDown(100, 100);
d2.pointerMove(100, 180);
check('dip types space', d2.pointerMove(100, 100).committed, { type: 'space', via: 'dip' });

// Crossed an arm, rotated back to zero, returned: a silent cancel.
const d3 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d3.pointerDown(100, 100);
for (let deg = 90; deg <= 160; deg += 8) d3.pointerMove(...at(deg));
for (let deg = 160; deg >= 90; deg -= 8) d3.pointerMove(...at(deg));
check('backtracked letter cancels, not a space', d3.pointerMove(100, 100).committed, null);

// Stationary press-and-release in a sector: a function tap.
const d4 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d4.pointerDown(160, 100); // straight right: E sector
check('sector tap is a function', d4.pointerUp(161, 101).committed, { type: 'function', sector: 'E' });

// A moved, crossing-less lift outside: silence (end word without space).
const d5 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d5.pointerDown(160, 100);
d5.pointerMove(170, 130);
check('dragged crossing-less lift is silent', d5.pointerUp(170, 130).committed, null);

// Letter gestures must start in the center: an outside start that loops
// through several sectors still types nothing (reserved for future
// outside-start gestures).
const d6 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d6.pointerDown(...at(90, 80));
for (let deg = 90; deg <= 290; deg += 8) d6.pointerMove(...at(deg, 80));
check('outside start never types letters', d6.pointerUp(...at(290, 80)).committed, null);

// An outside start that drags through the center still types nothing:
// the press's role is fixed at pointer down.
const d7 = new GestureDecoder({ center: { x: 100, y: 100 }, deadZoneRadius: 20 });
d7.pointerDown(160, 160);
d7.pointerMove(100, 100);
d7.pointerMove(40, 100);
check('outside start through center stays silent', d7.pointerUp(40, 100).committed, null);

process.exit(failures ? 1 : 0);
