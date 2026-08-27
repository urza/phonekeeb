// The number and symbol pad: a scroll of symbols above a numeric
// keypad, with the edit keys on the bottom bar. Like emoji-picker.js it
// knows nothing about gestures or about the text being edited; it
// reports presses through onInsert (a string to type) and onAction
// (backspace, space, enter).
//
// The caller places the returned element; the .pad-* classes in
// style.css style it, shared with the emoji picker.

// The characters the wheel does not carry, grouped the way someone
// looks for them. The wheel's own punctuation (the South drags: ? ! ,)
// is repeated here on purpose: this pad is where a user who has not
// learned those drags comes looking.
const SECTIONS = [
  {
    id: 'punctuation',
    label: 'Punctuation',
    // Sixteen: two full rows of eight on a phone, no key left alone on
    // a third. Both Czech quote marks („ “) and both English ones
    // (“ ”) are here, because one keyboard serves both languages. The
    // plain hyphen is in Math, next to the other operators.
    chars: ['.', ',', '?', '!', ':', ';', '…', "'", '"', '„', '“', '”', '«', '»', '–', '—'],
  },
  {
    id: 'brackets',
    label: 'Brackets',
    chars: ['(', ')', '[', ']', '{', '}', '<', '>'],
  },
  {
    id: 'math',
    label: 'Math',
    // Sixteen again, two full rows.
    chars: ['+', '-', '×', '÷', '=', '≠', '≈', '≤', '≥', '%', '‰', '±', '^', '√', 'π', '°'],
  },
  {
    // Kč is two characters, which is why every key here types a string
    // rather than a character.
    id: 'money',
    label: 'Money',
    chars: ['$', '€', '£', '¥', '¢', 'Kč'],
  },
  {
    id: 'signs',
    label: 'Signs',
    chars: ['@', '#', '&', '*', '/', '\\', '|', '_', '~', '§', '©', '®', '™', '•', '★', '✓', '✗', '→', '←', '↑', '↓'],
  },
];

// Flat, because .pad-keys is a three-column grid: the rows are 1-2-3,
// 4-5-6, 7-8-9, then the two decimal separators around the zero. The
// period and comma both sit there on purpose: English writes 3.14 and
// Czech writes 3,14, and this keyboard serves both.
const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', ','];

// The bar keys. The wheel carries all three (center tap, East tap,
// South tap), but they are unreachable while the pad covers it, and a
// number is rarely the last thing you type.
const BAR = [
  { action: 'backspace', glyph: '⌫', label: 'Backspace' },
  { action: 'space', glyph: '␣', label: 'Space' },
  { action: 'enter', glyph: '⏎', label: 'Enter' },
];

function key(className, text, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  if (label) b.setAttribute('aria-label', label);
  return b;
}

export function createSymbolsPad({ onInsert, onAction }) {
  const el = document.createElement('div');
  el.id = 'symbolPad';
  el.className = 'pad-panel';
  el.hidden = true;

  const scroll = document.createElement('div');
  scroll.className = 'pad-scroll';
  for (const section of SECTIONS) {
    const s = document.createElement('section');
    s.className = 'pad-section';
    s.dataset.group = section.id;

    const heading = document.createElement('h2');
    heading.className = 'pad-heading';
    heading.textContent = section.label;

    const row = document.createElement('div');
    row.className = 'pad-row';
    for (const ch of section.chars) {
      // pad-key, not the emoji picker's borderless pad-cell: a symbol
      // is a small mark, and without a key around it the grid reads as
      // scattered glyphs rather than something to press.
      const b = key('pad-key', ch);
      b.dataset.char = ch;
      row.append(b);
    }

    s.append(heading, row);
    scroll.append(s);
  }

  const keys = document.createElement('div');
  keys.className = 'pad-keys';
  for (const ch of KEYPAD) {
    const b = key('pad-key', ch);
    b.dataset.char = ch;
    keys.append(b);
  }

  const bar = document.createElement('div');
  bar.className = 'pad-bar';
  for (const k of BAR) {
    const b = key('pad-key', k.glyph, k.label);
    b.dataset.action = k.action;
    bar.append(b);
  }

  el.append(scroll, keys, bar);

  // One listener for the whole panel: every key is either a string to
  // type or one of the three edit actions.
  el.addEventListener('click', (e) => {
    const { char, action } = e.target.dataset ?? {};
    if (char !== undefined) onInsert(char);
    else if (action) onAction(action);
  });

  return {
    el,
    open() {
      el.hidden = false;
      // Always from the top: unlike the emoji picker there is no recent
      // section to return to, and the punctuation is what most presses
      // are after.
      scroll.scrollTop = 0;
    },
    close() {
      el.hidden = true;
    },
  };
}
