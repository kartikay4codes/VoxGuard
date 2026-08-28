"""
features.py
------------
Pure numpy/scipy audio feature extraction for VoxGuard.

Deliberately has ZERO dependency on librosa/soundfile-only-audio-ML stacks so
it installs anywhere (a hackathon judge's laptop, a CI box, a Raspberry Pi)
with just numpy + scipy. Every feature computed here has a direct, explainable
DSP meaning -- important for a judged round where you need to defend *why*
a score moved, not just that it moved.

Features extracted per audio chunk (default 2-3s @ 16kHz mono):
  1. MFCC statistics (mean + std across frames)      -> speaker embedding input
  2. Fundamental frequency (F0) track via autocorrelation
  3. Jitter   - cycle-to-cycle F0 instability (natural voices have healthy,
               irregular jitter; many vocoder/TTS pipelines over-smooth F0)
  4. Shimmer  - cycle-to-cycle amplitude instability (same idea, amplitude domain)
  5. Spectral flatness - how noise-like vs tonal the spectrum is
  6. Spectral centroid - "brightness" of the spectrum
  7. High-frequency energy ratio - vocoders often have a characteristic
     roll-off/ringing above ~4kHz that differs from natural glottal excitation
  8. Harmonics-to-noise-ratio (HNR) proxy
"""

import numpy as np
from scipy.signal import get_window
from scipy.fft import rfft, rfftfreq

SAMPLE_RATE = 16000
FRAME_LEN = 400   # 25 ms @16kHz
FRAME_HOP = 160   # 10 ms @16kHz
N_MELS = 26
N_MFCC = 13
PRE_EMPH = 0.97


# ----------------------------- low-level helpers ----------------------------

def pre_emphasize(signal: np.ndarray, coeff: float = PRE_EMPH) -> np.ndarray:
    return np.append(signal[0], signal[1:] - coeff * signal[:-1])


def frame_signal(signal: np.ndarray, frame_len=FRAME_LEN, hop=FRAME_HOP):
    if len(signal) < frame_len:
        signal = np.pad(signal, (0, frame_len - len(signal)))
    n_frames = 1 + (len(signal) - frame_len) // hop
    idx = (np.arange(frame_len)[None, :] + np.arange(n_frames)[:, None] * hop)
    frames = signal[idx]
    window = get_window("hamming", frame_len)
    return frames * window


def hz_to_mel(hz):
    return 2595 * np.log10(1 + hz / 700)


def mel_to_hz(mel):
    return 700 * (10 ** (mel / 2595) - 1)


def mel_filterbank(n_filters=N_MELS, n_fft=FRAME_LEN, sample_rate=SAMPLE_RATE):
    low_mel, high_mel = 0, hz_to_mel(sample_rate / 2)
    mel_points = np.linspace(low_mel, high_mel, n_filters + 2)
    hz_points = mel_to_hz(mel_points)
    bins = np.floor((n_fft + 1) * hz_points / sample_rate).astype(int)

    fbank = np.zeros((n_filters, n_fft // 2 + 1))
    for m in range(1, n_filters + 1):
        f_left, f_center, f_right = bins[m - 1], bins[m], bins[m + 1]
        for k in range(f_left, f_center):
            if f_center != f_left:
                fbank[m - 1, k] = (k - f_left) / (f_center - f_left)
        for k in range(f_center, f_right):
            if f_right != f_center:
                fbank[m - 1, k] = (f_right - k) / (f_right - f_center)
    return fbank


_MEL_FB = mel_filterbank()


def compute_mfcc(signal: np.ndarray, sample_rate=SAMPLE_RATE) -> np.ndarray:
    """Returns (n_frames, N_MFCC) MFCC matrix."""
    emph = pre_emphasize(signal)
    frames = frame_signal(emph)
    mag = np.abs(rfft(frames, n=FRAME_LEN, axis=1))
    power = (1.0 / FRAME_LEN) * (mag ** 2)
    mel_energy = power @ _MEL_FB.T
    mel_energy = np.where(mel_energy == 0, np.finfo(float).eps, mel_energy)
    log_mel = np.log(mel_energy)
    # DCT-II (like scipy.fftpack.dct but written explicitly to avoid an extra import path)
    n = log_mel.shape[1]
    dct_basis = np.cos(
        np.pi / n * (np.arange(n)[None, :] + 0.5) * np.arange(N_MFCC)[:, None]
    )
    mfcc = log_mel @ dct_basis.T
    return mfcc  # (n_frames, N_MFCC)


def estimate_f0_track(signal: np.ndarray, sample_rate=SAMPLE_RATE,
                       fmin=70, fmax=400) -> np.ndarray:
    """Per-frame F0 estimate via normalized autocorrelation. Returns array of
    F0 in Hz, with 0 for unvoiced/silent frames."""
    frames = frame_signal(signal, frame_len=FRAME_LEN * 2, hop=FRAME_HOP)  # longer frame for low-pitch resolution
    lag_min = int(sample_rate / fmax)
    lag_max = int(sample_rate / fmin)
    f0s = np.zeros(len(frames))
    for i, fr in enumerate(frames):
        fr = fr - fr.mean()
        energy = np.sum(fr ** 2)
        if energy < 1e-6:
            continue
        corr = np.correlate(fr, fr, mode="full")[len(fr) - 1:]
        corr /= (corr[0] + 1e-12)
        search = corr[lag_min:lag_max]
        if len(search) == 0:
            continue
        peak_lag = np.argmax(search) + lag_min
        peak_val = corr[peak_lag]
        if peak_val > 0.3:  # voicing threshold
            f0s[i] = sample_rate / peak_lag
    return f0s


def jitter_shimmer(signal: np.ndarray, f0_track: np.ndarray, sample_rate=SAMPLE_RATE):
    """Cycle-to-cycle jitter (F0 instability) and shimmer (amplitude instability),
    computed only over voiced frames. Returns (jitter_pct, shimmer_pct,
    f0_smoothness). f0_smoothness close to 1 means an almost perfectly smooth
    pitch contour -- a common TTS/vocoder tell; natural speech is rarely
    that smooth."""
    voiced = f0_track[f0_track > 0]
    if len(voiced) < 3:
        return 0.0, 0.0, 1.0

    periods = 1.0 / voiced
    diffs = np.abs(np.diff(periods))
    jitter_pct = float(100 * np.mean(diffs) / np.mean(periods))

    frames = frame_signal(signal, frame_len=FRAME_LEN * 2, hop=FRAME_HOP)
    amps = np.sqrt(np.mean(frames ** 2, axis=1))
    amps = amps[f0_track > 0]
    if len(amps) < 3:
        shimmer_pct = 0.0
    else:
        amp_diffs = np.abs(np.diff(amps))
        shimmer_pct = float(100 * np.mean(amp_diffs) / (np.mean(amps) + 1e-9))

    # smoothness: 1 - normalized variance of F0 derivative (higher = smoother/suspicious)
    f0_diff = np.diff(voiced)
    smoothness = float(1.0 - min(np.std(f0_diff) / (np.mean(voiced) + 1e-9), 1.0))
    return jitter_pct, shimmer_pct, smoothness


def spectral_flatness_and_centroid(signal: np.ndarray, sample_rate=SAMPLE_RATE):
    frames = frame_signal(signal)
    mag = np.abs(rfft(frames, axis=1)) + 1e-12
    freqs = rfftfreq(FRAME_LEN, d=1.0 / sample_rate)

    geo_mean = np.exp(np.mean(np.log(mag), axis=1))
    arith_mean = np.mean(mag, axis=1)
    flatness = float(np.mean(geo_mean / arith_mean))

    centroid = np.sum(mag * freqs[None, :], axis=1) / np.sum(mag, axis=1)
    centroid = float(np.mean(centroid))
    return flatness, centroid


def high_freq_energy_ratio(signal: np.ndarray, sample_rate=SAMPLE_RATE, cutoff=4000):
    mag = np.abs(rfft(signal * get_window("hamming", len(signal))))
    freqs = rfftfreq(len(signal), d=1.0 / sample_rate)
    total = np.sum(mag ** 2) + 1e-12
    hf = np.sum(mag[freqs >= cutoff] ** 2)
    return float(hf / total)


def hnr_proxy(f0_track: np.ndarray, jitter_pct: float, shimmer_pct: float):
    """Crude harmonics-to-noise-ratio proxy in dB-like units, derived from
    voicing rate and jitter/shimmer (a real HNR needs a full harmonic
    decomposition; this is a fast, defensible approximation for a live
    per-chunk score, not a replacement for offline forensic HNR)."""
    voiced_ratio = float(np.mean(f0_track > 0))
    instability = (jitter_pct + shimmer_pct) / 2.0
    hnr = 20 * voiced_ratio - 0.4 * instability
    return float(hnr)


def extract_features(signal: np.ndarray, sample_rate=SAMPLE_RATE) -> dict:
    """Single entry point: returns a dict of all features for one audio chunk."""
    signal = signal.astype(np.float64)
    if np.max(np.abs(signal)) > 1e-9:
        signal = signal / np.max(np.abs(signal))

    mfcc = compute_mfcc(signal, sample_rate)
    f0_track = estimate_f0_track(signal, sample_rate)
    jitter, shimmer, smoothness = jitter_shimmer(signal, f0_track, sample_rate)
    flatness, centroid = spectral_flatness_and_centroid(signal, sample_rate)
    hf_ratio = high_freq_energy_ratio(signal, sample_rate)
    hnr = hnr_proxy(f0_track, jitter, shimmer)

    embedding = np.concatenate([mfcc.mean(axis=0), mfcc.std(axis=0)])  # 26-dim

    return {
        "embedding": embedding,
        "jitter_pct": jitter,
        "shimmer_pct": shimmer,
        "f0_smoothness": smoothness,
        "spectral_flatness": flatness,
        "spectral_centroid": centroid,
        "hf_energy_ratio": hf_ratio,
        "hnr_proxy": hnr,
        "mean_f0": float(np.mean(f0_track[f0_track > 0])) if np.any(f0_track > 0) else 0.0,
        "voiced_ratio": float(np.mean(f0_track > 0)),
    }
