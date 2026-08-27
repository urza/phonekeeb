// Unit test of the personal learning layer: PersonalModel counts,
// blending into the Predictor's score, the SENT_START token, the
// out-of-vocabulary enrollment threshold, decay, and the JSON
// round-trip. Then the editing layer the dictionary page drives:
// forget, block, pin, pair deletes, time decay and the v1 upgrade.
// Plain node. Run: node tests/personal-unit.mjs

import { Predictor, PersonalModel, SENT_START, withinOneEdit, dayNumber } from '../prediction.js';

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : (detail ?? ''));
  if (!ok) failures++;
}

// A tiny static vocabulary so the blend math is inspectable.
const words = [['hello', 100], ['help', 80], ['very', 60], ['me', 50], ['you', 40]];
const p = new Predictor([{ id: 'en', words }]);
const m = new PersonalModel(null);
p.setPersonal(m);

// An out-of-vocabulary word needs two sightings before it becomes a
// candidate; until then only the verbatim chip offers it.
m.learn('vecerka', { atStart: true });
check('one sighting does not enroll', !p.predict('ve', 5).includes('vecerka'),
  JSON.stringify(p.predict('ve', 5)));
m.learn('vecerka', { atStart: true });
// Enrollment is the contract here; rank under context has its own
// checks below (the tiny synthetic vocabulary inflates unigram shares,
// so an absolute first place would test the fixture, not the model).
check('two sightings enroll the word', p.predict('ve', 5).includes('vecerka'),
  JSON.stringify(p.predict('ve', 5)));

// The start token: learned first words lead the fresh strip.
check('start token stored under SENT_START', m.bi.get(SENT_START)?.get('vecerka') === 2);
check('learned start word leads the empty strip',
  p.predict('', 5, { start: true })[0] === 'vecerka',
  JSON.stringify(p.predict('', 5, { start: true })));
check('static words still present on the fresh strip',
  p.predict('', 5, { start: true }).includes('hello'));

// A personal bigram beats the static order after its head.
m.learn('sunshine', { prev: 'help' });
m.learn('sunshine', { prev: 'help' });
const afterHelp = p.predict('', 5, { prev: 'help' });
check('personal phrase leads after its head', afterHelp[0] === 'sunshine',
  JSON.stringify(afterHelp));

// Diacritics fold applies to learned words and heads too.
m.learn('táta', { prev: 'muj' });
m.learn('táta', { prev: 'muj' });
check('learned accented word matches folded prefix',
  p.predict('tat', 5).includes('táta'), JSON.stringify(p.predict('tat', 5)));
check('folded prev finds the learned head',
  p.predict('', 5, { prev: 'muj' })[0] === 'táta',
  JSON.stringify(p.predict('', 5, { prev: 'muj' })));

// Words that collide with Object.prototype names must behave as data.
m.learn('constructor', {});
check('prototype-named words are safe', m.uni.get('constructor') === 1);

// JSON round-trip: a reloaded store predicts identically.
const reloaded = new PersonalModel(JSON.parse(JSON.stringify(m)));
const p2 = new Predictor([{ id: 'en', words }]);
p2.setPersonal(reloaded);
check('JSON round-trip preserves predictions',
  JSON.stringify(p2.predict('ve', 5)) === JSON.stringify(p.predict('ve', 5))
  && JSON.stringify(p2.predict('', 5, { start: true }))
     === JSON.stringify(p.predict('', 5, { start: true })));

// A corrupt store degrades to an empty model instead of throwing.
const broken = new PersonalModel({ v: 99, whatever: true });
check('corrupt store degrades to empty', broken.total === 0);

// Decay halves counts and drops ones.
const d = new PersonalModel(null);
d.learn('aa', {});
d.learn('aa', {});
d.learn('bb', {});
d.decay();
check('decay halves and prunes', d.uni.get('aa') === 1 && !d.uni.has('bb')
  && d.total === 1, JSON.stringify([...d.uni]));

// --- Trigrams -------------------------------------------------------

// Three words in a row store a trigram, and its context outranks the
// bigram that also matches.
const t = new PersonalModel(null);
const p3 = new Predictor([{ id: 'en', words }]);
p3.setPersonal(t);
for (let i = 0; i < 3; i++) {
  t.learn('mountain', { prev: 'the', prev2: 'over', atStart: false });
  t.learn('valley', { prev: 'the', prev2: 'under', atStart: false });
}
check('trigram context stored', t.tri.get('over the')?.get('mountain') === 3,
  JSON.stringify([...t.tri]));
check('trigram beats the shared bigram head',
  p3.predict('', 5, { prev: 'the', prev2: 'over' })[0] === 'mountain',
  JSON.stringify(p3.predict('', 5, { prev: 'the', prev2: 'over' })));
check('the other trigram wins under its own context',
  p3.predict('', 5, { prev: 'the', prev2: 'under' })[0] === 'valley',
  JSON.stringify(p3.predict('', 5, { prev: 'the', prev2: 'under' })));
// The start token never leads a trigram: first words have their own
// bigram level under SENT_START.
t.learn('hello', { prev: 'x', prev2: null, atStart: true });
check('start token leads no trigram', ![...t.tri.keys()].some((k) => k.includes(SENT_START)));

// --- Editing --------------------------------------------------------

const e = new PersonalModel(null);
e.learn('teh', { prev: 'and' });
e.learn('teh', { prev: 'and' });
e.learn('dog', { prev: 'teh', prev2: 'and' });
check('setup: the typo and its pairs exist',
  e.uni.get('teh') === 2 && e.bi.get('and')?.get('teh') === 2 && e.tri.size === 1);

e.forget('teh');
check('forget clears the word', !e.uni.has('teh'));
check('forget clears pairs that lead to it', !e.bi.get('and')?.has('teh'));
check('forget clears trigram contexts that mention it', e.tri.size === 0,
  JSON.stringify([...e.tri.keys()]));
check('forget scrubs the history', !e.log.some((x) => x[0] === 'teh' || x[1] === 'teh'),
  JSON.stringify(e.log));

// A bare forget is undone by typing again; blocking is what sticks.
e.learn('teh', { prev: 'and' });
check('a forgotten word is learned again', e.uni.get('teh') === 1);
e.block('teh');
e.learn('teh', { prev: 'and' });
e.learn('teh', { prev: 'and' });
check('a blocked word is never learned again', !e.uni.has('teh'));
check('a blocked word leaves no pair behind', !e.bi.get('and')?.has('teh'));
e.unblock('teh');
e.learn('teh', { prev: 'and' });
check('unblock lets it be learned once more', e.uni.get('teh') === 1);

// Blocking reaches the static vocabulary too, which the personal model
// alone could never do.
const b = new PersonalModel(null);
const pb = new Predictor([{ id: 'en', words }]);
pb.setPersonal(b);
check('setup: the static word is suggested', pb.predict('hel', 5).includes('hello'));
b.block('hello');
check('a blocked static word disappears', !pb.predict('hel', 5).includes('hello'),
  JSON.stringify(pb.predict('hel', 5)));
check('its neighbours still show', pb.predict('hel', 5).includes('help'));

// Pinning adds a word the user never typed, and decay keeps it.
const pinned = new PersonalModel(null);
pinned.pin('kolodej');
check('pin enrolls a brand-new word', pinned.uni.get('kolodej') >= 2);
pinned.decay();
pinned.decay();
pinned.decay();
check('decay never drops a pinned word', pinned.uni.has('kolodej'),
  JSON.stringify([...pinned.uni]));
pinned.unpin('kolodej');
pinned.decay(); // 3 -> 1
pinned.decay(); // 1 -> gone
check('an unpinned word fades again', !pinned.uni.has('kolodej'),
  JSON.stringify([...pinned.uni]));

// One pair deletable on its own, without touching the word.
const pr = new PersonalModel(null);
pr.learn('noc', { prev: 'dobrou' });
pr.learn('noc', { prev: 'dobrou' });
pr.learn('noc', { prev: 'zla' });
pr.forgetPair('zla', 'noc');
check('forgetPair drops only that pair',
  !pr.bi.has('zla') && pr.bi.get('dobrou')?.get('noc') === 2 && pr.uni.get('noc') === 3);

// --- Time decay -----------------------------------------------------

const now = Date.UTC(2026, 7, 27);
const aged = new PersonalModel(null);
for (let i = 0; i < 8; i++) aged.learn('slovo', { now });
check('setup: eight sightings', aged.uni.get('slovo') === 8);
aged.ageIfDue(now + 29 * 86400000);
check('no sweep before the interval', aged.uni.get('slovo') === 8);
aged.ageIfDue(now + 31 * 86400000);
check('one sweep after 30 days', aged.uni.get('slovo') === 4, String(aged.uni.get('slovo')));
aged.ageIfDue(now + 95 * 86400000);
check('two more sweeps after 90 days', aged.uni.get('slovo') === 1, String(aged.uni.get('slovo')));
aged.ageIfDue(now + 5000 * 86400000);
check('a long absence empties the store', aged.total === 0);
// A clock moved backwards must not sweep, and must not leave the store
// stuck in the future.
const back = new PersonalModel(null);
back.learn('slovo', { now });
back.ageIfDue(now - 400 * 86400000);
check('a backwards clock does not sweep', back.uni.get('slovo') === 1);
check('a backwards clock resets the day', back.day === dayNumber(now - 400 * 86400000));

// --- Storage --------------------------------------------------------

// A v1 store loads and keeps predicting; the new fields arrive empty.
const v1 = new PersonalModel({ v: 1, uni: { ahoj: 4 }, bi: { ahoj: { jak: 2 } } });
check('v1 store upgrades', v1.uni.get('ahoj') === 4 && v1.bi.get('ahoj')?.get('jak') === 2
  && v1.tri.size === 0 && v1.blocked.size === 0 && v1.log.length === 0);
check('v1 store is written back as v2', v1.toJSON().v === 2);

// The v2 round-trip carries the decisions and the history, not just counts.
const full = new PersonalModel(null);
full.learn('ahoj', { atStart: true, now });
full.learn('svete', { prev: 'ahoj', now });
full.pin('ahoj');
full.block('spam');
const back2 = new PersonalModel(JSON.parse(JSON.stringify(full)));
check('v2 round-trip keeps counts', back2.uni.get('svete') === 1);
check('v2 round-trip keeps the pin', back2.pinned.has('ahoj'));
check('v2 round-trip keeps the block', back2.blocked.has('spam'));
check('v2 round-trip keeps the history', back2.log.length === full.log.length);
check('v2 round-trip keeps the decay day', back2.day === full.day);

// Hand-edited and corrupt stores must not throw: this is an import path.
const junk = new PersonalModel({ v: 2, uni: { a: 'x', b: -3, c: 5 }, bi: 'nope', log: 7 });
check('junk counts are dropped', !junk.uni.has('a') && !junk.uni.has('b') && junk.uni.get('c') === 5);
check('junk containers degrade to empty', junk.bi.size === 0 && junk.log.length === 0);

// The history is bounded: it is the one field that holds text.
const many = new PersonalModel(null);
for (let i = 0; i < 700; i++) many.learn(`w${i}`, { now });
check('history stays bounded', many.log.length === 500, String(many.log.length));

// --- The typo check the dictionary page runs ------------------------

check('one substitution', withinOneEdit('helli', 'hello'));
check('one deletion', withinOneEdit('helo', 'hello'));
check('one insertion', withinOneEdit('helllo', 'hello'));
// The swap is the case the whole check exists for: the two most common
// English typos, teh and thsi, are both neighbour swaps.
check('neighbours swapped', withinOneEdit('teh', 'the') && withinOneEdit('thsi', 'this'));
check('a swap further in', withinOneEdit('recieve', 'receive'));
check('equal words', withinOneEdit('the', 'the'));
check('two edits rejected', !withinOneEdit('teh', 'thx'));
check('a non-adjacent swap is rejected', !withinOneEdit('abcd', 'dbca'));
check('length gap rejected', !withinOneEdit('he', 'hello'));
check('prefix is not one edit', !withinOneEdit('hell', 'hello123'));

process.exit(failures ? 1 : 0);
