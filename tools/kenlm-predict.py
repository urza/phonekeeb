#!/usr/bin/env python3
"""Suggestion strip driven by a KenLM n-gram model.

Part of the Czech language-model study (czech-lm-research.md). This is the
"classic n-gram, done properly" arm of the comparison: modified Kneser-Ney
smoothing over an open vocabulary and an order above 3, against the shipped
prediction.js, which is stupid backoff over pruned top-K successor lists.

A language model scores a word; a keyboard ranks words. So the strip is built
the same way prediction.js builds it: take every candidate the typed prefix
allows, score each one, sort. With no prefix that is the whole candidate list,
which is why the measured latency below is the honest number, not a lookup.

Usage:
  python3 tools/kenlm-predict.py --lm cs-o3.bin --pairs pairs-cs.json \\
      --limit-pairs 300 [--game]
"""
import argparse
import json
import re
import sys
import time
import unicodedata

import kenlm


def strip_diacritics(word):
    return "".join(c for c in unicodedata.normalize("NFD", word)
                   if not unicodedata.combining(c))


def match_key(word):
    return strip_diacritics(word).replace("'", "")


def load_vocab(paths):
    """Candidate words, in corpus-frequency order, from the shipped lists."""
    words = []
    seen = set()
    for path in paths:
        try:
            src = open(path, encoding="utf-8").read()
        except FileNotFoundError:
            continue
        for w in re.findall(r'\["([^"]+)",', src):
            if w not in seen:
                seen.add(w)
                words.append(w)
    return words


class KenPredictor:
    def __init__(self, lm_path, words):
        self.lm = kenlm.Model(lm_path)
        self.words = words
        # Bucket candidates by their first two match-key letters. The strip
        # asks for a prefix far more often than for nothing at all, and a
        # 40k-word linear scan per keystroke is the cost this avoids.
        self.by_key = {}
        for w in words:
            k = match_key(w.lower())
            # set(), not (1, 2): a one-letter word has k[:1] == k[:2], and
            # appending it twice put it on the strip twice.
            for n in {k[:1], k[:2]}:
                self.by_key.setdefault(n, []).append(w)

    def candidates(self, prefix):
        if not prefix:
            return self.words
        pool = self.by_key.get(prefix[:2] if len(prefix) >= 2 else prefix[:1], [])
        if len(prefix) <= 2:
            return pool
        return [w for w in pool if match_key(w.lower()).startswith(prefix)]

    def predict(self, context, prefix="", limit=6):
        prefix = match_key(prefix.lower())
        state = kenlm.State()
        out = kenlm.State()
        self.lm.BeginSentenceWrite(state)
        for w in context.split():
            self.lm.BaseScore(state, w, out)
            state, out = out, state
        scored = []
        tmp = kenlm.State()
        for w in self.candidates(prefix):
            scored.append((self.lm.BaseScore(state, w, tmp), w))
        scored.sort(key=lambda s: -s[0])
        return [w for _, w in scored[:limit]]


GAME = [
    (1, "you are", "am", "amazing"),
    (2, "", "how", "are"),
    (3, "do i", "e", "even"),
    (4, "", "future is", "now"),
    (5, "", "its", "it's"),
    (6, "", "i", "love"),
    (7, "i", "w", "would"),
    (8, "", "deliberat", "deliberately"),
    (9, "paja se šla vykoupat a", "zapla", "zaplavat"),
    (10, "mam hlad dam si", "k", "kuře"),
    (11, "", "smoo", "smooth"),
]
GAME_CTX_ONLY = {2, 4}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lm", required=True)
    ap.add_argument("--pairs")
    ap.add_argument("--limit-pairs", type=int, default=300)
    ap.add_argument("--limit", type=int, default=6)
    ap.add_argument("--game", action="store_true")
    ap.add_argument("--words", nargs="*",
                    default=["words-cs.js", "words-ext-cs.js",
                             "words-en.js", "words-ext-en.js"])
    args = ap.parse_args()

    words = load_vocab(args.words)
    t0 = time.time()
    p = KenPredictor(args.lm, words)
    print(f"{args.lm}: order {p.lm.order}, {len(words)} candidate words, "
          f"loaded in {time.time()-t0:.1f}s")

    if args.game:
        hits = 0
        for num, ctx, typed, want in GAME:
            context, prefix = (typed, "") if num in GAME_CTX_ONLY else (ctx, typed)
            t = time.time()
            chips = p.predict(context, prefix, args.limit)
            dt = (time.time() - t) * 1000
            keys = [match_key(c) for c in chips]
            hit = match_key(want) in keys
            hits += hit
            rank = keys.index(match_key(want)) + 1 if hit else 0
            star = "*" if hit and chips[rank - 1] != want else ""
            shown = f"{context} |{prefix}" if prefix else context
            print(f"{num:>3} {shown[:38]:38} {want:14} {', '.join(chips)}   "
                  f"[{'hit@' + str(rank) + star if hit else 'MISS'}, {dt:.0f} ms]")
        print(f"\ngame: {hits}/{len(GAME)} on a strip of {args.limit}")

    if args.pairs:
        pairs = json.load(open(args.pairs, encoding="utf-8"))[:args.limit_pairs]
        modes = {m: [0, 0, 0] for m in ("next-word", "prefix-2", "typo-2")}
        base = {m: [0, 0, 0] for m in ("next-word", "prefix-2", "typo-2")}
        t0 = time.time()
        for i, pr in enumerate(pairs):
            for mode, prefix, chipkey in (("next-word", "", "nextWord"),
                                          ("prefix-2", pr.get("prefix2"), "prefixChips"),
                                          ("typo-2", pr.get("typo2"), "typoChips")):
                if prefix is None:
                    continue
                chips = p.predict(pr["left"], prefix or "", args.limit)
                m, b = modes[mode], base[mode]
                m[2] += 1
                m[0] += chips[:1] == [pr["target"]]
                m[1] += pr["target"] in chips[:3]
                b[2] += 1
                b[0] += pr[chipkey][:1] == [pr["target"]]
                b[1] += pr["target"] in pr[chipkey][:3]
            if (i + 1) % 100 == 0:
                print(f"  {i+1}/{len(pairs)}", file=sys.stderr)
        el = time.time() - t0
        print(f"\n{'mode':12} {'n':>5}  {'kenlm h@1':>9} {'kenlm h@3':>9}   "
              f"{'ngram h@1':>9} {'ngram h@3':>9}")
        for mode in modes:
            m, b = modes[mode], base[mode]
            if not m[2]:
                continue
            print(f"{mode:12} {m[2]:>5}  {100*m[0]/m[2]:8.1f}% {100*m[1]/m[2]:8.1f}%   "
                  f"{100*b[0]/b[2]:8.1f}% {100*b[1]/b[2]:8.1f}%")
        n = sum(m[2] for m in modes.values())
        print(f"\nlatency: {el/max(n,1)*1000:.1f} ms per strip")


if __name__ == "__main__":
    main()
