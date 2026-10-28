"""Filesystem persistence for completed pipeline runs (experiment history)."""

from __future__ import annotations
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from overlapweave.schemas.models import PipelineResult

DEFAULT_RUNS_DIR = Path(__file__).resolve().parents[2] / "data" / "runs"
_ID_RE = re.compile(r"^run_[0-9]{8}T[0-9]{6}_[0-9a-f]{6}$")
_EXT_RE = re.compile(r"^\.[a-z0-9]{1,5}$")


class RunStore:
    """Stores each run as ``<base>/<run_id>/run.json`` plus the original ``audio<ext>``."""

    def __init__(self, base: Optional[Path] = None):
        self.base = Path(base) if base else DEFAULT_RUNS_DIR

    @staticmethod
    def valid_id(run_id: str) -> bool:
        return bool(_ID_RE.match(run_id))

    def save(self, result: PipelineResult, filename: str, audio_bytes: bytes) -> str:
        now = datetime.now(timezone.utc)
        run_id = f"run_{now.strftime('%Y%m%dT%H%M%S')}_{uuid.uuid4().hex[:6]}"
        d = self.base / run_id
        d.mkdir(parents=True, exist_ok=True)
        ext = Path(filename).suffix.lower()
        if not _EXT_RE.match(ext):
            ext = ".bin"
        (d / f"audio{ext}").write_bytes(audio_bytes)
        result.run_id = run_id
        record = {
            "id": run_id,
            "created_at": now.isoformat(),
            "filename": filename,
            "audio_file": f"audio{ext}",
            "result": json.loads(result.model_dump_json()),
        }
        (d / "run.json").write_text(json.dumps(record), encoding="utf-8")
        return run_id

    def _summary(self, rec: Dict[str, Any]) -> Dict[str, Any]:
        res = rec["result"]
        m = res.get("metrics", {})
        return {
            "id": rec["id"],
            "created_at": rec["created_at"],
            "filename": rec["filename"],
            "duration_s": res["audio_metadata"]["duration_seconds"],
            "overlap_regions": len(res["detected_overlaps"]),
            "separated_regions": m.get("separated_regions_count"),
            "real_time_factor": m.get("real_time_factor"),
            "processing_time_ms": res.get("processing_time_ms"),
            "language": m.get("detected_language"),
            "config": res.get("config", {}),
        }

    def list(self) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        if not self.base.exists():
            return out
        for d in self.base.iterdir():
            f = d / "run.json"
            if d.is_dir() and self.valid_id(d.name) and f.exists():
                try:
                    out.append(self._summary(json.loads(f.read_text(encoding="utf-8"))))
                except Exception:
                    continue  # unreadable run: skipped, not invented
        out.sort(key=lambda r: r["created_at"], reverse=True)
        return out

    def get(self, run_id: str) -> Optional[Dict[str, Any]]:
        if not self.valid_id(run_id):
            return None
        f = self.base / run_id / "run.json"
        if not f.exists():
            return None
        return json.loads(f.read_text(encoding="utf-8"))

    def audio_path(self, run_id: str) -> Optional[Path]:
        rec = self.get(run_id)
        if not rec:
            return None
        p = self.base / run_id / rec["audio_file"]
        return p if p.exists() else None
