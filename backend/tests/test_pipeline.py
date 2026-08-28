"""
Automated regression tests. Run with:  pytest backend/tests/test_pipeline.py

These assert the *directional* behavior the whole product depends on:
synthetic-like audio should score higher on synthetic_score than
natural-like audio, and same-speaker similarity should exceed
different-speaker similarity. Exact thresholds aren't asserted here because
they're expected to be recalibrated against real recordings (see README) --
what must never regress is the *ordering*.
"""

import os
import sys
import wave
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.features import extract_features
from app.synthetic_detector import score as synthetic_score
from app.speaker_verify import embed, cosine_similarity
from app.fusion import fuse

from generate_sample_audio import make_natural_like, make_synthetic_like, SR


def _first_chunk(signal, sr, seconds=2.5):
    return signal[: int(seconds * sr)]


@pytest.fixture(scope="module")
def natural_chunk():
    return _first_chunk(make_natural_like(), SR)


@pytest.fixture(scope="module")
def synthetic_chunk():
    return _first_chunk(make_synthetic_like(), SR)


def test_synthetic_score_ordering(natural_chunk, synthetic_chunk):
    natural_feats = extract_features(natural_chunk, SR)
    synthetic_feats = extract_features(synthetic_chunk, SR)

    natural_result = synthetic_score(natural_feats)
    synthetic_result = synthetic_score(synthetic_feats)

    assert synthetic_result["synthetic_score"] > natural_result["synthetic_score"]


def test_speaker_verification_same_vs_different(natural_chunk, synthetic_chunk):
    enrolled = embed(natural_chunk, SR)
    same_speaker_embedding = embed(_first_chunk(make_natural_like(), SR, seconds=1.0), SR)
    different_profile_embedding = embed(synthetic_chunk, SR)

    same_sim = cosine_similarity(same_speaker_embedding, enrolled)
    diff_sim = cosine_similarity(different_profile_embedding, enrolled)

    assert same_sim >= diff_sim


def test_fusion_trust_score_range():
    result = fuse(similarity=0.95, synthetic_score=0.05)
    assert 0 <= result["trust_score"] <= 100
    assert result["status"] == "trusted"

    result_bad = fuse(similarity=0.4, synthetic_score=0.9)
    assert result_bad["should_hold_transfer"] is True
