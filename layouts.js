// Letter layouts as data, one registry entry per layout. This is the
// only file to edit when adding or changing a layout: the dropdown, the
// validation, and the tests all read from LAYOUTS.
//
// An entry has a `label` (shown in the dropdown) and either:
//   - `build(language)`: computes the slot map per language, or
//   - `static`: a hand-written slot map, language-independent.
// Slot map shape: sector (N/E/S/W) -> direction -> four letters by
// crossing count, index 0 = 1 crossing = innermost. null = empty slot
// (types nothing, draws nothing).

import { SECTORS, DIRECTIONS, emptyLayout } from './layout.js';

// Approximate letter frequency, most common first, base 26 Latin letters
// only. Hand-written from published tables, not corpus-derived; see the
// discussion in features.md. Diacritics are out of scope for now.
export const FREQUENCY = {
  en: ['e','t','a','o','i','n','s','h','r','d','l','c','u','m','w','f','g','y','p','b','v','k','j','x','q','z'],
  cs: ['o','e','a','n','t','s','i','v','l','d','k','r','u','p','m','c','h','z','y','j','b','g','f','w','x','q'],
};

// Physical QWERTY keys grouped into the four sectors, at most 8 letters
// each (2 directions x 4 crossings is the hard cap). Top row splits
// N/E by keyboard half; the lower-left block goes W, the lower-right
// block goes S.
export const QWERTY_GROUPS = {
  N: ['q','w','e','r','t'],
  E: ['y','u','i','o','p'],
  W: ['a','s','d','f','g','z','x','c'],
  S: ['v','b','n','m','h','j','k','l'],
};

function byFrequency(letters, language) {
  const rank = FREQUENCY[language];
  return [...letters].sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
}

// Fills a sector's 8 slots from a frequency-sorted letter list: the two
// most frequent split across CW/CCW at 1 crossing, next two at 2, etc.
function fillSector(layout, sector, sortedLetters) {
  sortedLetters.forEach((letter, i) => {
    const direction = DIRECTIONS[i % 2];
    layout[sector][direction][Math.floor(i / 2)] = letter;
  });
}

export const LAYOUTS = {
  'original-8pen': {
    label: 'Original 8pen',
    // Transcribed from 8pen.png (repo root), a screenshot of the
    // original app. The geometry now matches the original directly:
    // X-shaped arms, sectors up/right/down/left. Reading order per
    // line: innermost glyph first (1 crossing). All 26 letters plus 6
    // punctuation marks fill the 32 slots exactly; the frequent ones
    // (. and ,) sit innermost, the rare ones (' ? ! @) outermost.
    static: {
      N: { CW: ['i', 'd', 'g', 'z'], CCW: ['y', 'x', 'k', "'"] },
      E: { CW: ['o', 'u', 'w', '!'], CCW: ['a', 'r', 'f', '?'] },
      S: { CW: ['e', 'l', 'p', 'q'], CCW: ['t', 'h', 'b', '@'] },
      W: { CW: ['.', 's', 'c', 'v'], CCW: [',', 'n', 'm', 'j'] },
    },
  },

  'qwerty-region': {
    label: 'QWERTY region',
    build(language) {
      const layout = emptyLayout();
      for (const sector of SECTORS) {
        fillSector(layout, sector, byFrequency(QWERTY_GROUPS[sector], language));
      }
      return layout;
    },
  },

  'frequency': {
    label: 'Pure frequency',
    build(language) {
      // Crossing-major fill: every 1-crossing slot (all sectors, both
      // directions) gets filled before any 2-crossing slot, so the most
      // common letters need minimal rotation everywhere.
      const layout = emptyLayout();
      const ranked = FREQUENCY[language];
      let i = 0;
      for (let slot = 0; slot < 4 && i < ranked.length; slot++) {
        for (const sector of SECTORS) {
          for (const direction of DIRECTIONS) {
            if (i >= ranked.length) break;
            layout[sector][direction][slot] = ranked[i++];
          }
        }
      }
      return layout;
    },
  },
};

// What the page starts on. The dropdown still lists everything.
export const DEFAULT_LAYOUT = 'original-8pen';

export function buildLayout(id, language) {
  const def = LAYOUTS[id];
  if (!def) throw new Error(`Unknown layout: ${id}`);
  return def.static ?? def.build(language);
}
