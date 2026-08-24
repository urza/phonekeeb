// Letter placement for the 32-slot address space (4 quadrants x 2
// directions x 4 depths) that gesture-decoder.js produces, modeled on how
// the real 8pen keyboard worked: most frequent letters need the least
// rotation. Two placement strategies, selectable behind a flag, per the
// open design question in gesture-keyboard-handoff.md: build both, measure
// rather than argue.

// Approximate letter frequency, most common first, base 26 Latin letters
// only. Diacritics are out of scope for this prototype (see handoff doc,
// "Open design question: letter placement").
export const FREQUENCY = {
  en: ['e','t','a','o','i','n','s','h','r','d','l','c','u','m','w','f','g','y','p','b','v','k','j','x','q','z'],
  cs: ['o','e','a','n','t','s','i','v','l','d','k','r','u','p','m','c','h','z','y','j','b','g','f','w','x','q'],
};

// Physical QWERTY keys grouped by screen quadrant, rebalanced to at most 8
// letters each (2 directions x 4 depths per quadrant is the hard cap). A
// few letters moved from their literal row into the geographically
// nearest quadrant to fit: f/g into SW (below them), k/l into SE.
export const QWERTY_GROUPS = {
  NW: ['q','w','e','r','t','a','s','d'],
  NE: ['y','u','i','o','p','h','j'],
  SW: ['z','x','c','v','b','f','g'],
  SE: ['n','m','k','l'],
};

export const QUADRANTS = ['NW', 'NE', 'SW', 'SE'];
export const DIRECTIONS = ['CW', 'CCW'];

function byFrequency(letters, language) {
  const rank = FREQUENCY[language];
  return [...letters].sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
}

function emptyLayout() {
  const layout = {};
  for (const q of QUADRANTS) layout[q] = { CW: [null, null, null, null], CCW: [null, null, null, null] };
  return layout;
}

// Fills a quadrant's 8 slots from a frequency-sorted letter list: the two
// most frequent split across CW/CCW at depth 0, next two at depth 1, etc.
function fillQuadrant(layout, quadrant, sortedLetters) {
  sortedLetters.forEach((letter, i) => {
    const direction = DIRECTIONS[i % 2];
    const depth = Math.floor(i / 2);
    layout[quadrant][direction][depth] = letter;
  });
}

export function buildLayout(mode, language) {
  const layout = emptyLayout();

  if (mode === 'qwerty-region') {
    for (const quadrant of QUADRANTS) {
      fillQuadrant(layout, quadrant, byFrequency(QWERTY_GROUPS[quadrant], language));
    }
    return layout;
  }

  if (mode === 'frequency') {
    // Depth-major fill: every depth-0 slot (all quadrants, both
    // directions) gets filled before any depth-1 slot, so the most common
    // letters land at minimal rotation everywhere, not just in one
    // quadrant. This is the placement 8pen itself used.
    const ranked = FREQUENCY[language];
    let i = 0;
    for (let depth = 0; depth < 4 && i < ranked.length; depth++) {
      for (const quadrant of QUADRANTS) {
        for (const direction of DIRECTIONS) {
          if (i >= ranked.length) break;
          layout[quadrant][direction][depth] = ranked[i++];
        }
      }
    }
    return layout;
  }

  throw new Error(`Unknown layout mode: ${mode}`);
}

export function letterAt(layout, quadrant, direction, depth) {
  return layout[quadrant]?.[direction]?.[depth] ?? null;
}
