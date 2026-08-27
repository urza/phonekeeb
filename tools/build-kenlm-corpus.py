#!/usr/bin/env python3
"""Write a KenLM training corpus from an OPUS OpenSubtitles dump.

Part of the Czech language-model study (czech-lm-research.md). KenLM wants
one sentence per line, already tokenized, whitespace separated. This script
produces exactly that from the same dump and with the same tokenization as
tools/build-ngrams.py, and it skips the same held-out lines, so a KenLM model
and the shipped tables are trained on identical text and scored on identical
pairs.

Two differences from build-ngrams.py, both deliberate:
  * no vocabulary filter. Open vocabulary is the whole point of the KenLM
    comparison, so out-of-vocabulary words stay in the text instead of
    breaking adjacency.
  * clause-ending punctuation splits the line. KenLM learns <s> and </s>
    from line boundaries, and the engine's adjacency rule already treats a
    clause end as a break, so the two models see the same breaks.

Usage:
  python3 tools/build-kenlm-corpus.py tools/corpus/os-cs-419430400.txt.gz out.txt
"""
import gzip
import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'build_wordlists', Path(__file__).with_name('build-wordlists.py'))
bw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bw)

CLAUSE_END = set('.!?…')
HOLDOUT_MOD = 100  # keep in sync with build-ngrams.py and eval-prediction.mjs


def main():
    dump_path, out_path = sys.argv[1:3]
    opener = gzip.open if dump_path.endswith('.gz') else open
    src = opener(dump_path, 'rt', encoding='utf-8', errors='replace')
    out = open(out_path, 'w', encoding='utf-8')
    lines = written = tokens = 0
    try:
        for idx, line in enumerate(src):
            lines += 1
            if idx % HOLDOUT_MOD == 0:
                continue
            line = line.lower().replace('’', "'")
            if '{' in line:
                line = bw.ASS_TAGS.sub(' ', line)
            if "'" in line:
                line = bw.TAIL_JOIN.sub(r"'\1", line)
            sent = []
            for wt in line.split():
                if bw.JUNK.search(wt):
                    continue
                tok = wt.strip(bw.EDGE_PUNCT)
                if not tok:
                    continue
                sent.append(tok)
                trail = wt[len(wt.rstrip(bw.EDGE_PUNCT)):]
                if any(c in CLAUSE_END for c in trail):
                    out.write(' '.join(sent) + '\n')
                    tokens += len(sent)
                    written += 1
                    sent = []
            if sent:
                out.write(' '.join(sent) + '\n')
                tokens += len(sent)
                written += 1
    except EOFError:
        pass  # range-truncated gzip: keep everything read so far
    finally:
        src.close()
        out.close()
    print(f'{lines} dump lines -> {written} sentences, {tokens} tokens, '
          f'{Path(out_path).stat().st_size // 1024 // 1024} MB')


if __name__ == '__main__':
    main()
