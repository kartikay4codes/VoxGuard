"""
deep_detector.py
------------------
Optional pretrained deep-learning synthetic-speech classifier.

Uses Gustking/wav2vec2-large-xlsr-deepfake-audio-classification, a
Wav2Vec2-XLS-R (300M param) model fine-tuned specifically for deepfake
audio classification -- reported Accuracy 0.929 / Equal Error Rate 0.040
on the ASVspoof2019 evaluation set (see model card on Hugging Face). This
is the same family of approach -- self-supervised wav2vec2/WavLM
representations feeding a classification head -- that published benchmarks
(ASVspoof5, the ADD challenge series) show performing best for this task,
and the approach described in published work on production-style
anti-spoofing systems.

This is deliberately kept SEPARATE and OPTIONAL from synthetic_detector.py
(the DSP heuristic scorer):
  - torch + transformers is a real, ~1-2GB additional dependency
  - the model weights are another ~1.3GB download on first run
  - CPU inference adds real per-chunk latency (see README "Latency" note)
None of that should be a silent surprise, and none of it should crash the
app if it's not available. If this module can't load for any reason
(missing deps, no internet, disk space, whatever), `is_available()`
returns False and the caller in main.py falls back to the heuristic
scorer automatically -- the app degrades gracefully instead of breaking,
which is exactly the failure mode that broke this project last time
(a service was imported unconditionally, so main.py failed to even start
if it couldn't be constructed).

Label handling is read from the model's OWN config (`model.config.id2label`)
rather than a hard-coded class index -- hard-coding "index 1 = fake" without
checking the label map is precisely the bug that made a previous version of
this project silently score the wrong thing.
"""

from __future__ import annotations  # keep `str | None` hints working on Python < 3.10

import logging
import numpy as np

logger = logging.getLogger("voxguard.deep_detector")

MODEL_ID = "Gustking/wav2vec2-large-xlsr-deepfake-audio-classification"

_model = None
_feature_extractor = None
_id2label = None
_fake_class_idx = None
_load_error = None
_load_attempted = False


def is_available() -> bool:
    return _load_attempt() is not None


def _load_attempt():
    """Lazily loads and caches the model. Returns the model object, or
    None if unavailable (never raises -- callers check the return value)."""
    global _model, _feature_extractor, _id2label, _fake_class_idx
    global _load_error, _load_attempted

    if _model is not None:
        return _model
    if _load_attempted:
        return None
    _load_attempted = True

    try:
        import torch  # noqa: F401 -- import here, not at module level, so a
        from transformers import AutoModelForAudioClassification, AutoFeatureExtractor
        # missing torch/transformers install never breaks importing this module.

        logger.info(f"Loading deep detector model {MODEL_ID} (first run downloads ~1.3GB)...")
        feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_ID)
        model = AutoModelForAudioClassification.from_pretrained(MODEL_ID)
        model.eval()

        id2label = model.config.id2label
        fake_idx = None
        for idx, label in id2label.items():
            if any(kw in str(label).lower() for kw in ("fake", "spoof", "synthetic")):
                fake_idx = int(idx)
                break
        if fake_idx is None:
            raise RuntimeError(
                f"Could not identify a 'fake'/'spoof' class in this model's labels: "
                f"{id2label}. Refusing to guess an index -- check MODEL_ID's config.json."
            )

        _feature_extractor = feature_extractor
        _model = model
        _id2label = id2label
        _fake_class_idx = fake_idx
        logger.info(f"Deep detector loaded. Labels: {id2label}, fake class index: {fake_idx}")
        return _model

    except Exception as e:
        _load_error = str(e)
        logger.warning(f"Deep detector unavailable ({e}); falling back to heuristic scorer.")
        return None


def load_error() -> str | None:
    return _load_error


def score(signal: np.ndarray, sample_rate: int = 16000) -> dict:
    """Returns the same result shape as synthetic_detector.score(), so
    callers can treat the two as interchangeable:
      {"synthetic_score": float 0-1, "reasons": [...], "confidence": str,
       "engine": "deep"}
    Raises RuntimeError if the model isn't available -- callers should
    check is_available() first, or catch this and fall back."""
    model = _load_attempt()
    if model is None:
        raise RuntimeError(f"Deep detector not available: {_load_error}")

    import torch

    inputs = _feature_extractor(signal, sampling_rate=sample_rate, return_tensors="pt")
    with torch.inference_mode():
        logits = model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]

    fake_score = float(probs[_fake_class_idx].item())
    confidence = float(torch.max(probs).item())
    predicted_label = _id2label[int(torch.argmax(probs).item())]

    return {
        "synthetic_score": fake_score,
        "reasons": [
            f"deep model ({MODEL_ID.split('/')[-1]}): "
            f"predicted '{predicted_label}', fake-class probability {fake_score:.3f}"
        ],
        "confidence": "high" if confidence > 0.85 else "normal",
        "engine": "deep",
    }
