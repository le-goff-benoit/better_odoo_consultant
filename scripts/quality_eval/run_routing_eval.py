#!/usr/bin/env python3
"""Harnais d'éval routing — phase 1 : skill selection only.

Pour chaque prompt du dataset, on rejoue ``_select_skill_playbooks`` (sans
appel LLM) et on compare les skills sélectionnés à la liste attendue. C'est
la couche déterministe : si le routing est faux, la qualité de la réponse
ne pourra pas être bonne.

Phase 2 (``run_quality_eval.py``, à activer manuellement) prendrait la même
liste de prompts et appellerait réellement le backend avec/sans skills pour
mesurer la qualité de réponse — coûteux en API, à lancer ponctuellement.

Usage:
    python scripts/quality_eval/run_routing_eval.py
    python scripts/quality_eval/run_routing_eval.py --json > report.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.services.context_service import _select_skill_playbooks  # noqa: E402


DATASET = Path(__file__).parent / "dataset.json"


def evaluate(prompt: str, mode: str = "assistant") -> tuple[list[str], list[dict]]:
    _select_skill_playbooks(
        prompt,
        migration=(mode == "migration"),
        creation=(mode == "creator"),
        disabled_tools=None,
        locale="fr",
    )
    matched = list(getattr(_select_skill_playbooks, "_last_matched", []) or [])
    candidates = list(getattr(_select_skill_playbooks, "_last_candidates", []) or [])
    return matched, candidates


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="emit JSON report instead of human text")
    parser.add_argument("--dataset", type=Path, default=DATASET)
    args = parser.parse_args()

    data = json.loads(args.dataset.read_text(encoding="utf-8"))

    results = []
    correct = 0
    total = 0
    for entry in data:
        mode = entry.get("mode", "assistant")
        matched, candidates = evaluate(entry["prompt"], mode=mode)
        expected = set(entry.get("expected_skills") or [])
        matched_set = set(matched)
        # Success: all expected skills are present AND no extra metier skill
        # is selected when expected list is empty.
        missing = expected - matched_set
        if expected:
            ok = not missing
        else:
            # No skill expected — accept core/template skills but flag
            # routed tool skills as failure.
            tool_leaks = [m for m in matched_set if not m.startswith("runtime_") and m != "output_report_writer"]
            ok = not tool_leaks
        total += 1
        if ok:
            correct += 1
        results.append({
            "id": entry["id"],
            "prompt": entry["prompt"],
            "mode": mode,
            "expected_skills": sorted(expected),
            "matched_skills": sorted(matched_set),
            "missing": sorted(missing),
            "extra": sorted(matched_set - expected) if expected else sorted(matched_set),
            "ok": ok,
            "top_candidates": [
                {"name": c["name"], "score": c["score"], "selected": c["selected"], "reason": c["reason"]}
                for c in candidates[:5]
            ],
        })

    report = {
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total, 3) if total else 0.0,
        "results": results,
    }

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    print(f"Routing accuracy: {correct}/{total} ({report['accuracy']:.0%})\n")
    for r in results:
        status = "OK " if r["ok"] else "KO "
        print(f"{status} [{r['id']}] {r['prompt'][:70]}")
        if not r["ok"]:
            print(f"    expected={r['expected_skills']} matched={r['matched_skills']}")
            if r["missing"]:
                print(f"    missing : {r['missing']}")
            if r["extra"] and not r["expected_skills"]:
                print(f"    leaked  : {r['extra']}")
    return 0 if correct == total else 1


if __name__ == "__main__":
    sys.exit(main())
