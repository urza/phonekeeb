// Unit test of the personal learning layer: PersonalModel counts,
// blending into the Predictor's score, the SENT_START token, the
// out-of-vocabulary enrollment threshold, decay, and the JSON
// round-trip. Plain node. Run: node tests/personal-unit.mjs

import { Predictor, PersonalModel, SENT_START } from '../prediction.js';

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
m.learn('vecerka', null, true);
check('one sighting does not enroll', !p.predict('ve', 5).includes('vecerka'),
  JSON.stringify(p.predict('ve', 5)));
m.learn('vecerka', null, true);
check('two sightings enroll the word', p.predict('ve', 5)[0] === 'vecerka',
  JSON.stringify(p.predict('ve', 5)));

// The start token: learned first words lead the fresh strip.
check('start token stored under SENT_START', m.bi.get(SENT_START)?.get('vecerka') === 2);
check('learned start word leads the empty strip',
  p.predict('', 5, { start: true })[0] === 'vecerka',
  JSON.stringify(p.predict('', 5, { start: true })));
check('static words still present on the fresh strip',
  p.predict('', 5, { start: true }).includes('hello'));

// A personal bigram beats the static order after its head.
m.learn('sunshine', 'help', false);
m.learn('sunshine', 'help', false);
const afterHelp = p.predict('', 5, { prev: 'help' });
check('personal phrase leads after its head', afterHelp[0] === 'sunshine',
  JSON.stringify(afterHelp));

// Diacritics fold applies to learned words and heads too.
m.learn('táta', 'muj', false);
m.learn('táta', 'muj', false);
check('learned accented word matches folded prefix',
  p.predict('tat', 5).includes('táta'), JSON.stringify(p.predict('tat', 5)));
check('folded prev finds the learned head',
  p.predict('', 5, { prev: 'muj' })[0] === 'táta',
  JSON.stringify(p.predict('', 5, { prev: 'muj' })));

// Words that collide with Object.prototype names must behave as data.
m.learn('constructor', null, false);
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
d.learn('aa', null, false);
d.learn('aa', null, false);
d.learn('bb', null, false);
d.decay();
check('decay halves and prunes', d.uni.get('aa') === 1 && !d.uni.has('bb')
  && d.total === 1, JSON.stringify([...d.uni]));

process.exit(failures ? 1 : 0);
