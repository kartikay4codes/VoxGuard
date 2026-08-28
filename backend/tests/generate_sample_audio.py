"""
generate_sample_audio.py
-------------------------
Creates two synthetic WAV files so the pipeline can be sanity-tested without
a microphone or real deepfake sample:

  natural_like.wav - a glottal-pulse-ish voiced signal with realistic jitter,
                      shimmer, and additive breath/room noise
  synthetic_like.wav - the same nominal pitch/formant structure but with an
                      artificially smoothed F0 contour, near-zero jitter,
                      and a "cleaner" harmonic spectrum -- mimicking the
                      documented tells of vocoder output described in
                      synthetic_detector.py

These are NOT real deepfake audio. They exist purely to let a judge or
teammate run `pytest` / the demo script and see the trust score swing
without needing a real cloned voice sample. For your actual submission demo,
replace these with: (a) a real recording of you, and (b) a clip run through
any consumer voice-cloning tool (ElevenLabs, etc.) saying the same sentence.
"""

import numpy as np
import wave
import struct
import os

SR = 16000
DURATION = 3.0


def _formant_voice(f0_track, sr=SR, formants=(700, 1220, 2600), base_f0=120.0):
    """Sum-of-harmonics glottal-pulse approximation. Formant amplitude
    envelope is shaped using the NOMINAL base_f0 (not the jittery
    instantaneous f0) so that period-to-period amplitude stays stationary
    and only the phase/period itself carries the jitter -- otherwise the
    autocorrelation pitch tracker (correctly) can't find a stable period,
    which would defeat the point of the fixture."""
    n = len(f0_track)
    phase = 2 * np.pi * np.cumsum(f0_track) / sr
    signal = np.zeros(n)
    for h in range(1, 12):
        nominal_harmonic_freq = base_f0 * h
        amp = 1.0 / h
        for f in formants:
            amp *= 1.0 / (1.0 + ((nominal_harmonic_freq - f) / 400.0) ** 2)
        signal += amp * np.sin(h * phase)
    return signal


def make_natural_like(duration=DURATION, sr=SR, seed=0):
    rng = np.random.default_rng(seed)
    n = int(duration * sr)
    base_f0 = 120.0
    # natural jitter: small random walk + micro-tremor
    jitter_noise = rng.normal(0, 2.0, n).cumsum() * 0.01
    tremor = 3 * np.sin(2 * np.pi * 5.5 * np.arange(n) / sr)
    f0_track = base_f0 + jitter_noise + tremor
    f0_track = np.clip(f0_track, 80, 220)

    voice = _formant_voice(f0_track, sr)
    # normalize the raw harmonic-sum voice to a consistent RMS BEFORE adding
    # any noise -- the formant weighting above heavily attenuates most
    # harmonics, so the raw signal is very quiet; adding fixed-amplitude
    # breath noise to that un-normalized signal would let the noise floor
    # drown out the periodic voice signal entirely.
    target_rms = 0.2
    voice = voice / (np.sqrt(np.mean(voice ** 2)) + 1e-9) * target_rms

    # natural shimmer: amplitude micro-variation
    shimmer_env = 1.0 + rng.normal(0, 0.05, n)
    voice = voice * shimmer_env

    breath_noise = rng.normal(0, 0.01, n)  # noise floor well below voice RMS
    voice = voice + breath_noise
    voice = voice / (np.max(np.abs(voice)) + 1e-9) * 0.8
    return voice.astype(np.float64)


def make_synthetic_like(duration=DURATION, sr=SR, seed=1):
    rng = np.random.default_rng(seed)
    n = int(duration * sr)
    base_f0 = 120.0
    # over-smoothed F0: slow, tiny, deterministic vibrato only -- a classic
    # vocoder tell -- basically no cycle-to-cycle jitter
    slow_drift = 2 * np.sin(2 * np.pi * 0.3 * np.arange(n) / sr)
    f0_track = base_f0 + slow_drift
    f0_track = np.clip(f0_track, 80, 220)

    voice = _formant_voice(f0_track, sr, base_f0=base_f0)
    target_rms = 0.2
    voice = voice / (np.sqrt(np.mean(voice ** 2)) + 1e-9) * target_rms
    # almost no shimmer, negligible noise floor (too "clean" -- the tell)
    voice = voice + rng.normal(0, 0.0005, n)
    voice = voice / (np.max(np.abs(voice)) + 1e-9) * 0.8
    return voice.astype(np.float64)


def write_wav(path, signal, sr=SR):
    signal = np.clip(signal, -1.0, 1.0)
    int_samples = (signal * 32767).astype(np.int16)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int_samples.tobytes())


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "sample_audio")
    os.makedirs(out_dir, exist_ok=True)
    write_wav(os.path.join(out_dir, "natural_like.wav"), make_natural_like())
    write_wav(os.path.join(out_dir, "synthetic_like.wav"), make_synthetic_like())
    print(f"Wrote sample_audio/natural_like.wav and synthetic_like.wav to {out_dir}")
