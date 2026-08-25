// Unit test of the theme registry: every theme defines the full
// variable set as hex colors, and letters keep readable contrast
// against the canvas. The floors are the promise made in themes.js.
// Run: node tests/themes-unit.mjs

import { THEMES, THEME_VARS, DEFAULT_THEME, SECTOR_COLORS } from '../themes.js';

let failures = 0;
function check(name, ok, detail) {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
  if (!ok) failures++;
}

// WCAG relative luminance and contrast ratio for #rrggbb colors.
function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

check('default theme exists', Boolean(THEMES[DEFAULT_THEME]), DEFAULT_THEME);
check('auto follows the stylesheet', THEMES.auto?.vars === null, 'auto must have vars: null');

// [foreground, background, minimum ratio]
const FLOORS = [
  ['--fg', '--panel', 4.5],
  ['--fg', '--bg', 4.5],
  ['--muted', '--panel', 3.0],
  ['--trail', '--panel', 2.2],
  ['--trail-center', '--panel', 2.2],
  ['--line', '--panel', 1.2],
];

for (const [id, def] of Object.entries(THEMES)) {
  if (!def.vars) continue;
  check(`${id} sets color-scheme`, def.scheme === 'light' || def.scheme === 'dark', String(def.scheme));
  const bad = THEME_VARS.filter((name) => !/^#[0-9a-f]{6}$/.test(def.vars[name] ?? ''));
  check(`${id} defines all vars as #rrggbb`, bad.length === 0, bad.join(' '));
  if (bad.length) continue;
  for (const [fg, bg, floor] of FLOORS) {
    const ratio = contrast(def.vars[fg], def.vars[bg]);
    check(`${id} ${fg} on ${bg} >= ${floor}`, ratio >= floor, `ratio ${ratio.toFixed(2)}`);
  }
}

// Sector learning colors: letters are drawn in these hues, so each hue
// must keep letter-grade contrast on every panel of its scheme. The
// auto theme reuses the light/dark palettes above, so it is covered.
for (const [scheme, palette] of Object.entries(SECTOR_COLORS)) {
  check(`sector palette ${scheme} covers N E S W`,
    ['N', 'E', 'S', 'W'].every((s) => s in palette), Object.keys(palette).join(' '));
  for (const [sector, color] of Object.entries(palette)) {
    check(`sector ${scheme} ${sector} is #rrggbb`, /^#[0-9a-f]{6}$/.test(color), color);
    for (const [id, def] of Object.entries(THEMES)) {
      if (!def.vars || def.scheme !== scheme) continue;
      const ratio = contrast(color, def.vars['--panel']);
      check(`sector ${scheme} ${sector} on ${id} panel >= 4.5`, ratio >= 4.5, `ratio ${ratio.toFixed(2)}`);
    }
  }
}

process.exit(failures ? 1 : 0);
