// PWA checks in a real browser: the service worker precaches the
// build, the app then loads with the network cut, and the Force
// update button still reloads a working page when back online.
//
// Run:
//   python3 -m http.server 8080          (repo root, in another shell)
//   node tests/pwa-offline.mjs
//
// Playwright lives OUTSIDE the repo (~/pw) because this filesystem does
// not support the symlinks npm needs. Set PW_DIR to override.

import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pwDir = process.env.PW_DIR ?? path.join(os.homedir(), 'pw');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const URL = process.env.URL ?? 'http://localhost:8080';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
const failures = [];

// data-center is set by main.js after the layout builds, so its
// presence proves the whole module graph loaded and executed.
const appAlive = () => page.waitForFunction(
  () => document.querySelector('#stage')?.dataset.center,
  null, { timeout: 10000 },
);

await page.goto(URL);
await appAlive();

// 1. The worker installs, precaches this build, and takes control.
const swState = await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  const keys = await caches.keys();
  const cache = await caches.open(keys[0] ?? 'none');
  return { keys, entries: (await cache.keys()).length };
});
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
if (!(swState.keys.length === 1 && /^phonekeeb-b\d+$/.test(swState.keys[0]))) {
  failures.push(`cache keys: ${JSON.stringify(swState.keys)}`);
}
if (swState.entries < 15) failures.push(`precache has only ${swState.entries} entries`);

// 2. Offline launch: the cut network forces every request to the cache.
await page.context().setOffline(true);
await page.reload();
try {
  await appAlive();
} catch {
  failures.push('app did not load offline');
}

// 3. Force update (online again): nukes caches, reloads, app comes back.
await page.context().setOffline(false);
await page.click('#settingsToggle');
await Promise.all([page.waitForNavigation(), page.click('#forceReload')]);
try {
  await appAlive();
} catch {
  failures.push('app did not load after Force update');
}

// Settings stayed open across the reload (persisted), so the shot
// shows the Force update button for the visual check.
await page.screenshot({ path: process.env.SHOT ?? '/tmp/pwa-offline.png' });
console.log(failures.length === 0 ? 'PASS' : `FAIL ${failures.join('; ')}`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
