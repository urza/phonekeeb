#!/usr/bin/env python3
"""Sample the vocabulary ranking at depth steps, for judging by hand.

Usage (needs `uv pip install wordfreq` in a build venv):
  python3 tools/vocab-depth.py en out-en
  python3 tools/vocab-depth.py cs out-cs [dump.gz [alpha]]

With a dump the ranking is the blended one the keyboard ships:
p_wordfreq^(1-alpha) * p_subtitles^alpha, same formula and same default
alpha as tools/build-wordlists.py. Pass the same OpenSubtitles slice the
lists were built from. Without a dump the ranking is pure wordfreq.

Writes out-LANG.txt: one block per depth band, each a random sample of
words from that band, with nothing else on the line. The samples are
read and labelled by a person; the labels and the conclusion live in
`vocabulary-depth-analysis.md`.

No dictionary check happens here, on purpose. aspell was tried first and
it answers a different question in each language. In English it holds
19k capitalized-only proper names, so it calls `waukesha` and `dodson`
words. In Czech it holds 2.95M lowercase forms but still misses live
derivation (`železnička`, diminutives, colloquial endings), so it calls
real keyboard words junk. A gate that is loose in one language and tight
in the other cannot say which language runs out of words first, which is
the whole question. Reading the samples can.

The candidate stream is the one tools/build-wordlists.py (wordfreq mode)
walks: same ALPHABET regex, same ONE_LETTER whitelist, same DROP set, in
wordfreq's frequency order. A rank here is a rank in the shipped list.

Frequency mass per band is printed with each block, because a band of
junk costs nothing if it carries no text either. Mass is wordfreq's own
probability, summed over the band, over the whole filtered stream.
"""
import gzip
import random
import re
import sys
from collections import Counter
from pathlib import Path

# Copied from tools/build-wordlists.py, not imported: that file's name
# has a hyphen, so it is not importable, and this script must keep
# working while the build script is being edited.
ALPHABET = {
    'en': re.compile(r"[a-z]+(?:'[a-z]+)*$"),
    'cs': re.compile(r"[a-záčďéěíňóřšťúůýž]+$"),
}
ONE_LETTER = {
    'en': {'i', 'a'},
    'cs': {'a', 'i', 'o', 'u', 's', 'z', 'v', 'k'},
}
DROP = {'en': {'re'}, 'cs': set()}

# Depth steps. Dense where the shipped lists end (3000 core, 20000 and
# 40000 combined), coarse in the tail.
BANDS = [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 40000,
         50000, 75000, 100000, 150000, 200000, 300000, 400000, 500000,
         600000]

SAMPLE_PER_BAND = 25
SEED = 20260830

# Subtitle share of the blended ranking, kept equal to WF_ALPHA in
# tools/build-wordlists.py. If that constant moves, move this one.
ALPHA = 0.5

# ASS/SSA subtitle override blocks and the other dump-mode token rules,
# copied from the build script for the same reason as the filters above.
ASS_TAGS = re.compile(r"\{\\[^}]*\}")
TAIL_JOIN = re.compile(r"\s+'(re|ll|ve|s|t|m|d|em)\b")
JUNK = re.compile(r"[\d{}\\/_=+\[\]<>|#@&*^~%]")
EDGE_PUNCT = ".,!?;:\"()«»„“”…‘’'–—-"


def subtitle_counts(dump_path):
    """Token counts from an OpenSubtitles slice, dump-mode rules."""
    counts = Counter()
    opener = gzip.open if str(dump_path).endswith('.gz') else open
    with opener(dump_path, 'rt', encoding='utf-8', errors='replace') as f:
        try:
            for line in f:
                line = line.lower().replace('’', "'")
                if '{' in line:
                    line = ASS_TAGS.sub(' ', line)
                if "'" in line:
                    line = TAIL_JOIN.sub(r"'\1", line)
                for wt in line.split():
                    if JUNK.search(wt):
                        continue
                    tok = wt.strip(EDGE_PUNCT)
                    if tok:
                        counts[tok] += 1
        except EOFError:
            pass  # range-truncated gzip: keep what was read
    return counts


def candidates(lang, dump_path=None, alpha=ALPHA):
    """The shipped candidate stream, structurally filtered, in rank order.

    Returns (word, freq) with freq the wordfreq probability, so the mass
    column stays comparable between the pure and the blended ranking.
    Only the ORDER changes when a dump is given.
    """
    from wordfreq import get_frequency_dict
    freqs = get_frequency_dict(lang, wordlist='large')
    if dump_path:
        subs = subtitle_counts(dump_path)
        n = sum(subs.values()) + len(freqs)
        key = {w: p ** (1 - alpha) * ((subs.get(w, 0) + 1) / n) ** alpha
               for w, p in freqs.items()}
    else:
        key = freqs
    valid, one_letter, drop = ALPHABET[lang], ONE_LETTER[lang], DROP[lang]
    out = []
    for word, _ in sorted(key.items(), key=lambda kv: -kv[1]):
        if word in drop or not valid.fullmatch(word):
            continue
        if len(word) == 1 and word not in one_letter:
            continue
        out.append((word, freqs[word]))
    return out


def main():
    lang, out_stem = sys.argv[1], sys.argv[2]
    dump = sys.argv[3] if len(sys.argv) > 3 else None
    alpha = float(sys.argv[4]) if len(sys.argv) > 4 else ALPHA
    rows = candidates(lang, dump, alpha)
    total = sum(f for _, f in rows)
    rng = random.Random(SEED)

    how = f"blended with {dump} at alpha {alpha}" if dump else "pure wordfreq"
    blocks = [f"# {lang}: {len(rows)} candidates after the structural "
              f"filters, ranked {how}\n"]
    cum = 0.0
    for lo, hi in zip([0] + BANDS, BANDS):
        hi = min(hi, len(rows))
        if lo >= hi:
            break
        mass = sum(rows[i][1] for i in range(lo, hi))
        cum += mass
        picks = sorted(rng.sample(range(lo, hi),
                                  min(SAMPLE_PER_BAND, hi - lo)))
        blocks.append(
            f"\n=== {lang} {lo}-{hi} "
            f"(mass {100 * mass / total:.3f}%, cum {100 * cum / total:.3f}%) "
            f"===\n" + ', '.join(rows[i][0] for i in picks))
    text = '\n'.join(blocks) + '\n'
    Path(f'{out_stem}.txt').write_text(text, encoding='utf-8')
    print(text)


if __name__ == '__main__':
    main()
