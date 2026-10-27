"""Pretrained ConvTasNet Libri2Mix speech separation adapter with windowed overlap-add reconstruction."""

from __future__ import annotations
import base64
import time
from typing import Tuple, Optional
import numpy as np
import torch
import torchaudio

from overlapweave.audio.processor import AudioProcessor
from overlapweave.schemas.models import SeparationResult


class ConvTasNetSeparator:
    """Wraps PyTorch Torchaudio's CONVTASNET_BASE_LIBRI2MIX pipeline for 2-speaker speech demixing."""

    _instance: Optional[ConvTasNetSeparator] = None

    def __init__(self, device: Optional[str] = None):
        if device is None:
            # ConvTasNet 1D dilated convolutions run fast on CPU and Apple Silicon
            self.device = torch.device("cpu")
        else:
            self.device = torch.device(device)

        self.model: Optional[torch.nn.Module] = None
        self.resample_to_8k = torchaudio.transforms.Resample(16000, 8000)
        self.resample_to_16k = torchaudio.transforms.Resample(8000, 16000)

    def load_model(self) -> None:
        """Loads weights from torchaudio bundle if not already loaded."""
        if self.model is None:
            bundle = torchaudio.pipelines.CONVTASNET_BASE_LIBRI2MIX
            self.model = bundle.get_model()
            self.model.to(self.device)
            self.model.eval()

    def separate_region(
        self,
        audio_16k: np.ndarray,
        region_id: str = "reg",
        include_b64_audio: bool = False,
        chunk_len_sec: float = 4.0,
        hop_len_sec: float = 2.0
    ) -> Tuple[np.ndarray, np.ndarray, SeparationResult]:
        """Separates a single-channel 16 kHz audio region into two distinct speaker audio streams.

        Args:
            audio_16k: 1-D numpy float32 array at 16,000 Hz.
            region_id: Unique string identifier for tracking.
            include_b64_audio: If True, encodes WAV bytes as base64 for frontend UI inspection.
            chunk_len_sec: Sliding window length for long regions (default: 4.0s).
            hop_len_sec: Step size for overlap-add (default: 2.0s).

        Returns:
            Tuple of:
              - stream_a: 1-D numpy float32 array at 16,000 Hz
              - stream_b: 1-D numpy float32 array at 16,000 Hz
              - SeparationResult metadata object.
        """
        start_time = time.perf_counter()

        if len(audio_16k) < 1600:  # < 0.1s
            # Too short for separation, return copies of mixture
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            return (
                audio_16k.copy(),
                audio_16k.copy(),
                SeparationResult(
                    region_id=region_id,
                    separation_duration_ms=round(elapsed_ms, 2),
                    success=False,
                    fallback_used=True,
                    details="Audio region too short for ConvTasNet separation (<0.1s)"
                ),
            )

        try:
            self.load_model()
            assert self.model is not None, "Separation model failed to initialize"

            # Convert numpy to torch tensor: (1, 1, samples_16k)
            tensor_16k = torch.from_numpy(audio_16k).float().unsqueeze(0).unsqueeze(0)
            tensor_8k = self.resample_to_8k(tensor_16k).to(self.device)

            total_samples_8k = tensor_8k.shape[-1]
            chunk_samples_8k = int(chunk_len_sec * 8000)
            hop_samples_8k = int(hop_len_sec * 8000)

            with torch.no_grad():
                if total_samples_8k <= chunk_samples_8k:
                    # Single pass
                    out_8k = self.model(tensor_8k)  # (1, 2, frames)
                else:
                    # Overlap-add chunk processing
                    out_8k = self._chunked_overlap_add(
                        tensor_8k, chunk_samples_8k, hop_samples_8k
                    )

                # Resample separated streams back to 16 kHz: (1, 2, samples_16k)
                out_16k = self.resample_to_16k(out_8k.cpu())

            stream_a = out_16k[0, 0, :].numpy()
            stream_b = out_16k[0, 1, :].numpy()

            # Align length exactly to original input length
            orig_len = len(audio_16k)
            stream_a = np.pad(stream_a[:orig_len], (0, max(0, orig_len - len(stream_a))))
            stream_b = np.pad(stream_b[:orig_len], (0, max(0, orig_len - len(stream_b))))

            # Normalize amplitudes to prevent clipping
            max_a = float(np.max(np.abs(stream_a)))
            if max_a > 1.0:
                stream_a = stream_a / (max_a + 1e-6)

            max_b = float(np.max(np.abs(stream_b)))
            if max_b > 1.0:
                stream_b = stream_b / (max_b + 1e-6)

            # Calculate RMS energy ratio between separated channels (dB)
            rms_a = float(np.sqrt(np.mean(stream_a**2))) + 1e-6
            rms_b = float(np.sqrt(np.mean(stream_b**2))) + 1e-6
            rms_ratio_db = round(20.0 * np.log10(rms_a / rms_b), 2)

            b64_a: Optional[str] = None
            b64_b: Optional[str] = None
            if include_b64_audio:
                wav_a = AudioProcessor.audio_to_wav_bytes(stream_a)
                wav_b = AudioProcessor.audio_to_wav_bytes(stream_b)
                b64_a = base64.b64encode(wav_a).decode("utf-8")
                b64_b = base64.b64encode(wav_b).decode("utf-8")

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            result = SeparationResult(
                region_id=region_id,
                stream_a_audio_b64=b64_a,
                stream_b_audio_b64=b64_b,
                separation_duration_ms=round(elapsed_ms, 2),
                rms_ratio_db=rms_ratio_db,
                success=True,
                fallback_used=False,
                details=f"ConvTasNet 2-speaker demixing complete ({round(elapsed_ms, 1)}ms)"
            )

            return stream_a, stream_b, result

        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            return (
                audio_16k.copy(),
                audio_16k.copy(),
                SeparationResult(
                    region_id=region_id,
                    separation_duration_ms=round(elapsed_ms, 2),
                    success=False,
                    fallback_used=True,
                    details=f"Separation failed with error: {str(e)}; fallback to mixture."
                ),
            )

    def _chunked_overlap_add(
        self,
        audio_8k: torch.Tensor,
        chunk_len: int,
        hop_len: int
    ) -> torch.Tensor:
        """Windowed overlap-add processing with cosine cross-fade to prevent block discontinuities."""
        total_len = audio_8k.shape[-1]
        output = torch.zeros((1, 2, total_len), device=self.device)
        norm_weights = torch.zeros((1, 1, total_len), device=self.device)

        window = torch.hann_window(chunk_len, device=self.device).view(1, 1, -1)

        start = 0
        prev_chunk_out: Optional[torch.Tensor] = None

        while start < total_len:
            end = min(start + chunk_len, total_len)
            chunk = audio_8k[..., start:end]

            if chunk.shape[-1] < chunk_len:
                chunk = torch.nn.functional.pad(chunk, (0, chunk_len - chunk.shape[-1]))

            with torch.no_grad():
                chunk_sep = self.model(chunk)  # (1, 2, chunk_len)

            # Permutation alignment with previous chunk if overlapping
            if prev_chunk_out is not None and start > 0:
                overlap_samples = min(start + hop_len, total_len) - start
                if overlap_samples > 100:
                    prev_tail = prev_chunk_out[..., -overlap_samples:]
                    curr_head = chunk_sep[..., :overlap_samples]

                    # Correlate direct vs swapped
                    corr_direct = (
                        torch.sum(prev_tail[:, 0, :] * curr_head[:, 0, :]) +
                        torch.sum(prev_tail[:, 1, :] * curr_head[:, 1, :])
                    )
                    corr_swap = (
                        torch.sum(prev_tail[:, 0, :] * curr_head[:, 1, :]) +
                        torch.sum(prev_tail[:, 1, :] * curr_head[:, 0, :])
                    )

                    if corr_swap > corr_direct:
                        # Swap channels to preserve speaker track continuity
                        chunk_sep = chunk_sep[:, [1, 0], :]

            prev_chunk_out = chunk_sep

            actual_len = end - start
            win_slice = window[..., :actual_len]
            output[..., start:end] += chunk_sep[..., :actual_len] * win_slice
            norm_weights[..., start:end] += win_slice

            start += hop_len

        norm_weights = torch.clamp(norm_weights, min=1e-6)
        return output / norm_weights

    @classmethod
    def get_default_separator(cls) -> ConvTasNetSeparator:
        """Singleton accessor for default separator."""
        if cls._instance is None:
            cls._instance = ConvTasNetSeparator()
        return cls._instance
