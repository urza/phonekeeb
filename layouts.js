// Letter layouts as data, one registry entry per layout. This is the
// only file to edit when adding or changing a layout: the dropdown, the
// validation, and the tests all read from LAYOUTS.
//
// An entry has a `label` (shown in the dropdown) and either:
//   - `build(language)`: computes the slot map per language, or
//   - `static`: a hand-written slot map, language-independent.
// Slot map shape: quadrant -> direction -> four letters by crossing
// count, index 0 = 1 crossing = innermost. null = empty slot (types
// nothing, draws nothing).

import { QUADRANTS, DIRECTIONS, emptyLayout } from './layout.js';

// Approximate letter frequency, most common first, base 26 Latin letters
// only. Hand-written from published tables, not corpus-derived; see the
// discussion in features.md. Diacritics are out of scope for now.
export const FREQUENCY = {
  en: ['e','t','a','o','i','n','s','h','r','d','l','c','u','m','w','f','g','y','p','b','v','k','j','x','q','z'],
  cs: ['o','e','a','n','t','s','i','v','l','d','k','r','u','p','m','c','h','z','y','j','b','g','f','w','x','q'],
};

// Physical QWERTY keys grouped by screen quadrant, rebalanced to at most 8
// letters each (2 directions x 4 crossings per quadrant is the hard cap).
// A few letters moved from their literal row into the geographically
// nearest quadrant to fit: f/g into SW (below them), k/l into SE.
export const QWERTY_GROUPS = {
  NW: ['q','w','e','r','t','a','s','d'],
  NE: ['y','u','i','o','p','h','j'],
  SW: ['z','x','c','v','b','f','g'],
  SE: ['n','m','k','l'],
};

function byFrequency(letters, language) {
  const rank = FREQUENCY[language];
  return [...letters].sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
}

// Fills a quadrant's 8 slots from a frequency-sorted letter list: the two
// most frequent split across CW/CCW at 1 crossing, next two at 2, etc.
function fillQuadrant(layout, quadrant, sortedLetters) {
  sortedLetters.forEach((letter, i) => {
    const direction = DIRECTIONS[i % 2];
    layout[quadrant][direction][Math.floor(i / 2)] = letter;
  });
}

export const LAYOUTS = {
  'qwerty-region': {
    label: 'QWERTY region',
    build(language) {
      const layout = emptyLayout();
      for (const quadrant of QUADRANTS) {
        fillQuadrant(layout, quadrant, byFrequency(QWERTY_GROUPS[quadrant], language));
      }
      return layout;
    },
  },

  'frequency': {
    label: 'Pure frequency',
    build(language) {
      // Crossing-major fill: every 1-crossing slot (all quadrants, both
      // directions) gets filled before any 2-crossing slot, so the most
      // common letters need minimal rotation everywhere.
      const layout = emptyLayout();
      const ranked = FREQUENCY[language];
      let i = 0;
      for (let slot = 0; slot < 4 && i < ranked.length; slot++) {
        for (const quadrant of QUADRANTS) {
          for (const direction of DIRECTIONS) {
            if (i >= ranked.length) break;
            layout[quadrant][direction][slot] = ranked[i++];
          }
        }
      }
      return layout;
    },
  },

  'original-8pen': {
    label: 'Original 8pen',
    // Transcribed from 8pen.png (repo root), a screenshot of the
    // original app. Its arms form an X (sectors top/right/bottom/left);
    // ours form a plus, so sectors are mapped by a 45-degree rotation:
    // top->NW, right->NE, bottom->SE, left->SW. Reading order per line:
    // innermost glyph first (1 crossing). All 26 letters plus 6
    // punctuation marks fill the 32 slots exactly; the frequent ones
    // (. and ,) sit innermost, the rare ones (' ? ! @) outermost.
    static: {
      NW: { CW: ['i', 'd', 'g', 'z'], CCW: ['y', 'x', 'k', "'"] },
      NE: { CW: ['o', 'u', 'w', '!'], CCW: ['a', 'r', 'f', '?'] },
      SE: { CW: ['e', 'l', 'p', 'q'], CCW: ['t', 'h', 'b', '@'] },
      SW: { CW: ['.', 's', 'c', 'v'], CCW: [',', 'n', 'm', 'j'] },
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
