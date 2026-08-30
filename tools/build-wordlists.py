#!/usr/bin/env python3
"""Regenerate words-en.js / words-cs.js from an OPUS OpenSubtitles dump.

Usage:
  python3 tools/build-wordlists.py en os_en.txt.gz words-en.js
  python3 tools/build-wordlists.py cs os_cs.txt.gz words-cs.js

Extension mode (words-ext-*.js, the unigram-only tail tier):
  python3 tools/build-wordlists.py ext en big_dump.gz dict-en.txt \\
      words-en.js words-ext-en.js

wordfreq mode, which writes BOTH tiers from one ranking (the second
dictionary is the other language's, used to reject words leaking across):
  python3 tools/build-wordlists.py wordfreq en dict-en.txt dict-cs.txt \\
      words-en.js words-ext-en.js [N|all]
Needs `pip install wordfreq` in a build venv; nothing here ships.

Use wordfreq mode. Subtitle counts alone rank the vocabulary wrong: in
the same 400 MB English slice the OpenSubtitles path reads, racquetball
occurs 252 times and playlist 11, so the keyboard shipped racquetball
and had no word for what you listen to (prediction game case 16,
2026-08-30). wordfreq merges 7 corpora per word (Wikipedia, subtitles,
news, books, OSCAR web, Twitter, Reddit; Czech has 5 of them), drops
each word's highest and lowest source, and averages the rest, so no
single register can carry a word on its own. It ranks playlist 12831
and racquetball 56999.

The dump modes above stay, because wordfreq is unigrams only and
bigrams-*.js / trigrams-*.js still come from the OpenSubtitles dump.

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


def js_export(name, data):
    """One data file's body: `export const NAME = JSON.parse(`...`);`

    NOT a plain JS literal. Safari's parser recurses through a literal
    and a 147000-entry array of pairs overflows its stack: a phone
    reported "Maximum call stack size exceeded" importing
    words-ext-cs.js on 2026-08-30, which is how this was found.
    JSON.parse reads the same bytes iteratively and is faster in every
    engine besides. The backtick keeps the JSON's own double quotes
    unescaped, so the file does not grow; the three replacements below
    are what a template literal does need, and none of them can fire
    for the words this project emits.
    """
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    safe = body.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    return f"export const {name} = JSON.parse(`{safe}`);\n"


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

# A closed-class word already carries its own possessive, so the clitic
# rule must not manufacture a second one. Without this, "its's" enters
# the English list (rank 67585 in the 2026-08-30 build) and then reaches
# the strip for "its", where hardly anything else matches the prefix.
CLITIC_BLOCK = {'it', 'its', 'this', 'that', 'us', 'his', 'her', 'hers',
                'our', 'ours', 'your', 'yours', 'their', 'theirs', 'my',
                'mine', 'these', 'those', 's'}

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
                   and tok[:-len(c)] not in CLITIC_BLOCK
                   for c in CLITICS)
    if lang == 'cs':
        return any(tok.endswith(a) and tok[:-len(a)] + b in dict_words
                   for a, b in CS_COLLOQ)
    return False


# wordfreq stores probabilities, the predictor wants integer counts. One
# scale for both tiers and both languages: count = round(p * SCALE). At
# 1e9 the rarest word wordfreq lists (Zipf 0, p = 1e-9) still rounds to
# 1, so no entry is quantized away. The core sum stays the probability
# denominator in prediction.js, exactly as with the dump modes, so
# nothing in the scorer changes.
WF_SCALE = 10 ** 9


# Rank above which a word aspell rejects can still get in. aspell holds
# standard written language, and the top of a chat-register ranking is
# full of words it never had: lmao, wtf, tbh, idk in English; kámo,
# furt, míň, svý in Czech. Those are keyboard words. Below this rank the
# aspell gate stays shut, because that is where the misspellings live
# (opressed, onsie, or00) and where a wrong entry is never worth it.
WF_LOOSE_RANK = 15000

# Subtitle share of the blended ranking. wordfreq alone ranks the
# vocabulary for written language: measured 2026-08-30, a straight swap
# threw 927 English and 1233 Czech words out of the core 3000, and they
# were the spoken ones (uh, huh, honey, bye; pojď, počkej, promiň,
# řekni). Those are the words a phone keyboard exists to type. Blending
# the two rankings geometrically keeps them and still gains the modern
# vocabulary subtitles never had: at 0.5 the core keeps 2522 of 3000 in
# English and 2382 in Czech, playlist lands at 16307 and pojď at 676.
# 0 is pure wordfreq, 1 is pure subtitles.
WF_ALPHA = 0.5


def needs_apostrophe(word, dict_words):
    """didnt -> didn't: one apostrophe short of a dictionary word.

    These stay out of the vocabulary on purpose. The strip's job when
    the user types "didnt" is to offer "didn't" (prediction game case 5,
    which is why matchKey folds the apostrophe). Listing the bare form
    would let the wrong spelling win its own prefix.
    """
    return any(word[:i] + "'" + word[i:] in dict_words
               for i in range(1, len(word)))


def blend_rank(freqs, subs, alpha):
    """Order the vocabulary by p_wordfreq^(1-alpha) * p_subtitles^alpha.

    A geometric blend, so a word needs support from both sides to rank
    high and neither side can veto the other. Subtitle probabilities are
    add-one smoothed, which is what gives a word the corpus never saw
    (playlist, emoji) a floor instead of a zero.
    """
    if not subs or alpha <= 0:
        return sorted(freqs.items(), key=lambda kv: -kv[1])
    n = sum(subs.values()) + len(freqs)
    scored = ((w, p ** (1 - alpha) * ((subs.get(w, 0) + 1) / n) ** alpha)
              for w, p in freqs.items())
    return sorted(scored, key=lambda kv: -kv[1])


def wordfreq_lists(lang, dict_words, other_dict, total, subs=None,
                   alpha=WF_ALPHA):
    """Rank the vocabulary with wordfreq, return (core, ext, rejected).

    The structural filters are the dump path's: same alphabet, same
    one-letter whitelist, same DROP set. They still earn their place
    here, because wordfreq lists digit shapes ("0000"), single letters
    from initialisms, and a long misspelling tail.

    The aspell gate also stays, for the reason ext mode states: deep in
    the tail, frequency stops being evidence of wordhood. Three
    exceptions, in the order they are tested:

    - a word the OTHER language's aspell holds is that language leaking
      in (live, air, facebook, star in the Czech ranking). Out. This is
      the guard aspell was quietly providing before, and it matters:
      cross-language leak under a short prefix is a known failure of
      this engine (prediction-game-analysis.md, cause D).
    - an apostrophe-less contraction is out, see needs_apostrophe().
    - anything else above WF_LOOSE_RANK is in. Seven corpora agreeing a
      token is common is better evidence than one dictionary's silence.
    """
    from wordfreq import get_frequency_dict  # build-time only, see the venv note

    valid = ALPHABET[lang]
    one_letter = ONE_LETTER[lang]
    drop = DROP[lang]
    freqs = get_frequency_dict(lang, wordlist='large')
    ranked = blend_rank(freqs, subs, alpha)

    chosen, rejected = [], []
    for word, score in ranked:
        rank = len(chosen)
        if rank >= total:
            break
        if word in drop or not valid.fullmatch(word):
            continue
        if len(word) == 1 and word not in one_letter:
            continue
        # The commonest TOP_N are certainly words, whichever dictionary
        # says otherwise. The gate applies below them.
        if (rank < TOP_N
                or in_dict(lang, word, dict_words)
                or (rank < WF_LOOSE_RANK and word not in other_dict
                    and not needs_apostrophe(word, dict_words))):
            chosen.append([word, score])
        else:
            rejected.append(word)
    return chosen, rejected


def score_and_split(chosen, subs):
    """Count the chosen words in the spoken register, then split the tiers.

    The blend decides WHICH words the keyboard holds. It must not decide
    how they RANK on the strip, because the two questions have different
    right answers. Measured 2026-08-30, ranking by the blend:
    `you` fell off the neutral strip behind `the`, `hello` fell below
    `hell` and out of the strip for the typo `helo`, and `amazing` lost
    its slot to `among` (game case 1). All three are the written
    register outvoting the spoken one, and all three are words a phone
    keyboard types constantly.

    So the count is the subtitle probability, add-one smoothed. A word
    the corpus never says (playlist, emoji) gets the floor, which is the
    honest estimate: we have no evidence anyone speaks it, and it still
    wins its own prefix, where nothing competes. The order in the file
    follows the count, so the core tier is the 3000 words the keyboard
    predicts from context, and the n-gram tables are built from it.
    """
    n = sum(subs.values()) + len(chosen) if subs else 0
    # Ties (every word the corpus never saw) keep the blend's order,
    # because Python's sort is stable and `chosen` arrives blend-ranked.
    if subs:
        scored = [[w, (subs.get(w, 0) + 1) / n] for w, _ in chosen]
        scored.sort(key=lambda r: -r[1])
    else:
        scored = [[w, s] for w, s in chosen]
    core, ext = scored[:TOP_N], scored[TOP_N:]
    # prediction.js divides every count by the CORE list's sum, so that
    # sum is the scale. Fixing it here keeps both tiers on one scale and
    # keeps the two languages comparable the way the dump modes leave
    # them: each language's probabilities are its own share of its own
    # core mass.
    scale = WF_SCALE / sum(s for _, s in core)
    for row in scored:
        row[1] = max(1, round(row[1] * scale))
    return core, ext


def wordfreq_main():
    lang, dict_path, other_path = sys.argv[2], sys.argv[3], sys.argv[4]
    core_out, ext_out = sys.argv[5], sys.argv[6]
    arg = sys.argv[7] if len(sys.argv) > 7 else str(EXT_TOTAL[lang])
    dump_path = sys.argv[8] if len(sys.argv) > 8 else None
    alpha = float(sys.argv[9]) if len(sys.argv) > 9 else WF_ALPHA
    # "all" means every word wordfreq lists that survives the filters.
    total = 10 ** 9 if arg == 'all' else int(arg)

    subs = None
    if dump_path:
        subs, lines = count_words(lang, dump_path)
        print(f"{lang}: {lines} subtitle lines, {len(subs)} distinct words, "
              f"blending at alpha {alpha}")
    dict_words = load_dict(dict_path)
    chosen, rejected = wordfreq_lists(lang, dict_words,
                                      load_dict(other_path), total,
                                      subs, alpha)
    core, ext = score_and_split(chosen, subs)

    credit = (
        f"// Generated by tools/build-wordlists.py (wordfreq mode) from\n"
        f"// wordfreq's large {lang} list: 7 corpora merged per word with the\n"
        f"// highest and lowest source dropped. Data CC-BY-SA 4.0, with\n"
        f"// credit to the SUBTLEX authors (Brysbaert et al.) and to the\n"
        f"// other sources wordfreq names; code Apache-2.0.\n"
        f"// WHICH words: a geometric blend of that ranking with the\n"
        f"// OpenSubtitles v2018 counts (attribution:\n"
        f"// https://www.opensubtitles.org), subtitle share {alpha}.\n"
        f"// HOW THEY RANK: the OpenSubtitles probability alone, add-one\n"
        f"// smoothed. The strip must rank in the register it is typed in.\n"
        f"// Counts scale the core sum to {WF_SCALE:.0e}, both tiers together.\n"
    )
    Path(core_out).write_text(
        credit
        + f"// Core tier: top {len(core)} {lang} words as [word, count].\n"
        + f"// One-letter words and in-word apostrophes are deliberate: see\n"
        + f"// the \"Vocabulary bug\" section of word-prediction-research.md.\n"
        + js_export('WORDS', core), encoding='utf-8')
    Path(ext_out).write_text(
        credit
        + f"// Extension tier: {len(ext)} {lang} words below the core top\n"
        + f"// {len(core)}, aspell-filtered, lazy-loaded after first paint.\n"
        + js_export('WORDS_EXT', ext), encoding='utf-8')

    print(f"{lang}: core {len(core)} -> {core_out}, "
          f"ext {len(ext)} -> {ext_out}, rejected {len(rejected)}")
    print(f"  core last 8: {', '.join(w for w, _ in core[-8:])}")
    print(f"  ext last 8:  {', '.join(w for w, _ in ext[-8:])}")
    print(f"  rejected e.g. {', '.join(rejected[:12])}")


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
    Path(out_path).write_text(header + js_export('WORDS_EXT', ext),
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
    if sys.argv[1] == 'wordfreq':
        wordfreq_main()
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
    old = read_old_words(out_path)
    Path(out_path).write_text(header + js_export('WORDS', [[w, c] for w, c in top]),
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
