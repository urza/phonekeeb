#!/usr/bin/env python3
"""Regenerate words-en.js / words-cs.js from an OPUS OpenSubtitles dump.

Usage:
  python3 tools/build-wordlists.py en os_en.txt.gz words-en.js
  python3 tools/build-wordlists.py cs os_cs.txt.gz words-cs.js

Extension mode (words-ext-*.js, the unigram-only tail tier):
  python3 tools/build-wordlists.py ext en big_dump.gz dict-en.txt \\
      words-en.js words-ext-en.js

The ext list holds ranks beyond the shipped core list, up to
EXT_TOTAL[lang] combined. Two extra rules apply to the tail (and only
the tail; the core list is never touched by ext mode):
- a tail word must be in the aspell dictionary dump (dict file, one
  form per line; `aspell -d LANG --encoding=utf-8 dump master |
  aspell -l LANG --encoding=utf-8 expand`). Deep subtitle ranks are
  full of transcription junk and misspellings; frequency alone stops
  being evidence of wordhood there. Names that aspell itself carries
  (kevin, rome) do get in; that is fine, unigram-only tail words
  surface only when their prefix is typed. Names aspell lacks stay
  out; the personal model is where those live.
- counts are rescaled to the core list's corpus scale (factor = the
  core words' count sum in this corpus / their sum in the core file),
  so the predictor can keep the core sum as the one probability
  denominator for both tiers.

Input: the monolingual OpenSubtitles v2018 dump (raw sentences, gzip):
  https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/en.txt.gz (3.4 GiB)
  https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/cs.txt.gz (1.2 GiB)
A range-truncated download (e.g. `curl -r 0-83886080`) is fine; the top
3000 words are stable from ~50M tokens on, and a truncated gzip stream
is handled. The full dump gives canonical counts.
Attribution: https://www.opensubtitles.org (same corpus family as the
original hermitdave/FrequencyWords lists).

Filter rules (the 2026-08 vocabulary-bug fix, see
word-prediction-research.md, "Vocabulary bug"):
- one-letter words are allowed: "i"/"a" in en, a/i/o/u/s/z/v/k in cs
- en keeps apostrophes inside words, so "don't" is a single entry
- a whitespace token is validated whole: markup and digit-bearing
  tokens ({\\fscx100}, mp3) are dropped entirely, never trimmed into
  letter fragments like "fscx"
- pre-tokenized contraction tails ("they 're") are rejoined first
"""
import gzip
import json
import re
import sys
from collections import Counter
from pathlib import Path

TOP_N = 3000

# Combined vocabulary size (core + ext) per language. Czech gets more:
# its inflection spreads one lemma over many forms, so equal-coverage
# needs a longer form list.
EXT_TOTAL = {'en': 20000, 'cs': 40000}

# ASS/SSA subtitle override blocks, e.g. {\fscx100\pos(1,2)}.
ASS_TAGS = re.compile(r"\{\\[^}]*\}")
# A minority of files ship pre-tokenized contractions: "they 're here".
TAIL_JOIN = re.compile(r"\s+'(re|ll|ve|s|t|m|d|em)\b")
# Any digit or markup char disqualifies the whole whitespace token.
JUNK = re.compile(r"[\d{}\\/_=+\[\]<>|#@&*^~%]")
EDGE_PUNCT = ".,!?;:\"()«»„“”…‘’'–—-"

ALPHABET = {
    'en': re.compile(r"[a-z]+(?:'[a-z]+)*$"),
    'cs': re.compile(r"[a-záčďéěíňóřšťúůýž]+$"),
}

# Subtitles are full of spelled-out initials and music syllables, so a
# bare length-1 pass floods the list with junk letters. Only these are
# real one-letter words.
ONE_LETTER = {
    'en': {'i', 'a'},
    'cs': {'a', 'i', 'o', 'u', 's', 'z', 'v', 'k'},
}

# Frequent non-words that survive every structural filter: "re" stays in
# the top 3000 through email "Re:" headers and do-re-mi solfège.
DROP = {
    'en': {'re'},
    'cs': set(),
}


def count_words(lang, dump_path):
    valid = ALPHABET[lang]
    one_letter = ONE_LETTER[lang]
    drop = DROP[lang]
    counts = Counter()
    lines = 0
    if dump_path == '-':
        f = sys.stdin  # e.g. `curl … | gunzip -c | build-wordlists.py en -`
    else:
        opener = gzip.open if str(dump_path).endswith('.gz') else open
        f = opener(dump_path, 'rt', encoding='utf-8', errors='replace')
    try:
        for line in f:
            lines += 1
            line = line.lower().replace('’', "'")
            if '{' in line:
                line = ASS_TAGS.sub(' ', line)
            if "'" in line:
                line = TAIL_JOIN.sub(r"'\1", line)
            for wt in line.split():
                if JUNK.search(wt):
                    continue
                tok = wt.strip(EDGE_PUNCT)
                if not tok or (len(tok) == 1 and tok not in one_letter):
                    continue
                if tok in drop:
                    continue
                if valid.fullmatch(tok):
                    counts[tok] += 1
    except EOFError:
        pass  # range-truncated gzip: keep everything read so far
    finally:
        if f is not sys.stdin:
            f.close()
    return counts, lines


def read_old_words(js_path):
    try:
        text = Path(js_path).read_text(encoding='utf-8')
        start = text.index('[', text.index('WORDS = '))  # skip "[" in comments
        return dict(json.loads(text[start:text.rindex(']') + 1]))
    except (FileNotFoundError, ValueError):
        return {}


def load_dict(path):
    # Lowercased: corpus tokens are lowercase, and folding proper nouns
    # down ("John" -> "john") is wanted, not a bug.
    words = set()
    with open(path, encoding='utf-8') as f:
        for line in f:
            w = line.strip().lower()
            if w:
                words.add(w)
    return words


# aspell's expansion has no possessives or clitics, but "driver's",
# "this'll" and "there'd" are real conversational words: accept a token
# whose base before the clitic is a dictionary word. 't is absent on
# purpose ("don't" is a dictionary entry itself; "don" alone proves
# nothing).
CLITICS = ("'s", "'ll", "'d", "'re", "'ve", "'m")

# aspell cs holds standard Czech only, but subtitles (and phone typing)
# are colloquial: admit a form whose standard rewrite is a dictionary
# word. -uju/-ju first person maps to -uji/-ji (gratuluju), final -ej
# maps to -ý (novej, prej). A wrong rewrite lands outside the
# dictionary and rejects itself.
CS_COLLOQ = (('uju', 'uji'), ('ju', 'ji'), ('ej', 'ý'))


def in_dict(lang, tok, dict_words):
    if tok in dict_words:
        return True
    if lang == 'en':
        return any(tok.endswith(c) and tok[:-len(c)] in dict_words
                   for c in CLITICS)
    if lang == 'cs':
        return any(tok.endswith(a) and tok[:-len(a)] + b in dict_words
                   for a, b in CS_COLLOQ)
    return False


def ext_main():
    lang, dump_path = sys.argv[2], sys.argv[3]
    dict_path, core_path, out_path = sys.argv[4], sys.argv[5], sys.argv[6]
    dict_words = load_dict(dict_path)
    core = read_old_words(core_path)
    if not core:
        sys.exit(f'cannot read core list {core_path}')
    counts, lines = count_words(lang, dump_path)

    new_core_sum = sum(counts[w] for w in core)
    factor = new_core_sum / sum(core.values())
    ext_n = EXT_TOTAL[lang] - len(core)
    ext = []
    rejected = []
    for w, c in counts.most_common():
        if len(ext) >= ext_n:
            break
        if w in core:
            continue
        if in_dict(lang, w, dict_words):
            ext.append([w, max(1, round(c / factor))])
        else:
            rejected.append(w)

    header = (
        f"// Generated by tools/build-wordlists.py (ext mode) from the OPUS\n"
        f"// OpenSubtitles v2018 mono dump (attribution:\n"
        f"// https://www.opensubtitles.org). Extension vocabulary: {len(ext)}\n"
        f"// {lang} words below the core top {len(core)}, aspell-filtered,\n"
        f"// counts rescaled to the core corpus scale (factor {factor:.2f})\n"
        f"// so the core sum stays the one probability denominator. See the\n"
        f"// \"Vocabulary bug\" section of word-prediction-research.md before\n"
        f"// changing filters.\n"
    )
    body = json.dumps(ext, ensure_ascii=False, separators=(',', ':'))
    Path(out_path).write_text(header + f"export const WORDS_EXT = {body};\n",
                              encoding='utf-8')

    print(f"{lang} ext: {lines} lines, factor {factor:.2f}; "
          f"wrote {len(ext)} words to {out_path}")
    print(f"  rejected as non-dictionary: {len(rejected)}, "
          f"top: {', '.join(rejected[:30])}")
    print(f"  first 10: {', '.join(w for w, _ in ext[:10])}")
    print(f"  last 10: {', '.join(w for w, _ in ext[-10:])}")


def main():
    if sys.argv[1] == 'ext':
        ext_main()
        return
    lang, dump_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    counts, lines = count_words(lang, dump_path)
    top = counts.most_common(TOP_N)

    header = (
        f"// Generated by tools/build-wordlists.py from the OPUS OpenSubtitles\n"
        f"// v2018 mono dump (attribution: https://www.opensubtitles.org).\n"
        f"// Top {TOP_N} {lang} words as [word, count]. One-letter words and\n"
        f"// in-word apostrophes are deliberate: see the \"Vocabulary bug\"\n"
        f"// section of word-prediction-research.md before changing filters.\n"
    )
    body = json.dumps([[w, c] for w, c in top],
                      ensure_ascii=False, separators=(',', ':'))
    old = read_old_words(out_path)
    Path(out_path).write_text(header + f"export const WORDS = {body};\n",
                              encoding='utf-8')

    total = sum(counts.values())
    print(f"{lang}: {lines} lines, {total} tokens, "
          f"{len(counts)} distinct; wrote top {len(top)} to {out_path}")
    print("  top 12:", ', '.join(w for w, _ in top[:12]))
    ones = [w for w, _ in top if len(w) == 1]
    apos = [w for w, _ in top if "'" in w]
    print(f"  one-letter words: {ones}")
    print(f"  apostrophe words: {len(apos)}, e.g. {apos[:8]}")
    if old:
        new_set = {w for w, _ in top}
        gone = [w for w in old if w not in new_set]
        added = [w for w, _ in top if w not in old]
        print(f"  vs old list: +{len(added)} -{len(gone)}; "
              f"added e.g. {added[:8]}; dropped e.g. {gone[:8]}")


if __name__ == '__main__':
    main()
