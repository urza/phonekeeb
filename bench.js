// Phone-side twin of tools/bench-predict.mjs. The desktop harness says
// what an engine change costs; this page says what the phone that has to
// run it costs, which is the number that decides vocabulary size. Both
// measure the same thing the same way: predict() over a sample of
// prefixes drawn from the lists themselves, split by prefix length,
// because an empty prefix (the next-word strip) is the expensive shape.
//
// Deliberately not part of the keyboard page: it loads the trigram
// tables unconditionally, which the data-saving toggle exists to avoid.

import { Predictor } from './prediction.js';
import { WORDS as WEN } from './words-en.js';
import { WORDS as WCS } from './words-cs.js';
import { BIGRAMS as BEN } from './bigrams-en.js';
import { BIGRAMS as BCS } from './bigrams-cs.js';

const $ = (id) => document.getElementById(id);
const status = (text) => { $('status').textContent = text; };
// One frame between phases, so the status line paints before the next
// phase blocks the main thread.
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
const ms = (n) => `${n.toFixed(n < 10 ? 2 : 0)}`;

// 40 words per language is enough for a stable mean and keeps a slow
// phone under a few seconds. The words are spread across the whole list
// so the sample is not all common words.
const SAMPLE_WORDS = 40;
const LENGTHS = [0, 1, 2, 3, 5];

function sampleFrom(lists) {
  const out = [];
  for (const list of lists) {
    const step = Math.max(1, Math.floor(list.length / SAMPLE_WORDS));
    for (let i = 0; i < list.length && out.length < lists.length * SAMPLE_WORDS; i += step) {
      if (list[i]?.[0]) out.push(list[i][0]);
    }
  }
  return out;
}

function bench(predictor, words, ctx) {
  const byLen = new Map(LENGTHS.map((l) => [l, []]));
  for (const w of words) {
    for (const len of LENGTHS) {
      if (len > w.length) continue;
      const t = performance.now();
      predictor.predict(w.slice(0, len), 6, ctx);
      byLen.get(len).push(performance.now() - t);
    }
  }
  const rows = [];
  for (const len of LENGTHS) {
    const ts = byLen.get(len).sort((a, b) => a - b);
    if (!ts.length) continue;
    rows.push({
      len,
      n: ts.length,
      mean: ts.reduce((a, b) => a + b, 0) / ts.length,
      p95: ts[Math.floor(ts.length * 0.95)],
      max: ts[ts.length - 1],
    });
  }
  return rows;
}

function table(title, rows) {
  const body = rows.map((r) => {
    // 16 ms is one frame at 60 Hz: above that a keystroke can drop one.
    const cls = r.p95 > 16 ? 'slow' : r.p95 < 4 ? 'fast' : '';
    return `<tr class="${cls}"><td>${r.len === 0 ? 'next word' : `${r.len} letter${r.len > 1 ? 's' : ''}`}</td>`
      + `<td class="n">${ms(r.mean)}</td><td class="n">${ms(r.p95)}</td>`
      + `<td class="n">${ms(r.max)}</td><td class="n">${r.n}</td></tr>`;
  }).join('');
  return `<section><h2>${title}</h2><table>
    <tr><th>prefix</th><th>mean ms</th><th>p95</th><th>max</th><th>n</th></tr>
    ${body}</table></section>`;
}

let text = ''; // the copyable report, built as the run goes

async function run() {
  $('out').innerHTML = '';
  text = '';
  const add = (html, plain) => { $('out').insertAdjacentHTML('beforeend', html); text += plain; };

  status('building the core predictor...');
  await frame();
  let t = performance.now();
  const predictor = new Predictor([
    { id: 'en', words: WEN, bigrams: BEN },
    { id: 'cs', words: WCS, bigrams: BCS },
  ]);
  const buildMs = performance.now() - t;

  const ctx = { prev: WEN[5][0], prev2: WEN[9][0], recent: [WEN[9][0], WEN[5][0]] };
  const coreWords = sampleFrom([WEN, WCS]);
  status('measuring the core tier...');
  await frame();
  const coreRows = bench(predictor, coreWords, ctx);
  add(table(`Core only, ${WEN.length + WCS.length} words`, coreRows),
    `core only ${WEN.length + WCS.length} words, build ${ms(buildMs)} ms\n`
    + coreRows.map((r) => `  prefix ${r.len}: mean ${ms(r.mean)} p95 ${ms(r.p95)}\n`).join(''));

  status('fetching the extension tier...');
  await frame();
  t = performance.now();
  const [xen, xcs] = await Promise.all([
    import('./words-ext-en.js'),
    import('./words-ext-cs.js'),
  ]);
  const fetchMs = performance.now() - t;
  t = performance.now();
  predictor.addWords('en', xen.WORDS_EXT);
  predictor.addWords('cs', xcs.WORDS_EXT);
  const addMs = performance.now() - t;

  const total = WEN.length + WCS.length + xen.WORDS_EXT.length + xcs.WORDS_EXT.length;
  status('measuring the full vocabulary...');
  await frame();
  const fullRows = bench(predictor, sampleFrom([WEN, WCS, xen.WORDS_EXT, xcs.WORDS_EXT]), ctx);
  add(table(`Core plus extension, ${total} words`, fullRows),
    `full ${total} words, fetch+parse ${ms(fetchMs)} ms, addWords ${ms(addMs)} ms\n`
    + fullRows.map((r) => `  prefix ${r.len}: mean ${ms(r.mean)} p95 ${ms(r.p95)}\n`).join(''));

  status('fetching the trigram tables...');
  await frame();
  t = performance.now();
  try {
    const [ten, tcs] = await Promise.all([
      import('./trigrams-en.js'),
      import('./trigrams-cs.js'),
    ]);
    predictor.setTrigrams('en', ten.TRIGRAMS);
    predictor.setTrigrams('cs', tcs.TRIGRAMS);
  } catch {
    status('trigram tables unavailable (offline?)');
  }
  const triMs = performance.now() - t;
  status('measuring with trigrams...');
  await frame();
  const triRows = bench(predictor, sampleFrom([WEN, WCS, xen.WORDS_EXT, xcs.WORDS_EXT]), ctx);
  add(table('With trigram tables', triRows),
    `with trigrams, load ${ms(triMs)} ms\n`
    + triRows.map((r) => `  prefix ${r.len}: mean ${ms(r.mean)} p95 ${ms(r.p95)}\n`).join(''));

  // Device facts, so a pasted result says which phone produced it.
  // deviceMemory and memory are Chrome-only; Safari reports neither.
  const dev = [
    ['vocabulary', `${total} words`],
    ['core build', `${ms(buildMs)} ms`],
    ['ext fetch + parse', `${ms(fetchMs)} ms`],
    ['ext addWords', `${ms(addMs)} ms`],
    ['trigram load', `${ms(triMs)} ms`],
    ['screen', `${screen.width}x${screen.height} @${devicePixelRatio}`],
    ['cores', navigator.hardwareConcurrency ?? 'unknown'],
    ['device memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'not reported'],
    ['JS heap', performance.memory
      ? `${(performance.memory.usedJSHeapSize / 1e6).toFixed(0)} MB`
      : 'not reported (Safari)'],
    ['agent', navigator.userAgent],
  ];
  add(`<section><h2>Device</h2><dl class="kv">${dev
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>`,
  dev.map(([k, v]) => `${k}: ${v}\n`).join(''));
  status('done');
}

$('run').addEventListener('click', () => { run().catch((e) => status(`failed: ${e.message}`)); });
$('copy').addEventListener('click', async () => {
  if (!text) return status('run it first');
  try {
    await navigator.clipboard.writeText(text);
    status('results copied');
  } catch {
    status('clipboard refused; select the text by hand');
  }
});
