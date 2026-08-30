#!/usr/bin/env python3
"""Build trigrams-en.js / trigrams-cs.js from an OPUS OpenSubtitles dump.

Usage:
  python3 tools/build-trigrams.py en os_en.txt.gz words-en.js trigrams-en.js
  python3 tools/build-trigrams.py cs os_cs.txt.gz words-cs.js trigrams-cs.js

The trigram layer of the scored-prediction design
(word-prediction-research.md): contexts are adjacent in-vocabulary
word pairs, successors their next words. The predictor walks
trigram -> bigram -> unigram with stupid backoff, so this table only
needs the strong contexts; everything else backs off.

Two passes keep memory flat: pass 1 counts context pairs and keeps
those with at least MIN_CONTEXT occurrences, pass 2 counts successor
triples only for the kept contexts, integer-keyed against the
vocabulary index.

Output format matches bigrams v3, keyed by "w1 w2":
  {"you are": "T|g succ|c succ|c ...", ...}
with T, g and c log-quantized (decode exp(code/QUANT_K), same QUANT_K
as build-ngrams.py). c is the absolute-discounted triple count and g
the context's backoff weight; see build-ngrams.py for both. Adjacency,
holdout, and tokenization rules are identical to build-ngrams.py
(tokenization imported, never copied).
"""
import gzip
import importlib.util
import json
import math
import sys
from collections import Counter
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'build_wordlists', Path(__file__).with_name('build-wordlists.py'))
bw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bw)

MIN_CONTEXT = 200   # a context pair needs this many occurrences
MIN_TRIPLE = 6     # a successor needs this many occurrences in it
TOP_SUCCESSORS = 8  # swept 4 -> 8 on 2026-08-27, after the gamma
#   smoothing changed what the tail is worth: every eval row improved
#   (prefix-2 hit@1 +1.5pp en / +1.0pp cs, typo-2 hit@3 +2.3 / +1.5).
#   These tables are lazy-loaded behind the "Trigram data" toggle, so
#   the extra ~300 KB gzipped costs nothing at first paint.
QUANT_K = 8        # keep in sync with build-ngrams.py and prediction.js
GAMMA_FLOOR = 1e-3  # keep in sync with build-ngrams.py
CLAUSE_END = set('.!?…')
HOLDOUT_MOD = 100  # keep in sync with build-ngrams.py / eval-prediction.mjs


def quant(count):
    return round(math.log(count) * QUANT_K)


def discount(counts):
    """Absolute discount D from count-of-counts; see build-ngrams.py.
    Here the counts are the triples of the kept contexts, which is every
    triple this builder ever sees."""
    n1 = n2 = 0
    for c in counts:
        if c == 1:
            n1 += 1
        elif c == 2:
            n2 += 1
    return n1 / (n1 + 2 * n2) if n1 else 0.0


def each_token_run(dump_path, vocab):
    """Yields runs of adjacent in-vocabulary tokens, holdout skipped."""
    opener = gzip.open if str(dump_path).endswith('.gz') else open
    f = opener(dump_path, 'rt', encoding='utf-8', errors='replace')
    try:
        run = []
        for idx, line in enumerate(f):
            if idx % HOLDOUT_MOD == 0:
                continue  # held out for the eval harness
            line = line.lower().replace('’', "'")
            if '{' in line:
                line = bw.ASS_TAGS.sub(' ', line)
            if "'" in line:
                line = bw.TAIL_JOIN.sub(r"'\1", line)
            run.clear()
            for wt in line.split():
                if bw.JUNK.search(wt):
                    if run:
                        yield run
                        run = []
                    continue
                tok = wt.strip(bw.EDGE_PUNCT)
                if tok not in vocab:
                    if run:
                        yield run
                        run = []
                    continue
                run.append(tok)
                trail = wt[len(wt.rstrip(bw.EDGE_PUNCT)):]
                if any(c in CLAUSE_END for c in trail):
                    yield run
                    run = []
            if run:
                yield run
                run = []
    except EOFError:
        pass  # range-truncated gzip: keep everything read so far
    finally:
        f.close()


def main():
    lang, dump_path, words_path, out_path = sys.argv[1:5]
    words = list(bw.read_old_words(words_path))
    vocab = set(words)
    index = {w: i for i, w in enumerate(words)}

    # Pass 1: context pair counts.
    contexts = Counter()
    for run in each_token_run(dump_path, vocab):
        for a, b in zip(run, run[1:]):
            contexts[(a, b)] += 1
    kept = {c: i for i, (c, n) in enumerate(contexts.items())
            if n >= MIN_CONTEXT}
    print(f"{lang}: {len(contexts)} distinct contexts, "
          f"{len(kept)} with count >= {MIN_CONTEXT}")

    # Pass 2: successor counts for kept contexts, integer-keyed.
    n_words = len(words)
    triples = Counter()
    for run in each_token_run(dump_path, vocab):
        for a, b, c in zip(run, run[1:], run[2:]):
            ci = kept.get((a, b))
            if ci is not None:
                triples[ci * n_words + index[c]] += 1

    by_context = {}
    for key, n in triples.items():
        if n >= MIN_TRIPLE:
            by_context.setdefault(key // n_words, []).append(
                (-n, words[key % n_words]))

    d = discount(triples.values())
    out = {}
    for (a, b), ci in kept.items():  # insertion order = corpus order
        ranked = sorted(by_context.get(ci, []))
        if not ranked:
            continue
        keep_succ = ranked[:TOP_SUCCESSORS]
        total = contexts[(a, b)]
        # Same mass conservation as build-ngrams.py. Here "dropped" also
        # holds the context occurrences that ended a run with no third
        # word, which is honest: those are occurrences this list does not
        # predict either.
        dropped = total - sum(-nc for nc, _ in keep_succ)
        gamma = max((d * len(keep_succ) + dropped) / total, GAMMA_FLOOR)
        succ = ' '.join(f'{w}|{quant(-nc - d)}' for nc, w in keep_succ)
        out[f'{a} {b}'] = f'{quant(total)}|{quant(gamma)} {succ}'

    header = (
        f"// Generated by tools/build-trigrams.py from the OPUS OpenSubtitles\n"
        f"// v2018 mono dump (attribution: https://www.opensubtitles.org).\n"
        f"// {lang} trigram layer, v3, per context \"w1 w2\": \"T|g succ|c ...\",\n"
        f"// T = context count, g = backoff weight, c = triple count minus\n"
        f"// the absolute discount D = {d:.4f}; all log-quantized (decode\n"
        f"// exp(code/{QUANT_K})). Contexts >= {MIN_CONTEXT}, triples >= {MIN_TRIPLE},\n"
        f"// top {TOP_SUCCESSORS} successors. Lazy-loaded; see features.md.\n"
    )
    Path(out_path).write_text(header + bw.js_export("TRIGRAMS", out),
                              encoding='utf-8')
    size = Path(out_path).stat().st_size
    # One '|' per successor plus one in each context token ("T|g").
    n_succ = sum(v.count('|') for v in out.values()) - len(out)
    print(f"{lang}: {len(out)} contexts kept, {n_succ} successors, "
          f"D={d:.4f}; {size // 1024} KB -> {out_path}")
    for demo in {'en': ['you are', 'i love', 'thank you'],
                 'cs': ['co se', 'já jsem', 'to je']}[lang]:
        entry = out.get(demo, '-')
        tops = ', '.join(s.split('|')[0] for s in entry.split(' ')[1:7])
        print(f"  {demo:10}: {tops}")


if __name__ == '__main__':
    main()
