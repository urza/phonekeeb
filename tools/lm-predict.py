#!/usr/bin/env python3
"""Word-level suggestion strip driven by a GPT-2 class language model.

Written for the Czech language-model study (czech-lm-research.md). It answers
one question: if a small Czech transformer replaced prediction.js, what would
the six chips be? A raw LM cannot answer that on its own. It ranks subword
tokens, while the strip ranks whole words, and a typed prefix constrains the
word, not the tokens. So this file wraps the model in the two things a keyboard
actually needs:

  * marginalization over tokenizations. "zaplavat" may be Ġzapla+vat or
    Ġzap+lavat; both spellings of the same word add up to one candidate.
  * a prefix constraint applied during the beam, not after it. Filtering
    afterwards throws away almost every beam and returns an empty strip.

Constrained beam search over word starts does both. It is the same trick a
production keyboard would need, so its cost is part of the measurement, not an
artifact of the harness.

Usage:
  python3 tools/lm-predict.py --model MU-NLPC/CzeGPT-2 --game
  python3 tools/lm-predict.py --model MU-NLPC/CzeGPT-2 --pairs pairs-cs.json \\
      --limit-pairs 300 [--cap] [--csv out.csv]
"""

import argparse
import json
import math
import sys
import time
import unicodedata

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# Mirrors EDGE_PUNCT in tools/eval-prediction.mjs, so a word the LM emits is
# trimmed exactly like a word the corpus builder emits.
EDGE_PUNCT = set(".,!?;:\"()«»„“”…‘’'–—-")


def strip_diacritics(word):
    return "".join(c for c in unicodedata.normalize("NFD", word)
                   if not unicodedata.combining(c))


def match_key(word):
    """The predictor's match key: prediction.js matchKey()."""
    return strip_diacritics(word).replace("'", "")


class WordLM:
    """Predicts whole next words with an optional typed prefix."""

    def __init__(self, model_id, device="cpu", dtype=torch.float32, beam=24,
                 max_tokens=6, local_files_only=False):
        self.tok = AutoTokenizer.from_pretrained(
            model_id, local_files_only=local_files_only)
        self.model = AutoModelForCausalLM.from_pretrained(
            model_id, dtype=dtype, local_files_only=local_files_only)
        self.model.eval().to(device)
        self.device = device
        self.beam = beam
        self.max_tokens = max_tokens
        self.n_vocab = self.model.get_output_embeddings().weight.shape[0]

        # Decode every token once. The beam needs each token as text far more
        # often than the model needs it as an id, and decoding inside the loop
        # dominated the runtime before this cache existed.
        ids = list(range(self.n_vocab))
        # A model whose output layer is padded past its real vocabulary (Qwen3
        # rounds 151646 up to 151936 for tensor alignment) returns None for the
        # unused ids. They decode to nothing and must never win a beam slot, so
        # they become empty strings here and fail every test below.
        self.piece = [p or "" for p in self.tok.convert_ids_to_tokens(ids)]
        self.text = [self.tok.convert_tokens_to_string([p]) if p else ""
                     for p in self.piece]
        # A byte-level BPE marks a word start with U+0120 ("Ġ"); some Czech
        # tokenizers use the sentencepiece "▁" instead. Accept both, and fall
        # back to a leading space in the decoded form.
        self.starts_word = [
            p.startswith("Ġ") or p.startswith("▁") or t.startswith(" ")
            for p, t in zip(self.piece, self.text)
        ]
        # Folded core of each token: what it contributes to the match key.
        self.core = [match_key(t.strip().lower()) for t in self.text]
        self.alpha = [bool(c) and c.isalpha() for c in self.core]
        # A token continues the current word only if it adds letters and does
        # not open a new one. Everything else ("!", ".", "Ġa", "\n") ends the
        # word. The two sets partition the vocabulary, which is what lets the
        # "ends here" mass and the "continues" mass be summed independently
        # without counting anything twice.
        self.cont = torch.tensor(
            [a and not s for a, s in zip(self.alpha, self.starts_word)],
            dtype=torch.bool)
        self._mask_cache = {}

    # --- prefix constraint -------------------------------------------------

    def _allowed(self, pattern, word_start):
        """Bool mask over the vocabulary.

        pattern is the still-unmatched tail of the typed prefix. A token is
        allowed when its folded core extends the pattern (the word is longer
        than what was typed) or the pattern extends the core (more letters are
        still to come). Empty pattern means the prefix is already satisfied.
        Cached: the eval reuses a few hundred distinct patterns thousands of
        times, and one uncached pass costs a 50k-element Python loop.
        """
        key = (pattern, word_start)
        hit = self._mask_cache.get(key)
        if hit is not None:
            return hit
        mask = torch.zeros(self.n_vocab, dtype=torch.bool)
        cont = self.cont
        for i in range(self.n_vocab):
            if word_start:
                if not (self.starts_word[i] and self.alpha[i]):
                    continue
            elif not cont[i]:
                continue
            c = self.core[i]
            if pattern and not (c.startswith(pattern) or pattern.startswith(c)):
                continue
            mask[i] = True
        self._mask_cache[key] = mask
        return mask

    # --- the beam ----------------------------------------------------------

    @torch.inference_mode()
    def predict(self, context, prefix="", limit=6):
        """Return up to `limit` words, most likely first.

        context: the text before the cursor. prefix: the letters already typed
        for the current word, in match-key form (no diacritics, no apostrophe).
        """
        prefix = match_key(prefix.lower())
        ctx_ids = self.tok.encode(context) if context else []
        if not ctx_ids:
            ctx_ids = [self.tok.eos_token_id or 0]

        # A beam is (appended token ids, cumulative logprob, word text so far).
        # The word is carried in its real spelling; the match key is derived
        # when needed, so the strip shows "řekl", not "rekl".
        beams = [([], 0.0, "")]
        done = {}   # word -> summed probability
        for step in range(self.max_tokens):
            if not beams:
                break
            inp = torch.tensor(
                [ctx_ids + b[0] for b in beams], device=self.device)
            logits = self.model(inp).logits[:, -1, :].float()
            logp = torch.log_softmax(logits, dim=-1)

            cand = []
            for bi, (toks, score, sofar) in enumerate(beams):
                key = match_key(sofar)
                pattern = prefix[len(key):] if len(key) < len(prefix) else ""
                row = logp[bi].clone()
                mask = self._allowed(pattern, word_start=(step == 0))
                if step > 0 and sofar and len(key) >= len(prefix):
                    # The word may END here. "Ends" means the next token opens
                    # a new word or is punctuation, so the ending mass is the
                    # sum over every non-continuation token. The expansion mask
                    # below keeps only continuation tokens, so the two branches
                    # are disjoint and nothing is counted twice.
                    endmass = torch.logsumexp(row[~self.cont], dim=-1).item()
                    done[sofar] = done.get(sofar, 0.0) + math.exp(score + endmass)
                row[~mask] = float("-inf")
                k = min(self.beam, int(mask.sum()))
                if k == 0:
                    continue
                top = torch.topk(row, k)
                for lp, tid in zip(top.values.tolist(), top.indices.tolist()):
                    if lp == float("-inf"):
                        break
                    cand.append((toks + [tid], score + lp,
                                 sofar + self.text[tid].strip().lower()))
            if not cand:
                break
            cand.sort(key=lambda c: -c[1])
            beams = cand[:self.beam]

        # Whatever is still open at the token budget closes as-is. A word past
        # six subword tokens is rare; dropping the open beams instead would
        # bias the strip against long words, which in Czech means against
        # exactly the inflected forms that matter.
        for toks, score, sofar in beams:
            if sofar and len(match_key(sofar)) >= len(prefix):
                done[sofar] = done.get(sofar, 0.0) + math.exp(score)

        ranked = sorted(done.items(), key=lambda kv: -kv[1])
        return [w for w, _ in ranked[:limit]], dict(ranked[:limit])


# --- the prediction game -------------------------------------------------
# The answered exchanges of prediction-game.md, in the shape this harness
# needs. The numbers are transcript exchange numbers: 15 was never answered,
# so they jump from 14 to 16. A score in a research note is only comparable
# to another one with the same denominator.
GAME = [
    (1, "you are", "am", "amazing"),
    (2, "", "how", "are"),          # "how" is itself the typed prefix
    (3, "do i", "e", "even"),
    (4, "", "future is", "now"),
    (5, "", "its", "it's"),
    (6, "", "i", "love"),
    (7, "i", "w", "would"),
    (8, "", "deliberat", "deliberately"),
    (9, "paja se šla vykoupat a", "zapla", "zaplavat"),
    (10, "mam hlad dam si", "k", "kuře"),
    (11, "", "smoo", "smooth"),
    (12, "ahojky", "zebricko", "zebřičko"),
    (13, "zkouška nového", "predik", "predikčního"),
    (14, "zkouška nového predikčního", "", "algoritmu"),
    (16, "listening to", "playl", "playlists"),
]
# Cases 2 and 4 are next-word questions whose "prefix" column holds context.
# Case 14 is one too, but it already carries its context in the context
# column, so it needs no entry here.
GAME_CTX_ONLY = {2, 4}


def run_game(lm, limit, cap=None):
    hits = 0
    print(f"{'#':>3} {'input':38} {'wanted':14} strip")
    for num, ctx, typed, want in GAME:
        if num in GAME_CTX_ONLY:
            context, prefix = typed, ""
        else:
            context, prefix = ctx, typed
        t0 = time.time()
        chips, _ = lm.predict(context, prefix, limit if cap is None else limit * 6)
        if cap is not None:
            chips = [c for c in chips if c in cap]
        chips = chips[:limit]
        dt = (time.time() - t0) * 1000
        keys = [match_key(c) for c in chips]
        hit = match_key(want) in keys
        hits += hit
        shown = f"{context} |{prefix}" if prefix else context
        rank = keys.index(match_key(want)) + 1 if hit else 0
        # A star marks a match on the fold only: the LM offered "its" where
        # the user wanted "it's". The engine would insert the wrong string,
        # so the star cases are not real hits.
        star = "*" if hit and chips[rank - 1] != want else ""
        print(f"{num:>3} {shown[:38]:38} {want:14} "
              f"{', '.join(chips)}   [{'hit@' + str(rank) + star if hit else 'MISS'}, "
              f"{dt:.0f} ms]")
    print(f"\ngame: {hits}/{len(GAME)} on a strip of {limit}")
    return hits


def run_pairs(lm, pairs, limit, cap_to_vocab=None, csv_path=None):
    """Score the same held-out pairs tools/eval-prediction.mjs scores."""
    modes = {m: [0, 0, 0] for m in ("next-word", "prefix-2")}
    base = {m: [0, 0, 0] for m in ("next-word", "prefix-2")}
    rows = []
    t0 = time.time()
    for i, p in enumerate(pairs):
        target = p["target"]
        for mode, prefix, chipkey in (("next-word", "", "nextWord"),
                                      ("prefix-2", p.get("prefix2"), "prefixChips")):
            if prefix is None:
                continue
            # Capping asks for a wider list first. Filtering a 6-chip strip
            # would leave 2 or 3 chips and measure the cap as a loss, when
            # the point is what a lexicon-backed LM would actually show.
            chips, _ = lm.predict(p["left"], prefix or "",
                                  limit if cap_to_vocab is None else limit * 6)
            if cap_to_vocab is not None:
                chips = [c for c in chips if c in cap_to_vocab]
            chips = chips[:limit]
            m = modes[mode]
            m[2] += 1
            m[0] += chips[:1] == [target]
            m[1] += target in chips[:3]
            b = base[mode]
            b[2] += 1
            b[0] += p[chipkey][:1] == [target]
            b[1] += target in p[chipkey][:3]
            rows.append((mode, p["left"], target, "|".join(chips),
                         "|".join(p[chipkey])))
        if (i + 1) % 25 == 0:
            el = time.time() - t0
            print(f"  {i+1}/{len(pairs)} pairs, {el:.0f}s "
                  f"({el/(i+1)*1000:.0f} ms/pair)", file=sys.stderr)
    el = time.time() - t0
    print(f"\n{'mode':12} {'n':>5}  {'LM h@1':>7} {'LM h@3':>7}   "
          f"{'ngram h@1':>9} {'ngram h@3':>9}")
    for mode in modes:
        m, b = modes[mode], base[mode]
        if not m[2]:
            continue
        print(f"{mode:12} {m[2]:>5}  {100*m[0]/m[2]:6.1f}% {100*m[1]/m[2]:6.1f}%   "
              f"{100*b[0]/b[2]:8.1f}% {100*b[1]/b[2]:8.1f}%")
    n = sum(m[2] for m in modes.values())
    print(f"\nlatency: {el/max(n,1)*1000:.0f} ms per strip "
          f"(batch 1, {torch.get_num_threads()} threads)")
    if csv_path:
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("mode\tleft\ttarget\tlm\tngram\n")
            for r in rows:
                f.write("\t".join(r) + "\n")
    return modes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--pairs")
    ap.add_argument("--limit-pairs", type=int, default=200)
    ap.add_argument("--limit", type=int, default=6, help="strip width")
    ap.add_argument("--beam", type=int, default=24)
    ap.add_argument("--max-tokens", type=int, default=6)
    ap.add_argument("--game", action="store_true")
    ap.add_argument("--cap", action="store_true",
                    help="keep only words the shipped vocabulary knows")
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--dtype", default="float32")
    ap.add_argument("--csv")
    args = ap.parse_args()

    if args.threads:
        torch.set_num_threads(args.threads)
    t0 = time.time()
    lm = WordLM(args.model, beam=args.beam, max_tokens=args.max_tokens,
                dtype=getattr(torch, args.dtype))
    n_par = sum(p.numel() for p in lm.model.parameters())
    print(f"{args.model}: {n_par/1e6:.0f}M parameters, "
          f"vocab {lm.n_vocab}, loaded in {time.time()-t0:.1f}s")

    cap = None
    if args.cap:
        import re
        words = set()
        for path in ("words-cs.js", "words-ext-cs.js", "words-en.js"):
            try:
                src = open(path, encoding="utf-8").read()
            except FileNotFoundError:
                continue
            words |= set(re.findall(r'\["([^"]+)",', src))
        cap = words
        print(f"vocabulary cap: {len(cap)} words")

    if args.game:
        run_game(lm, args.limit, cap)
    if args.pairs:
        pairs = json.load(open(args.pairs, encoding="utf-8"))[:args.limit_pairs]
        run_pairs(lm, pairs, args.limit, cap, args.csv)


if __name__ == "__main__":
    main()
