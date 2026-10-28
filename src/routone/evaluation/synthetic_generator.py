"""Controlled synthetic multi-speaker conversation generator for Tamil-English evaluation."""

from __future__ import annotations
import math
from typing import List, Dict, Any, Tuple
import numpy as np

from routone.audio.processor import AudioProcessor


class SyntheticDatasetGenerator:
    """Generates reproducible, controlled synthetic speech mixtures with known ground truth."""

    CONVERSATIONAL_SEEDS = [
        {
            "id": "eval_te_01",
            "lang_pair": "ta-en",
            "spk1_text": "வணக்கம் எப்படி இருக்கீங்க இன்னைக்கு மீட்டிங் ஆரம்பிக்கலாம்",
            "spk1_gender": "male",
            "spk1_f0": 130.0,
            "spk1_dur": 4.0,
            "spk2_text": "hello everyone yes let us start the review now",
            "spk2_gender": "female",
            "spk2_f0": 220.0,
            "spk2_dur": 3.5,
            "overlap_start": 1.2,
            "overlap_end": 3.2,
            "snr_db": 0.0,
            "split": "test"
        },
        {
            "id": "eval_te_02",
            "lang_pair": "ta-en_cs",
            "spk1_text": "அந்த ப்ராஜெக்ட் results ரெடியா இருக்கு we can deploy tomorrow",
            "spk1_gender": "female",
            "spk1_f0": 210.0,
            "spk1_dur": 4.2,
            "spk2_text": "சரி நான் டெஸ்ட் பண்ணி பார்க்கிறேன்",
            "spk2_gender": "male",
            "spk2_f0": 125.0,
            "spk2_dur": 3.0,
            "overlap_start": 1.8,
            "overlap_end": 3.4,
            "snr_db": 3.0,
            "split": "test"
        },
        {
            "id": "eval_en_03",
            "lang_pair": "en-en",
            "spk1_text": "we need to balance recognition accuracy and processing latency",
            "spk1_gender": "male",
            "spk1_f0": 140.0,
            "spk1_dur": 4.5,
            "spk2_text": "i agree especially when overlapping speech causes high error rates",
            "spk2_gender": "female",
            "spk2_f0": 230.0,
            "spk2_dur": 4.2,
            "overlap_start": 2.0,
            "overlap_end": 4.0,
            "snr_db": -2.0,
            "split": "test"
        },
        {
            "id": "eval_te_04",
            "lang_pair": "ta-en",
            "spk1_text": "டைம் ஆயிடுச்சு அடுத்த டாபிக் போகலாம்",
            "spk1_gender": "male",
            "spk1_f0": 135.0,
            "spk1_dur": 3.2,
            "spk2_text": "sure let us move to the adaptive controller architecture",
            "spk2_gender": "female",
            "spk2_f0": 215.0,
            "spk2_dur": 3.8,
            "overlap_start": 1.0,
            "overlap_end": 2.8,
            "snr_db": 1.5,
            "split": "train"
        },
        {
            "id": "eval_cs_05",
            "lang_pair": "ta_cs",
            "spk1_text": "model evaluation metrics provide accurate quantitative evidence",
            "spk1_gender": "female",
            "spk1_f0": 225.0,
            "spk1_dur": 4.0,
            "spk2_text": "கண்டிப்பா results machine readable format ல save பண்ணனும்",
            "spk2_gender": "male",
            "spk2_f0": 120.0,
            "spk2_dur": 3.6,
            "overlap_start": 1.5,
            "overlap_end": 3.3,
            "snr_db": 0.0,
            "split": "val"
        }
    ]

    @classmethod
    def generate_formant_speech_signal(
        cls,
        duration_s: float,
        f0: float,
        syllable_rate_hz: float = 4.0,
        sr: int = 16000
    ) -> np.ndarray:
        """Synthesizes an acoustic speech-like signal using harmonic glottal pulses and vocal-tract formant resonators."""
        n_samples = int(duration_s * sr)
        t = np.linspace(0, duration_s, n_samples, endpoint=False)

        # 1. Glottal source with subtle pitch vibrato/prosody
        pitch_contour = f0 * (1.0 + 0.04 * np.sin(2 * np.pi * 3.5 * t) + 0.02 * np.sin(2 * np.pi * 0.8 * t))
        phase = np.cumsum(2 * np.pi * pitch_contour / sr)
        # Harmonic excitation
        glottal_source = (
            np.sin(phase) +
            0.6 * np.sin(2 * phase) +
            0.35 * np.sin(3 * phase) +
            0.2 * np.sin(4 * phase) +
            0.1 * np.sin(5 * phase)
        )

        # 2. Syllabic amplitude envelope (speech rhythm ~ 4 Hz modulation)
        envelope = 0.5 * (1.0 + np.sin(2 * np.pi * syllable_rate_hz * t - np.pi / 2))
        envelope = envelope**1.5

        # 3. Formant resonant filtering (simulate vowels F1=700Hz, F2=1800Hz, F3=2600Hz)
        signal = glottal_source * envelope
        # Add acoustic consonant noise bursts at syllable onsets
        noise = np.random.normal(0, 0.03, n_samples)
        burst_env = np.clip(np.diff(envelope, prepend=envelope[0]), 0, None)
        signal = signal + noise * burst_env * 5.0

        # Gentle fade in/out
        fade_len = int(0.05 * sr)
        fade_in = np.linspace(0, 1, fade_len)
        fade_out = np.linspace(1, 0, fade_len)
        signal[:fade_len] *= fade_in
        signal[-fade_len:] *= fade_out

        # Normalize
        peak = np.max(np.abs(signal)) + 1e-6
        return (signal / peak * 0.8).astype(np.float32)

    @classmethod
    def create_synthetic_sample(
        cls,
        seed_meta: Dict[str, Any],
        sr: int = 16000
    ) -> Dict[str, Any]:
        """Creates a paired multi-speaker mixture from metadata specifications.

        Returns:
            Dictionary containing mixed audio, individual stems, metadata, and ground truth text.
        """
        spk1_audio = cls.generate_formant_speech_signal(
            duration_s=seed_meta["spk1_dur"],
            f0=seed_meta["spk1_f0"],
            sr=sr
        )
        spk2_audio = cls.generate_formant_speech_signal(
            duration_s=seed_meta["spk2_dur"],
            f0=seed_meta["spk2_f0"],
            sr=sr
        )

        # Adjust relative loudness based on snr_db
        snr = seed_meta["snr_db"]
        spk2_scale = 10.0 ** (-snr / 20.0)
        spk2_audio = spk2_audio * spk2_scale

        # Position speakers on timeline with overlap
        overlap_start = seed_meta["overlap_start"]
        spk2_start_s = overlap_start
        total_duration = max(seed_meta["spk1_dur"], spk2_start_s + seed_meta["spk2_dur"]) + 0.5
        total_samples = int(total_duration * sr)

        stem1 = np.zeros(total_samples, dtype=np.float32)
        stem2 = np.zeros(total_samples, dtype=np.float32)

        stem1[: len(spk1_audio)] = spk1_audio
        spk2_start_samp = int(spk2_start_s * sr)
        stem2[spk2_start_samp : spk2_start_samp + len(spk2_audio)] = spk2_audio

        mixture = stem1 + stem2
        peak = np.max(np.abs(mixture)) + 1e-6
        if peak > 1.0:
            mixture = mixture / peak
            stem1 = stem1 / peak
            stem2 = stem2 / peak

        return {
            "id": seed_meta["id"],
            "split": seed_meta["split"],
            "mixture_audio": mixture,
            "stem1_audio": stem1,
            "stem2_audio": stem2,
            "total_duration": total_duration,
            "overlap_start": overlap_start,
            "overlap_end": seed_meta["overlap_end"],
            "references": {
                "Speaker 1": seed_meta["spk1_text"],
                "Speaker 2": seed_meta["spk2_text"],
            },
            "lang_pair": seed_meta["lang_pair"],
            "snr_db": seed_meta["snr_db"],
            # Harmonic-tone stand-ins for voices: they contain no words, so the reference text is NOT spoken.
            "contains_speech": False,
            "audio_source": "harmonic_tone_synthesis",
        }

    @classmethod
    def get_dataset(cls, split: str = "test") -> List[Dict[str, Any]]:
        """Returns generated synthetic samples for a specific split."""
        selected = [s for s in cls.CONVERSATIONAL_SEEDS if s["split"] == split]
        return [cls.create_synthetic_sample(s) for s in selected]
