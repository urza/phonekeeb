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

// The smallest step this browser's clock can report. Safari clamps
// performance.now() to 1 ms against timing attacks, so a single
// sub-millisecond call reads as 0 or 1 and nothing in between: a phone
// reported "mean 0.44, p95 1.00" for work that never took a
// millisecond. Everything below is timed in batches for that reason.
function timerQuantum() {
  let min = Infinity;
  for (let i = 0; i < 200; i++) {
    const a = performance.now();
    let b = a;
    // Bounded spin: if the clock never moves, give up rather than hang.
    for (let k = 0; k < 200000 && b === a; k++) b = performance.now();
    if (b > a) min = Math.min(min, b - a);
  }
  return min === Infinity ? 0 : min;
}

// Calls per timed batch. A batch must outlast the clock's quantum by
// enough that rounding is noise: 10 calls of 0.4 ms is 4 ms, four
// Safari ticks. The mean stays exact (total time / calls); the worst
// figure becomes the worst BATCH, which the table header says.
const BATCH = 10;

function bench(predictor, words, ctx) {
  const rows = [];
  for (const len of LENGTHS) {
    const prefixes = words.filter((w) => w.length >= len).map((w) => w.slice(0, len));
    if (!prefixes.length) continue;
    const batchMeans = [];
    let total = 0;
    for (let i = 0; i < prefixes.length; i += BATCH) {
      const slice = prefixes.slice(i, i + BATCH);
      const t = performance.now();
      for (const p of slice) predictor.predict(p, 6, ctx);
      const dt = performance.now() - t;
      total += dt;
      batchMeans.push(dt / slice.length);
    }
    batchMeans.sort((a, b) => a - b);
    // No p95: 160 prefixes make 16 batches, and the 95th percentile of
    // 16 samples IS the last one. Mean and worst batch are what this
    // sample size can honestly report.
    rows.push({
      len,
      n: prefixes.length,
      mean: total / prefixes.length,
      max: batchMeans[batchMeans.length - 1],
    });
  }
  return rows;
}

function table(title, rows) {
  const body = rows.map((r) => {
    // 16 ms is one frame at 60 Hz: a strip that costs that much can drop
    // one. 4 ms leaves the frame to the drawing.
    const cls = r.max > 16 ? 'slow' : r.max < 4 ? 'fast' : '';
    return `<tr class="${cls}"><td>${r.len === 0 ? 'next word' : `${r.len} letter${r.len > 1 ? 's' : ''}`}</td>`
      + `<td class="n">${ms(r.mean)}</td>`
      + `<td class="n">${ms(r.max)}</td><td class="n">${r.n}</td></tr>`;
  }).join('');
  return `<section><h2>${title}</h2><table>
    <tr><th>prefix</th><th>mean ms</th><th>worst 10</th><th>n</th></tr>
    ${body}</table></section>`;
}

let text = ''; // the copyable report, built as the run goes
let phase = ''; // the step in flight, so a copied partial run says where it stopped

// Two phone runs came back holding the core table alone, and neither
// the page nor the paste said whether the next step had failed or was
// still going. Every phase now names itself in the copied text, and a
// step that cannot finish says so instead of leaving a status line
// spinning: a fetch that hangs is a result, not a missing one.
const STEP_TIMEOUT = 90000;
const mark = (name) => {
  phase = name;
  status(`${name}...`);
  text += `> ${name}\n`;
};
const step = (name, promise) => {
  mark(name);
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`gave up after ${STEP_TIMEOUT / 1000}s`)), STEP_TIMEOUT)),
  ]);
};

async function run() {
  $('out').innerHTML = '';
  text = '';
  const add = (html, plain) => { $('out').insertAdjacentHTML('beforeend', html); text += plain; };

  mark('checking the clock');
  await frame();
  const quantum = timerQuantum();
  text += `clock step ${quantum ? quantum.toFixed(3) : '<0.001'} ms\n`;

  mark('building the core predictor');
  await frame();
  let t = performance.now();
  const predictor = new Predictor([
    { id: 'en', words: WEN, bigrams: BEN },
    { id: 'cs', words: WCS, bigrams: BCS },
  ]);
  const buildMs = performance.now() - t;

  const ctx = { prev: WEN[5][0], prev2: WEN[9][0], recent: [WEN[9][0], WEN[5][0]] };
  const coreWords = sampleFrom([WEN, WCS]);
  mark('measuring the core tier');
  await frame();
  const coreRows = bench(predictor, coreWords, ctx);
  add(table(`Core only, ${WEN.length + WCS.length} words`, coreRows),
    `core only ${WEN.length + WCS.length} words, build ${ms(buildMs)} ms\n`
    + coreRows.map((r) => `  prefix ${r.len}: mean ${ms(r.mean)} worst10 ${ms(r.max)}\n`).join(''));

  await frame();
  t = performance.now();
  const [xen, xcs] = await step('fetching the extension tier, 3.4 MB', Promise.all([
    import('./words-ext-en.js'),
    import('./words-ext-cs.js'),
  ]));
  const fetchMs = performance.now() - t;
  t = performance.now();
  mark('adding the extension words');
  await frame();
  predictor.addWords('en', xen.WORDS_EXT);
  predictor.addWords('cs', xcs.WORDS_EXT);
  const addMs = performance.now() - t;

  const total = WEN.length + WCS.length + xen.WORDS_EXT.length + xcs.WORDS_EXT.length;
  mark('measuring the full vocabulary');
  await frame();
  const fullRows = bench(predictor, sampleFrom([WEN, WCS, xen.WORDS_EXT, xcs.WORDS_EXT]), ctx);
  add(table(`Core plus extension, ${total} words`, fullRows),
    `full ${total} words, fetch+parse ${ms(fetchMs)} ms, addWords ${ms(addMs)} ms\n`
    + fullRows.map((r) => `  prefix ${r.len}: mean ${ms(r.mean)} worst10 ${ms(r.max)}\n`).join(''));

  await frame();
  t = performance.now();
  const [ten, tcs] = await step('fetching the trigram tables, 8.7 MB', Promise.all([
    import('./trigrams-en.js'),
    import('./trigrams-cs.js'),
  ]));
  mark('attaching the trigram tables');
  await frame();
  predictor.setTrigrams('en', ten.TRIGRAMS);
  predictor.setTrigrams('cs', tcs.TRIGRAMS);
  const triMs = performance.now() - t;
  mark('measuring with trigrams');
  await frame();
  const triRows = bench(predictor, sampleFrom([WEN, WCS, xen.WORDS_EXT, xcs.WORDS_EXT]), ctx);
  add(table('With trigram tables', triRows),
    `with trigrams, load ${ms(triMs)} ms\n`
    + triRows.map((r) => `  prefix ${r.len}: mean ${ms(r.mean)} worst10 ${ms(r.max)}\n`).join(''));

  // Device facts, so a pasted result says which phone produced it.
  // deviceMemory and memory are Chrome-only; Safari reports neither.
  const dev = [
    ['vocabulary', `${total} words`],
    ['core build', `${ms(buildMs)} ms`],
    ['ext fetch + parse', `${ms(fetchMs)} ms`],
    ['ext addWords', `${ms(addMs)} ms`],
    ['trigram load', `${ms(triMs)} ms`],
    ['clock step', quantum ? `${quantum.toFixed(3)} ms` : 'below measurement'],
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

// A failure is printed into the page AND into the copied text. The
// point of this page is that its numbers get pasted somewhere else, so
// "it stopped here, because of this" has to travel with them.
$('run').addEventListener('click', () => {
  $('run').disabled = true;
  run()
    .catch((e) => {
      const line = `FAILED while ${phase}: ${e.message}`;
      text += `\n${line}\n`;
      $('out').insertAdjacentHTML('beforeend',
        `<section><h2>Failed</h2><p class="note">${line}</p></section>`);
      status(line);
    })
    .finally(() => { $('run').disabled = false; });
});
$('copy').addEventListener('click', async () => {
  if (!text) return status('run it first');
  try {
    await navigator.clipboard.writeText(text);
    status('results copied');
  } catch {
    status('clipboard refused; select the text by hand');
  }
});
