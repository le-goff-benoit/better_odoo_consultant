from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from scripts.quality_eval import run_agent_response_eval as eval_runner


DATASET = Path(__file__).resolve().parent.parent / "scripts" / "quality_eval" / "agent_response_eval.jsonl"


def test_agent_response_eval_dataset_shape():
    cases = eval_runner.load_dataset(DATASET)
    assert len(cases) == 200
    assert Counter(case.expected_agent for case in cases) == {
        "support": 50,
        "business_analyst": 50,
        "architect": 50,
        "developer": 50,
    }
    assert sum(1 for case in cases if case.id.startswith("simple-")) == 50
    assert sum(1 for case in cases if case.id.startswith("hard-")) == 50
    assert sum(1 for case in cases if case.golden) >= 10
    assert all(case.criteria for case in cases)
    assert all(case.tags for case in cases)


def test_agent_response_eval_dry_run_writes_results_and_report(tmp_path):
    out = tmp_path / "run.jsonl"
    report = tmp_path / "run.md"

    result = eval_runner.run(DATASET)
    eval_runner._write_jsonl(out, result["results"])
    report.write_text(
        eval_runner.build_report(result["summary"], result["results"]),
        encoding="utf-8",
    )

    rows = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 200
    assert result["summary"]["total"] == 200
    assert "agent_accuracy" in result["summary"]
    assert "tool_accuracy" in result["summary"]
    # After de-overfit, golden failures > 0 is acceptable but should stay bounded.
    assert result["summary"]["golden_failures"] <= 15
    assert result["summary"]["agent_accuracy"] >= 0.55
    assert result["summary"]["tool_accuracy"] >= 0.60
    # Each split (train/dev/test) is reported.
    assert set(result["summary"]["by_split"].keys()) == {"train", "dev", "test"}
    assert "Agent Response Eval Report" in report.read_text(encoding="utf-8")
    assert all("agent_fit" in row["dimensions"] for row in rows)
    assert all("tool_use" in row["dimensions"] for row in rows)
    assert all(row["pending_dimensions"] for row in rows)
