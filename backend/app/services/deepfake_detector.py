import torch
import torchaudio
import librosa
import numpy as np
from transformers import AutoModelForAudioClassification, Wav2Vec2FeatureExtractor

class DeepfakeDetector:
    def __init__(self):
        self.model_name = "facebook/mms-lid-126"
        self.feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(self.model_name)
        self.model = AutoModelForAudioClassification.from_pretrained(self.model_name)
        self.model.eval()
        self.target_length = 48000  # 3 seconds fixed at 16kHz

    def _apply_noise_gate(self, audio_np: np.ndarray, threshold_db: int = -30) -> np.ndarray:
        stft = librosa.stft(audio_np)
        magnitude, phase = librosa.magphase(stft)
        mag_db = librosa.amplitude_to_db(magnitude, ref=np.max)
        
        mask = mag_db > threshold_db
        cleaned_stft = stft * mask
        return librosa.istft(cleaned_stft)

    def _pad_or_truncate(self, signal: torch.Tensor) -> torch.Tensor:
        length = signal.shape[-1]
        if length < self.target_length:
            pad_size = self.target_length - length
            return torch.nn.functional.pad(signal, (0, pad_size))
        elif length > self.target_length:
            return signal[:, :self.target_length]
        return signal

    @torch.inference_mode()
    def predict(self, audio_path: str) -> dict:
        signal, sr = torchaudio.load(audio_path)

        if signal.shape[0] > 1:
            signal = torch.mean(signal, dim=0, keepdim=True)

        if sr != 16000:
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=16000)
            signal = resampler(signal)

        signal = self._pad_or_truncate(signal)

        audio_np = signal.squeeze(0).numpy()
        cleaned_audio = self._apply_noise_gate(audio_np)

        inputs = self.feature_extractor(
            cleaned_audio,
            sampling_rate=16000,
            return_tensors="pt"
        )
        
        logits = self.model(**inputs).logits
        probabilities = torch.softmax(logits, dim=-1)

        fake_score = float(probabilities[0][1].item())
        is_synthetic = fake_score > 0.60
        confidence = float(torch.max(probabilities).item())

        return {
            "is_synthetic": is_synthetic,
            "synthetic_score": round(fake_score, 4),
            "confidence": round(confidence, 4)
        }