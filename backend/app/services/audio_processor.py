import librosa
import numpy as np

class AudioProcessor:
    @staticmethod
    def extract_features(file_path: str, target_length: int = 48000) -> dict:
        # Optimized load directly to 16kHz mono using fast duration cap
        signal, sr = librosa.load(file_path, sr=16000, mono=True, duration=5.0)
        
        # Fixed-length array padding/truncating for UI visual rendering safety
        if len(signal) < target_length:
            signal = np.pad(signal, (0, target_length - len(signal)), mode='constant')
        else:
            signal = signal[:target_length]

        # Fast vectorized feature computation
        mfccs = librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=13, n_fft=1024, hop_length=512)
        spectral_centroid = librosa.feature.spectral_centroid(y=signal, sr=sr, n_fft=1024, hop_length=512)
        
        return {
            "signal": signal,
            "sample_rate": sr,
            "mfcc_mean": np.mean(mfccs, axis=1).tolist(),
            "spectral_centroid_mean": float(np.mean(spectral_centroid))
        }