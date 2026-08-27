#!/usr/bin/env python3
"""Train a keyboard-sized word-level transformer, then score it on the strip.

The third arm of the Czech language-model study (czech-lm-research.md): not a
pretrained model, but a small one trained from scratch on this project's own
corpus and its own vocabulary. The point of a word-level vocabulary is that it
removes every problem the pretrained arm has:

  * the output layer IS the strip. One forward pass gives a probability for
    every candidate word, so there is no beam search over subword pieces and
    no latency multiplier.
  * a typed prefix is a mask over that vector, which costs nothing.
  * the model cannot invent a non-word, because the vocabulary is the lexicon.

The price is that the vocabulary is fixed and small, which is the same trade
Gboard makes (a 10K-word neural model behind a much larger decoder lexicon).
Sizing follows Gboard's published federated model so the comparison is honest:
about 2M parameters, a few MB quantized.

Usage:
  python3 tools/train-mini-lm.py --corpus kenlm-cs.txt --steps 20000 \\
      --out mini-cs.pt
  python3 tools/train-mini-lm.py --eval mini-cs.pt --pairs pairs-cs.json
"""
import argparse
import math
import re
import time
import unicodedata
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

UNK, BOS = 0, 1  # reserved ids; real words start at 2


def strip_diacritics(w):
    return "".join(c for c in unicodedata.normalize("NFD", w)
                   if not unicodedata.combining(c))


def match_key(w):
    return strip_diacritics(w).replace("'", "")


def load_vocab(paths, size):
    words, seen = [], set()
    for p in paths:
        for w in re.findall(r'\["([^"]+)",', Path(p).read_text(encoding="utf-8")):
            if w not in seen:
                seen.add(w)
                words.append(w)
            if len(words) >= size:
                return words
    return words


class MiniGPT(nn.Module):
    def __init__(self, vocab, dim=128, layers=4, heads=4, block=32):
        super().__init__()
        self.block = block
        self.tok = nn.Embedding(vocab, dim)
        self.pos = nn.Embedding(block, dim)
        enc = nn.TransformerEncoderLayer(
            dim, heads, dim_feedforward=4 * dim, dropout=0.0,
            activation="gelu", batch_first=True, norm_first=True)
        self.blocks = nn.TransformerEncoder(enc, layers)
        self.ln = nn.LayerNorm(dim)
        self.head = nn.Linear(dim, vocab, bias=False)
        self.head.weight = self.tok.weight  # tied: the embedding is most of
        #   the parameter budget, and a keyboard model cannot afford it twice.

    def forward(self, idx):
        t = idx.shape[1]
        x = self.tok(idx) + self.pos(torch.arange(t, device=idx.device))
        mask = nn.Transformer.generate_square_subsequent_mask(t, device=idx.device)
        x = self.blocks(x, mask=mask, is_causal=True)
        return self.head(self.ln(x))


def encode_corpus(corpus, words, out_path, max_tokens):
    index = {w: i + 2 for i, w in enumerate(words)}
    buf = np.empty(max_tokens, dtype=np.uint16)
    n = 0
    with open(corpus, encoding="utf-8") as f:
        for line in f:
            toks = line.split()
            if not toks or n + len(toks) + 1 >= max_tokens:
                if n + len(toks) + 1 >= max_tokens:
                    break
                continue
            buf[n] = BOS
            n += 1
            for w in toks:
                buf[n] = index.get(w, UNK)
                n += 1
    buf = buf[:n]
    np.save(out_path, buf)
    print(f"{n} tokens, {100*(buf == UNK).mean():.1f}% out of vocabulary "
          f"-> {out_path}")
    return buf


def train(args):
    words = load_vocab(args.words, args.vocab)
    vocab = len(words) + 2
    data_path = Path(args.out).with_suffix(".data.npy")
    if data_path.exists():
        data = np.load(data_path)
        print(f"reusing {data_path}, {len(data)} tokens")
    else:
        data = encode_corpus(args.corpus, words, data_path, args.max_tokens)
    data = torch.from_numpy(data.astype(np.int64))

    torch.manual_seed(1)
    model = MiniGPT(vocab, args.dim, args.layers, args.heads, args.block)
    n_par = sum(p.numel() for p in model.parameters())
    print(f"vocab {vocab}, {n_par/1e6:.2f}M parameters "
          f"({n_par/1e6:.1f} MB int8, {4*n_par/1e6:.1f} MB float32)")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, args.lr, total_steps=args.steps, pct_start=0.05)

    t0 = time.time()
    for step in range(args.steps):
        ix = torch.randint(len(data) - args.block - 1, (args.batch,))
        x = torch.stack([data[i:i + args.block] for i in ix])
        y = torch.stack([data[i + 1:i + 1 + args.block] for i in ix])
        logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, vocab), y.reshape(-1),
                               ignore_index=UNK)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        sched.step()
        if step % 200 == 0 or step == args.steps - 1:
            el = time.time() - t0
            seen = (step + 1) * args.batch * args.block
            print(f"  step {step:>6}  loss {loss.item():.3f}  "
                  f"ppl {math.exp(loss.item()):.0f}  {seen/1e6:.1f}M tokens  "
                  f"{el:.0f}s", flush=True)
    torch.save({"words": words, "state": model.state_dict(),
                "cfg": dict(dim=args.dim, layers=args.layers,
                            heads=args.heads, block=args.block)}, args.out)
    print(f"saved {args.out}")


@torch.inference_mode()
def evaluate(args):
    ck = torch.load(args.eval, weights_only=False)
    words, cfg = ck["words"], ck["cfg"]
    vocab = len(words) + 2
    model = MiniGPT(vocab, **cfg)
    model.load_state_dict(ck["state"])
    model.eval()
    index = {w: i + 2 for i, w in enumerate(words)}
    keys = [""] * 2 + [match_key(w.lower()) for w in words]

    # Prefix -> allowed word ids. Built once; a keystroke then costs a mask.
    by_prefix = {}
    for i, k in enumerate(keys):
        if i < 2:
            continue
        for n in {k[:1], k[:2]}:
            by_prefix.setdefault(n, []).append(i)

    import json
    pairs = json.load(open(args.pairs, encoding="utf-8"))[:args.limit_pairs]
    modes = {m: [0, 0, 0] for m in ("next-word", "prefix-2")}
    base = {m: [0, 0, 0] for m in ("next-word", "prefix-2")}
    block = cfg["block"]
    t0 = time.time()
    for pr in pairs:
        ctx = [BOS] + [index.get(w, UNK) for w in pr["left"].split()]
        x = torch.tensor([ctx[-block:]])
        logits = model(x)[0, -1]
        for mode, prefix, chipkey in (("next-word", "", "nextWord"),
                                      ("prefix-2", pr.get("prefix2"), "prefixChips")):
            if prefix is None:
                continue
            if prefix:
                allowed = by_prefix.get(prefix[:2], [])
                allowed = [i for i in allowed if keys[i].startswith(prefix)]
                if not allowed:
                    chips = []
                else:
                    sub = logits[torch.tensor(allowed)]
                    order = torch.topk(sub, min(args.limit, len(allowed))).indices
                    chips = [words[allowed[j] - 2] for j in order.tolist()]
            else:
                order = torch.topk(logits[2:], args.limit).indices
                chips = [words[j] for j in order.tolist()]
            m, b = modes[mode], base[mode]
            m[2] += 1
            m[0] += chips[:1] == [pr["target"]]
            m[1] += pr["target"] in chips[:3]
            b[2] += 1
            b[0] += pr[chipkey][:1] == [pr["target"]]
            b[1] += pr["target"] in pr[chipkey][:3]
    el = time.time() - t0
    print(f"\n{'mode':12} {'n':>5}  {'mini h@1':>8} {'mini h@3':>8}   "
          f"{'ngram h@1':>9} {'ngram h@3':>9}")
    for mode in modes:
        m, b = modes[mode], base[mode]
        print(f"{mode:12} {m[2]:>5}  {100*m[0]/m[2]:7.1f}% {100*m[1]/m[2]:7.1f}%   "
              f"{100*b[0]/b[2]:8.1f}% {100*b[1]/b[2]:8.1f}%")
    print(f"\nlatency: {el/len(pairs)*1000:.1f} ms per forward pass "
          f"(both modes share it), {torch.get_num_threads()} threads")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus")
    ap.add_argument("--words", nargs="*",
                    default=["words-cs.js", "words-ext-cs.js"])
    ap.add_argument("--vocab", type=int, default=10000)
    ap.add_argument("--dim", type=int, default=128)
    ap.add_argument("--layers", type=int, default=4)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--block", type=int, default=32)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--steps", type=int, default=20000)
    ap.add_argument("--max-tokens", type=int, default=120_000_000)
    ap.add_argument("--out", default="mini-cs.pt")
    ap.add_argument("--eval")
    ap.add_argument("--pairs")
    ap.add_argument("--limit-pairs", type=int, default=1000)
    ap.add_argument("--limit", type=int, default=6)
    ap.add_argument("--threads", type=int, default=0)
    args = ap.parse_args()
    if args.threads:
        torch.set_num_threads(args.threads)
    if args.eval:
        evaluate(args)
    else:
        train(args)


if __name__ == "__main__":
    main()
