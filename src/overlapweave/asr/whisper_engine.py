"""Faster-Whisper integration for multilingual baseline ASR and separated stream transcription."""

from __future__ import annotations
import time
from typing import List, Optional, Tuple
import numpy as np
from faster_whisper import WhisperModel

from overlapweave.schemas.models import TranscriptSegment, TranscriptWord


class WhisperASREngine:
    """Encapsulates Faster-Whisper ASR inference for English and Tamil code-switching."""

    _instance: Optional[WhisperASREngine] = None

    def __init__(
        self,
        model_size: str = "tiny",
        device: str = "cpu",
        compute_type: str = "int8"
    ):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model: Optional[WhisperModel] = None

    def load_model(self) -> None:
        """Loads Whisper model weights into memory if not already loaded."""
        if self.model is None:
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type
            )

    def transcribe(
        self,
        audio: np.ndarray,
        language: Optional[str] = None,
        speaker_label: str = "Speaker 1",
        source_path: str = "mixture",
        time_offset: float = 0.0
    ) -> Tuple[List[TranscriptSegment], float, str]:
        """Transcribes 16kHz mono audio array using faster-whisper.

        Args:
            audio: 1-D numpy float32 array at 16,000 Hz.
            language: Optional language code ('ta' for Tamil, 'en' for English, or None for auto).
            speaker_label: Attributed speaker name.
            source_path: Provenance tag ('mixture', 'separated_stream_a', 'separated_stream_b').
            time_offset: Offset in seconds to add to segment and word timestamps.

        Returns:
            Tuple of (segments: List[TranscriptSegment], elapsed_ms: float, detected_language: str).
        """
        self.load_model()
        assert self.model is not None, "Model failed to initialize"

        start_time = time.perf_counter()

        # Faster-whisper accepts float32 numpy array directly
        segments_gen, info = self.model.transcribe(
            audio,
            language=language,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400)
        )

        detected_lang = info.language if info else (language or "en")
        segments: List[TranscriptSegment] = []

        for idx, seg in enumerate(segments_gen):
            word_items: List[TranscriptWord] = []
            if seg.words:
                for w in seg.words:
                    word_items.append(
                        TranscriptWord(
                            word=w.word.strip(),
                            start=round(w.start + time_offset, 3),
                            end=round(w.end + time_offset, 3),
                            probability=round(float(w.probability), 3),
                            speaker=speaker_label
                        )
                    )

            # Compute normalized confidence from avg_logprob
            # logprob in whisper is typically in [-1.5, 0.0]
            confidence = round(float(np.exp(np.clip(seg.avg_logprob, -5.0, 0.0))), 3)

            segment_model = TranscriptSegment(
                id=f"{source_path}_seg_{idx}_{int(time_offset*1000)}",
                start=round(seg.start + time_offset, 3),
                end=round(seg.end + time_offset, 3),
                speaker=speaker_label,
                text=seg.text.strip(),
                language=detected_lang,
                avg_logprob=round(float(seg.avg_logprob), 4),
                no_speech_prob=round(float(seg.no_speech_prob), 4),
                words=word_items,
                source_path=source_path,
                confidence=confidence
            )
            segments.append(segment_model)

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        return segments, elapsed_ms, detected_lang

    @classmethod
    def get_default_engine(cls, model_size: str = "tiny") -> WhisperASREngine:
        """Singleton accessor for default ASR engine to avoid reloading checkpoints."""
        if cls._instance is None or cls._instance.model_size != model_size:
            cls._instance = WhisperASREngine(model_size=model_size)
        return cls._instance
