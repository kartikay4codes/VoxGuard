"""
validate_pipeline.py
----------------------
Runs the real feature extraction + synthetic detector + speaker verification
code (no mocks) against the generated sample audio, and prints the results.
This is what you run to PROVE to yourself (and judges, if asked) that the
pipeline isn't just a static UI mockup.

    python3 tests/validate_pipeline.py
"""

import sys
import os
import wave
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.features import extract_features, SAMPLE_RATE
from app.synthetic_detector import score as synthetic_score
from app.speaker_verify import embed, cosine_similarity


def read_wav(path):
    with wave.open(path, "rb") as wf:
        sr = wf.getframerate()
        n = wf.getnframes()
        raw = wf.readframes(n)
        signal = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    return signal, sr


def chunk_signal(signal, sr, chunk_seconds=2.5):
    chunk_len = int(chunk_seconds * sr)
    return [signal[i:i + chunk_len] for i in range(0, len(signal), chunk_len)
            if len(signal[i:i + chunk_len]) > sr * 0.5]


def main():
    base = os.path.join(os.path.dirname(__file__), "sample_audio")
    natural, sr = read_wav(os.path.join(base, "natural_like.wav"))
    synthetic, _ = read_wav(os.path.join(base, "synthetic_like.wav"))

    print("=" * 70)
    print("NATURAL-LIKE SAMPLE")
    print("=" * 70)
    for i, chunk in enumerate(chunk_signal(natural, sr)):
        feats = extract_features(chunk, sr)
        result = synthetic_score(feats)
        print(f"chunk {i}: jitter={feats['jitter_pct']:.3f}%  "
              f"shimmer={feats['shimmer_pct']:.3f}%  "
              f"smoothness={feats['f0_smoothness']:.3f}  "
              f"synthetic_score={result['synthetic_score']:.3f}")
        for r in result["reasons"]:
            print(f"    - {r}")

    print()
    print("=" * 70)
    print("SYNTHETIC-LIKE SAMPLE")
    print("=" * 70)
    for i, chunk in enumerate(chunk_signal(synthetic, sr)):
        feats = extract_features(chunk, sr)
        result = synthetic_score(feats)
        print(f"chunk {i}: jitter={feats['jitter_pct']:.3f}%  "
              f"shimmer={feats['shimmer_pct']:.3f}%  "
              f"smoothness={feats['f0_smoothness']:.3f}  "
              f"synthetic_score={result['synthetic_score']:.3f}")
        for r in result["reasons"]:
            print(f"    - {r}")

    print()
    print("=" * 70)
    print("SPEAKER VERIFICATION (enrolled=natural, test against both)")
    print("=" * 70)
    enroll_chunks = chunk_signal(natural, sr)[:1]
    enrolled_embedding = embed(enroll_chunks[0], sr)

    for label, sig in [("natural (same speaker)", natural), ("synthetic (different profile)", synthetic)]:
        test_chunk = chunk_signal(sig, sr)[-1]
        test_embedding = embed(test_chunk, sr)
        sim = cosine_similarity(test_embedding, enrolled_embedding)
        print(f"{label}: cosine similarity to enrolled voice = {sim:.3f}")


if __name__ == "__main__":
    main()
