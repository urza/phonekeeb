// Letter study cards (cards.html): one card per filled slot. Each card
// draws the wheel with only that card's letter on it, plus the whole
// gesture as one curve, so a learner reads one stroke at a time
// instead of the full 32-slot map.
//
// The drawing itself lives in wheel-svg.js, shared with the practice
// game so the two teaching pages cannot draw a stroke differently.

import { SECTORS, DIRECTIONS } from './layout.js';
import { LAYOUTS, DEFAULT_LAYOUT, buildLayout } from './layouts.js';
import { SECTOR_COLORS } from './themes.js';
import { cardSvg } from './wheel-svg.js';

// The caption's own escaping. wheel-svg.js escapes what it puts inside
// the SVG, but that is its private business, so this file keeps its
// own rather than importing an internal.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function deck(layout) {
  const cards = [];
  for (const sector of SECTORS) {
    for (const direction of DIRECTIONS) {
      layout[sector][direction].forEach((letter, i) => {
        if (letter) cards.push({ letter, sector, direction, crossings: i + 1 });
      });
    }
  }
  const isLetter = (ch) => /\p{L}/u.test(ch);
  cards.sort((a, b) =>
    isLetter(a.letter) !== isLetter(b.letter)
      ? (isLetter(a.letter) ? -1 : 1)
      : a.letter.localeCompare(b.letter));
  return cards;
}

const layoutEl = document.getElementById('layoutMode');
const gridEl = document.getElementById('cards');

function render() {
  const layout = buildLayout(layoutEl.value);
  gridEl.innerHTML = deck(layout).map((card) => `
    <figure class="card">
      ${cardSvg(card)}
      <figcaption><b>${esc(card.letter)}</b><span>${card.sector} · ${card.direction} · ${card.crossings} ${card.crossings === 1 ? 'line' : 'lines'}</span></figcaption>
    </figure>`).join('');
}

for (const [id, def] of Object.entries(LAYOUTS)) layoutEl.add(new Option(def.label, id));

// Start from the keyboard page's saved choice so the deck matches
// what the user practices. Read-only: changing the dropdown here must
// not reconfigure the keyboard.
let savedLayout = null;
try { savedLayout = localStorage.getItem('phonekeeb.layout'); } catch {}
layoutEl.value = savedLayout && LAYOUTS[savedLayout] ? savedLayout : DEFAULT_LAYOUT;
layoutEl.addEventListener('change', render);

// Sector hues as CSS rules generated from themes.js, so the card
// colors can never drift from the main canvas. The SVG parts pick
// them up through currentColor (see cards.html).
const hueCss = (scheme) => SECTORS.map((s) => `.hue-${s} { color: ${SECTOR_COLORS[scheme][s]}; }`).join('\n');
const style = document.createElement('style');
style.textContent = `${hueCss('light')}\n@media (prefers-color-scheme: dark) {\n${hueCss('dark')}\n}`;
document.head.appendChild(style);

render();
