// The learned-words page (dictionary.html): inspect and edit everything
// the keyboard learned from your typing.
//
// It is a separate page rather than a panel inside index.html for two
// reasons. The settings block already costs half the touch area on a
// phone. And a full page load is itself the synchronisation mechanism:
// index.html flushes its write-behind buffer on pagehide, this page then
// reads the store fresh, and going back re-reads it again. So the two
// pages need no live sync between them at all.
//
// Every mutation happens in PersonalModel (prediction.js), which is
// DOM-free and ports to Swift. This file only decides what to show.

import { PersonalModel, SENT_START, matchKey, withinOneEdit } from './prediction.js';
import { WORDS as WORDS_EN } from './words-en.js';
import { WORDS as WORDS_CS } from './words-cs.js';

const PERSONAL_KEY = 'phonekeeb.personal';
const ROW_CAP = 300; // rows rendered per view. A phone cannot usefully
//   scroll thousands, and search is the way to reach the tail.
const PAIR_CAP = 8; // pairs shown inside one expanded word
const RUN_GAP_MS = 5 * 60 * 1000; // silence that ends a run in the feed
const SUSPECT_MAX_COUNT = 3; // a "typo" typed more often than this is a
//   habit, not a slip, so it stops being offered for correction
const SUSPECT_MIN_LEN = 3; // shorter words have too many one-edit
//   neighbours for the suggestion to carry any information

const $ = (id) => document.getElementById(id);
const listEl = $('list');

// ---------------------------------------------------------------- store

function load() {
  try {
    return new PersonalModel(JSON.parse(localStorage.getItem(PERSONAL_KEY) ?? 'null'));
  } catch {
    return new PersonalModel(null);
  }
}

let model = load();
let saveTimer = 0;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 300);
}

function writeNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(PERSONAL_KEY, JSON.stringify(model)); } catch {}
}

window.addEventListener('pagehide', writeNow);

// Every edit goes through act(), so every edit is undoable. The snapshot
// is the whole store serialized, a few hundred KB at worst and a few
// milliseconds once per tap. That is a fair price for an undo that
// cannot drift out of step with the model.
let undoData = null;
let toastTimer = 0;

function act(message, fn) {
  undoData = JSON.stringify(model);
  fn();
  // Row identity can change under an edit (the feed addresses entries by
  // index), so nothing stays expanded across one.
  expandedId = null;
  save();
  render();
  showToast(message);
}

function showToast(message) {
  $('toastMsg').textContent = message;
  $('toastUndo').hidden = !undoData;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}

$('toastUndo').addEventListener('click', () => {
  if (!undoData) return;
  model = new PersonalModel(JSON.parse(undoData));
  undoData = null;
  expandedId = null;
  $('toast').hidden = true;
  save();
  render();
});

// ------------------------------------------------------------- suspects

// The static vocabulary folded to match keys, with the best spelling and
// count per key. Only the typo check reads it.
const known = new Map();
for (const [word, count] of [...WORDS_EN, ...WORDS_CS]) {
  const k = matchKey(word);
  const cur = known.get(k);
  if (!cur || cur.count < count) known.set(k, { word, count });
}
const knownKeys = [...known.keys()];

// Does this learned word look like a typo of a real one? A word the
// static vocabulary does not know, typed once or twice, one edit from a
// common word, is nearly always a slip. Returns the word it was probably
// meant to be, or null.
function suspectOf(word) {
  const k = matchKey(word);
  if (k.length < SUSPECT_MIN_LEN || known.has(k)) return null;
  let best = null;
  let bestCount = 0;
  for (const cand of knownKeys) {
    // The length prefilter comes first: it removes most of the
    // vocabulary before the character loop runs, which is what keeps a
    // full sweep over the whole store quick enough to do on render.
    if (Math.abs(cand.length - k.length) > 1) continue;
    const entry = known.get(cand);
    if (entry.count <= bestCount || !withinOneEdit(k, cand)) continue;
    bestCount = entry.count;
    best = entry.word;
  }
  return best;
}

// The full sweep is the one expensive thing on this page, so it is
// memoized. The model object is part of the key because import, undo and
// "forget everything" replace it outright, and a fresh model starts its
// version back at zero.
let suspectCache = null;
let suspectFor = null;
let suspectVersion = -1;

function suspects() {
  if (suspectCache && suspectFor === model && suspectVersion === model.version) return suspectCache;
  suspectFor = model;
  suspectVersion = model.version;
  suspectCache = new Map();
  for (const [word, count] of model.uni) {
    if (count > SUSPECT_MAX_COUNT || model.pinned.has(word)) continue;
    const fix = suspectOf(word);
    if (fix) suspectCache.set(word, fix);
  }
  return suspectCache;
}

// ------------------------------------------------------------ view state

const VIEWS = [
  { id: 'recent', label: 'Recent' },
  { id: 'words', label: 'Words' },
  { id: 'phrases', label: 'Phrases' },
];
const WORD_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'suspects', label: 'Typos' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'blocked', label: 'Blocked' },
];
const PHRASE_FILTERS = [
  { id: '2', label: '2 words' },
  { id: '3', label: '3 words' },
];

let view = 'recent';
let wordFilter = 'all';
let phraseLen = '2';
let query = ''; // match-key folded, for comparing
let rawQuery = ''; // as typed, for adding a word with its real spelling
// One expanded thing at a time, addressed by an id the renderer builds:
// "w:<word>", "p:<key> <word>" or "f:<log index>". A single string keeps
// the open and close logic identical across all three views.
let expandedId = null;

// -------------------------------------------------------------- helpers

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function chip(label, on, onClick) {
  const b = button(label, 'chip', onClick);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  return b;
}

function note(text) {
  return el('p', 'note', text);
}

function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(ms) {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function seenLabel(word) {
  const day = model.seen.get(word);
  if (!day) return 'unknown';
  // Midday, so the label lands inside the right local date whichever
  // way the store's UTC day number rounded.
  return dayLabel(day * 86400000 + 43200000);
}

function pairText(key, word) {
  return key === SENT_START ? word : `${key} ${word}`;
}

function matches(text) {
  return !query || matchKey(text.toLowerCase()).includes(query);
}

function meter(count, max) {
  const box = el('div', 'meter');
  const bar = el('i');
  bar.style.width = `${Math.max(4, Math.round((count / max) * 100))}%`;
  box.append(bar);
  return box;
}

function toggle(id) {
  expandedId = expandedId === id ? null : id;
  render();
}

// ------------------------------------------------------------- rendering

function render() {
  renderStats();
  renderChips();
  listEl.replaceChildren(
    view === 'recent' ? renderRecent()
      : view === 'words' ? renderWords()
        : renderPhrases()
  );
  if (!$('dataPanel').hidden) renderSize();
}

function renderStats() {
  const s = model.stats();
  const parts = [`${s.words} words`, `${s.pairs} pairs`, `${s.triples} triples`];
  if (s.pinned) parts.push(`${s.pinned} pinned`);
  if (s.blocked) parts.push(`${s.blocked} blocked`);
  $('stats').textContent = parts.join(' · ');
}

function renderChips() {
  $('tabs').replaceChildren(...VIEWS.map((v) => chip(v.label, v.id === view, () => {
    view = v.id;
    expandedId = null;
    render();
  })));
  const active = view === 'words' ? WORD_FILTERS : view === 'phrases' ? PHRASE_FILTERS : [];
  const current = view === 'words' ? wordFilter : phraseLen;
  $('filters').replaceChildren(...active.map((f) => chip(f.label, f.id === current, () => {
    if (view === 'words') wordFilter = f.id; else phraseLen = f.id;
    expandedId = null;
    render();
  })));
}

// --- Recent: the history feed -------------------------------------------
//
// Consecutive commits render as one line of text, so the feed reads like
// what you actually typed. Context is what makes a word recognizable; a
// bare list of words is not something anyone can review.

// Group the log into runs of words typed one after another. Built
// forwards, because a run is defined by each entry naming the one before
// it as its previous word; the display reverses the result.
function buildRuns() {
  const runs = [];
  let cur = null;
  model.log.forEach(([word, prev, t], i) => {
    const before = i > 0 ? model.log[i - 1] : null;
    const joins = cur && before && prev && prev === before[0]
      && t - before[2] < RUN_GAP_MS && startOfDay(t) === cur.day;
    if (!joins) {
      cur = { day: startOfDay(t), t, items: [] };
      runs.push(cur);
    }
    cur.items.push({ word, i });
  });
  return runs;
}

function renderRecent() {
  const frag = document.createDocumentFragment();
  if (!model.log.length) {
    frag.append(note('Nothing learned yet. Type on the keyboard and this fills up.'));
    return frag;
  }
  const sus = suspects();
  // A run is kept whole when any of its words matches: filtering words
  // out of a sentence would destroy the context that makes it readable.
  const runs = buildRuns()
    .filter((r) => r.items.some((it) => matches(it.word)))
    .reverse();
  if (!runs.length) {
    frag.append(note('No history matches that search.'));
    return frag;
  }
  let lastDay = null;
  for (const run of runs) {
    if (run.day !== lastDay) {
      frag.append(el('div', 'day', dayLabel(run.t)));
      lastDay = run.day;
    }
    const line = el('div', 'run');
    line.append(el('span', 'time',
      new Date(run.t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })));
    let detail = null;
    for (const it of run.items) {
      const id = `f:${it.i}`;
      const b = button(it.word, sus.has(it.word) ? 'w sus' : 'w', () => toggle(id));
      b.setAttribute('aria-expanded', expandedId === id ? 'true' : 'false');
      line.append(b);
      if (expandedId === id) detail = wordDetail(it.word);
    }
    frag.append(line);
    if (detail) frag.append(detail);
  }
  return frag;
}

// --- Words ---------------------------------------------------------------

function renderWords() {
  const frag = document.createDocumentFragment();
  const sus = suspects();
  let rows;
  if (wordFilter === 'blocked') {
    // Blocked words are not in uni at all (block() forgets them), so
    // this filter is also the only way back: unblock lives here.
    rows = [...model.blocked].map((word) => ({ word, count: 0 }));
  } else {
    rows = [...model.uni].map(([word, count]) => ({ word, count }));
    if (wordFilter === 'suspects') rows = rows.filter((r) => sus.has(r.word));
    if (wordFilter === 'pinned') rows = rows.filter((r) => model.pinned.has(r.word));
  }
  rows = rows.filter((r) => matches(r.word));
  rows.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  if (!rows.length) {
    frag.append(emptyWords());
    return frag;
  }
  // Typos arrive in batches, so cleaning them one at a time is the wrong
  // unit of work. Undo covers the whole batch as one action.
  if (wordFilter === 'suspects' && rows.length > 1) {
    const bulk = el('div', 'actions bulk');
    bulk.append(button(`Delete all ${rows.length}`, 'danger',
      () => act(`Deleted ${rows.length} words`, () => {
        for (const r of rows) model.block(r.word);
      })));
    frag.append(bulk);
  }
  const max = rows[0].count || 1;
  for (const r of rows.slice(0, ROW_CAP)) frag.append(wordRow(r.word, r.count, max, sus.get(r.word)));
  if (rows.length > ROW_CAP) {
    frag.append(note(`Showing the top ${ROW_CAP} of ${rows.length}. Search to reach the rest.`));
  }
  return frag;
}

// Nothing found, but the search box holds a word: offer to add it. This
// is the only place a word is added by hand, and pinning is what adds it.
function emptyWords() {
  if (!rawQuery || !/^[\p{L}'’]{2,24}$/u.test(rawQuery)) {
    return note(wordFilter === 'blocked' ? 'No blocked words.' : 'Nothing here.');
  }
  const word = rawQuery.toLowerCase();
  const wrap = el('div', 'actions');
  wrap.append(button(`Add "${word}"`, '', () => act(`Added ${word}`, () => model.pin(word))));
  return wrap;
}

function wordRow(word, count, max, fix) {
  const row = el('div', 'row');
  const id = `w:${word}`;
  const head = button('', 'rowhead', () => toggle(id));
  head.setAttribute('aria-expanded', expandedId === id ? 'true' : 'false');
  head.append(el('span', 'label', word));
  if (model.pinned.has(word)) head.append(el('span', 'tag', 'pinned'));
  if (model.blocked.has(word)) head.append(el('span', 'tag warn', 'blocked'));
  else if (fix) head.append(el('span', 'tag warn', `→ ${fix}`));
  head.append(el('span', 'count', String(count)));
  head.append(meter(count, max));
  row.append(head);
  if (expandedId === id) row.append(wordDetail(word));
  return row;
}

// --- Phrases -------------------------------------------------------------

function renderPhrases() {
  const frag = document.createDocumentFragment();
  const level = phraseLen === '3' ? model.tri : model.bi;
  const rows = [];
  for (const [key, succ] of level) {
    for (const [word, count] of succ) {
      const text = pairText(key, word);
      if (matches(text)) rows.push({ key, word, count, text });
    }
  }
  rows.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  if (!rows.length) {
    frag.append(note(phraseLen === '3'
      ? 'No three-word phrases yet. They need three words typed in a row.'
      : 'No phrases yet.'));
    return frag;
  }
  const max = rows[0].count;
  for (const r of rows.slice(0, ROW_CAP)) frag.append(phraseRow(r, max));
  if (rows.length > ROW_CAP) {
    frag.append(note(`Showing the top ${ROW_CAP} of ${rows.length}. Search to reach the rest.`));
  }
  return frag;
}

function phraseRow(r, max) {
  const row = el('div', 'row');
  const id = `p:${r.key} ${r.word}`;
  const head = button('', 'rowhead', () => toggle(id));
  head.setAttribute('aria-expanded', expandedId === id ? 'true' : 'false');
  const label = el('span', 'label');
  if (r.key === SENT_START) label.append(el('span', 'start', '⌈start⌉ '));
  label.append(document.createTextNode(r.text));
  head.append(label);
  head.append(el('span', 'count', String(r.count)));
  head.append(meter(r.count, max));
  row.append(head);
  if (expandedId === id) row.append(phraseDetail(r));
  return row;
}

function phraseDetail(r) {
  const box = el('div', 'detail');
  const dl = el('dl');
  dl.append(el('dt', '', 'typed'), el('dd', '', `${r.count} times`));
  box.append(dl);
  const actions = el('div', 'actions');
  actions.append(button('Delete phrase', 'danger',
    () => act('Phrase deleted', () => model.forgetPair(r.key, r.word))));
  actions.append(button(`Delete "${r.word}"`, 'danger',
    () => act(`Deleted ${r.word}`, () => model.block(r.word))));
  box.append(actions);
  return box;
}

// --- The shared word detail ---------------------------------------------
//
// One renderer for all three views. A word tapped in the feed opens the
// same panel as a word tapped in the list, so the facts and the actions
// have exactly one home.

function wordDetail(word) {
  const box = el('div', 'detail');
  const count = model.uni.get(word) ?? 0;
  const blocked = model.blocked.has(word);
  const dl = el('dl');
  if (blocked) {
    dl.append(el('dt', '', 'state'), el('dd', '', 'blocked, never suggested'));
  } else {
    dl.append(el('dt', '', 'learned'), el('dd', '', `${count} times`));
    dl.append(el('dt', '', 'last seen'), el('dd', '', seenLabel(word)));
    if (model.pinned.has(word)) {
      dl.append(el('dt', '', 'state'), el('dd', '', 'pinned, kept through decay'));
    }
    const fix = count <= SUSPECT_MAX_COUNT ? suspectOf(word) : null;
    if (fix) dl.append(el('dt', '', 'note'), el('dd', 'fix', `looks like a typo of "${fix}"`));
  }
  box.append(dl);

  if (!blocked) {
    const after = [];
    for (const [key, succ] of model.bi) {
      const c = succ.get(word);
      if (c && key !== SENT_START) after.push({ key, word, count: c, text: key });
    }
    box.append(...pairSection('after', after));
    box.append(...pairSection('then', [...(model.bi.get(word) ?? [])]
      .map(([w, c]) => ({ key: word, word: w, count: c, text: w }))));
  }

  const actions = el('div', 'actions');
  if (blocked) {
    actions.append(button('Unblock', '', () => act(`${word} unblocked`, () => model.unblock(word))));
  } else {
    // Delete means block. A bare forget is undone by typing the word
    // twice more, which reads as a delete that did not work.
    actions.append(button('Delete', 'danger',
      () => act(`Deleted ${word}`, () => model.block(word))));
    const pinned = model.pinned.has(word);
    const pin = button('Pin', '', () => act(pinned ? `${word} unpinned` : `${word} pinned`,
      () => (pinned ? model.unpin(word) : model.pin(word))));
    pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    actions.append(pin);
  }
  box.append(actions);
  return box;
}

// A word's pairs, each one deletable on its own: a bad pair does not
// always mean a bad word.
function pairSection(title, pairs) {
  if (!pairs.length) return [];
  pairs.sort((a, b) => b.count - a.count);
  const wrap = el('div', 'pairlist');
  for (const p of pairs.slice(0, PAIR_CAP)) {
    const b = button('', '', () => act('Pair deleted', () => model.forgetPair(p.key, p.word)));
    b.append(document.createTextNode(`${p.text} `));
    b.append(el('span', 'n', String(p.count)));
    b.title = 'Delete this pair';
    wrap.append(b);
  }
  if (pairs.length > PAIR_CAP) wrap.append(el('span', 'n', `+${pairs.length - PAIR_CAP} more`));
  return [el('div', 'pairtitle', title), wrap];
}

// ------------------------------------------------------------ data panel

$('dataToggle').addEventListener('click', () => {
  const panel = $('dataPanel');
  panel.hidden = !panel.hidden;
  $('dataToggle').setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
  if (!panel.hidden) renderSize();
});

function renderSize() {
  const s = model.stats();
  const kb = (new Blob([JSON.stringify(model)]).size / 1024).toFixed(1);
  $('size').textContent = `${kb} KB · ${s.tokens} words learned in total · ${s.events} in history`;
}

$('copyJson').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(model));
    showToast('Copied to the clipboard');
  } catch {
    showToast('The browser refused the clipboard');
  }
});

$('downloadJson').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(model)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'phonekeeb-learned.json';
  a.click();
  URL.revokeObjectURL(url);
});

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    act('Store replaced', () => { model = new PersonalModel(data); });
  } catch {
    showToast('That file is not a valid store');
  }
  e.target.value = '';
});

$('clearLog').addEventListener('click', () => act('History cleared', () => model.clearLog()));
$('forgetAll').addEventListener('click',
  () => act('Everything forgotten', () => { model = new PersonalModel(null); }));

$('rawLoad').addEventListener('click', () => {
  $('raw').value = JSON.stringify(model, null, 1);
  $('rawMsg').textContent = '';
});

$('rawApply').addEventListener('click', () => {
  try {
    const data = JSON.parse($('raw').value);
    act('Store replaced', () => { model = new PersonalModel(data); });
    $('rawMsg').textContent = 'Applied.';
  } catch (err) {
    $('rawMsg').textContent = `Not valid JSON: ${err.message}`;
  }
});

// ----------------------------------------------------------------- wiring

$('search').addEventListener('input', (e) => {
  rawQuery = e.target.value.trim();
  query = matchKey(rawQuery.toLowerCase());
  expandedId = null;
  render();
});

render();
