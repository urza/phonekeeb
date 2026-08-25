#!/usr/bin/env python3
"""Design probe for context-aware fuzzy prediction: the "you are am|" case.

Scans the EN sample once. Collects the full successor distribution of
the trigram context "you are" and the bigram head "are", plus total
tokens. Then scores the SwiftKey example candidates with stupid backoff
and an edit-penalty, to check the design reproduces "amazing" first.
"""
import gzip, re, sys, json
from collections import Counter

SAMPLE = sys.argv[1]
WORD = re.compile(r"[a-z']+")

tri = Counter()      # successors of the exact context "you are"
bi = Counter()       # successors of the head "are"
uni = Counter()
tokens = 0
try:
    with gzip.open(SAMPLE, 'rt', encoding='utf-8', errors='replace') as f:
        for line in f:
            ws = WORD.findall(line.lower().replace('’', "'"))
            tokens += len(ws)
            for w in ws:
                uni[w] += 1
            for i in range(len(ws) - 1):
                if ws[i] == 'are':
                    bi[ws[i + 1]] += 1
                    if i and ws[i - 1] == 'you':
                        tri[ws[i + 1]] += 1
except EOFError:
    pass

tri_total = sum(tri.values())
bi_total = sum(bi.values())
print(f"tokens={tokens} count(you are)={tri_total} count(are)={bi_total}")
print(f"distinct successors: you-are={len(tri)}, are={len(bi)}")
ranked = [w for w, _ in tri.most_common()]
for w in ['a', 'an', 'am', 'and', 'amazing']:
    r = ranked.index(w) + 1 if w in ranked else None
    print(f"  you are {w:8} count={tri[w]:6} rank={r}")
kept3 = sum(1 for c in tri.values() if c >= 3)
print(f"successors of 'you are' with count>=3: {kept3}")

# Stupid backoff (alpha=0.4) + typo penalty 0.05 per edit.
A = 0.4
PEN = 0.05
def p_backoff(w):
    if tri[w]:
        return tri[w] / tri_total
    if bi[w]:
        return A * bi[w] / bi_total
    return A * A * uni[w] / tokens

print("\nscores for typed prefix 'am' after 'you are':")
cands = [('amazing', 0), ('am', 0), ('among', 0), ('america', 0),
         ('an', 1), ('and', 1), ('angel', 1)]
scored = sorted(((p_backoff(w) * PEN ** e, w, e) for w, e in cands), reverse=True)
for s, w, e in scored:
    print(f"  {w:8} edits={e} score={s:.3e}")
