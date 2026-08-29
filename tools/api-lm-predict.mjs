// Suggestion strip driven by a chat model behind an OpenAI-compatible HTTP
// API: Ollama, LM Studio, llama.cpp server, vLLM, or a hosted provider.
//
// Written for prediction-roadmap.md direction 8 ("a big model beside the
// small one"). tools/lm-predict.py answers the same question for a model we
// load ourselves, with logits and a constrained beam. This file answers it
// for a model we can only talk to in words. That is the harder and more
// honest case, because it is what iOS gives us: Apple's Foundation Models
// framework hands out text and never numbers
// (apple-foundation-models-research.md). So the ranking here comes from the
// model's own ordering of a list, not from probabilities.
//
// Usage:
//   node tools/api-lm-predict.mjs --base http://192.168.1.50:11434 --game
//   node tools/api-lm-predict.mjs --base URL --model qwen3:27b --game --no-think
//   node tools/api-lm-predict.mjs --base URL --pairs /tmp/pairs-cs.json \
//       --limit 100 [--tasks next,prefix,typo] [--concurrency 4]
//
// Pairs files come from tools/dump-eval-pairs.mjs, so the model is scored on
// exactly the pairs the shipped engine is scored on, and each row already
// carries the engine's own strip for the same context.

import { readFileSync } from 'node:fs';
import { CASES, LANG } from './game-cases.mjs';

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);

const BASE = (arg('base') || process.env.LM_API_BASE || '').replace(/\/+$/, '');
const KEY = arg('key') || process.env.LM_API_KEY || 'none';
const LIMIT = Number(arg('n', '6')); // strip of 6: eval-prediction.mjs LIMIT
const TEMP = Number(arg('temp', '0'));
const MAX_TOKENS = Number(arg('max-tokens', '700'));
const NO_THINK = flag('no-think');
const CONCURRENCY = Number(arg('concurrency', '2'));
const TIMEOUT_MS = Number(arg('timeout', '180')) * 1000;
const VERBOSE = flag('verbose');

if (!BASE) {
  console.error('Give the server with --base http://HOST:PORT (or LM_API_BASE).');
  process.exit(2);
}

// Mirrors EDGE_PUNCT in tools/eval-prediction.mjs and tools/lm-predict.py, so
// a word this model emits is trimmed exactly like a word the corpus builder
// emits. Without it "amazing," and "amazing" score differently.
const EDGE_PUNCT = new Set('.,!?;:"()«»„“”…‘’\'–—-');

const stripDiacritics = (w) => w.normalize('NFD').replace(/\p{M}/gu, '');
// prediction.js matchKey(), repeated here to keep this file dependency-free.
const matchKey = (w) => stripDiacritics(w).replace(/'/g, '');

// ------------------------------------------------------------------- client

let MODEL = arg('model');

async function listModels() {
  const r = await fetch(`${BASE}/v1/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`GET /v1/models -> ${r.status} ${await r.text()}`);
  const j = await r.json();
  return (j.data || []).map((m) => m.id);
}

async function chat(messages) {
  const body = {
    model: MODEL,
    messages,
    temperature: TEMP,
    max_tokens: MAX_TOKENS,
    stream: false,
  };
  // Qwen3 and other hybrid-reasoning models think before answering, which
  // costs seconds and can hit max_tokens before the answer starts. Servers
  // disagree on how to switch it off, so send both known switches; the parser
  // below still strips a <think> block if neither one is honoured.
  if (NO_THINK) body.chat_template_kwargs = { enable_thinking: false };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (r.status === 403) {
      throw new Error(`403 from the sandbox proxy. The LAN host is not on the allow list.\n`
        + `Ask the user to run on the host:  sbx policy allow network ${new URL(BASE).host}\n${text}`);
    }
    if (!r.ok) throw new Error(`POST /v1/chat/completions -> ${r.status} ${text}`);
    const j = JSON.parse(text);
    // finish_reason travels with the answer because a reasoning model can
    // spend the whole output budget thinking and return an empty strip. That
    // is a harness fault and must never be reported as a model miss.
    return {
      content: j.choices?.[0]?.message?.content ?? '',
      finish: j.choices?.[0]?.finish_reason ?? '',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ prompts

const SYSTEM = `You are the word prediction engine of a phone keyboard.
The user writes English and Czech, often mixed, in casual chat style.
Answer with candidate words only, one per line, most likely first.
No numbering, no quotes, no explanation, no punctuation around a word.
Never repeat a candidate. Never answer with a phrase; one word per line.`;

function userPrompt({ left, prefix, n }) {
  const ctx = left ? `Text so far:\n${left}\n\n` : 'The user starts a new message.\n\n';
  if (prefix) {
    return `${ctx}The user has started typing the next word. `
      + `The letters typed so far are: ${prefix}\n`
      + `List the ${n} most likely whole words that begin with "${prefix}", `
      + `most likely first. Every line must start with "${prefix}".`
      + (NO_THINK ? ' /no_think' : '');
  }
  return `${ctx}List the ${n} most likely next words, most likely first.`
    + (NO_THINK ? ' /no_think' : '');
}

// A served model answers in prose whenever the prompt lets it. This keeps the
// slot count honest: junk still occupies a strip slot, exactly as a bad chip
// would on the phone.
function parseCandidates(text, n) {
  const body = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, ''); // an unclosed opening tag, truncated
  const out = [];
  for (let line of body.split('\n')) {
    line = line.trim();
    if (!line) continue;
    line = line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '');
    line = line.replace(/^[`"'“„‘]+|[`"'”“’]+$/g, '').trim();
    if (!line) continue;
    const word = line.split(/\s+/)[0];
    let w = word;
    while (w.length > 1 && EDGE_PUNCT.has(w[0])) w = w.slice(1);
    while (w.length > 1 && EDGE_PUNCT.has(w[w.length - 1])) w = w.slice(0, -1);
    if (!w) continue;
    if (out.some((p) => p.toLowerCase() === w.toLowerCase())) continue;
    out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

async function strip({ left, prefix, n = LIMIT }) {
  const t0 = performance.now();
  const { content, finish } = await chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userPrompt({ left, prefix, n }) },
  ]);
  const chips = parseCandidates(content, n);
  return { chips, ms: performance.now() - t0, raw: content, finish };
}

// ------------------------------------------------------------------ scoring

// The engine can never emit a chip that breaks the typed prefix; a chat model
// can, and a broken chip is a wasted slot. Counted, not filtered out.
const breaksPrefix = (w, prefix) =>
  prefix && !matchKey(w.toLowerCase()).startsWith(matchKey(prefix.toLowerCase()));

// eval-game.mjs compares exact strings. A chat model chooses its own case, so
// the comparison here folds case only. A fold-only match (diacritics or an
// apostrophe differ) is a near miss on both sides, because it would be
// inserted as the wrong word.
const hitRank = (chips, want) =>
  chips.findIndex((w) => w.toLowerCase() === want.toLowerCase()) + 1;
const foldRank = (chips, want) =>
  chips.findIndex((w) => matchKey(w.toLowerCase()) === matchKey(want.toLowerCase())) + 1;

async function runGame() {
  let hits = 0;
  let wasted = 0;
  let totalMs = 0;
  let cut = 0;
  const byLang = { en: 0, cs: 0 };
  for (const c of CASES) {
    const left = c.prefix ? c.input.slice(0, c.input.length - c.prefix.length).trim() : c.input;
    let res;
    try {
      res = await strip({ left, prefix: c.prefix });
    } catch (e) {
      console.error(`#${c.n} failed: ${e.message}`);
      break;
    }
    totalMs += res.ms;
    const bad = res.chips.filter((w) => breaksPrefix(w, c.prefix)).length;
    wasted += bad;
    const rank = hitRank(res.chips, c.want);
    const fold = foldRank(res.chips, c.want);
    if (rank) { hits++; byLang[LANG[c.n]]++; }
    console.log(`#${String(c.n).padStart(2)} "${c.input}" want=${c.want}`);
    console.log(`    strip: ${res.chips.join(' | ')}`);
    // An empty strip after a long wait is a reasoning model that never left
    // its scratchpad: either it ran out of budget, or it looped inside the
    // thinking block and ended the turn with no content. Both are reported
    // as no answer, not as a miss, because the cause is the run and not the
    // model's word choice.
    if (!res.chips.length) cut++;
    const verdict = !res.chips.length
      ? `NO ANSWER (${res.finish === 'length' ? 'output budget spent on reasoning' : 'the model ended inside the reasoning block'})`
      : rank ? `HIT at rank ${rank}`
        : fold ? `MISS (fold-only match "${res.chips[fold - 1]}" at rank ${fold})`
          : 'MISS';
    console.log(`    ${verdict}   ${(res.ms / 1000).toFixed(1)}s`
      + (bad ? `   ${bad} chip(s) break the prefix` : ''));
    if (VERBOSE) console.log(`    raw: ${JSON.stringify(res.raw).slice(0, 400)}`);
  }
  console.log(`\n${hits}/${CASES.length} wanted words on the strip`
    + `  (EN ${byLang.en}/9, CS ${byLang.cs}/5)`);
  console.log(`${wasted} chip(s) broke the typed prefix`);
  if (cut) console.log(`${cut} empty strip(s); the score is a floor, not a result`);
  console.log(`${(totalMs / 1000 / CASES.length).toFixed(1)}s per strip on average`);
}

// -------------------------------------------------------------- pairs mode

// Runs a fixed pool of workers over the pair list. Ollama serialises requests
// anyway; vLLM and llama.cpp batch them, so the default is small but > 1.
async function mapPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

async function runPairs() {
  const file = arg('pairs');
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  const limit = Number(arg('limit', String(rows.length)));
  const tasks = (arg('tasks', 'next,prefix')).split(',');
  const use = rows.filter((r) => r.prefix2 || tasks.includes('next')).slice(0, limit);

  const jobs = [];
  for (const r of use) {
    if (tasks.includes('next')) jobs.push({ r, task: 'next', prefix: '', engine: r.nextWord });
    if (tasks.includes('prefix') && r.prefix2) jobs.push({ r, task: 'prefix', prefix: r.prefix2, engine: r.prefixChips });
    if (tasks.includes('typo') && r.typo2) jobs.push({ r, task: 'typo', prefix: r.typo2, engine: r.typoChips });
  }
  console.error(`${use.length} pairs, ${jobs.length} requests, model ${MODEL}`);

  const t0 = performance.now();
  let done = 0;
  const results = await mapPool(jobs, async (j) => {
    let chips = [];
    let ms = 0;
    try {
      const res = await strip({ left: j.r.left, prefix: j.prefix });
      chips = res.chips;
      ms = res.ms;
    } catch (e) {
      console.error(`  request failed: ${e.message}`);
    }
    done++;
    if (done % 20 === 0) console.error(`  ${done}/${jobs.length}`);
    return { ...j, chips, ms };
  }, CONCURRENCY);

  const score = (rowsIn, get) => {
    const at = (k) => rowsIn.filter((x) => {
      const rank = hitRank(get(x), x.r.target);
      return rank && rank <= k;
    }).length;
    return rowsIn.length
      ? { h1: (100 * at(1) / rowsIn.length).toFixed(1), h3: (100 * at(3) / rowsIn.length).toFixed(1), n: rowsIn.length }
      : null;
  };

  console.log(`\n| Task | model hit@1 / hit@3 | engine hit@1 / hit@3 | pairs |`);
  console.log(`|---|---|---|---|`);
  for (const task of tasks) {
    const sub = results.filter((x) => x.task === task);
    if (!sub.length) continue;
    const m = score(sub, (x) => x.chips);
    const e = score(sub, (x) => x.engine || []);
    console.log(`| ${task} | ${m.h1} / ${m.h3} | ${e.h1} / ${e.h3} | ${m.n} |`);
  }
  const msAll = results.reduce((a, x) => a + x.ms, 0);
  console.log(`\n${(msAll / results.length / 1000).toFixed(2)}s per request, `
    + `${((performance.now() - t0) / 1000).toFixed(0)}s wall at concurrency ${CONCURRENCY}`);
}

// --------------------------------------------------------------------- main

const models = await listModels().catch((e) => {
  console.error(`Cannot list models on ${BASE}: ${e.message}`);
  return null;
});
if (models && models.length) {
  if (!MODEL) MODEL = models[0];
  console.error(`server ${BASE}, models: ${models.join(', ')}`);
} else if (!MODEL) {
  console.error('No model given and /v1/models returned nothing. Use --model.');
  process.exit(2);
}
console.error(`using model: ${MODEL}\n`);

if (arg('pairs')) await runPairs();
else await runGame();
