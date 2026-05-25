#!/usr/bin/env python3
"""LLM-as-judge for response traces produced against the agent eval dataset.

Reads:
- ``--dataset``   : the agent eval JSONL (criteria, expected_agent, …).
- ``--responses`` : JSONL with ``{id, response_text, tool_calls?, events?}``
                    keyed by case id (produced by an out-of-band run that
                    actually hits the backend for each prompt).

Writes:
- ``--out``       : JSONL compatible with ``run_agent_response_eval.py
                    --responses``, i.e. each row carries
                    ``{id, response_text, scores: {odoo_accuracy, answer_quality, handoff_quality}}``.

Design rules:
- Same model for every grade in a run, so scores are comparable across runs
  (rubric drift = grader drift, not progress).
- Same rubric, derived from the case's ``criteria``. The judge sees the
  prompt, the criteria, the response, and (when present) the tool calls.
- Never auto-runs in CI. The user invokes it manually with their own key.

Cost note: 200 cases × ~3k tokens prompt + ~600 tokens output ≈ <0.50 €
with claude-opus-4-7 today. Run on dev split only during iteration.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET = ROOT / "scripts/quality_eval/agent_response_eval.jsonl"

JUDGE_MODEL = "claude-opus-4-7"

SYSTEM_PROMPT = """Tu es un évaluateur expert Odoo qui note des réponses d'agent IA.

Pour chaque réponse, tu attribues 3 scores entiers sur 20 :

1. `odoo_accuracy` (0-20): exactitude technique/fonctionnelle Odoo (versions, modèles, ORM, fluxmétier, sécurité, comportement réel d'Odoo). 20 = parfait, 10 = correct mais incomplet, 0 = faux ou inventé.

2. `answer_quality` (0-20): la réponse traite-t-elle réellement la question, en respectant les `criteria` listés ? Cohérente, actionnable, sans bullshit ni délayage. 20 = ce qu'un consultant senior aurait écrit, 0 = hors-sujet ou vide.

3. `handoff_quality` (0-20): l'agent reste-t-il dans son rôle et propose-t-il un handoff propre si la suite sort de son périmètre ? 20 = parfaite délimitation de rôle, 0 = empiète ou rate un handoff évident.

Tu réponds uniquement en JSON strict :
{"odoo_accuracy": <int>, "answer_quality": <int>, "handoff_quality": <int>, "rationale": "<200 chars max>"}

Pas de markdown, pas de commentaire. Tu juges sévèrement : 20 est rare, 15-17 est un bon score.
"""

USER_TEMPLATE = """## Case

Prompt utilisateur:
{prompt}

Agent attendu: {expected_agent}
Critères de réponse:
{criteria}

## Réponse de l'agent ({selected_agent})

{response_text}

{tool_calls_block}

Note maintenant.
"""


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def _build_user_prompt(case: dict, trace: dict) -> str:
    criteria = "\n".join(f"- {c}" for c in case.get("criteria") or [])
    tool_calls = trace.get("tool_calls") or []
    if tool_calls:
        block = "## Outils appelés\n\n" + "\n".join(
            f"- {t.get('name')}({json.dumps(t.get('args') or {}, ensure_ascii=False)[:200]})"
            for t in tool_calls
        )
    else:
        block = ""
    return USER_TEMPLATE.format(
        prompt=case["prompt"],
        expected_agent=case["expected_agent"],
        criteria=criteria or "- (none)",
        selected_agent=trace.get("selected_agent") or case["expected_agent"],
        response_text=trace.get("response_text") or "(empty)",
        tool_calls_block=block,
    )


def _grade(client, case: dict, trace: dict) -> dict[str, Any]:
    user = _build_user_prompt(case, trace)
    msg = client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=400,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(b.text for b in msg.content if hasattr(b, "text")).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # The judge violated the format. Surface the issue without failing the run.
        return {"odoo_accuracy": None, "answer_quality": None, "handoff_quality": None,
                "rationale": f"unparsable judge output: {text[:200]}"}
    return {
        "odoo_accuracy": int(data.get("odoo_accuracy", 0)),
        "answer_quality": int(data.get("answer_quality", 0)),
        "handoff_quality": int(data.get("handoff_quality", 0)),
        "rationale": str(data.get("rationale") or "")[:400],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--responses", type=Path, required=True,
                        help="JSONL of {id, response_text, tool_calls?} from a backend run")
    parser.add_argument("--out", type=Path, required=True,
                        help="JSONL judge scores, feed to run_agent_response_eval.py --responses")
    parser.add_argument("--split", choices=("train", "dev", "test", "all"), default="dev",
                        help="only judge cases of this split (default dev)")
    parser.add_argument("--limit", type=int, default=0, help="stop after N cases (0=all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="don't call the API, emit a placeholder scores=null per case")
    args = parser.parse_args()

    cases = {c["id"]: c for c in _load_jsonl(args.dataset)}
    traces = {t["id"]: t for t in _load_jsonl(args.responses)}

    to_grade = []
    for cid, case in cases.items():
        if args.split != "all" and case.get("split") != args.split:
            continue
        if cid not in traces:
            continue
        to_grade.append(cid)
    if args.limit:
        to_grade = to_grade[: args.limit]

    if not to_grade:
        print(f"No cases to grade (split={args.split}, traces={len(traces)}).", file=sys.stderr)
        return 1

    client = None
    if not args.dry_run:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("ANTHROPIC_API_KEY not set. Use --dry-run to validate the pipeline without API calls.", file=sys.stderr)
            return 2
        try:
            import anthropic  # type: ignore
        except ImportError:
            print("pip install anthropic", file=sys.stderr)
            return 2
        client = anthropic.Anthropic()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as fh:
        for i, cid in enumerate(to_grade, start=1):
            case, trace = cases[cid], traces[cid]
            if args.dry_run:
                scores = {"odoo_accuracy": None, "answer_quality": None,
                          "handoff_quality": None, "rationale": "dry-run"}
            else:
                scores = _grade(client, case, trace)
            row = {"id": cid, "response_text": trace.get("response_text"),
                   "tool_calls": trace.get("tool_calls"), "events": trace.get("events"),
                   "scores": {k: v for k, v in scores.items() if k != "rationale"},
                   "judge_rationale": scores.get("rationale"),
                   "judge_model": JUDGE_MODEL}
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            fh.flush()
            print(f"[{i}/{len(to_grade)}] {cid}: {scores}", file=sys.stderr)

    print(f"Wrote {len(to_grade)} graded rows to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
