#!/usr/bin/env python3
"""Promote real-world routing-feedback entries into eval candidates.

Reads ``~/.odoo-consultant/routing-feedback.jsonl`` (written by
``backend.services.routing_feedback``) and surfaces the most useful entries
to add to the dev split of ``agent_response_eval.jsonl``:

- ``reformulated=True`` (user pushed back on the previous turn)
- ``confidence == "low"`` (router was unsure)
- ``drift=True`` (agent drift signal)

Each candidate is anonymised (only prompt + routing decision kept, no profile
or company data) and printed as a JSONL row ready to be **manually reviewed**
then appended to the dev split. The consultant must:

1. Set ``expected_agent`` (the router's choice is shown but unverified).
2. Set ``expected_skills`` / ``forbidden_skills`` if known.
3. Adjust ``criteria`` to the situation.
4. Set ``split: "dev"`` (never ``train`` or ``test`` for promoted entries —
   we want the held-out signal).

Usage::

    python scripts/quality_eval/promote_feedback.py --limit 20
    python scripts/quality_eval/promote_feedback.py --filter reformulated
    python scripts/quality_eval/promote_feedback.py --out runs/candidates.jsonl
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

LOG_FILE = Path.home() / ".odoo-consultant" / "routing-feedback.jsonl"

KEEP_KEYS = ("ts", "prompt", "agent", "mode", "locale", "skills", "confidence", "candidates", "reformulated", "drift")


def _conf_level(entry: dict) -> str:
    """Extract the confidence level string from a feedback entry.

    Older entries stored a flat string; newer ones store
    ``{"level": "low"|"medium"|"high", ...}``.
    """
    conf = entry.get("confidence")
    if isinstance(conf, dict):
        return str(conf.get("level") or "").lower()
    if isinstance(conf, str):
        return conf.lower()
    return ""


def load(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def candidate(entry: dict) -> dict:
    """Strip an entry down to fields safe to share + skeleton eval fields."""
    base = {k: entry.get(k) for k in KEEP_KEYS if k in entry}
    return {
        "id": f"promote-{base.get('ts', 'unknown')}-TODO",
        "prompt": base.get("prompt", ""),
        "expected_agent": base.get("agent", ""),  # ROUTER GUESS — verify before commit
        "mode": base.get("mode", "assistant"),
        "context": {},
        "expected_skills": list(base.get("skills") or []),
        "forbidden_skills": [],
        "criteria": [
            "TODO — fill at least two criteria before merging",
            "TODO — describe the desired answer shape",
        ],
        "difficulty": "medium",
        "tags": ["promoted-from-feedback"],
        "golden": False,
        "expected_handoff": [],
        "split": "dev",
        "_router_decision": {
            "confidence": base.get("confidence"),
            "candidates": base.get("candidates"),
            "reformulated": base.get("reformulated"),
            "drift": base.get("drift"),
        },
    }


def select(entries: list[dict], filter_mode: str) -> list[dict]:
    if filter_mode == "reformulated":
        return [e for e in entries if e.get("reformulated")]
    if filter_mode == "low-confidence":
        return [e for e in entries if _conf_level(e) == "low"]
    if filter_mode == "drift":
        return [e for e in entries if e.get("drift")]
    # default: any of the above
    return [
        e for e in entries
        if e.get("reformulated") or e.get("drift") or _conf_level(e) == "low"
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--log", type=Path, default=LOG_FILE)
    parser.add_argument(
        "--filter", choices=("any", "reformulated", "low-confidence", "drift"),
        default="any",
    )
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--out", type=Path, default=None, help="write candidates JSONL")
    parser.add_argument("--summary", action="store_true", help="print summary stats instead of candidates")
    args = parser.parse_args()

    entries = load(args.log)
    if not entries:
        print(f"No feedback log at {args.log}", file=sys.stderr)
        return 1

    selected = select(entries, args.filter)[-args.limit:]
    if args.summary:
        c = Counter()
        for e in entries:
            if e.get("reformulated"):
                c["reformulated"] += 1
            if e.get("drift"):
                c["drift"] += 1
            if _conf_level(e) == "low":
                c["low-confidence"] += 1
        print(json.dumps({
            "total_entries": len(entries),
            "weak_signals": dict(c),
            "selected": len(selected),
        }, ensure_ascii=False, indent=2))
        return 0

    rows = [candidate(e) for e in selected]
    out_text = "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + ("\n" if rows else "")
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(out_text, encoding="utf-8")
        print(f"Wrote {len(rows)} candidates to {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(out_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
