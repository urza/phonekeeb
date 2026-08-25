// Color themes. Like layouts.js, this registry is the only file to
// edit when adding or changing a theme: the dropdown, the page, the
// canvas, and the tests all read from it.
//
// Each theme sets the same seven CSS variables. The canvas reads them
// through getComputedStyle, so one map colors both the page and the
// drawing:
//   --bg            page background and text panels
//   --panel         canvas and suggestion chips
//   --fg            text, keyboard letters, HUD
//   --muted         hints, outer letters, sector names, function glyphs
//   --line          arms and borders
//   --trail         finger trail in the sectors
//   --trail-center  finger trail over the center circle
//
// tests/themes-unit.mjs enforces contrast floors against --panel
// (letters 4.5, muted 3.0, trails 2.2, lines 1.2), so a theme that
// makes the letters hard to read fails before it ships.

export const THEME_VARS = ['--bg', '--panel', '--fg', '--muted', '--line', '--trail', '--trail-center'];

export const THEMES = {
  auto: {
    // Follows the device light/dark setting through the stylesheet's
    // media query. style.css duplicates the light and dark palettes
    // below and carries a keep-in-sync note.
    label: 'Auto (system)',
    vars: null,
  },
  light: {
    label: 'Light',
    scheme: 'light',
    vars: {
      '--bg': '#fafafa', '--panel': '#ffffff', '--fg': '#111111',
      '--muted': '#777777', '--line': '#dddddd',
      '--trail': '#2563eb', '--trail-center': '#16a34a',
    },
  },
  dark: {
    label: 'Dark',
    scheme: 'dark',
    vars: {
      '--bg': '#141414', '--panel': '#1c1c1c', '--fg': '#eeeeee',
      '--muted': '#999999', '--line': '#3a3a3a',
      '--trail': '#60a5fa', '--trail-center': '#4ade80',
    },
  },
  black: {
    // True black everywhere for OLED screens; borders carry the
    // panel separation instead of background shades.
    label: 'Black (OLED)',
    scheme: 'dark',
    vars: {
      '--bg': '#000000', '--panel': '#000000', '--fg': '#ffffff',
      '--muted': '#999999', '--line': '#333333',
      '--trail': '#3b82f6', '--trail-center': '#22c55e',
    },
  },
  grey: {
    label: 'Grey',
    scheme: 'dark',
    vars: {
      '--bg': '#262626', '--panel': '#303030', '--fg': '#e8e8e8',
      '--muted': '#9e9e9e', '--line': '#4d4d4d',
      '--trail': '#64b5f6', '--trail-center': '#81c784',
    },
  },
  'solarized-dark': {
    // Ethan Schoonover's palette. base2 for letters instead of the
    // usual base0 body text: keyboard letters are small and need more
    // contrast than editor text.
    label: 'Solarized Dark',
    scheme: 'dark',
    vars: {
      '--bg': '#002b36', '--panel': '#073642', '--fg': '#eee8d5',
      '--muted': '#839496', '--line': '#586e75',
      '--trail': '#268bd2', '--trail-center': '#859900',
    },
  },
  'solarized-light': {
    label: 'Solarized Light',
    scheme: 'light',
    vars: {
      '--bg': '#fdf6e3', '--panel': '#eee8d5', '--fg': '#073642',
      '--muted': '#657b83', '--line': '#93a1a1',
      '--trail': '#268bd2', '--trail-center': '#859900',
    },
  },
  nord: {
    label: 'Nord',
    scheme: 'dark',
    vars: {
      '--bg': '#2e3440', '--panel': '#3b4252', '--fg': '#eceff4',
      // nord3 (#616e88 comments) fails the 3.0 muted floor; lightened.
      '--muted': '#8c96a8', '--line': '#4c566a',
      '--trail': '#88c0d0', '--trail-center': '#a3be8c',
    },
  },
  dracula: {
    label: 'Dracula',
    scheme: 'dark',
    vars: {
      '--bg': '#282a36', '--panel': '#343746', '--fg': '#f8f8f2',
      // Dracula's comment blue #6272a4 fails the 3.0 floor; lightened.
      '--muted': '#7b88b8', '--line': '#44475a',
      '--trail': '#bd93f9', '--trail-center': '#50fa7b',
    },
  },
  'gruvbox-dark': {
    label: 'Gruvbox Dark',
    scheme: 'dark',
    vars: {
      '--bg': '#282828', '--panel': '#32302f', '--fg': '#ebdbb2',
      '--muted': '#a89984', '--line': '#504945',
      '--trail': '#83a598', '--trail-center': '#b8bb26',
    },
  },
  monokai: {
    label: 'Monokai',
    scheme: 'dark',
    vars: {
      '--bg': '#1e1f1c', '--panel': '#272822', '--fg': '#f8f8f2',
      '--muted': '#a59f85', '--line': '#49483e',
      '--trail': '#66d9ef', '--trail-center': '#a6e22e',
    },
  },
  'one-dark': {
    label: 'One Dark',
    scheme: 'dark',
    vars: {
      '--bg': '#21252b', '--panel': '#282c34', '--fg': '#dcdfe4',
      '--muted': '#8b919c', '--line': '#3e4451',
      '--trail': '#61afef', '--trail-center': '#98c379',
    },
  },
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    scheme: 'dark',
    vars: {
      '--bg': '#181825', '--panel': '#1e1e2e', '--fg': '#cdd6f4',
      '--muted': '#9399b2', '--line': '#45475a',
      '--trail': '#89b4fa', '--trail-center': '#a6e3a1',
    },
  },
};

export const DEFAULT_THEME = 'auto';

// Sector learning colors: one hue per sector (N blue, E orange,
// S green, W purple). The canvas tints each quadrant and draws every
// letter in the hue of its LANDING sector (where the glide returns to
// the center from), so a learner sees at a glance toward which region
// to drag before coming back. Two variants instead of per-theme
// entries: themes only vary in panel brightness, so one palette per
// scheme keeps 13 themes maintainable. tests/themes-unit.mjs enforces
// >= 4.5 contrast against every same-scheme --panel.
export const SECTOR_COLORS = {
  light: { N: '#1d4ed8', E: '#9a3f00', S: '#046c4e', W: '#8626e0' },
  dark: { N: '#93c5fd', E: '#fdba74', S: '#86efac', W: '#e9b8ff' },
};
