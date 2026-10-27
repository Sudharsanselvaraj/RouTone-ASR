"""Unit tests for AudioProcessor."""

import io
import numpy as np
import pytest
import soundfile as sf
from overlapweave.audio.processor import AudioProcessor


def test_audio_processor_valid_wav():
    # Create 1 second 44100 Hz stereo sine wave
    sr = 44100
    t = np.linspace(0, 1.0, sr, endpoint=False)
    sine = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    stereo = np.column_stack([sine, sine])

    buf = io.BytesIO()
    sf.write(buf, stereo, sr, format="WAV")
    raw_bytes = buf.getvalue()

    audio, meta = AudioProcessor.load_audio(raw_bytes)

    assert meta.sample_rate == 16000
    assert meta.channels == 2  # original channels tracked
    assert len(audio) == 16000
    assert 0.99 <= meta.duration_seconds <= 1.01
    assert meta.rms_energy > 0.0
    assert meta.peak_amplitude <= 1.0
    assert meta.estimated_snr_db >= 0.0


def test_audio_processor_empty_file():
    with pytest.raises(ValueError, match="Audio buffer is empty"):
        AudioProcessor.load_audio(b"")


def test_audio_processor_too_short():
    # 0.05 seconds audio
    sr = 16000
    short_audio = np.zeros(int(0.05 * sr), dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, short_audio, sr, format="WAV")

    with pytest.raises(ValueError, match="shorter than minimum"):
        AudioProcessor.load_audio(buf.getvalue())


def test_audio_processor_extract_region():
    audio = np.ones(16000 * 5, dtype=np.float32)  # 5 seconds
    # Extract 1.0 to 2.0 with 0.1 pad
    sliced, start, end = AudioProcessor.extract_region(audio, 1.0, 2.0, sr=16000, pad_sec=0.1)

    assert start == pytest.approx(0.9, abs=0.01)
    assert end == pytest.approx(2.1, abs=0.01)
    expected_len = int(round((2.1 - 0.9) * 16000))
    assert abs(len(sliced) - expected_len) <= 2


def test_audio_to_wav_bytes():
    audio = np.sin(np.linspace(0, 10, 8000)).astype(np.float32)
    wav_bytes = AudioProcessor.audio_to_wav_bytes(audio, sr=16000)
    assert len(wav_bytes) > 44  # Valid WAV header + data
    assert wav_bytes[:4] == b"RIFF"
