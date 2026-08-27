// The emoji picker: one continuous scroll through every category, with
// tabs that jump to a category and follow the scroll back. It knows
// nothing about gestures or about the text being edited; it reports a
// tap through onPick and lets the caller decide what that means, the
// same split wheel-svg.js keeps.
//
// The caller places the returned element; the .pad-* classes in
// style.css style it, shared with the number and symbol pad. This
// module owns only the contents and the recently-used list.
import { EMOJI_CATEGORIES } from './emoji-data.js';

// Recently used emoji, newest first, on this device only. The picker is
// useless without it: nobody scrolls through 925 emoji for the same
// three they always send.
const RECENT_KEY = 'phonekeeb.emojiRecent';
// Two rows at the current cell size. This section sits at the top of
// the scroll, so a taller one would push every category down.
const RECENT_MAX = 16;

const RECENT = { id: 'recent', label: 'Recently used', icon: '🕘' };

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
  el.className = 'pad-panel';
  el.hidden = true;

  const grid = document.createElement('div');
  grid.className = 'pad-scroll';

  const tabs = document.createElement('div');
  tabs.className = 'pad-bar';
  tabs.setAttribute('role', 'tablist');

  // Tabs sit below the grid, as on the iPhone keyboard: the thumb
  // reaches the bottom edge of the screen most easily.
  el.append(grid, tabs);

  const all = [RECENT, ...EMOJI_CATEGORIES];
  const sections = new Map();
  let activeId = null;

  function fill(page, emojis) {
    const frag = document.createDocumentFragment();
    for (const emoji of emojis) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pad-cell';
      b.dataset.emoji = emoji;
      b.textContent = emoji;
      frag.append(b);
    }
    page.replaceChildren(frag);
  }

  // Every category is built once, up front: with one continuous scroll
  // there is no tab switch left to build on, and 925 buttons is a cost
  // paid once on the first open of a session.
  for (const cat of all) {
    const section = document.createElement('section');
    section.className = 'pad-section';
    section.dataset.category = cat.id;

    const heading = document.createElement('h2');
    heading.className = 'pad-heading';
    heading.textContent = cat.label;

    const page = document.createElement('div');
    page.className = 'pad-row';
    if (cat.id !== RECENT.id) fill(page, cat.emojis);

    section.append(heading, page);
    grid.append(section);
    sections.set(cat.id, { section, page });

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'emoji-tab';
    tab.dataset.category = cat.id;
    tab.textContent = cat.icon;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-label', cat.label);
    tabs.append(tab);
  }

  function renderRecent() {
    const { page } = sections.get(RECENT.id);
    fill(page, recent);
    if (!recent.length) {
      const empty = document.createElement('p');
      empty.className = 'emoji-empty';
      empty.textContent = 'Emoji you pick appear here.';
      page.append(empty);
    }
  }

  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    for (const tab of tabs.children) {
      const on = tab.dataset.category === id;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
    }
  }

  // Scroll offset of a section inside the grid. Measured against the
  // first section rather than used raw: offsetTop is counted from the
  // grid's border box, which the grid's own top padding shifts.
  function offsetOf(id) {
    const first = sections.get(all[0].id).section;
    return sections.get(id).section.offsetTop - first.offsetTop;
  }

  function syncActiveToScroll() {
    let id = all[0].id;
    // The last section whose heading has reached the top edge wins.
    // The 4 px tolerance covers sub-pixel layout, which can leave a
    // heading a hair short of the offset it was scrolled to.
    for (const cat of all) {
      if (offsetOf(cat.id) <= grid.scrollTop + 4) id = cat.id;
    }
    setActive(id);
  }

  let scrollRaf = null;
  grid.addEventListener('scroll', () => {
    if (scrollRaf !== null) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      syncActiveToScroll();
    });
  });

  tabs.addEventListener('click', (e) => {
    const id = e.target.dataset?.category;
    if (!id) return;
    grid.scrollTop = offsetOf(id);
    // Not left to the scroll handler: a jump to the last section stops
    // short of its offset (there is nothing below it to scroll into),
    // and the handler would then light the section above it.
    setActive(id);
  });

  grid.addEventListener('click', (e) => {
    const emoji = e.target.dataset?.emoji;
    if (!emoji) return;
    recent = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
    // The recent section is deliberately left stale until the next
    // open: rebuilding it now would move every category down the
    // scroll, under a finger that is picking a second emoji.
    onPick(emoji);
  });

  return {
    el,
    open() {
      el.hidden = false;
      renderRecent();
      // Land on the emoji you actually use. A first run has no recent
      // section worth reading, so it starts at the first category.
      const id = recent.length ? RECENT.id : EMOJI_CATEGORIES[0].id;
      grid.scrollTop = offsetOf(id);
      setActive(id);
    },
    close() {
      el.hidden = true;
    },
  };
}
