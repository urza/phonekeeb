// Service worker: offline cache for exactly one pinned build.
//
// The ?v= pinning in index.html/cards.html stays the freshness
// mechanism; this worker is designed around it instead of against it:
// - BUILD below must equal the ?v= number. Bump them together.
// - The cache holds one build's pinned URLs. Activating a new worker
//   deletes every older cache, so two builds never mix.
// - Navigations go network-first with `cache: 'no-cache'`, which
//   revalidates GitHub Pages' 10-minute HTTP cache. An online launch
//   therefore gets the newest index (and with it the newest ?v= set)
//   right away; the cached copy is served only when the network fails.
const BUILD = 35;
const CACHE = `phonekeeb-b${BUILD}`;

// Everything a launch needs, pinned to this build. The trigram tables
// are deliberately absent: they are ~1.4 MB and lazy-loaded behind the
// "Trigram data" toggle, so precaching them would defeat the toggle's
// data saving. They are runtime-cached in the fetch handler instead.
const ASSETS = [
  './',
  './index.html',
  './cards.html',
  './game.html',
  './dictionary.html',
  `./style.css?v=${BUILD}`,
  `./main.js?v=${BUILD}`,
  `./cards.js?v=${BUILD}`,
  `./game.js?v=${BUILD}`,
  `./dictionary.js?v=${BUILD}`,
  `./wheel-svg.js?v=${BUILD}`,
  `./qwerty-map.js?v=${BUILD}`,
  // Lazy-loaded on the first emoji-button press, but precached anyway:
  // together they are ~35 kB, small enough that the toggle-saving
  // argument for the trigram tables does not apply, and precaching is
  // what makes the picker work offline the first time it is opened.
  `./emoji-picker.js?v=${BUILD}`,
  `./emoji-data.js?v=${BUILD}`,
  `./symbols-pad.js?v=${BUILD}`,
  `./gesture-decoder.js?v=${BUILD}`,
  `./layout.js?v=${BUILD}`,
  `./layouts.js?v=${BUILD}`,
  `./themes.js?v=${BUILD}`,
  `./prediction.js?v=${BUILD}`,
  `./words-en.js?v=${BUILD}`,
  `./words-cs.js?v=${BUILD}`,
  `./bigrams-en.js?v=${BUILD}`,
  `./bigrams-cs.js?v=${BUILD}`,
  `./manifest.webmanifest?v=${BUILD}`,
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  // skipWaiting: take over without waiting for every tab to close.
  // Safe here because cache keys carry the ?v= build, so a still-open
  // old page keeps resolving its own URLs (from the network) and never
  // gets new-build bytes under an old name from this cache.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  if (req.mode === 'navigate') {
    // fetch(req.url, ...) not fetch(req, ...): a navigate-mode Request
    // cannot be re-constructed with a different cache option.
    event.respondWith(
      fetch(req.url, { cache: 'no-cache' }).catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then((hit) => hit ?? caches.match('./index.html'))
      )
    );
    return;
  }

  // Assets: cache-first. A miss (a lazy-loaded table, or a newer ?v=
  // requested while this worker is still the active one) goes to the
  // network. Store the copy only when its ?v= matches this build, so a
  // stale open page cannot plant a wrong-build entry in this cache.
  event.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      const v = new URL(req.url).searchParams.get('v');
      if (res.ok && (v === null || v === String(BUILD))) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
