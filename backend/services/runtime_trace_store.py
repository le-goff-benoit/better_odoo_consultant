"""Persistent runtime-trace summaries for skill routing observability."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

_TRACE_STORE_PATH = Path.home() / ".odoo-consultant" / "runtime-traces.jsonl"
_MAX_JSONL_BYTES = 1_000_000


def _compact(payload: Any) -> Any:
    if isinstance(payload, list):
        return [_compact(item) for item in payload[:80]]
    if isinstance(payload, dict):
        out = {}
        for key, value in payload.items():
            if isinstance(value, str) and len(value) > 600:
                out[key] = value[:600].rstrip() + "…"
            else:
                out[key] = _compact(value)
        return out
    return payload


def persist_runtime_trace_summary(
    *,
    run_id: str,
    selected_skills: list[str],
    candidates: list[dict],
    context_trace: list[dict],
    output_template: Optional[dict] = None,
    provider: Optional[str] = None,
    mode: Optional[str] = None,
) -> dict:
    _TRACE_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if _TRACE_STORE_PATH.exists() and _TRACE_STORE_PATH.stat().st_size > _MAX_JSONL_BYTES:
        data = _TRACE_STORE_PATH.read_text(encoding="utf-8", errors="replace")
        _TRACE_STORE_PATH.write_text("\n".join(data.splitlines()[-300:]) + "\n", encoding="utf-8")
    record = {
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "provider": provider,
        "mode": mode,
        "selected_skills": selected_skills,
        "candidates": _compact(candidates),
        "context_trace": _compact(context_trace),
        "output_template": output_template,
    }
    with _TRACE_STORE_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    return record


def get_runtime_trace_summary(run_id: str) -> Optional[dict]:
    if not _TRACE_STORE_PATH.exists():
        return None
    found: Optional[dict] = None
    for line in _TRACE_STORE_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if record.get("run_id") == run_id:
            found = record
    return found