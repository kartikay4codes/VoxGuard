"""
fusion.py
----------
Combines the two independent signals into one live Voice-Trust Score (0-100):

  1. speaker_similarity  (0-1, higher = more likely the enrolled speaker)
  2. synthetic_score      (0-1, higher = more likely synthetic/cloned)

Trust = high similarity AND low synthetic score. Either signal alone is
gameable (a good clone can pass speaker similarity; a low-effort mismatch
can be a bad phone line rather than a clone) -- fusing them is the actual
point of the product.

trust_score = 100 * similarity * (1 - synthetic_score)

This intentionally multiplies rather than averages: a total failure on
EITHER axis should tank trust, not just drag it down by half. Weights are
exposed as constants so they're an obvious calibration knob, not a magic
number buried in a formula.
"""

SIMILARITY_WEIGHT = 1.0
SYNTHETIC_PENALTY_WEIGHT = 1.0

RISK_THRESHOLD_HOLD = 45     # trust score below this -> auto-hold transfer
RISK_THRESHOLD_WARN = 65     # trust score below this -> UI shows amber warning


def fuse(similarity: float, synthetic_score: float) -> dict:
    similarity_component = similarity ** SIMILARITY_WEIGHT
    synthetic_component = (1 - synthetic_score) ** SYNTHETIC_PENALTY_WEIGHT
    trust_score = round(100 * similarity_component * synthetic_component, 1)

    if trust_score < RISK_THRESHOLD_HOLD:
        status = "critical"
    elif trust_score < RISK_THRESHOLD_WARN:
        status = "warning"
    else:
        status = "trusted"

    return {
        "trust_score": trust_score,
        "status": status,
        "should_hold_transfer": trust_score < RISK_THRESHOLD_HOLD,
        "components": {
            "speaker_similarity": round(similarity, 3),
            "synthetic_score": round(synthetic_score, 3),
        },
    }
