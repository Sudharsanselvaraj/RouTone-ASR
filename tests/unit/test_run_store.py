"""Tests for run persistence."""

from overlapweave.runs import RunStore
from overlapweave.schemas.models import PipelineResult, AudioMetadata, ReconciliationResult


def _result():
    return PipelineResult(
        audio_metadata=AudioMetadata(duration_seconds=1.0, rms_energy=0.1, peak_amplitude=0.5, estimated_snr_db=10.0),
        baseline_segments=[], detected_overlaps=[], routing_decisions=[],
        reconciliation=ReconciliationResult(baseline_segments=[], separated_segments=[], final_segments=[]),
        final_transcript=[], metrics={"detected_language": "en", "separated_regions_count": 0}, processing_time_ms=12.0,
    )


def test_save_list_get_audio(tmp_path):
    store = RunStore(tmp_path)
    run_id = store.save(_result(), "clip.wav", b"RIFFxxxx")
    assert store.valid_id(run_id)
    listed = store.list()
    assert [r["id"] for r in listed] == [run_id]
    assert listed[0]["filename"] == "clip.wav"
    rec = store.get(run_id)
    assert rec["result"]["run_id"] == run_id
    assert store.audio_path(run_id).read_bytes() == b"RIFFxxxx"


def test_rejects_path_traversal(tmp_path):
    store = RunStore(tmp_path)
    assert store.get("../../etc/passwd") is None
    assert store.audio_path("../x") is None
