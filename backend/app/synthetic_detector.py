"""
synthetic_detector.py
----------------------
Heuristic synthetic-speech ("is this vocoded/cloned") scorer.

Real TTS/voice-conversion/vocoder pipelines (WaveNet-style, HiFi-GAN, etc.)
tend to differ from natural speech in measurable, explainable ways:

  * Pitch (F0) contours are often unnaturally SMOOTH -- neural vocoders
    regularize F0 during synthesis, whereas a human larynx has natural,
    irregular jitter even in sustained vowels.
  * Amplitude (shimmer) is often more regular for the same reason.
  * Spectral flatness tends to differ -- vocoders can leave a flatter or
    a distinctly "buzzy" spectral floor depending on the model.
  * High-frequency energy above ~4kHz often has an artificial roll-off or
    ringing pattern from the vocoder's upsampling stage.
  * HNR proxy is often unusually clean/high for synthetic speech clipped
    from a TTS pipeline (no real room noise, no natural breath noise).

None of these signals alone is proof of a clone -- a very calm, controlled
human speaker can also have low jitter. That's WHY this is a fused,
multi-signal score (see fusion.py) combined with active speaker
verification and challenge-response, not a single-feature classifier.
This module is intentionally swappable: replace `score()` with a call to a
trained classifier (logistic regression/SVM on these same features, or a
deep anti-spoofing model) once you have a labeled dataset -- the feature
dict below is exactly the feature vector you'd train on.
"""

import numpy as np

# Empirical-ish thresholds tuned by hand against synthetic test signals in
# generate_sample_audio.py. Documented explicitly as calibration knobs
# (see README "Calibration" section) rather than hidden magic numbers.
JITTER_NATURAL_MIN = 0.3      # % - below this, pitch is suspiciously smooth
SHIMMER_NATURAL_MIN = 0.5     # %
SMOOTHNESS_SUSPECT = 0.90     # f0_smoothness above this is a red flag
FLATNESS_SUSPECT_LOW = 0.01
FLATNESS_SUSPECT_HIGH = 0.35
HF_RATIO_SUSPECT = 0.02


def score(features: dict) -> dict:
    """Returns synthetic_score in [0,1] (1.0 = strong synthetic indicators)
    plus a breakdown of which signals fired, for the UI to explain itself."""
    reasons = []
    votes = []

    jitter = features["jitter_pct"]
    shimmer = features["shimmer_pct"]
    smoothness = features["f0_smoothness"]
    flatness = features["spectral_flatness"]
    hf_ratio = features["hf_energy_ratio"]
    hnr = features["hnr_proxy"]
    voiced_ratio = features["voiced_ratio"]

    if voiced_ratio < 0.05:
        # Not enough voiced speech in this chunk to say anything meaningful.
        return {"synthetic_score": 0.0, "reasons": ["insufficient voiced speech"],
                "confidence": "low"}

    if jitter < JITTER_NATURAL_MIN:
        votes.append(1.0)
        reasons.append(f"pitch jitter unusually low ({jitter:.3f}% < {JITTER_NATURAL_MIN}%)")
    else:
        votes.append(0.0)

    if shimmer < SHIMMER_NATURAL_MIN:
        votes.append(1.0)
        reasons.append(f"amplitude shimmer unusually low ({shimmer:.3f}% < {SHIMMER_NATURAL_MIN}%)")
    else:
        votes.append(0.0)

    if smoothness > SMOOTHNESS_SUSPECT:
        votes.append(1.0)
        reasons.append(f"pitch contour unnaturally smooth (smoothness={smoothness:.3f})")
    else:
        votes.append(0.0)

    if flatness < FLATNESS_SUSPECT_LOW or flatness > FLATNESS_SUSPECT_HIGH:
        votes.append(0.6)
        reasons.append(f"spectral flatness out of natural-speech range ({flatness:.4f})")
    else:
        votes.append(0.0)

    if hf_ratio < HF_RATIO_SUSPECT:
        votes.append(0.6)
        reasons.append(f"low high-frequency energy above 4kHz ({hf_ratio:.4f})")
    else:
        votes.append(0.0)

    if hnr > 18:
        votes.append(0.5)
        reasons.append(f"unusually clean HNR proxy ({hnr:.1f}) -- little natural noise floor")
    else:
        votes.append(0.0)

    synthetic_score = float(np.clip(np.mean(votes) * 1.3, 0.0, 1.0))
    if not reasons:
        reasons.append("no synthetic indicators detected")

    return {
        "synthetic_score": synthetic_score,
        "reasons": reasons,
        "confidence": "normal",
    }
