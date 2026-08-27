// The emoji picker: a grid of emoji with category tabs, modelled on the
// iPhone one. It knows nothing about gestures or about the text being
// edited; it reports a tap through onPick and lets the caller decide
// what that means, the same split wheel-svg.js keeps.
//
// The caller places the returned element and styles it (see
// #emojiPicker in style.css). This module owns only the contents and
// the recently-used list.
import { EMOJI_CATEGORIES } from './emoji-data.js';

// Recently used emoji, newest first, on this device only. The picker is
// useless without it: nobody hunts through 925 emoji for the same three
// they always send.
const RECENT_KEY = 'phonekeeb.emojiRecent';
// Two rows on a phone at the current cell size. More would push the
// third row half off screen and turn the shortcut back into a hunt.
const RECENT_MAX = 16;

const RECENT_TAB = { id: 'recent', label: 'Recently used', icon: '🕘' };

function loadRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY));
    // Anything else in the slot (an old format, a hand edit) is dropped
    // rather than trusted: this list is rendered as DOM text.
    return Array.isArray(raw) ? raw.filter((e) => typeof e === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function createEmojiPicker({ onPick }) {
  let recent = loadRecent();

  const el = document.createElement('div');
  el.id = 'emojiPicker';
  el.hidden = true;

  const grid = document.createElement('div');
  grid.className = 'emoji-grid';

  const tabs = document.createElement('div');
  tabs.className = 'emoji-tabs';
  tabs.setAttribute('role', 'tablist');

  // Tabs sit below the grid, as on the iPhone keyboard: the thumb
  // reaches the bottom edge, and a tab row at the top would collide
  // with the emoji button in the corner above.
  el.append(grid, tabs);

  const all = [RECENT_TAB, ...EMOJI_CATEGORIES];
  let activeId = null;

  // Built grids are kept and re-shown, not rebuilt: 925 buttons across
  // ten categories is enough DOM that rebuilding on every tab switch
  // stutters, and building all of it up front delays the first open.
  const built = new Map();

  function buildGrid(id) {
    const page = document.createElement('div');
    page.className = 'emoji-page';
    const emojis = id === RECENT_TAB.id
      ? recent
      : EMOJI_CATEGORIES.find((c) => c.id === id).emojis;
    for (const emoji of emojis) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-cell';
      b.dataset.emoji = emoji;
      b.textContent = emoji;
      page.append(b);
    }
    if (id === RECENT_TAB.id && !emojis.length) {
      const empty = document.createElement('p');
      empty.className = 'emoji-empty';
      empty.textContent = 'Emoji you pick appear here.';
      page.append(empty);
    }
    return page;
  }

  // Drops a built page. The node must leave the DOM with the map entry:
  // the visibility loop below only touches pages the map still knows
  // about, so an orphan left behind would stay on screen under its
  // replacement.
  function drop(id) {
    built.get(id)?.remove();
    built.delete(id);
  }

  function select(id) {
    // The recent page is the one that goes stale, so it is rebuilt on
    // every visit. Rebuilding it right after a pick instead would
    // reshuffle the grid under a finger that is picking a second emoji.
    if (id === RECENT_TAB.id) drop(id);
    if (!built.has(id)) {
      const page = buildGrid(id);
      built.set(id, page);
      grid.append(page);
    }
    for (const [key, page] of built) page.hidden = key !== id;
    for (const tab of tabs.children) {
      const on = tab.dataset.category === id;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
    }
    activeId = id;
    grid.scrollTop = 0;
  }

  for (const cat of all) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'emoji-tab';
    tab.dataset.category = cat.id;
    tab.textContent = cat.icon;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-label', cat.label);
    tabs.append(tab);
  }

  tabs.addEventListener('click', (e) => {
    const id = e.target.dataset?.category;
    if (id) select(id);
  });

  grid.addEventListener('click', (e) => {
    const emoji = e.target.dataset?.emoji;
    if (!emoji) return;
    recent = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
    // The recent page is now out of date. It is dropped, not rebuilt,
    // so the rebuild happens when that tab is next opened. While that
    // page is the visible one it must stay as it is; select() drops it
    // on the next visit anyway.
    if (activeId !== RECENT_TAB.id) drop(RECENT_TAB.id);
    onPick(emoji);
  });

  return {
    el,
    open() {
      el.hidden = false;
      // Open on the emoji you actually use; fall back to smileys on a
      // first run, when the recent page would be empty.
      if (!activeId) select(recent.length ? RECENT_TAB.id : EMOJI_CATEGORIES[0].id);
    },
    close() {
      el.hidden = true;
    },
  };
}
