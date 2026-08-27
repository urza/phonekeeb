// Dumps the held-out eval pairs of tools/eval-prediction.mjs to JSON, plus
// the shipped Predictor's strip for each pair. Written for the Czech
// language-model study (czech-lm-research.md): a Python harness must score
// GPT-2 class models on EXACTLY the pairs the n-gram engine is scored on,
// otherwise the two columns of the comparison table are not comparable.
//
// Usage:
//   node tools/dump-eval-pairs.mjs cs 1000 > /tmp/pairs-cs.json
//
// The pair rules, holdout split, tokenization, subsample, and typo seed are
// copied from eval-prediction.mjs; keep them in sync. Only MAX_PAIRS becomes
// an argument, because a neural model needs about 1000x the time per pair.

import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Predictor, matchKey } from '../prediction.js';

const HOLDOUT_MOD = 100;
const PREFIX_BYTES = (Number(process.env.EVAL_PREFIX_MB) || 80) * 1024 * 1024;
const LIMIT = 6;
const SEED = 8;
const RECENT = 8;

const lang = process.argv[2] || 'cs';
const MAX_PAIRS = Number(process.argv[3]) || 1000;

const DUMP_URL = (l) =>
  `https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/${l}.txt.gz`;
const here = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.join(here, 'corpus');

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

function ensureDump(l) {
  mkdirSync(corpusDir, { recursive: true });
  const file = path.join(corpusDir, `os-${l}-${PREFIX_BYTES}.txt.gz`);
  if (existsSync(file) && statSync(file).size === PREFIX_BYTES) return file;
  const r = spawnSync('curl', ['-sS', '--fail', '-r', `0-${PREFIX_BYTES - 1}`,
    '-o', file, DUMP_URL(l)], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`download failed for ${l}`);
  return file;
}

async function eachLine(file, onLine) {
  await new Promise((resolve, reject) => {
    const gz = createGunzip();
    const rl = createInterface({ input: gz, crlfDelay: Infinity });
    rl.on('line', onLine);
    rl.on('close', resolve);
    rl.on('error', () => rl.close());
    gz.on('error', () => {});
    createReadStream(file).on('error', reject).pipe(gz);
  });
}

// Same as eval-prediction.mjs, with one addition: `left` keeps the full
// raw left context of the line. An n-gram engine needs only prev/prev2,
// but a transformer is scored on everything before the target.
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
    let prev2 = null;
    const seen = [];
    for (const wt of line.split(/\s+/)) {
      if (!wt) continue;
      if (JUNK.test(wt)) { prev = null; prev2 = null; continue; }
      const { tok, trail } = stripEdges(wt);
      if (!vocab.has(tok)) { prev = null; prev2 = null; continue; }
      if (prev !== null) {
        pairs.push({
          prev, prev2: prev2 ?? '', recent: seen.slice(-RECENT),
          left: seen.join(' '), target: tok,
        });
      }
      seen.push(tok);
      const broke = [...trail].some((c) => CLAUSE_END.has(c));
      prev2 = broke ? null : prev;
      prev = broke ? null : tok;
    }
  });
  return pairs;
}

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

function corrupt(prefix2, rng) {
  const pos = rng() < 0.5 ? 0 : 1;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let ch = prefix2[pos];
  while (ch === prefix2[pos]) ch = alphabet[Math.floor(rng() * 26)];
  return pos === 0 ? ch + prefix2[1] : prefix2[0] + ch;
}

const langs = ['en', 'cs'];
const sources = {};
for (const l of langs) {
  const { WORDS } = await import(`../words-${l}.js`);
  const { BIGRAMS } = await import(`../bigrams-${l}.js`);
  const { TRIGRAMS } = await import(`../trigrams-${l}.js`);
  sources[l] = { id: l, words: WORDS, bigrams: BIGRAMS, trigrams: TRIGRAMS };
}
const predictor = new Predictor(langs.map((l) => sources[l]));
for (const l of langs) {
  const { WORDS_EXT } = await import(`../words-ext-${l}.js`);
  predictor.addWords(l, WORDS_EXT);
}

const vocab = new Set(sources[lang].words.map(([w]) => w));
const pairs = subsample(await collectPairs(ensureDump(lang), vocab));

const rng = mulberry32(SEED);
const out = [];
for (const p of pairs) {
  const ctx = { prev: p.prev, prev2: p.prev2, recent: p.recent };
  const key = matchKey(p.target);
  const row = {
    left: p.left, prev: p.prev, target: p.target,
    nextWord: predictor.predict('', LIMIT, ctx),
  };
  if (key.length >= 2) {
    row.prefix2 = key.slice(0, 2);
    row.typo2 = corrupt(row.prefix2, rng);
    row.prefixChips = predictor.predict(row.prefix2, LIMIT, ctx);
    row.typoChips = predictor.predict(row.typo2, LIMIT, ctx);
  }
  out.push(row);
}
process.stdout.write(JSON.stringify(out));
console.error(`${lang}: ${out.length} pairs dumped`);
