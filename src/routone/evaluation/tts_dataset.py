"""Real-speech overlapping mixtures built from text-to-speech stems (macOS ``say``).

Unlike :class:`SyntheticDatasetGenerator` (harmonic tones that contain no words), these mixtures
contain intelligible speech whose reference transcripts are exactly the text that was synthesized.
They are still synthetic (TTS, single-channel linear mixing), not natural conversational speech.
"""

from __future__ import annotations
import hashlib
import platform
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import soundfile as sf

from routone.evaluation.synthetic_generator import SyntheticDatasetGenerator

CACHE_DIR = Path(__file__).resolve().parents[3] / "data" / "tts_cache"
_TAMIL = re.compile(r"[஀-௿]")
VOICES = {"en": {"male": "Daniel", "female": "Samantha"}, "ta": {"male": "Vani", "female": "Vani"}}


class TTSDatasetGenerator:
    """Builds overlapping two-speaker mixtures from TTS stems with exact reference transcripts."""

    DATASET_NAME = "TTS Overlap Mixtures (macOS say, test split)"

    @staticmethod
    def available() -> bool:
        return platform.system() == "Darwin" and shutil.which("say") is not None

    @classmethod
    def _voice_for(cls, text: str, gender: str) -> str:
        lang = "ta" if _TAMIL.search(text) else "en"
        return VOICES[lang][gender]

    @classmethod
    def _synthesize(cls, text: str, voice: str, sr: int = 16000) -> np.ndarray:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha1(f"{voice}|{text}|{sr}".encode("utf-8")).hexdigest()[:16]
        path = CACHE_DIR / f"{key}.wav"
        if not path.exists():
            with tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / "out.wav"
                subprocess.run(
                    ["say", "-v", voice, "-o", str(out), "--file-format=WAVE", f"--data-format=LEI16@{sr}", text],
                    check=True, capture_output=True,
                )
                shutil.copy(out, path)
        audio, file_sr = sf.read(str(path), dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if file_sr != sr:
            raise RuntimeError(f"Unexpected TTS sample rate {file_sr}")
        peak = float(np.max(np.abs(audio))) + 1e-6
        return (audio / peak * 0.8).astype(np.float32)

    @classmethod
    def create_sample(cls, seed: Dict[str, Any], sr: int = 16000) -> Dict[str, Any]:
        a1 = cls._synthesize(seed["spk1_text"], cls._voice_for(seed["spk1_text"], seed["spk1_gender"]), sr)
        a2 = cls._synthesize(seed["spk2_text"], cls._voice_for(seed["spk2_text"], seed["spk2_gender"]), sr)
        a2 = a2 * float(10.0 ** (-seed["snr_db"] / 20.0))

        len1 = len(a1) / sr
        start2 = float(seed["overlap_start"])
        if start2 >= len1 - 0.3:  # guarantee a real temporal overlap
            start2 = max(0.0, len1 - 1.0)
        total = max(len1, start2 + len(a2) / sr) + 0.3
        n = int(total * sr)
        s1 = np.zeros(n, dtype=np.float32)
        s2 = np.zeros(n, dtype=np.float32)
        s1[: len(a1)] = a1
        i2 = int(start2 * sr)
        s2[i2:i2 + len(a2)] = a2[: n - i2]
        mix = s1 + s2
        peak = float(np.max(np.abs(mix))) + 1e-6
        if peak > 1.0:
            mix, s1, s2 = mix / peak, s1 / peak, s2 / peak
        overlap_end = min(len1, start2 + len(a2) / sr)
        return {
            "id": seed["id"],
            "split": seed["split"],
            "mixture_audio": mix,
            "stem1_audio": s1,
            "stem2_audio": s2,
            "total_duration": total,
            "overlap_start": start2,
            "overlap_end": overlap_end,
            "references": {"Speaker 1": seed["spk1_text"], "Speaker 2": seed["spk2_text"]},
            "lang_pair": seed["lang_pair"],
            "snr_db": seed["snr_db"],
            "contains_speech": True,
            "audio_source": "macos_say_tts",
        }

    @classmethod
    def get_dataset(cls, split: str = "test") -> List[Dict[str, Any]]:
        if not cls.available():
            raise RuntimeError("TTS dataset requires macOS 'say'; not available on this platform.")
        seeds = [s for s in SyntheticDatasetGenerator.CONVERSATIONAL_SEEDS if s["split"] == split]
        return [cls.create_sample(s) for s in seeds]
