// Unit test of the figure-eight model in layout.js (`flowJoin`) and of
// the flow properties the urza layout was hand-tuned for.
// Run: node tests/flow-unit.mjs
//
// Two independent anchors, because the model is only worth trusting if
// it agrees with work done without it:
//
// 1. The 8pen demo video, hand-decoded into CLAUDE.md before this code
//    existed: he, in, er, ea are figure eights on the original layout,
//    th, an, on are not. If flowJoin ever stops reproducing these, the
//    numbers in layout-flow-analysis.md are meaningless.
// 2. The side effects hand-checked in the 2026-08-26 "swap a and s"
//    entry of layout-tuning.md. These lock the tuned slots by their
//    reason, not only by their position, so a future swap that quietly
//    undoes the "is" figure eight fails here.

import { buildLayout } from '../layouts.js';
import { slotOf, flowJoin } from '../layout.js';

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
  if (!ok) failures++;
}

const joinOf = (layout, pair) =>
  flowJoin(slotOf(layout, pair[0]), slotOf(layout, pair[1]));

// 1. The video anchor.
const orig = buildLayout('original-8pen');
for (const [pair, want] of Object.entries({
  he: true, in: true, er: true, ea: true, th: false, an: false, on: false,
})) {
  const got = joinOf(orig, pair);
  check(`original-8pen "${pair}" eight=${want}`, got.eight === want, `got ${got.key}`);
}

// 2. The a/s swap anchor. qwerty-8pen is the pre-swap baseline and
// urza is the post-swap layout, so the pair of tables is the swap.
const before = buildLayout('qwerty-8pen');
const after = buildLayout('urza-layout');
for (const [pair, [wantBefore, wantAfter]] of Object.entries({
  is: ['turn/co', 'through/counter'],       // the reason for the swap
  at: ['turn/counter', 'through/co'],       // gained a pass-through
  es: ['turn/counter', 'through/co'],       // gained a pass-through
  st: ['through/co', 'turn/counter'],       // lost its pass-through
  as: ['reverse/counter', 'reverse/counter'], // a reversal either way
})) {
  check(`"${pair}" before swap`, joinOf(before, pair).key === wantBefore, joinOf(before, pair).key);
  check(`"${pair}" after swap`, joinOf(after, pair).key === wantAfter, joinOf(after, pair).key);
}

// The model must be total: every ordered pair of typable letters gets
// exactly one of the six categories, with no undefined fallthrough.
const KEYS = new Set([
  'through/counter', 'through/co', 'turn/counter', 'turn/co', 'reverse/counter', 'reverse/co',
]);
const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
const bad = [];
for (const a of letters) {
  for (const b of letters) {
    const j = flowJoin(slotOf(after, a), slotOf(after, b));
    if (!KEYS.has(j.key)) bad.push(`${a}${b}=${j.key}`);
  }
}
check('all 676 urza pairs classify', bad.length === 0, bad.slice(0, 5).join(' '));

// A doubled letter ("ll", "ss") can never be a figure eight, whatever
// the layout: a letter rotates the same way as itself, so the curl is
// always 'co' and the counter-curl half of the rule cannot hold. The
// shape half varies, and deliberately so. A 1-crossing letter lands
// one sector off its entry, so repeating it is a 'turn'; only a
// 4-crossing letter lands back on its entry and reverses.
const selfEight = letters.filter((c) => flowJoin(slotOf(after, c), slotOf(after, c)).eight);
check('no doubled letter is an eight', selfEight.length === 0, selfEight.join(' '));

// Sign guard on landingSector: a 4-crossing letter is a full loop, so
// it must land on the sector it started from and reverse into itself.
// A flipped sign would land it opposite and silently invent eights.
const ring4 = letters.filter((c) => slotOf(after, c).crossings === 4);
const ring4Bad = ring4.filter((c) => flowJoin(slotOf(after, c), slotOf(after, c)).shape !== 'reverse');
check(`ring-4 letters (${ring4.join(' ')}) loop back to entry`, ring4Bad.length === 0, ring4Bad.join(' '));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
