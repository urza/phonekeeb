#!/usr/bin/env python3
"""Per-word perplexity of Czech language models on held-out subtitle text.

Part of the Czech language-model study (czech-lm-research.md). Hit@k answers
"would the chip be there"; perplexity answers "does this model know the
register at all", which is the question behind every result in that study.

Perplexity is normalized PER WORD, not per token. A byte-level BPE, a
sentencepiece vocabulary, and a KenLM word vocabulary cut the same sentence
into different numbers of pieces, so per-token numbers from different models
are not comparable. Per-word numbers are.

Usage:
  python3 tools/lm-perplexity.py --lines 400 \\
      --hf MU-NLPC/CzeGPT-2 --hf lchaloupsky/czech-gpt2-oscar \\
      --kenlm cs-o3.bin --dump tools/corpus/os-cs-83886080.txt.gz
"""
import argparse
import gzip
import importlib.util
import math
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'build_wordlists', Path(__file__).with_name('build-wordlists.py'))
bw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bw)

HOLDOUT_MOD = 100


def held_out_lines(dump_path, want, min_words=5):
    """The eval slice, tokenized exactly like the training corpus."""
    out = []
    opener = gzip.open if str(dump_path).endswith('.gz') else open
    f = opener(dump_path, 'rt', encoding='utf-8', errors='replace')
    try:
        for idx, line in enumerate(f):
            if idx % HOLDOUT_MOD != 0:
                continue
            line = line.lower().replace('’', "'")
            if '{' in line:
                line = bw.ASS_TAGS.sub(' ', line)
            if "'" in line:
                line = bw.TAIL_JOIN.sub(r"'\1", line)
            toks = []
            for wt in line.split():
                if bw.JUNK.search(wt):
                    continue
                tok = wt.strip(bw.EDGE_PUNCT)
                if tok:
                    toks.append(tok)
            if len(toks) >= min_words:
                out.append(' '.join(toks))
            if len(out) >= want:
                break
    except EOFError:
        pass
    finally:
        f.close()
    return out


def hf_perplexity(model_id, lines, dtype='float32'):
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    tok = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(
        model_id, dtype=getattr(torch, dtype)).eval()
    bos = tok.bos_token_id if tok.bos_token_id is not None else tok.eos_token_id
    nll = 0.0
    words = 0
    t0 = time.time()
    with torch.inference_mode():
        for line in lines:
            ids = tok.encode(line)
            if not ids:
                continue
            inp = torch.tensor([[bos] + ids])
            logits = model(inp).logits[0, :-1].float()
            logp = torch.log_softmax(logits, dim=-1)
            tgt = torch.tensor(ids)
            # Sum over the line's own tokens only. No </s>: the KenLM arm
            # excludes it too, and a sentence-end probability would otherwise
            # reward whichever model saw more line-shaped training text.
            nll += -logp[torch.arange(len(ids)), tgt].sum().item()
            words += len(line.split())
    ce = nll / words
    return math.exp(ce), words, time.time() - t0


def kenlm_perplexity(lm_path, lines):
    import kenlm
    lm = kenlm.Model(lm_path)
    nll = 0.0
    words = 0
    oov = 0
    t0 = time.time()
    for line in lines:
        state = kenlm.State()
        out = kenlm.State()
        lm.BeginSentenceWrite(state)
        for w in line.split():
            lp = lm.BaseScore(state, w, out)   # log10
            state, out = out, state
            nll += -lp * math.log(10)
            words += 1
            if w not in lm:
                oov += 1
    return math.exp(nll / words), words, time.time() - t0, oov


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dump', default='tools/corpus/os-cs-83886080.txt.gz')
    ap.add_argument('--lines', type=int, default=400)
    ap.add_argument('--hf', action='append', default=[])
    ap.add_argument('--kenlm', action='append', default=[])
    args = ap.parse_args()

    lines = held_out_lines(args.dump, args.lines)
    total_words = sum(len(l.split()) for l in lines)
    print(f'{len(lines)} held-out lines, {total_words} words\n')
    print(f'{"model":42} {"ppl/word":>9} {"sec":>7}')
    for path in args.kenlm:
        ppl, w, sec, oov = kenlm_perplexity(path, lines)
        print(f'{Path(path).name:42} {ppl:9.1f} {sec:7.1f}   '
              f'OOV {100*oov/w:.1f}%')
    for model_id in args.hf:
        ppl, w, sec = hf_perplexity(model_id, lines)
        print(f'{model_id:42} {ppl:9.1f} {sec:7.1f}')


if __name__ == '__main__':
    main()
