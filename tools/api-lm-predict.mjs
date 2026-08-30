// Suggestion strip driven by a model behind an OpenAI-compatible HTTP API:
// vLLM, Ollama, LM Studio, llama.cpp server, or a hosted provider.
//
// Written for prediction-roadmap.md direction 8 ("a big model beside the
// small one"). tools/lm-predict.py answers the same question for a model we
// load ourselves. This file answers it over the network, at three levels of
// access, because the level decides what a big model is worth here:
//
//   --chat    (default) ask in words, take the model's own ordering. This is
//             all Apple's Foundation Models framework allows: text out, no
//             numbers (apple-foundation-models-research.md).
//   --beam    constrained beam search over /v1/completions logprobs. The same
//             method lm-predict.py runs locally: whole words, the typed
//             prefix enforced by the prompt, and tokenizations of one word
//             summed. Needs an API that returns top-N logprobs.
//   --rerank  score the shipped engine's own chips and reorder them. The
//             neural re-ranker of roadmap direction 5, measured without
//             building one: the n-gram generates, the big model ranks.
//
// Usage:
//   node tools/api-lm-predict.mjs --base http://192.168.1.50:11434 --game
//   node tools/api-lm-predict.mjs --base URL --model qwen3:27b --game --no-think
//   node tools/api-lm-predict.mjs --base URL --game --beam
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
// The engine treats a typed prefix as evidence, not as law: its typo layer
// offers words one edit away. A prompt that says "every line must start with
// these letters" asks for something else, and on the corrupted-prefix task it
// makes the model spell out words that cannot exist. This flag states the
// engine's own rule instead, so the two columns measure the same task.
const FUZZY = flag('fuzzy-prefix');
const CONCURRENCY = Number(arg('concurrency', '2'));
const TIMEOUT_MS = Number(arg('timeout', '180')) * 1000;
const VERBOSE = flag('verbose');

const MODE = flag('beam') ? 'beam' : flag('rerank') ? 'rerank' : 'chat';
const BEAM = Number(arg('beam-width', '8'));
const DEPTH = Number(arg('beam-depth', '6'));   // tokens per word, after the prefix
const TOP = Number(arg('top', '20'));           // vLLM caps sample logprobs at 20

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

// The raw completions endpoint, with no chat template. That is deliberate:
// the beam needs the model as a plain language model over the user's own
// text, which is what lm-predict.py measures locally on GPT-2 class models.
// `prompt` may be a list, and the server answers one choice per prompt, so a
// whole beam step costs one request.
async function complete(prompts, extra) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}/v1/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, prompt: prompts, temperature: 0, ...extra }),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`POST /v1/completions -> ${r.status} ${text}`);
    const j = JSON.parse(text);
    // The server may return the choices out of order; index says which prompt.
    const out = new Array(prompts.length);
    for (const c of j.choices) out[c.index] = c;
    return out;
  } finally {
    clearTimeout(timer);
  }
}

// vLLM answers a whole batch with 400 when one prompt in it produces a NaN
// logprob, and the batch is then lost. Retrying prompt by prompt keeps the
// rest of the strip, and only the prompt that actually fails scores as
// impossible.
async function completeSafe(prompts, extra) {
  try {
    return await complete(prompts, extra);
  } catch (e) {
    if (prompts.length === 1) return [null];
    const out = [];
    for (const p of prompts) {
      try { out.push((await complete([p], extra))[0]); } catch { out.push(null); }
    }
    return out;
  }
}

const logsumexp = (a, b) => (a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b)));

// A token that opens with a space or a newline starts a NEW word, so it ends
// the word being built. So does a token that opens with punctuation. Anything
// else continues the current word.
const startsWord = (t) => /^[\s]/.test(t);
const endsWord = (t) => startsWord(t) || (t.length > 0 && EDGE_PUNCT.has(t[0]));

function trimWord(w) {
  let s = w.split(/\s/)[0];
  while (s.length > 1 && EDGE_PUNCT.has(s[0])) s = s.slice(1);
  while (s.length > 1 && EDGE_PUNCT.has(s[s.length - 1])) s = s.slice(0, -1);
  return s;
}

// One constrained beam search over whole words, from one prompt.
//
// Two things make this a suggestion strip and not a text generator. The typed
// prefix filters every step of the beam, so no slot is spent on a word that
// breaks it. And two token paths that spell the same word are one candidate,
// summed in probability, because "zaplavat" is one word whether the model
// reached it as zapla+vat or zap+lavat.
//
// `spelled` is what the prompt has already committed of the word: empty when
// the prompt ends at a word boundary, and the typed prefix when the prompt
// ends mid-word.
async function beamFrom(base, prefix, spelled, count) {
  const pkey = matchKey(prefix.toLowerCase());
  // A path stays alive while it agrees with the typed prefix in either
  // direction: still inside it, or already past it.
  const compatible = (w) => {
    const k = matchKey(w.toLowerCase());
    return k.startsWith(pkey) || pkey.startsWith(k);
  };
  const covers = (w) => matchKey(w.toLowerCase()).startsWith(pkey);
  // A beam carries two strings. `cont` is what gets appended to the prompt,
  // and `word` is the word being spelled. They differ when the model restates
  // the typed prefix inside one token, so neither one alone is enough.
  let beams = [{ cont: '', word: spelled, lp: 0, open: spelled !== '' }];
  const done = new Map();
  const trace = [];
  let requests = 0;

  const record = (word, score) => {
    const w = trimWord(word);
    if (!w || !covers(w)) return;
    const cur = done.get(w);
    done.set(w, cur === undefined ? score : logsumexp(cur, score));
  };

  for (let step = 0; step < DEPTH && beams.length; step++) {
    const res = await complete(beams.map((b) => base + b.cont), { max_tokens: 1, logprobs: TOP });
    requests++;
    const next = new Map();
    const push = (cont, word, score) => {
      if (!compatible(word)) return;
      const cur = next.get(cont);
      next.set(cont, { cont, word, lp: cur ? logsumexp(cur.lp, score) : score, open: true });
    };
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i];
      const top = res[i]?.logprobs?.top_logprobs?.[0];
      if (!top) continue;
      for (const [tok, lp] of Object.entries(top)) {
        if (/^<\|.*\|>$/.test(tok)) continue; // chat control tokens are not words
        const score = b.lp + lp;
        const t = tok.replace(/^\s+/, '');
        if (!b.open) {
          // Before the word: only a token that opens one counts. A
          // continuation here would be the model finishing the PREVIOUS word.
          if (!startsWord(tok) || !t || endsWord(t)) continue;
          push(tok, t, score);
          continue;
        }
        if (startsWord(tok) && b.cont === '' && spelled && t && covers(t)) {
          // The prompt ends mid-word and the model answers with the WHOLE
          // word as one token, space and all ("you are am" -> " amazing").
          // That is the word's canonical tokenization, so it is another path
          // to the same candidate and not a new word.
          push(tok, t, score);
          continue;
        }
        if (endsWord(tok)) { record(b.word, score); continue; }
        push(b.cont + tok, b.word + tok, score);
      }
    }
    beams = [...next.values()].sort((a, b) => b.lp - a.lp).slice(0, BEAM);
    // The trace travels back with the result instead of being printed here,
    // so it lands under its own case and not under the previous one.
    trace.push(`${count} step ${step}: [${beams.map((b) => JSON.stringify(b.cont)).join(' ')}] ${done.size} done`);
  }
  return { done, requests, trace };
}

// The strip is two beams when a prefix is typed, because the two prompts see
// different parts of the model's top 20 and each one hides what the other
// finds.
//
// From the context alone, the top 20 after "you are" holds a token compatible
// with the typed "am" in 84% of eval rows, and holds the whole target word in
// 51% of English rows. That is the sound measurement: the prompt ends at a
// word boundary, so the tokenization is the model's own.
//
// From the context plus the typed letters, "you are am", the model continues
// or restates the word. That prompt is mid-word, so the tokenization is
// forced and the probabilities are not on the same scale. It is recall only:
// its words are appended under the first beam's, never mixed into its
// ranking.
async function stripBeam({ left, prefix, n = LIMIT }) {
  const t0 = performance.now();
  const ctx = left || '\n';
  const a = await beamFrom(ctx, prefix, '', 'ctx');
  const rank = (m) => [...m.entries()].sort((x, y) => y[1] - x[1]).map(([w]) => w);
  let chips = rank(a.done);
  let requests = a.requests;
  let trace = a.trace;

  if (prefix && chips.length < n) {
    const b = await beamFrom(left ? `${ctx} ${prefix}` : prefix, prefix, prefix, 'mid');
    requests += b.requests;
    trace = trace.concat(b.trace);
    for (const w of rank(b.done)) if (!chips.includes(w)) chips.push(w);
  }

  return {
    chips: chips.slice(0, n),
    ms: performance.now() - t0,
    raw: `${requests} requests\n    ${trace.join('\n    ')}`,
    finish: 'stop',
  };
}

// Scores whole candidates the engine already produced, and reorders them.
// One request for the whole strip: echo returns a logprob per prompt token,
// and text_offset says which tokens are the candidate rather than the
// context. The sum of those is log P(candidate | context), marginalized over
// nothing, because the tokenization of a given string is fixed.
async function rerankChips(left, chips) {
  const t0 = performance.now();
  if (!chips.length) return { chips: [], ms: 0, raw: '', finish: 'stop' };
  const prompts = chips.map((w) => (left ? `${left} ${w}` : w));
  // One generated token comes back with the echo. Its distribution is what
  // says the word is FINISHED, and without it this scores prefixes instead of
  // words: the token sum for "fi" is the probability of every word starting
  // "fi", which beats "film" for no good reason. The boundary term is the
  // mass on tokens that open a new word, and it collapses that bias.
  const res = await completeSafe(prompts, { max_tokens: 1, echo: true, logprobs: TOP });
  const scored = chips.map((w, i) => {
    const lg = res[i]?.logprobs;
    if (!lg) return { w, lp: -Infinity };
    let lp = 0;
    for (let k = 0; k < lg.tokens.length - 1; k++) {
      // A token belongs to the candidate when it starts at or after the end
      // of the context. The joining space rides on the candidate's first
      // token (" bright"), so the boundary is left.length, not left.length+1.
      if (lg.text_offset[k] >= left.length && lg.token_logprobs[k] !== null) lp += lg.token_logprobs[k];
    }
    const top = lg.top_logprobs?.[lg.top_logprobs.length - 1] || {};
    let mass = 0;
    for (const [tok, tlp] of Object.entries(top)) if (endsWord(tok)) mass += Math.exp(tlp);
    // A floor, not zero: when no word-start token is in the top 20 the true
    // mass is small but unknown, and -Infinity would make every such
    // candidate equally last.
    lp += Math.log(Math.max(mass, 1e-9));
    return { w, lp };
  });
  const order = scored.slice().sort((a, b) => b.lp - a.lp);
  // `lps` travels with the result so the blend sweep below can mix the
  // model's posterior with the engine's own order, without asking the server
  // a second time.
  return {
    chips: order.map((s) => s.w),
    lps: scored.map((s) => s.lp),
    ms: performance.now() - t0,
    raw: '',
    finish: 'stop',
  };
}

// ------------------------------------------------------------------ prompts

const SYSTEM = `You are the word prediction engine of a phone keyboard.
The user writes English and Czech, often mixed, in casual chat style.
Answer with candidate words only, one per line, most likely first.
No numbering, no quotes, no explanation, no punctuation around a word.
Never repeat a candidate. Never answer with a phrase; one word per line.`;

function userPrompt({ left, prefix, n }) {
  const ctx = left ? `Text so far:\n${left}\n\n` : 'The user starts a new message.\n\n';
  if (prefix && FUZZY) {
    return `${ctx}The user has started typing the next word. `
      + `The letters typed so far are: ${prefix}\n`
      + `Gestures slip, so one of those letters can be wrong.\n`
      + `List the ${n} most likely whole words the user is typing, most likely `
      + `first. Most of them begin with "${prefix}". Include a word that `
      + `differs from "${prefix}" by one letter when that word is more likely.`
      + (NO_THINK ? ' /no_think' : '');
  }
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

async function stripChat({ left, prefix, n = LIMIT }) {
  const t0 = performance.now();
  const { content, finish } = await chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userPrompt({ left, prefix, n }) },
  ]);
  const chips = parseCandidates(content, n);
  return { chips, ms: performance.now() - t0, raw: content, finish };
}

// One entry point for all three access levels. `engine` is the shipped
// strip for this context, which only the re-ranker needs.
function strip({ left, prefix, n = LIMIT, engine = [] }) {
  if (MODE === 'beam') return stripBeam({ left, prefix, n });
  if (MODE === 'rerank') return rerankChips(left, engine.slice(0, n));
  return stripChat({ left, prefix, n });
}

// The shipped predictor, loaded only when the re-ranker needs a strip to
// reorder and the pairs file does not already hold one (the game).
let _predictor = null;
async function enginePredictor() {
  if (_predictor) return _predictor;
  const { Predictor } = await import('../prediction.js');
  const langs = ['en', 'cs'];
  const sources = [];
  for (const l of langs) {
    const [{ WORDS }, { BIGRAMS }, { TRIGRAMS }] = await Promise.all([
      import(`../words-${l}.js`), import(`../bigrams-${l}.js`), import(`../trigrams-${l}.js`),
    ]);
    sources.push({ id: l, words: WORDS, bigrams: BIGRAMS, trigrams: TRIGRAMS });
  }
  _predictor = new Predictor(sources);
  for (const l of langs) {
    const { WORDS_EXT } = await import(`../words-ext-${l}.js`);
    _predictor.addWords(l, WORDS_EXT);
  }
  return _predictor;
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
      const engine = MODE === 'rerank'
        ? (await enginePredictor()).predict(c.prefix, LIMIT, { prev: c.prev, prev2: c.prev2, recent: c.recent })
        : [];
      res = await strip({ left, prefix: c.prefix, engine });
    } catch (e) {
      console.error(`#${c.n} failed: ${e.message}`);
      break;
    }
    totalMs += res.ms;
    // Only the chat mode can break the typed prefix. The beam enforces it and
    // the re-ranker reorders the engine's chips, whose typo layer is meant to
    // leave the prefix behind.
    const bad = MODE === 'chat' ? res.chips.filter((w) => breaksPrefix(w, c.prefix)).length : 0;
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
    let lps = null;
    let ms = 0;
    try {
      const res = await strip({ left: j.r.left, prefix: j.prefix, engine: j.engine || [] });
      chips = res.chips;
      lps = res.lps || null;
      ms = res.ms;
    } catch (e) {
      console.error(`  request failed: ${e.message}`);
    }
    done++;
    if (done % 20 === 0) console.error(`  ${done}/${jobs.length}`);
    return { ...j, chips, lps, ms };
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
  complement(results, tasks);
  if (MODE === 'rerank') blendSweep(results, tasks, score);

  const msAll = results.reduce((a, x) => a + x.ms, 0);
  console.log(`\n${(msAll / results.length / 1000).toFixed(2)}s per request, `
    + `${((performance.now() - t0) / 1000).toFixed(0)}s wall at concurrency ${CONCURRENCY}`);
}

// The score tables answer "is the big model better". This answers the
// question that actually decides direction 8: does it cover what we miss?
//
// A rescue is a row where the target is absent from the engine's whole strip
// and present in the model's. Those are the rows a second opinion would earn
// its cost on, and they are invisible in a hit@1 column, where a model that
// only repeats our own good answers looks identical to one that adds new
// ones.
//
// Two limits belong with every number here. The pair dump keeps only targets
// that are inside our vocabulary, so the rescue rate below cannot see the
// out-of-vocabulary tail, which is where the game says this model is
// strongest. And --rerank can never rescue anything by construction: its
// candidates are the engine's own six.
function complement(results, tasks) {
  const has = (chips, w) => chips.some((c) => c.toLowerCase() === w.toLowerCase());
  console.log(`\nComplementarity: rows the engine misses, that the model answers.`);
  console.log(`\n| Task | engine misses | model rescues | rescue rate | engine-only | union hit@6 |`);
  console.log(`|---|---|---|---|---|---|`);
  const samples = [];
  for (const task of tasks) {
    const sub = results.filter((x) => x.task === task);
    if (!sub.length) continue;
    let miss = 0; let rescue = 0; let engineOnly = 0; let union = 0;
    for (const x of sub) {
      const e = has(x.engine || [], x.r.target);
      const m = has(x.chips || [], x.r.target);
      if (!e) miss++;
      if (!e && m) { rescue++; if (samples.length < 12) samples.push({ task, x }); }
      if (e && !m) engineOnly++;
      if (e || m) union++;
    }
    const rate = miss ? (100 * rescue / miss).toFixed(1) : '-';
    console.log(`| ${task} | ${miss} | ${rescue} | ${rate}% | ${engineOnly} | `
      + `${(100 * union / sub.length).toFixed(1)} |`);
  }
  if (!samples.length) return;
  console.log(`\nRescued rows, up to 12:`);
  for (const { task, x } of samples) {
    console.log(`  [${task}] ...${x.r.left.split(' ').slice(-6).join(' ')} -> ${x.r.target}`);
    console.log(`      engine: ${(x.engine || []).join(' | ')}`);
    console.log(`      model:  ${(x.chips || []).join(' | ')}`);
  }
}

// A re-ranker that replaces our order with the model's is one extreme, and
// keeping our order is the other. The useful question is whether any mixture
// beats both, which is how SwiftKey's fifth layer is described. So blend two
// posteriors over the same six chips and sweep the weight.
//
// The model side is a softmax over its own log P(word | context). The engine
// side has no scores in the dump, only an order, so it gets a 1/rank prior,
// normalized. That prior is a stand-in, not the engine's real distribution,
// and a positive result here would need the real scores before it ships.
function blendSweep(results, tasks, score) {
  const blended = (x, alpha) => {
    if (!x.lps || !x.engine?.length) return x.engine || [];
    const max = Math.max(...x.lps);
    const em = x.lps.map((lp) => Math.exp(lp - max));
    const esum = em.reduce((a, b) => a + b, 0) || 1;
    const prior = x.engine.map((_, i) => 1 / (i + 1));
    const psum = prior.reduce((a, b) => a + b, 0);
    return x.engine
      .map((w, i) => ({ w, p: alpha * (em[i] / esum) + (1 - alpha) * (prior[i] / psum) }))
      .sort((a, b) => b.p - a.p)
      .map((s) => s.w);
  };

  console.log(`\nBlend sweep, alpha = weight on the model (0 = our order, 1 = the model's):`);
  console.log(`\n| Task | ${[0, 0.2, 0.4, 0.5, 0.6, 0.8, 1].map((a) => `a=${a}`).join(' | ')} |`);
  console.log(`|---|${'---|'.repeat(7)}`);
  for (const task of tasks) {
    const sub = results.filter((x) => x.task === task);
    if (!sub.length) continue;
    const cells = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1].map((a) => {
      const s = score(sub, (x) => blended(x, a));
      return `${s.h1} / ${s.h3}`;
    });
    console.log(`| ${task} | ${cells.join(' | ')} |`);
  }
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
console.error(`using model: ${MODEL}, access level: ${MODE}\n`);

if (arg('pairs')) await runPairs();
else await runGame();
