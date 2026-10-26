#!/usr/bin/env python3
"""Builds the bundled semantic model for the extension.

Source: minishlab/potion-base-8M (MIT licence), a static-embedding model: every word piece has
one fixed vector and a sentence is the average of its pieces. No neural network runs in the
browser, so it is fast and needs no WebAssembly.

Output (extension/model/):
  vocab.txt        one word piece per line; the line number is its id
  embeddings.i8    int8 matrix, rows x dim, one row per word piece
  scales.f32       float32 scale per row (row * scale = original vector)
  meta.json        shape, ids and credits
and tests/fixtures/semantic-reference.json: token ids and exact embeddings from the original
Python model, so the JavaScript implementation can be checked against it.

Usage (needs numpy, tokenizers, safetensors, model2vec, huggingface_hub):
  python3 tools/build_model.py
"""
import json
import pathlib

import numpy as np
from huggingface_hub import hf_hub_download
from model2vec import StaticModel
from safetensors.numpy import load_file

REPO = "minishlab/potion-base-8M"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "extension" / "model"
FIXTURE = ROOT / "extension" / "tests" / "fixtures" / "semantic-reference.json"

SAMPLES = [
    "Power Automate cloud flow tips and connectors",
    "Copilot Studio learning hub for Microsoft 365",
    "Vendor NDA request form - Service Portal",
    "GitHub Copilot Chat",
    "Best pasta recipes",
    "Flights to Tokyo",
    "Standing desk, adjustable height",
    "Quarterly budget forecast template",
    "Interview scorecard for candidates",
    "Café menu: crème brûlée & naïve résumé",
    "https://learn.microsoft.com/power-automate/get-started",
    "node.js v18.2 release notes (LTS)",
    "UPPER and lower CASE Mixed",
    "双十一购物清单 2026",
    "东京旅游攻略 hotel booking",
    "a",
    "",
    "!!! ??? ...",
    "x" * 150,
    "snake_case_identifier and kebab-case-name",
    "Dr. O'Neil's 5-minute TED talk",
    "Tab\tand\nnewline   spaces",
    "Prototype wireframe typography palette",
    "Runbook for oncall alert and incident response",
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)

    weights = load_file(hf_hub_download(REPO, "model.safetensors"))
    emb = np.asarray(weights["embeddings"], dtype=np.float32)
    tok = json.load(open(hf_hub_download(REPO, "tokenizer.json")))
    vocab = tok["model"]["vocab"]  # token -> id
    assert tok["model"]["type"] == "WordPiece" and len(vocab) == emb.shape[0]
    by_id = [None] * len(vocab)
    for token, idx in vocab.items():
        by_id[idx] = token
    assert all(t is not None and "\n" not in t for t in by_id)

    scales = np.maximum(np.abs(emb).max(axis=1) / 127.0, 1e-12).astype(np.float32)
    q = np.clip(np.rint(emb / scales[:, None]), -127, 127).astype(np.int8)

    (OUT / "vocab.txt").write_text("\n".join(by_id) + "\n", encoding="utf-8")
    (OUT / "embeddings.i8").write_bytes(q.tobytes())
    (OUT / "scales.f32").write_bytes(scales.astype("<f4").tobytes())
    meta = {
        "source": REPO,
        "license": "MIT",
        "rows": int(emb.shape[0]),
        "dim": int(emb.shape[1]),
        "unkId": vocab[tok["model"]["unk_token"]],
        "maxCharsPerWord": tok["model"]["max_input_chars_per_word"],
        "continuingSubwordPrefix": tok["model"]["continuing_subword_prefix"],
        "credit": "Static embeddings by MinishLab (model2vec), MIT licence.",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    model = StaticModel.from_pretrained(REPO)
    ids = model.tokenize(SAMPLES)  # model2vec drops [UNK], matching the JavaScript side
    vectors = model.encode(SAMPLES)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    vectors = np.where(norms > 0, vectors / np.maximum(norms, 1e-12), 0.0)
    FIXTURE.write_text(
        json.dumps(
            {"samples": SAMPLES, "ids": ids, "vectors": [[round(float(x), 5) for x in v] for v in vectors]},
            ensure_ascii=False,
        )
    )
    print(f"rows={emb.shape[0]} dim={emb.shape[1]} int8={q.nbytes/1e6:.2f}MB vocab={(OUT/'vocab.txt').stat().st_size/1e3:.0f}KB")


if __name__ == "__main__":
    main()
