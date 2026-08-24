// Letter placement tables for the two layout modes named in
// gesture-keyboard-handoff.md: build both behind a flag, measure rather
// than argue.

// Approximate letter frequency, most common first, base 26 Latin letters
// only. Diacritics are out of scope for this prototype (see handoff doc,
// "Open design question: letter placement").
export const FREQUENCY = {
  en: ['e','t','a','o','i','n','s','h','r','d','l','c','u','m','w','f','g','y','p','b','v','k','j','x','q','z'],
  cs: ['o','e','a','n','t','s','i','v','l','d','k','r','u','p','m','c','h','z','y','j','b','g','f','w','x','q'],
};

// Physical QWERTY keys grouped by screen quadrant (NW/NE/SW/SE), so the eye
// finds a letter's general area from day one. Row 3 is short, so it merges
// into the row-2 group on each side rather than forming its own sector.
export const QWERTY_GROUPS = {
  NW: ['q','w','e','r','t','a','s','d','f','g'],
  NE: ['y','u','i','o','p','h','j','k','l'],
  SW: ['z','x','c','v','b'],
  SE: ['n','m'],
};

export const SECTORS = ['NW', 'NE', 'SW', 'SE'];

function byFrequency(letters, language) {
  const rank = FREQUENCY[language];
  return [...letters].sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
}

export function buildLayout(mode, language) {
  if (mode === 'qwerty-region') {
    const layout = {};
    for (const sector of SECTORS) {
      layout[sector] = byFrequency(QWERTY_GROUPS[sector], language);
    }
    return layout;
  }

  if (mode === 'frequency') {
    // Pure frequency placement, spread round-robin across sectors so the
    // most common letters land shallow in every sector, not just one.
    const layout = { NW: [], NE: [], SW: [], SE: [] };
    FREQUENCY[language].forEach((letter, i) => {
      layout[SECTORS[i % 4]].push(letter);
    });
    return layout;
  }

  throw new Error(`Unknown layout mode: ${mode}`);
}

export function letterAt(layout, sector, loopCount) {
  const letters = layout[sector];
  if (!letters || letters.length === 0) return null;
  const index = Math.min(loopCount, letters.length - 1);
  return letters[index];
}
