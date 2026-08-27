#!/usr/bin/env python3
"""Build bigrams-en.js / bigrams-cs.js from an OPUS OpenSubtitles dump.

Usage:
  python3 tools/build-ngrams.py en os_en.txt.gz words-en.js bigrams-en.js
  python3 tools/build-ngrams.py cs os_cs.txt.gz words-cs.js bigrams-cs.js

Input: the same monolingual OpenSubtitles v2018 dump as
tools/build-wordlists.py (see its docstring for URLs). A
range-truncated download (first ~80 MB) is fine and is what the
measured tables in word-prediction-research.md came from.
Attribution: https://www.opensubtitles.org

Output (v3, the smoothed scored-prediction format): per head one
compact string, "T|g succ|c succ|c ...", where T, g and c are
log-quantized (code = round(ln(value) * QUANT_K); decode
exp(code/QUANT_K)). T is the head's total adjacency count BEFORE the
cap and floor, so c/T approximates the true conditional probability.
c is the absolute-discounted count (c - D), and g is the head's
backoff weight gamma: the probability mass the discount and the
dropped tail leave for words this list does not hold. The predictor
multiplies the lower level by gamma instead of a flat constant, which
is the one thing our tables lacked against KenLM (czech-lm-research.md,
"Result 3"). The five-chip strip needs no more precision than the ~13%
quantization step. Heads stay in vocabulary frequency order (the
predictor's first-wins key-collision rule depends on it).

Rules:
- Tokenization is imported from build-wordlists.py, so the two files
  can never drift apart. The shared tools/textnorm.py extraction is
  planned with the personalization work.
- A pair counts only when both words are vocabulary entries and the
  tokens are adjacent. An out-of-vocabulary or junk token between two
  words breaks adjacency; so does clause-ending punctuation (.!?…)
  after the first word ("no. you go" must not teach "no -> you").
- A pair needs MIN_PAIR occurrences; below that a rare head's list
  fills with one-off noise.
- TOP_SUCCESSORS caps each head's list. The scored predictor scans
  candidates by prefix and looks their counts up here, so the cap
  bounds file size, not the candidate set; a miss backs off to the
  unigram probability (stupid backoff).
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

TOP_SUCCESSORS = 12
MIN_PAIR = 4
QUANT_K = 8  # log-quantization scale; decode = exp(code / QUANT_K)
GAMMA_FLOOR = 1e-3  # a head whose successors leave no mass at all still
#   needs a positive gamma: the runtime takes its log-quantized code,
#   and an unseen word must stay reachable behind the verbatim chip.
CLAUSE_END = set('.!?…')
# Every HOLDOUT_MODth line (0-based) is the eval slice of
# tools/eval-prediction.mjs (keep in sync). Training must never see it.
HOLDOUT_MOD = 100

DEMO_HEADS = {
    'en': ['how', 'what', 'thank', 'good', 'see', 'are'],
    'cs': ['jak', 'dobrý', 'děkuji', 'co'],
}


def quant(count):
    return round(math.log(count) * QUANT_K)


def discount(counts):
    """Absolute discount D from count-of-counts (Ney's estimate):
    D = n1 / (n1 + 2 * n2) over the FULL, unfiltered pair counts, where
    n1 and n2 are the pairs seen exactly once and exactly twice. The
    singletons are the corpus telling us how much of each context's mass
    belongs to pairs it has not shown yet."""
    n1 = n2 = 0
    for c in counts:
        if c == 1:
            n1 += 1
        elif c == 2:
            n2 += 1
    return n1 / (n1 + 2 * n2) if n1 else 0.0


def count_pairs(dump_path, vocab):
    pairs = Counter()
    lines = 0
    opener = gzip.open if str(dump_path).endswith('.gz') else open
    f = opener(dump_path, 'rt', encoding='utf-8', errors='replace')
    try:
        for idx, line in enumerate(f):
            lines += 1
            if idx % HOLDOUT_MOD == 0:
                continue  # held out for the eval harness
            line = line.lower().replace('’', "'")
            if '{' in line:
                line = bw.ASS_TAGS.sub(' ', line)
            if "'" in line:
                line = bw.TAIL_JOIN.sub(r"'\1", line)
            prev = None
            for wt in line.split():
                if bw.JUNK.search(wt):
                    prev = None
                    continue
                tok = wt.strip(bw.EDGE_PUNCT)
                if tok not in vocab:
                    prev = None
                    continue
                if prev is not None:
                    pairs[(prev, tok)] += 1
                trail = wt[len(wt.rstrip(bw.EDGE_PUNCT)):]
                prev = None if any(c in CLAUSE_END for c in trail) else tok
    except EOFError:
        pass  # range-truncated gzip: keep everything read so far
    finally:
        f.close()
    return pairs, lines


def main():
    lang, dump_path, words_path, out_path = sys.argv[1:5]
    # Optional sweep overrides: ... out.js [TOP_SUCCESSORS [MIN_PAIR]].
    # The shipped tier is recorded in word-prediction-research.md.
    global TOP_SUCCESSORS, MIN_PAIR
    if len(sys.argv) > 5:
        TOP_SUCCESSORS = int(sys.argv[5])
    if len(sys.argv) > 6:
        MIN_PAIR = int(sys.argv[6])
    words = list(bw.read_old_words(words_path))  # frequency order
    vocab = set(words)
    pairs, lines = count_pairs(dump_path, vocab)

    totals = Counter()
    by_head = {}
    for (h, w), c in pairs.items():
        totals[h] += c  # total before cap and floor: the P denominator
        if c >= MIN_PAIR:
            by_head.setdefault(h, []).append((-c, w))
    d = discount(pairs.values())
    successors = {}
    for head in words:  # vocabulary frequency order
        ranked = sorted(by_head.get(head, []))  # count desc, ties alphabetic
        if ranked:
            keep = ranked[:TOP_SUCCESSORS]
            total = totals[head]
            # Mass conservation: the D taken off each kept successor plus
            # everything the floor and the cap threw away is exactly what
            # is left for the words this list does not hold. The kept
            # discounted probabilities and gamma then sum to 1.
            dropped = total - sum(-nc for nc, _ in keep)
            gamma = max((d * len(keep) + dropped) / total, GAMMA_FLOOR)
            succ = ' '.join(f'{w}|{quant(-nc - d)}' for nc, w in keep)
            successors[head] = f'{quant(total)}|{quant(gamma)} {succ}'

    header = (
        f"// Generated by tools/build-ngrams.py from the OPUS OpenSubtitles\n"
        f"// v2018 mono dump (attribution: https://www.opensubtitles.org).\n"
        f"// v3 format, per {lang} head: \"T|g succ|c ...\", T = total\n"
        f"// adjacency count, g = backoff weight, c = pair count minus the\n"
        f"// absolute discount D = {d:.4f}; all log-quantized (decode\n"
        f"// exp(code/{QUANT_K})). Top {TOP_SUCCESSORS} successors,\n"
        f"// pair count >= {MIN_PAIR}, heads in frequency order.\n"
    )
    body = json.dumps(successors, ensure_ascii=False, separators=(',', ':'))
    Path(out_path).write_text(header + f"export const BIGRAMS = {body};\n",
                              encoding='utf-8')

    # One '|' per successor plus one in each head token ("T|g").
    kept = sum(v.count('|') for v in successors.values()) - len(successors)
    size = Path(out_path).stat().st_size
    print(f"{lang}: {lines} lines, {len(pairs)} distinct pairs, D={d:.4f}; "
          f"{len(successors)} heads, {kept} successors; "
          f"{size // 1024} KB -> {out_path}")
    for head in DEMO_HEADS[lang]:
        entry = successors.get(head, '-')
        tops = ', '.join(s.split('|')[0] for s in entry.split(' ')[1:7])
        print(f"  {head:7}: {tops}")


if __name__ == '__main__':
    main()
