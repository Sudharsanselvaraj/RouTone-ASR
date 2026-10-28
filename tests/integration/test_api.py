"""Integration tests for FastAPI REST endpoints."""

import io
import numpy as np
import pytest
import soundfile as sf
from starlette.testclient import TestClient

from routone.api.app import app


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


def test_api_health_reports_runtime(client):
    data = client.get("/api/health").json()
    rt = data["runtime"]
    assert rt["asr"]["engine"] == "faster-whisper"
    assert isinstance(rt["asr"]["loaded"], bool)
    assert rt["accelerator"]["mps_used"] is False
    assert "benefit_aware" in data["routing"]["strategies"]


def test_api_replay_endpoint(client):
    decision = {
        "region_id": "r0", "start": 1.0, "end": 3.0, "decision": "KEEP_MIXTURE",
        "predicted_benefit": 0.1, "normalized_cost": 0.2, "utility": 0.0,
        "features": {"overlap_score": 0.7, "pitch_clash_index": 0.6, "baseline_avg_logprob": -1.0,
                     "overlap_duration": 2.0, "normalized_cost": 0.2, "speaker_count_estimate": 2.0},
    }
    res = client.post("/api/routing/replay", json={
        "decisions": [decision],
        "policies": [{"name": "never", "strategy": "never_separate"}, {"name": "always", "strategy": "always_separate"}],
    })
    assert res.status_code == 200
    pols = res.json()["policies"]
    assert pols[0]["decisions"][0]["decision"] == "KEEP_MIXTURE"
    assert pols[1]["decisions"][0]["decision"] == "ROUTE_SEPARATION"


def test_api_replay_rejects_unknown_strategy(client):
    res = client.post("/api/routing/replay", json={"decisions": [], "policies": [{"strategy": "nope"}]})
    assert res.status_code == 400


def test_api_runs_unknown_id_404(client):
    assert client.get("/api/runs/run_20200101T000000_abcdef").status_code == 404
    assert client.get("/api/runs/../../etc").status_code in (404, 422)


def test_api_demos_only_lists_existing(client):
    for demo in client.get("/api/demos").json():
        assert client.get(f"/api/demos/{demo['id']}/audio").status_code == 200


def test_api_transcribe_rejects_bad_options(client):
    import io, numpy as np, soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, (0.1 * np.sin(np.linspace(0, 400, 16000))).astype(np.float32), 16000, format="WAV")
    files = {"file": ("t.wav", buf.getvalue(), "audio/wav")}
    assert client.post("/api/transcribe", files=files, data={"routing_strategy": "bogus"}).status_code == 400
    assert client.post("/api/transcribe", files=files, data={"asr_model": "huge"}).status_code == 400


def test_api_transcribe_trace_config_and_persist(client, tmp_path, monkeypatch):
    import io, numpy as np, soundfile as sf
    import importlib
    app_module = importlib.import_module("routone.api.app")
    from routone.runs import RunStore
    monkeypatch.setattr(app_module, "run_store", RunStore(tmp_path))
    buf = io.BytesIO()
    sf.write(buf, (0.1 * np.sin(np.linspace(0, 400, 32000))).astype(np.float32), 16000, format="WAV")
    res = client.post("/api/transcribe", files={"file": ("t.wav", buf.getvalue(), "audio/wav")},
                      data={"routing_strategy": "never_separate", "vad_filter": "false", "word_timestamps": "false"})
    assert res.status_code == 200
    body = res.json()
    events = [e["event"] for e in body["trace"]]
    assert events[0] == "audio_loaded" and events[-1] == "pipeline_complete"
    assert body["config"]["vad_filter"] is False and body["config"]["routing_strategy"] == "never_separate"
    assert body["run_id"]
    assert client.get(f"/api/runs/{body['run_id']}").status_code == 200
    assert client.get(f"/api/runs/{body['run_id']}/audio").status_code == 200


def test_api_benchmark_history_rejects_bad_id(client):
    assert client.get("/api/benchmarks/history/..%2Fsecret").status_code == 404
    assert client.get("/api/benchmarks/history/bench_notadate").status_code == 404
    assert isinstance(client.get("/api/benchmarks/history").json(), list)
