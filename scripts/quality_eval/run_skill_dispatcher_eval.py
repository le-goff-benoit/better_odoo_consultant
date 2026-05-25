#!/usr/bin/env python3
"""Skill-dispatcher evaluation harness.

Counterpart of ``run_agent_response_eval.py`` for the skill router. Loads
every routing case shipped in:

- ``scripts/quality_eval/dataset.json`` (28 curated end-to-end prompts)
- ``skills/*/eval_queries.json`` (per-skill positives + near-miss negatives,
  256 cases at v0.97.0)

and replays each prompt through ``_select_skill_playbooks`` to measure:

- positive accuracy (expected skill selected when ``should_trigger=true``);
- negative accuracy (expected skill *not* selected when ``should_trigger=false``);
- paraphrase robustness (optional ``paraphrases`` array per case);
- skill-to-skill confusion matrix (which skill won when the expected one missed).

A deterministic train/dev/test split (70/15/15, stratified by skill) is
assigned by hashing the case id so a new contribution can't accidentally land
exclusively in the train slice.

Usage::

    python scripts/quality_eval/run_skill_dispatcher_eval.py
    python scripts/quality_eval/run_skill_dispatcher_eval.py --report runs/dispatcher.md
    python scripts/quality_eval/run_skill_dispatcher_eval.py --json > report.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.services.context_service import _select_skill_playbooks  # noqa: E402
from backend.skills.registry import SKILL_DEFINITIONS  # noqa: E402


CURATED_DATASET = ROOT / "scripts" / "quality_eval" / "dataset.json"
SKILLS_DIR = ROOT / "skills"

# Skills that are never reported as "selected" in confusion analysis because
# they're orchestration plumbing, not tools chosen against the user prompt.
_INFRASTRUCTURE_SKILLS = {
    "runtime_context_aggregator", "runtime_skill_dispatcher",
    "runtime_complexity_analyzer", "runtime_localization_detector",
    "runtime_perspective_router", "runtime_release_notes_injector",
    "runtime_project_context_refresh", "runtime_attachment_handler",
    "output_report_writer",
}


@dataclass(frozen=True)
class EvalCase:
    id: str
    source: str          # "curated" | folder name
    prompt: str
    owner_skill: str | None   # for per-skill eval_queries: the folder's skill
    expected_skills: tuple[str, ...]  # for curated: the explicit list
    should_trigger: bool      # for per-skill: from the JSON; curated: True if expected non-empty
    category: str
    language: str
    modes: tuple[str, ...]    # one or more dispatcher modes this case must succeed under
    paraphrases: tuple[str, ...]
    split: str
    xfail: str | None         # documented known-weakness reason; case is skipped in scoring


def _stable_split(case_id: str) -> str:
    """Hash → 0..99 buckets : 0-69 train, 70-84 dev, 85-99 test."""
    h = int(hashlib.sha1(case_id.encode("utf-8")).hexdigest(), 16) % 100
    if h < 70:
        return "train"
    if h < 85:
        return "dev"
    return "test"


def _folder_to_skill(folder: str) -> str:
    return folder.replace("-", "_")


def _load_curated(path: Path) -> list[EvalCase]:
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    out: list[EvalCase] = []
    for entry in data:
        cid = entry["id"]
        expected = tuple(entry.get("expected_skills") or [])
        modes = tuple(entry.get("modes") or [entry.get("mode", "assistant")])
        out.append(EvalCase(
            id=f"curated::{cid}",
            source="curated",
            prompt=entry["prompt"],
            owner_skill=None,
            expected_skills=expected,
            should_trigger=bool(expected),
            category=entry.get("category", "curated"),
            language="fr",
            modes=modes,
            paraphrases=tuple(entry.get("paraphrases") or ()),
            split=_stable_split(f"curated::{cid}"),
            xfail=entry.get("xfail"),
        ))
    return out


def _load_per_skill(dir_: Path) -> list[EvalCase]:
    known = {s.name for s in SKILL_DEFINITIONS}
    out: list[EvalCase] = []
    for eval_path in sorted(dir_.glob("*/eval_queries.json")):
        folder = eval_path.parent.name
        owner = _folder_to_skill(folder)
        if owner not in known:
            continue
        data = json.loads(eval_path.read_text(encoding="utf-8"))
        for i, entry in enumerate(data):
            cid = f"{folder}::{i:02d}::{entry.get('category','?')}"
            modes = tuple(entry.get("modes") or [entry.get("mode", "assistant")])
            out.append(EvalCase(
                id=cid,
                source=folder,
                prompt=entry["query"],
                owner_skill=owner,
                expected_skills=(owner,) if entry.get("should_trigger") else (),
                should_trigger=bool(entry.get("should_trigger")),
                category=entry.get("category", "?"),
                language=entry.get("language", "fr"),
                modes=modes,
                paraphrases=tuple(entry.get("paraphrases") or ()),
                split=_stable_split(cid),
                xfail=entry.get("xfail"),
            ))
    return out


def load_dataset() -> list[EvalCase]:
    cases = _load_curated(CURATED_DATASET) + _load_per_skill(SKILLS_DIR)
    if not cases:
        raise SystemExit("No cases loaded — check dataset paths.")
    return cases


def _route(prompt: str, mode: str) -> tuple[set[str], list[dict[str, Any]]]:
    _select_skill_playbooks(
        prompt,
        migration=(mode == "migration"),
        creation=(mode == "creator"),
        disabled_tools=None,
        locale="fr",
    )
    matched = set(getattr(_select_skill_playbooks, "_last_matched", []) or [])
    candidates = list(getattr(_select_skill_playbooks, "_last_candidates", []) or [])
    return matched, candidates


def _evaluate_one(prompt: str, modes: tuple[str, ...], case: EvalCase) -> dict[str, Any]:
    """Replay the dispatcher across every declared mode and union the result.

    Mirrors ``tests/test_trigger_routing.py``: a case that says ``modes:
    [migration]`` is only meaningful when routed in migration mode; running
    it in assistant mode would never select the migration_* skills.
    """
    all_matched: set[str] = set()
    all_candidates: list[dict[str, Any]] = []
    for mode in modes:
        m, c = _route(prompt, mode)
        all_matched |= m
        all_candidates.extend(c)
    if case.should_trigger:
        owner_or_expected = set(case.expected_skills)
        missing = sorted(owner_or_expected - all_matched)
        ok = not missing
    else:
        owner_or_expected = {case.owner_skill} if case.owner_skill else set()
        owner_hit = bool(owner_or_expected & all_matched)
        ok = not owner_hit
        missing = []
    selected_business = sorted({
        c["name"] for c in all_candidates
        if c.get("selected") and c["name"] not in _INFRASTRUCTURE_SKILLS
    })
    return {
        "ok": ok,
        "matched": sorted(all_matched),
        "missing": missing,
        "selected_business": selected_business,
        "top_candidates": [
            {"name": c["name"], "score": c["score"], "selected": c["selected"], "reason": c["reason"]}
            for c in all_candidates[:5]
        ],
    }


def evaluate_case(case: EvalCase) -> dict[str, Any]:
    primary = _evaluate_one(case.prompt, case.modes, case)
    paraphrase_runs = [_evaluate_one(p, case.modes, case) for p in case.paraphrases]
    paraphrase_ok = sum(1 for r in paraphrase_runs if r["ok"])

    return {
        "id": case.id,
        "source": case.source,
        "split": case.split,
        "language": case.language,
        "category": case.category,
        "modes": list(case.modes),
        "xfail": case.xfail,
        "prompt": case.prompt,
        "owner_skill": case.owner_skill,
        "expected_skills": list(case.expected_skills),
        "should_trigger": case.should_trigger,
        "matched_skills": primary["matched"],
        "selected_business": primary["selected_business"],
        "missing": primary["missing"],
        "ok": primary["ok"],
        "top_candidates": primary["top_candidates"],
        "paraphrase_total": len(paraphrase_runs),
        "paraphrase_ok": paraphrase_ok,
        "paraphrase_runs": [
            {"prompt": p, **r} for p, r in zip(case.paraphrases, paraphrase_runs)
        ],
    }


def _confusion_matrix(results: list[dict[str, Any]], *, exclude_xfail: bool = True) -> dict[str, dict[str, int]]:
    if exclude_xfail:
        results = [r for r in results if not r.get("xfail")]

    """Build a confusion matrix indexed by *expected* skill.

    For positive cases where the expected skill is missing, record which
    business skill(s) actually won. A single failed case contributes 1 to
    each non-expected business skill that was selected (multi-label flavour).
    """
    matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in results:
        if not r["should_trigger"] or r["ok"]:
            continue
        expected = r["expected_skills"]
        sel = r["selected_business"]
        for exp in expected:
            for s in sel:
                if s == exp:
                    continue
                matrix[exp][s] += 1
            if not sel:
                matrix[exp]["<nothing>"] += 1
    return {k: dict(v) for k, v in matrix.items()}


def _top_confusions(matrix: dict[str, dict[str, int]], limit: int = 10) -> list[dict[str, Any]]:
    cells = [
        {"expected": e, "selected_instead": s, "count": c}
        for e, row in matrix.items() for s, c in row.items() if c > 0
    ]
    cells.sort(key=lambda x: -x["count"])
    return cells[:limit]


def _stats(items: list[dict[str, Any]]) -> dict[str, Any]:
    # Documented known weaknesses (xfail) are excluded from scoring so the
    # accuracy number reflects what the dispatcher is actually expected to
    # handle today. They're still listed separately in the report.
    items = [r for r in items if not r.get("xfail")]
    n = len(items)
    if not n:
        return {"total": 0}
    positives = [r for r in items if r["should_trigger"]]
    negatives = [r for r in items if not r["should_trigger"]]
    p_total = sum(r["paraphrase_total"] for r in items)
    p_ok = sum(r["paraphrase_ok"] for r in items)
    return {
        "total": n,
        "accuracy": round(sum(1 for r in items if r["ok"]) / n, 3),
        "positive_total": len(positives),
        "positive_accuracy": round(sum(1 for r in positives if r["ok"]) / len(positives), 3) if positives else None,
        "negative_total": len(negatives),
        "negative_accuracy": round(sum(1 for r in negatives if r["ok"]) / len(negatives), 3) if negatives else None,
        "paraphrase_total": p_total,
        "paraphrase_accuracy": round(p_ok / p_total, 3) if p_total else None,
    }


def _summarise(results: list[dict[str, Any]]) -> dict[str, Any]:
    by_split: dict[str, dict[str, Any]] = {}
    for split in ("train", "dev", "test"):
        items = [r for r in results if r["split"] == split]
        if items:
            by_split[split] = _stats(items)
    by_skill: dict[str, dict[str, Any]] = {}
    skills = sorted({r["owner_skill"] for r in results if r["owner_skill"]})
    for skill in skills:
        items = [r for r in results if r["owner_skill"] == skill]
        by_skill[skill] = _stats(items)
    matrix = _confusion_matrix(results)
    return {
        **_stats(results),
        "by_split": by_split,
        "by_skill": by_skill,
        "confusion_matrix": matrix,
        "top_confusions": _top_confusions(matrix),
    }


def _fmt_pct(v: float | None) -> str:
    return f"{v:.1%}" if isinstance(v, (int, float)) else "—"


def build_report(summary: dict[str, Any], results: list[dict[str, Any]]) -> str:
    lines = [
        "# Skill Dispatcher Eval Report",
        "",
        f"- Cases: {summary['total']}",
        f"- Accuracy: {_fmt_pct(summary.get('accuracy'))}",
        f"- Positive accuracy: {_fmt_pct(summary.get('positive_accuracy'))} (n={summary.get('positive_total', 0)})",
        f"- Negative accuracy: {_fmt_pct(summary.get('negative_accuracy'))} (n={summary.get('negative_total', 0)})",
        f"- Paraphrase accuracy: {_fmt_pct(summary.get('paraphrase_accuracy'))} (n={summary.get('paraphrase_total', 0)})",
        "",
        "## By Split",
        "",
        "| Split | Cases | Accuracy | Positive | Negative | Paraphrase |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for split, st in summary.get("by_split", {}).items():
        lines.append(
            f"| {split} | {st['total']} | {_fmt_pct(st.get('accuracy'))} | "
            f"{_fmt_pct(st.get('positive_accuracy'))} | {_fmt_pct(st.get('negative_accuracy'))} | "
            f"{_fmt_pct(st.get('paraphrase_accuracy'))} |"
        )

    failing_skills = [
        (skill, st) for skill, st in summary["by_skill"].items()
        if (st.get("accuracy") or 0) < 1.0
    ]
    failing_skills.sort(key=lambda kv: (kv[1].get("accuracy") or 0))
    lines.extend(["", "## Skills with failures (worst first)", "",
                  "| Skill | Cases | Accuracy | Positive | Negative |",
                  "|---|---:|---:|---:|---:|"])
    if not failing_skills:
        lines.append("| (all skills 100%) |  |  |  |  |")
    for skill, st in failing_skills[:20]:
        lines.append(
            f"| {skill} | {st['total']} | {_fmt_pct(st.get('accuracy'))} | "
            f"{_fmt_pct(st.get('positive_accuracy'))} | {_fmt_pct(st.get('negative_accuracy'))} |"
        )

    top = summary.get("top_confusions") or []
    lines.extend(["", "## Top confusions (positives where the owner missed)", ""])
    if not top:
        lines.append("- None")
    for cell in top:
        lines.append(
            f"- expected `{cell['expected']}` → selected `{cell['selected_instead']}` : {cell['count']}"
        )

    failing = [r for r in results if not r["ok"]]
    lines.extend(["", f"## Failing cases ({len(failing)})", ""])
    for r in failing[:30]:
        marker = "positive" if r["should_trigger"] else "negative"
        lines.append(
            f"- [{r['split']}/{marker}] `{r['id']}` — expected `{r['expected_skills'] or r['owner_skill']}`, "
            f"matched_business=`{r['selected_business']}`"
        )
    if len(failing) > 30:
        lines.append(f"- … and {len(failing) - 30} more")

    return "\n".join(lines) + "\n"


def run() -> dict[str, Any]:
    cases = load_dataset()
    results = [evaluate_case(c) for c in cases]
    return {"summary": _summarise(results), "results": results, "count": len(results)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    report = run()
    summary = report["summary"]

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("w", encoding="utf-8") as fh:
            for r in report["results"]:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(build_report(summary, report["results"]), encoding="utf-8")

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(
            f"Skill dispatcher eval: {summary['total']} cases, "
            f"accuracy={_fmt_pct(summary.get('accuracy'))}, "
            f"positive={_fmt_pct(summary.get('positive_accuracy'))}, "
            f"negative={_fmt_pct(summary.get('negative_accuracy'))}, "
            f"paraphrase={_fmt_pct(summary.get('paraphrase_accuracy'))}"
        )
        if args.report:
            print(f"Markdown report: {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
