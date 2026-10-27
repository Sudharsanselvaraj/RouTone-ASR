"""Integration tests for FastAPI REST endpoints."""

import io
import numpy as np
import pytest
import soundfile as sf
from starlette.testclient import TestClient

from overlapweave.api.app import app


@pytest.fixture
def client():
    return TestClient(app)


def test_api_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "default_models" in data


def test_api_sample_metadata(client):
    res = client.get("/api/sample-metadata")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 3
    assert data[0]["id"] == "eval_te_01"


def test_api_sample_audio(client):
    res = client.get("/api/sample-audio/eval_te_01")
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert len(res.content) > 100


def test_api_overlap_endpoint(client):
    # Create simple WAV
    buf = io.BytesIO()
    audio = (0.2 * np.sin(np.linspace(0, 100, 16000))).astype(np.float32)
    sf.write(buf, audio, 16000, format="WAV")
    buf.seek(0)

    res = client.post(
        "/api/overlap",
        files={"file": ("test.wav", buf.getvalue(), "audio/wav")}
    )
    assert res.status_code == 200
    data = res.json()
    assert "metadata" in data
    assert "overlaps" in data
