"""Robust audio ingestion, resampling, validation, and signal feature extraction."""

from __future__ import annotations
import io
import math
from typing import Tuple, Optional, Union
import numpy as np
import soundfile as sf
import librosa

from overlapweave.schemas.models import AudioMetadata


class AudioProcessor:
    """Handles audio decoding, resampling to 16 kHz mono, and acoustic quality analysis."""

    TARGET_SAMPLE_RATE = 16000
    MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB
    MIN_DURATION_SECONDS = 0.2
    MAX_DURATION_SECONDS = 600.0  # 10 minutes

    @classmethod
    def load_audio(
        cls,
        source: Union[str, bytes, io.BytesIO],
        target_sr: int = TARGET_SAMPLE_RATE
    ) -> Tuple[np.ndarray, AudioMetadata]:
        """Loads audio from path or byte buffer, converts to 16kHz mono float32, and extracts metadata.

        Args:
            source: Filepath string, raw bytes, or BytesIO object.
            target_sr: Target sample rate in Hz (default: 16000).

        Returns:
            Tuple of (audio_signal: np.ndarray [shape: (N,)], metadata: AudioMetadata).

        Raises:
            ValueError: If file is too large, too short, empty, or unparseable.
        """
        if isinstance(source, bytes):
            if len(source) > cls.MAX_FILE_SIZE_BYTES:
                raise ValueError(
                    f"Audio file size ({len(source)} bytes) exceeds max limit of {cls.MAX_FILE_SIZE_BYTES} bytes."
                )
            if len(source) == 0:
                raise ValueError("Audio buffer is empty.")
            buffer = io.BytesIO(source)
        elif isinstance(source, io.BytesIO):
            buffer = source
        elif isinstance(source, str):
            buffer = source
        else:
            raise ValueError(f"Unsupported source type: {type(source)}")

        # Read audio using soundfile first, fallback to librosa
        try:
            audio, orig_sr = sf.read(buffer, dtype="float32", always_2d=False)
        except Exception as sf_err:
            try:
                # Librosa uses audioread/ffmpeg under the hood
                if isinstance(buffer, io.BytesIO):
                    buffer.seek(0)
                audio, orig_sr = librosa.load(buffer, sr=None, mono=False)
                # librosa outputs (channels, N) or (N,)
                if audio.ndim == 2:
                    audio = audio.T
            except Exception as lib_err:
                raise ValueError(f"Failed to decode audio. Soundfile error: {sf_err}; Librosa error: {lib_err}")

        # Handle channels -> Convert to mono by averaging
        if audio.ndim > 1:
            orig_channels = audio.shape[1] if audio.shape[0] > audio.shape[1] else audio.shape[0]
            if audio.shape[0] < audio.shape[1]:  # (channels, N)
                audio = np.mean(audio, axis=0)
            else:  # (N, channels)
                audio = np.mean(audio, axis=1)
        else:
            orig_channels = 1

        audio = np.ascontiguousarray(audio, dtype=np.float32)

        # Resample if needed
        if orig_sr != target_sr:
            audio = librosa.resample(audio, orig_sr=orig_sr, target_sr=target_sr, res_type="soxr_hq")

        duration = len(audio) / float(target_sr)
        if duration < cls.MIN_DURATION_SECONDS:
            raise ValueError(
                f"Audio duration ({duration:.2f}s) is shorter than minimum required ({cls.MIN_DURATION_SECONDS}s)."
            )
        if duration > cls.MAX_DURATION_SECONDS:
            raise ValueError(
                f"Audio duration ({duration:.2f}s) exceeds maximum allowed ({cls.MAX_DURATION_SECONDS}s)."
            )

        # Prevent digital clipping and normalize if needed
        peak = float(np.max(np.abs(audio))) if len(audio) > 0 else 0.0
        if peak > 1.0:
            audio = audio / (peak + 1e-6)
            peak = 1.0

        rms = float(np.sqrt(np.mean(audio**2))) if len(audio) > 0 else 0.0
        snr_est = cls.estimate_snr_db(audio)

        metadata = AudioMetadata(
            duration_seconds=round(duration, 3),
            sample_rate=target_sr,
            channels=orig_channels,
            rms_energy=round(rms, 5),
            peak_amplitude=round(peak, 5),
            estimated_snr_db=round(snr_est, 2),
            codec="PCM_16K_MONO"
        )

        return audio, metadata

    @classmethod
    def estimate_snr_db(cls, audio: np.ndarray, frame_length: int = 1024, hop_length: int = 512) -> float:
        """Estimates audio Signal-to-Noise Ratio (dB) via energy percentile floor comparison."""
        if len(audio) < frame_length:
            return 20.0

        # Calculate frame-level energy
        energy = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
        if len(energy) == 0 or np.all(energy == 0):
            return 0.0

        # Noise floor estimated as 10th percentile energy, signal as 90th percentile
        noise_floor = float(np.percentile(energy, 10))
        signal_level = float(np.percentile(energy, 90))

        if noise_floor <= 1e-7:
            noise_floor = 1e-7
        if signal_level <= noise_floor:
            return 5.0

        snr_db = 20.0 * math.log10(signal_level / noise_floor)
        return float(np.clip(snr_db, 0.0, 60.0))

    @classmethod
    def extract_region(
        cls,
        audio: np.ndarray,
        start_sec: float,
        end_sec: float,
        sr: int = TARGET_SAMPLE_RATE,
        pad_sec: float = 0.1
    ) -> Tuple[np.ndarray, float, float]:
        """Extracts a slice of audio with symmetric padding to protect boundary phonemes.

        Returns:
            Tuple of (sliced_audio, actual_start_sec, actual_end_sec).
        """
        total_duration = len(audio) / float(sr)
        padded_start = max(0.0, start_sec - pad_sec)
        padded_end = min(total_duration, end_sec + pad_sec)

        start_idx = int(round(padded_start * sr))
        end_idx = int(round(padded_end * sr))

        return audio[start_idx:end_idx], padded_start, padded_end

    @classmethod
    def audio_to_wav_bytes(cls, audio: np.ndarray, sr: int = TARGET_SAMPLE_RATE) -> bytes:
        """Encodes float32 numpy audio array to 16-bit PCM WAV bytes."""
        buffer = io.BytesIO()
        # Scale to 16-bit PCM
        scaled = np.clip(audio, -1.0, 1.0)
        sf.write(buffer, scaled, sr, format="WAV", subtype="PCM_16")
        return buffer.getvalue()
