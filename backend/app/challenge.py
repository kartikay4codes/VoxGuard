"""
challenge.py
-------------
Dynamic spoken-passphrase challenge.

Why this exists even though speaker verification + artifact detection
already run continuously: a *sufficiently good* real-time voice-conversion
attack (not just a pre-recorded clip, but live voice conversion of an
attacker's own speech) can in principle push both of those scores into a
comfortable range. A challenge the attacker has never heard before, that
must be answered within a natural human reaction window, adds a THIRD,
independent axis: can this speaker respond correctly, live, right now?

Honest scope note: full challenge verification needs ASR (does the audio
actually contain the right words?) which needs a speech-to-text model.
This sandbox has no internet access to fetch one, so this module ships
two of the three checks fully working today, with the ASR hook stubbed
and clearly marked:

  1. [WORKING] Speaker verification on the challenge-response clip itself
     (does the voice answering match the enrolled Voice-DNA?)
  2. [WORKING] Timing liveness (did a response arrive within a plausible
     human reaction window, and does it contain actual voiced speech --
     not silence, not a suspiciously exact copy of a previous chunk's
     waveform)
  3. [STUBBED] Content verification via ASR (does the transcript match the
     challenge phrase?) -- swap `verify_transcript_stub` for a real STT
     call (faster-whisper, Vosk, or a cloud STT API) when you have
     internet/API access. The interface is already shaped for it.
"""

import random
import time
import numpy as np
import hashlib

PASSPHRASE_WORDS = [
    "orbit", "quartz", "harbor", "velvet", "granite", "cobalt", "ember",
    "marble", "willow", "copper", "lantern", "thistle", "meridian", "citrus",
    "falcon", "amber", "cascade", "juniper", "onyx", "tundra",
]

MAX_RESPONSE_WINDOW_SEC = 6.0
MIN_RESPONSE_WINDOW_SEC = 0.4  # a response faster than this is itself suspicious
                                # (a pre-recorded/replay clip answering too fast)


def generate_passphrase(n_words: int = 3) -> dict:
    words = random.sample(PASSPHRASE_WORDS, n_words)
    phrase = " ".join(words)
    return {
        "phrase": phrase,
        "issued_at": time.time(),
        "challenge_id": hashlib.sha1(f"{phrase}{time.time()}".encode()).hexdigest()[:12],
    }


def check_timing_liveness(issued_at: float, responded_at: float) -> dict:
    elapsed = responded_at - issued_at
    ok = MIN_RESPONSE_WINDOW_SEC <= elapsed <= MAX_RESPONSE_WINDOW_SEC
    return {
        "elapsed_sec": round(elapsed, 2),
        "timing_ok": ok,
        "reason": None if ok else (
            "responded suspiciously fast for a human to hear+speak"
            if elapsed < MIN_RESPONSE_WINDOW_SEC else
            "no response within the challenge window"
        ),
    }


def check_not_replay(response_signal: np.ndarray, recent_chunks: list) -> dict:
    """Cheap replay-attack guard: flag if the response is near-identical
    (sample-for-sample, allowing for tiny numerical noise) to any recently
    seen chunk -- a real live human answer will never be byte-identical to
    an earlier chunk, but a looped/replayed clip might be."""
    for prev in recent_chunks[-10:]:
        if len(prev) == len(response_signal):
            diff = np.mean(np.abs(prev - response_signal))
            if diff < 1e-6:
                return {"is_replay": True, "reason": "identical waveform to a recent chunk"}
    return {"is_replay": False, "reason": None}


def verify_transcript_stub(response_signal: np.ndarray, expected_phrase: str) -> dict:
    """STUBBED -- see module docstring. Always returns 'unverified' rather
    than silently pretending to check content, so the UI can honestly show
    'content check unavailable' instead of a fake pass/fail."""
    return {
        "content_verified": None,  # None = not evaluated, NOT "failed"
        "note": "ASR content verification not wired up in this build; "
                "plug in faster-whisper/Vosk/cloud STT here.",
    }
