// Eval harness for word prediction: step 1 of the scored-prediction
// plan (word-prediction-research.md). Run it before and after every
// model change; the numbers, not feel, decide whether a change ships.
//
// Usage:
//   node tools/eval-prediction.mjs          # both languages
//   node tools/eval-prediction.mjs en       # one language
//
// Data: the first PREFIX_BYTES of the OPUS OpenSubtitles v2018 mono
// dump (attribution: https://www.opensubtitles.org), downloaded once
// with a range request into tools/corpus/ (gitignored) and reused
// offline afterwards. Only a prefix is usable: gzip cannot start
// mid-file, so a range must begin at byte 0. Override the size with
// EVAL_PREFIX_MB=2 for a quick smoke run (its numbers are noise).
//
// Held-out split: every line whose 0-based index is divisible by
// HOLDOUT_MOD is an eval line. build-ngrams.py skips exactly those
// lines (keep the two constants in sync), so regenerated tables never
// train on the eval slice.
//
// Each language is measured twice: with a single-language Predictor
// (the ceiling) and with the shipped mixed en+cs Predictor
// (mixed-en / mixed-cs). The mixed rows carry the line's own recent
// words as language context; the gap to the single-language rows is
// the price of mixing, which the language posterior must keep small.
//
// Three measurements per row, chips capped at the strip's 5:
//   next-word   empty prefix after a space: is the true next word in
//               the chips? This is the industry hit@k form.
//   prefix-2    first 2 gesture letters of the true word typed
//               (matchKey form: diacritics and apostrophes stripped).
//   typo-2      the same 2-letter prefix with one seeded substitution
//               (edit distance 1), served by the typo hypotheses.
// Pairs come from adjacent in-vocabulary words, with the same
// adjacency rules as build-ngrams.py: junk tokens and out-of-vocab
// words break adjacency, clause-ending punctuation breaks after the
// word. Tokenization mirrors tools/build-wordlists.py (ASS_TAGS,
// TAIL_JOIN, JUNK, EDGE_PUNCT; keep in sync).

import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Predictor, matchKey } from '../prediction.js';

const HOLDOUT_MOD = 100; // keep in sync with build-ngrams.py
const PREFIX_BYTES = (Number(process.env.EVAL_PREFIX_MB) || 80) * 1024 * 1024;
// Eval pairs per language, subsampled EVENLY from all held-out pairs of
// the whole prefix. Taking the first N instead would draw everything
// from the few subtitle files at the start of the dump.
const MAX_PAIRS = 4000;
const LIMIT = 5; // the suggestion strip shows at most 5 chips
const SEED = 8; // typo corruption seed; fixed so runs are comparable
const RECENT = 8; // context words carried per pair, language evidence

const DUMP_URL = (lang) =>
  `https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/${lang}.txt.gz`;

const here = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.join(here, 'corpus');

// Tokenization constants mirrored from tools/build-wordlists.py.
const ASS_TAGS = /\{\\[^}]*\}/g;
const TAIL_JOIN = /\s+'(re|ll|ve|s|t|m|d|em)\b/g;
const JUNK = /[\d{}\\/_=+\[\]<>|#@&*^~%]/;
const EDGE_PUNCT = new Set('.,!?;:"()«»„“”…‘’\'–—-');
const CLAUSE_END = new Set('.!?…');

function stripEdges(token) {
  let a = 0;
  let b = token.length;
  while (a < b && EDGE_PUNCT.has(token[a])) a++;
  while (b > a && EDGE_PUNCT.has(token[b - 1])) b--;
  return { tok: token.slice(a, b), trail: token.slice(b) };
}

function ensureDump(lang) {
  mkdirSync(corpusDir, { recursive: true });
  const file = path.join(corpusDir, `os-${lang}-${PREFIX_BYTES}.txt.gz`);
  if (existsSync(file) && statSync(file).size === PREFIX_BYTES) return file;
  console.log(`downloading ${lang} prefix (${PREFIX_BYTES / 1024 / 1024} MB) ...`);
  const r = spawnSync('curl', ['-sS', '--fail', '-r', `0-${PREFIX_BYTES - 1}`,
    '-o', file, DUMP_URL(lang)], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`download failed for ${lang}`);
  return file;
}

// Streams the gzipped prefix line by line. A range-truncated gzip ends
// mid-stream; the gunzip error just means "no more data", everything
// decoded before it counts (same stance as build-ngrams.py).
async function eachLine(file, onLine) {
  await new Promise((resolve, reject) => {
    const gz = createGunzip();
    const rl = createInterface({ input: gz, crlfDelay: Infinity });
    rl.on('line', onLine);
    rl.on('close', resolve);
    // The truncated tail surfaces as an error on BOTH streams (readline
    // re-emits its input's error); swallow it on each, keep every line
    // decoded before it.
    rl.on('error', () => rl.close());
    gz.on('error', () => {});
    createReadStream(file).on('error', reject).pipe(gz);
  });
}

// { prev, recent, target } from held-out lines only, builder adjacency
// rules. recent = the in-vocabulary words of the line before the
// target, for the mixed model's language posterior.
async function collectPairs(file, vocab) {
  const pairs = [];
  let index = -1;
  await eachLine(file, (raw) => {
    index++;
    if (index % HOLDOUT_MOD !== 0) return;
    let line = raw.toLowerCase().replace(/’/g, "'");
    if (line.includes('{')) line = line.replace(ASS_TAGS, ' ');
    if (line.includes("'")) line = line.replace(TAIL_JOIN, "'$1");
    let prev = null;
    const seen = [];
    for (const wt of line.split(/\s+/)) {
      if (!wt) continue;
      if (JUNK.test(wt)) { prev = null; continue; }
      const { tok, trail } = stripEdges(wt);
      if (!vocab.has(tok)) { prev = null; continue; }
      if (prev !== null) {
        pairs.push({ prev, recent: seen.slice(-RECENT), target: tok });
      }
      seen.push(tok);
      prev = [...trail].some((c) => CLAUSE_END.has(c)) ? null : tok;
    }
  });
  return pairs;
}

// Deterministic even subsample: every step-th pair across the corpus.
function subsample(all) {
  if (all.length <= MAX_PAIRS) return all;
  const step = all.length / MAX_PAIRS;
  const out = [];
  for (let i = 0; out.length < MAX_PAIRS; i += step) out.push(all[Math.floor(i)]);
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One substitution inside the 2-letter prefix: the seeded position and
// letter make every run identical, so before/after diffs are real.
function corrupt(prefix2, rng) {
  const pos = rng() < 0.5 ? 0 : 1;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let ch = prefix2[pos];
  while (ch === prefix2[pos]) ch = alphabet[Math.floor(rng() * 26)];
  return pos === 0 ? ch + prefix2[1] : prefix2[0] + ch;
}

function pct(hits, total) {
  return total ? ((100 * hits) / total).toFixed(1).padStart(5) + '%' : '    -';
}

function evalPairs(label, predictor, pairs) {
  const modes = {
    'next-word': { hit1: 0, hit3: 0, n: 0 },
    'prefix-2': { hit1: 0, hit3: 0, n: 0 },
    'typo-2': { hit1: 0, hit3: 0, n: 0 },
  };
  const score = (mode, chips, target) => {
    modes[mode].n++;
    if (chips[0] === target) modes[mode].hit1++;
    if (chips.slice(0, 3).includes(target)) modes[mode].hit3++;
  };

  const rng = mulberry32(SEED);
  for (const { prev, recent, target } of pairs) {
    const ctx = { prev, recent };
    score('next-word', predictor.predict('', LIMIT, ctx), target);
    const key = matchKey(target);
    if (key.length < 2) continue;
    const prefix2 = key.slice(0, 2);
    score('prefix-2', predictor.predict(prefix2, LIMIT, ctx), target);
    score('typo-2', predictor.predict(corrupt(prefix2, rng), LIMIT, ctx), target);
  }

  console.log(`\n${label}:`);
  console.log('  mode        pairs  hit@1   hit@3');
  for (const [name, m] of Object.entries(modes)) {
    console.log(`  ${name.padEnd(10)} ${String(m.n).padStart(5)}  ${pct(m.hit1, m.n)}  ${pct(m.hit3, m.n)}`);
  }
  return modes;
}

const langs = process.argv[2] ? [process.argv[2]] : ['en', 'cs'];
const sources = {};
const pairsByLang = {};
for (const lang of langs) {
  const { WORDS } = await import(`../words-${lang}.js`);
  const { BIGRAMS } = await import(`../bigrams-${lang}.js`);
  sources[lang] = { id: lang, words: WORDS, bigrams: BIGRAMS };
  const vocab = new Set(WORDS.map(([w]) => w));
  const all = await collectPairs(ensureDump(lang), vocab);
  pairsByLang[lang] = subsample(all);
  console.log(`${lang}: ${pairsByLang[lang].length} eval pairs, sampled evenly `
    + `from ${all.length} held-out pairs (every ${HOLDOUT_MOD}th line, `
    + `${PREFIX_BYTES / 1024 / 1024} MB prefix)`);
}

for (const lang of langs) {
  evalPairs(lang, new Predictor([sources[lang]]), pairsByLang[lang]);
}
if (langs.length > 1) {
  const mixed = new Predictor(langs.map((l) => sources[l]));
  for (const lang of langs) {
    evalPairs(`mixed-${lang}`, mixed, pairsByLang[lang]);
  }
}
