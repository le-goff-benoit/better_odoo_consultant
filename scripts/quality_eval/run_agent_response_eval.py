#!/usr/bin/env python3
"""Agent-response evaluation harness.

Phase 1 is intentionally deterministic and offline: it evaluates the agent
inference and skill routing that precede any provider call. Optional response
trace files can be merged later so LLM/human graders can fill the qualitative
dimensions without making CI depend on API keys.

Usage:
    python scripts/quality_eval/run_agent_response_eval.py
    python scripts/quality_eval/run_agent_response_eval.py --out runs/baseline.jsonl --report runs/baseline.md
    python scripts/quality_eval/run_agent_response_eval.py --json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.agents import list_agents  # noqa: E402
from backend.services.ai_service import _infer_perspective  # noqa: E402
from backend.services.context_service import (  # noqa: E402
    _select_skill_playbooks,
    last_skill_route_candidates,
    last_skill_route_confidence,
)
from backend.skills.registry import SKILL_DEFINITIONS  # noqa: E402


DATASET = Path(__file__).parent / "agent_response_eval.jsonl"
DIMENSIONS = ("agent_fit", "tool_use", "odoo_accuracy", "answer_quality", "handoff_quality")
QUALITATIVE_DIMENSIONS = ("odoo_accuracy", "answer_quality", "handoff_quality")


class DatasetError(ValueError):
    """Raised when the agent response eval dataset is malformed."""


@dataclass(frozen=True)
class EvalCase:
    id: str
    prompt: str
    expected_agent: str
    mode: str
    context: dict[str, Any]
    expected_skills: tuple[str, ...]
    forbidden_skills: tuple[str, ...]
    criteria: tuple[str, ...]
    difficulty: str
    tags: tuple[str, ...]
    golden: bool
    expected_handoff: tuple[str, ...]
    split: str
    paraphrases: tuple[str, ...]


def _as_str_tuple(raw: Any, field: str, case_id: str) -> tuple[str, ...]:
    if raw is None:
        return ()
    if not isinstance(raw, list) or not all(isinstance(item, str) and item.strip() for item in raw):
        raise DatasetError(f"{case_id}: {field} must be a list of non-empty strings")
    return tuple(item.strip() for item in raw)


def _validate_case(
    raw: dict[str, Any],
    line_no: int,
    known_agents: set[str],
    known_skills: set[str],
) -> EvalCase:
    case_id = str(raw.get("id") or "").strip()
    if not case_id:
        raise DatasetError(f"line {line_no}: missing id")
    prompt = str(raw.get("prompt") or "").strip()
    if not prompt:
        raise DatasetError(f"{case_id}: missing prompt")
    expected_agent = str(raw.get("expected_agent") or "").strip()
    if expected_agent not in known_agents:
        raise DatasetError(f"{case_id}: unknown expected_agent {expected_agent!r}")
    mode = str(raw.get("mode") or "assistant").strip()
    if mode not in {"assistant", "migration", "creator"}:
        raise DatasetError(f"{case_id}: mode must be assistant, migration or creator")
    context = raw.get("context") or {}
    if not isinstance(context, dict):
        raise DatasetError(f"{case_id}: context must be an object")
    criteria = _as_str_tuple(raw.get("criteria"), "criteria", case_id)
    if len(criteria) < 2:
        raise DatasetError(f"{case_id}: at least two criteria are required")
    difficulty = str(raw.get("difficulty") or "").strip()
    if difficulty not in {"easy", "medium", "hard"}:
        raise DatasetError(f"{case_id}: difficulty must be easy, medium or hard")
    tags = _as_str_tuple(raw.get("tags"), "tags", case_id)
    if not tags:
        raise DatasetError(f"{case_id}: at least one tag is required")
    expected_skills = _as_str_tuple(raw.get("expected_skills"), "expected_skills", case_id)
    forbidden_skills = _as_str_tuple(raw.get("forbidden_skills"), "forbidden_skills", case_id)
    unknown_skills = sorted((set(expected_skills) | set(forbidden_skills)) - known_skills)
    if unknown_skills:
        raise DatasetError(f"{case_id}: unknown skills: {unknown_skills}")

    split = str(raw.get("split") or "train").strip()
    if split not in {"train", "dev", "test"}:
        raise DatasetError(f"{case_id}: split must be train, dev or test")
    paraphrases = _as_str_tuple(raw.get("paraphrases"), "paraphrases", case_id) if raw.get("paraphrases") else ()
    return EvalCase(
        id=case_id,
        prompt=prompt,
        expected_agent=expected_agent,
        mode=mode,
        context=context,
        expected_skills=expected_skills,
        forbidden_skills=forbidden_skills,
        criteria=criteria,
        difficulty=difficulty,
        tags=tags,
        golden=bool(raw.get("golden")),
        expected_handoff=_as_str_tuple(raw.get("expected_handoff"), "expected_handoff", case_id),
        split=split,
        paraphrases=paraphrases,
    )


def load_dataset(path: Path = DATASET) -> list[EvalCase]:
    known_agents = {agent.name for agent in list_agents()}
    known_skills = {skill.name for skill in SKILL_DEFINITIONS}
    cases: list[EvalCase] = []
    seen: set[str] = set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            raw = json.loads(line)
        except json.JSONDecodeError as exc:
            raise DatasetError(f"line {line_no}: invalid JSON: {exc}") from exc
        if not isinstance(raw, dict):
            raise DatasetError(f"line {line_no}: each JSONL row must be an object")
        case = _validate_case(raw, line_no, known_agents, known_skills)
        if case.id in seen:
            raise DatasetError(f"{case.id}: duplicate id")
        seen.add(case.id)
        cases.append(case)
    if not cases:
        raise DatasetError(f"{path}: dataset is empty")
    return cases


def _agent_versions() -> dict[str, dict[str, str]]:
    versions: dict[str, dict[str, str]] = {}
    for agent in list_agents():
        agent_md = Path(agent.folder) / "AGENT.md"
        content = agent_md.read_bytes()
        versions[agent.name] = {
            "path": str(agent_md.relative_to(ROOT)),
            "sha256": hashlib.sha256(content).hexdigest(),
        }
    try:
        head = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        head = "unknown"
    return {"git_head": {"sha": head}, **versions}


def _load_response_traces(path: Path | None) -> dict[str, dict[str, Any]]:
    if path is None:
        return {}
    traces: dict[str, dict[str, Any]] = {}
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        if not isinstance(raw, dict) or not raw.get("id"):
            raise DatasetError(f"{path}:{line_no}: response trace rows require an id")
        traces[str(raw["id"])] = raw
    return traces


def _score_tool_use(expected: set[str], forbidden: set[str], matched: set[str]) -> tuple[int, list[str]]:
    issues: list[str] = []
    missing = sorted(expected - matched)
    forbidden_hit = sorted(forbidden & matched)
    if missing:
        issues.append("missing_expected_skills")
    if forbidden_hit:
        issues.append("forbidden_skills_selected")
    if not expected and not forbidden_hit:
        tool_leaks = sorted(
            name for name in matched
            if not name.startswith("runtime_") and name != "output_report_writer"
        )
        if tool_leaks:
            issues.append("unexpected_tool_use")

    penalty = 0
    penalty += 10 * len(missing)
    penalty += 10 * len(forbidden_hit)
    if "unexpected_tool_use" in issues:
        penalty += 8
    return max(0, 20 - penalty), issues


def _qualitative_scores(trace: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not trace:
        return {
            name: {"score": None, "status": "pending", "reason": "no response trace supplied"}
            for name in QUALITATIVE_DIMENSIONS
        }
    scores = trace.get("scores") or {}
    out: dict[str, dict[str, Any]] = {}
    for name in QUALITATIVE_DIMENSIONS:
        raw = scores.get(name)
        if isinstance(raw, (int, float)):
            out[name] = {"score": max(0, min(20, int(raw))), "status": "graded", "reason": "provided by response trace"}
        else:
            out[name] = {"score": None, "status": "pending", "reason": "missing grader score in response trace"}
    return out


def _route_one(case: EvalCase, prompt: str) -> dict[str, Any]:
    """Run the agent inference + skill router for one prompt variant."""
    selected_agent = _infer_perspective(prompt, fallback="business_analyst")
    _select_skill_playbooks(
        prompt,
        migration=(case.mode == "migration"),
        creation=(case.mode == "creator"),
        disabled_tools=None,
        locale="fr",
        perspective=selected_agent,
    )
    matched = set(getattr(_select_skill_playbooks, "_last_matched", []) or [])
    expected = set(case.expected_skills)
    forbidden = set(case.forbidden_skills)
    return {
        "prompt": prompt,
        "selected_agent": selected_agent,
        "agent_ok": selected_agent == case.expected_agent,
        "matched": sorted(matched),
        "missing": sorted(expected - matched),
        "forbidden_hit": sorted(forbidden & matched),
        "confidence": last_skill_route_confidence(),
    }


def evaluate_case(case: EvalCase, response_trace: dict[str, Any] | None = None) -> dict[str, Any]:
    selected_agent = _infer_perspective(case.prompt, fallback="business_analyst")
    agent_result = dict(getattr(_infer_perspective, "last_result", {}) or {})

    _select_skill_playbooks(
        case.prompt,
        migration=(case.mode == "migration"),
        creation=(case.mode == "creator"),
        disabled_tools=None,
        locale="fr",
        perspective=selected_agent,
    )
    matched = set(getattr(_select_skill_playbooks, "_last_matched", []) or [])
    candidates = list(last_skill_route_candidates())
    confidence = last_skill_route_confidence()

    expected = set(case.expected_skills)
    forbidden = set(case.forbidden_skills)
    agent_ok = selected_agent == case.expected_agent
    tool_score, tool_issues = _score_tool_use(expected, forbidden, matched)

    paraphrase_runs = [_route_one(case, p) for p in case.paraphrases]
    paraphrase_agent_ok = sum(1 for r in paraphrase_runs if r["agent_ok"])
    paraphrase_tool_ok = sum(
        1 for r in paraphrase_runs if not r["missing"] and not r["forbidden_hit"]
    )

    dimensions: dict[str, dict[str, Any]] = {
        "agent_fit": {
            "score": 20 if agent_ok else 0,
            "status": "graded",
            "reason": "selected expected agent" if agent_ok else "selected wrong agent",
        },
        "tool_use": {
            "score": tool_score,
            "status": "graded",
            "reason": "skill expectations satisfied" if not tool_issues else ", ".join(tool_issues),
        },
        **_qualitative_scores(response_trace),
    }

    numeric_scores = [
        dim["score"] for dim in dimensions.values()
        if isinstance(dim.get("score"), int)
    ]
    total_score = (
        sum(dim["score"] for dim in dimensions.values())
        if all(isinstance(dim.get("score"), int) for dim in dimensions.values())
        else None
    )
    deterministic_score = sum(numeric_scores)
    pending = [name for name, dim in dimensions.items() if dim.get("score") is None]

    failure_reasons: list[str] = []
    if not agent_ok:
        failure_reasons.append("wrong_agent")
    failure_reasons.extend(tool_issues)
    if case.golden and failure_reasons:
        failure_reasons.append("golden_regression_candidate")

    return {
        "id": case.id,
        "prompt": case.prompt,
        "mode": case.mode,
        "split": case.split,
        "expected_agent": case.expected_agent,
        "selected_agent": selected_agent,
        "agent_result": agent_result,
        "paraphrases": paraphrase_runs,
        "paraphrase_agent_ok": paraphrase_agent_ok,
        "paraphrase_tool_ok": paraphrase_tool_ok,
        "paraphrase_total": len(paraphrase_runs),
        "expected_skills": sorted(expected),
        "forbidden_skills": sorted(forbidden),
        "matched_skills": sorted(matched),
        "missing_skills": sorted(expected - matched),
        "forbidden_skills_selected": sorted(forbidden & matched),
        "skill_confidence": confidence,
        "top_candidates": [
            {
                "name": c["name"],
                "score": c["score"],
                "selected": c["selected"],
                "reason": c["reason"],
            }
            for c in candidates[:8]
        ],
        "criteria": list(case.criteria),
        "difficulty": case.difficulty,
        "tags": list(case.tags),
        "golden": case.golden,
        "expected_handoff": list(case.expected_handoff),
        "dimensions": dimensions,
        "deterministic_score": deterministic_score,
        "total_score": total_score,
        "pending_dimensions": pending,
        "failure_reasons": failure_reasons,
        "response_trace": response_trace or None,
    }


def _stats(items: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(items)
    if not n:
        return {"total": 0, "agent_accuracy": 0, "tool_accuracy": 0, "paraphrase_total": 0, "paraphrase_agent_accuracy": 0, "paraphrase_tool_accuracy": 0}
    agent_ok = sum(1 for r in items if r["selected_agent"] == r["expected_agent"])
    tool_ok = sum(1 for r in items if not r["missing_skills"] and not r["forbidden_skills_selected"])
    p_total = sum(r["paraphrase_total"] for r in items)
    p_agent = sum(r["paraphrase_agent_ok"] for r in items)
    p_tool = sum(r["paraphrase_tool_ok"] for r in items)
    return {
        "total": n,
        "agent_accuracy": round(agent_ok / n, 3),
        "tool_accuracy": round(tool_ok / n, 3),
        "paraphrase_total": p_total,
        "paraphrase_agent_accuracy": round(p_agent / p_total, 3) if p_total else None,
        "paraphrase_tool_accuracy": round(p_tool / p_total, 3) if p_total else None,
    }


def _confusion_matrix(results: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    """Build an expected→selected agent confusion matrix.

    Outer key = expected agent (the truth), inner key = selected agent (what
    the router did). Cell = case count. Use to spot which agent pair is
    actually colliding before deciding whether to add a framing detector,
    trim keywords, or write a pruning rule.
    """
    matrix: dict[str, dict[str, int]] = {}
    agents = sorted({r["expected_agent"] for r in results} | {r["selected_agent"] for r in results})
    for a in agents:
        matrix[a] = {b: 0 for b in agents}
    for r in results:
        matrix[r["expected_agent"]][r["selected_agent"]] += 1
    return matrix


def _top_confusions(matrix: dict[str, dict[str, int]], limit: int = 6) -> list[dict[str, Any]]:
    """Return the largest off-diagonal cells, descending."""
    cells = [
        {"expected": e, "selected": s, "count": c}
        for e, row in matrix.items() for s, c in row.items()
        if e != s and c > 0
    ]
    cells.sort(key=lambda x: -x["count"])
    return cells[:limit]


def _summarise(results: list[dict[str, Any]]) -> dict[str, Any]:
    by_agent: dict[str, dict[str, Any]] = {}
    failures = Counter(reason for r in results for reason in r["failure_reasons"])
    for agent in sorted({r["expected_agent"] for r in results}):
        items = [r for r in results if r["expected_agent"] == agent]
        by_agent[agent] = {
            **_stats(items),
            "golden_failures": sum(1 for r in items if r["golden"] and r["failure_reasons"]),
            "avg_deterministic_score": round(sum(r["deterministic_score"] for r in items) / len(items), 2) if items else 0,
        }
    by_split: dict[str, dict[str, Any]] = {}
    for split in ("train", "dev", "test"):
        items = [r for r in results if r.get("split") == split]
        if items:
            by_split[split] = {
                **_stats(items),
                "golden_failures": sum(1 for r in items if r["golden"] and r["failure_reasons"]),
            }
    confusion = _confusion_matrix(results)
    return {
        "total": len(results),
        **_stats(results),
        "confusion_matrix": confusion,
        "top_confusions": _top_confusions(confusion),
        "golden_failures": sum(1 for r in results if r["golden"] and r["failure_reasons"]),
        "failure_reasons": dict(failures),
        "by_agent": by_agent,
        "by_split": by_split,
    }


def _fmt_pct(v: float | None) -> str:
    return f"{v:.1%}" if isinstance(v, (int, float)) else "—"


def build_report(summary: dict[str, Any], results: list[dict[str, Any]]) -> str:
    lines = [
        "# Agent Response Eval Report",
        "",
        f"- Cases: {summary['total']}",
        f"- Agent accuracy: {_fmt_pct(summary['agent_accuracy'])}",
        f"- Tool expectation accuracy: {_fmt_pct(summary['tool_accuracy'])}",
        f"- Paraphrase agent accuracy: {_fmt_pct(summary.get('paraphrase_agent_accuracy'))} (n={summary.get('paraphrase_total', 0)})",
        f"- Paraphrase tool accuracy: {_fmt_pct(summary.get('paraphrase_tool_accuracy'))}",
        f"- Golden failures: {summary['golden_failures']}",
        "",
        "## By Split",
        "",
        "| Split | Cases | Agent OK | Tool OK | Paraphrase agent | Paraphrase tool | Golden fail |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for split, stats in summary.get("by_split", {}).items():
        lines.append(
            f"| {split} | {stats['total']} | {_fmt_pct(stats['agent_accuracy'])} | "
            f"{_fmt_pct(stats['tool_accuracy'])} | {_fmt_pct(stats['paraphrase_agent_accuracy'])} | "
            f"{_fmt_pct(stats['paraphrase_tool_accuracy'])} | {stats['golden_failures']} |"
        )
    lines.extend([
        "",
        "## By Agent",
        "",
        "| Agent | Cases | Agent OK | Tool OK | Paraphrase agent | Golden fail | Avg det. score |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ])
    for agent, stats in summary["by_agent"].items():
        lines.append(
            f"| {agent} | {stats['total']} | {_fmt_pct(stats['agent_accuracy'])} | "
            f"{_fmt_pct(stats['tool_accuracy'])} | {_fmt_pct(stats['paraphrase_agent_accuracy'])} | "
            f"{stats['golden_failures']} | {stats['avg_deterministic_score']} |"
        )
    matrix = summary.get("confusion_matrix") or {}
    if matrix:
        agents = sorted(matrix.keys())
        header = "| expected ↓ / selected → | " + " | ".join(agents) + " |"
        sep = "|---|" + "|".join("---:" for _ in agents) + "|"
        lines.extend(["", "## Confusion Matrix", "", header, sep])
        for e in agents:
            cells = []
            for s in agents:
                v = matrix[e].get(s, 0)
                cells.append(f"**{v}**" if e == s else str(v))
            lines.append(f"| {e} | " + " | ".join(cells) + " |")
        top = summary.get("top_confusions") or []
        if top:
            lines.extend(["", "### Top confusions (off-diagonal)", ""])
            for cell in top:
                lines.append(f"- expected `{cell['expected']}` → selected `{cell['selected']}` : {cell['count']}")
    lines.extend(["", "## Failure Reasons", ""])
    if summary["failure_reasons"]:
        for reason, count in sorted(summary["failure_reasons"].items(), key=lambda item: (-item[1], item[0])):
            lines.append(f"- `{reason}`: {count}")
    else:
        lines.append("- None")

    failing = [r for r in results if r["failure_reasons"]]
    lines.extend(["", "## Top Failing Cases", ""])
    if not failing:
        lines.append("- None")
    for r in failing[:25]:
        lines.append(
            f"- `{r['id']}` expected `{r['expected_agent']}`, got `{r['selected_agent']}`; "
            f"matched={r['matched_skills']}; reasons={r['failure_reasons']}"
        )
    lines.extend([
        "",
        "## Notes",
        "",
        "- `deterministic_score` covers `agent_fit` and `tool_use` only.",
        "- `odoo_accuracy`, `answer_quality` and `handoff_quality` stay pending until response traces or judge scores are supplied.",
    ])
    return "\n".join(lines) + "\n"


def run(dataset: Path, responses: Path | None = None) -> dict[str, Any]:
    cases = load_dataset(dataset)
    traces = _load_response_traces(responses)
    results = [evaluate_case(case, traces.get(case.id)) for case in cases]
    return {
        "metadata": {
            "dataset": str(dataset),
            "agent_versions": _agent_versions(),
            "dimensions": list(DIMENSIONS),
        },
        "summary": _summarise(results),
        "results": results,
    }


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--responses", type=Path, default=None, help="optional JSONL response/judge traces keyed by id")
    parser.add_argument("--out", type=Path, default=None, help="write per-case JSONL results")
    parser.add_argument("--report", type=Path, default=None, help="write a Markdown summary report")
    parser.add_argument("--json", action="store_true", help="emit full JSON report to stdout")
    parser.add_argument("--fail-on-golden", action="store_true", help="exit 1 if any golden case fails deterministic checks")
    args = parser.parse_args()

    report = run(args.dataset, args.responses)

    if args.out:
        _write_jsonl(args.out, report["results"])
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(build_report(report["summary"], report["results"]), encoding="utf-8")

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        summary = report["summary"]
        print(
            f"Agent response eval: {summary['total']} cases, "
            f"agent_accuracy={summary['agent_accuracy']:.1%}, "
            f"tool_accuracy={summary['tool_accuracy']:.1%}, "
            f"golden_failures={summary['golden_failures']}"
        )
        if args.report:
            print(f"Markdown report: {args.report}")
        if args.out:
            print(f"JSONL results: {args.out}")

    if args.fail_on_golden and report["summary"]["golden_failures"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
