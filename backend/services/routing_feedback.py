"""Lightweight routing-quality feedback log.

Persists one JSON line per AI turn under
``~/.odoo-consultant/routing-feedback.jsonl``. Each line records the
inputs that drove the dispatcher (prompt, agent, mode, locale) and the
routing decision (skills selected, confidence, top candidates). When the
user reformulates within the next two turns (markers like "non",
"plutôt", "actually", "rather"), the **previous** record is updated with
``reformulated=True``.

The log is read by the ``routing_self_audit`` skill to spot weak spots
in the dispatcher. It never leaves the local machine.

Failures are swallowed: routing quality logging must NEVER break a turn.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from threading import Lock
from typing import Any, Optional

_logger = logging.getLogger(__name__)

_LOG_DIR = Path.home() / ".odoo-consultant"
_LOG_FILE = _LOG_DIR / "routing-feedback.jsonl"
_LOCK = Lock()
_MAX_ENTRIES = 5000  # rolling cap; older entries are truncated on rotation

# Sentinel that the next turn started by disagreeing with the previous answer.
# Kept conservative: false positives would mislabel valid routing as bad.
_REFORMULATION_MARKERS = re.compile(
    r"^(?:non[,. ]|plut[ôo]t |en fait |actually[,. ]|rather[,. ]|"
    r"je voulais dire |i meant |c'est pas [çc]a |that'?s not what)",
    re.IGNORECASE,
)


def _safe_write(payload: dict[str, Any]) -> None:
    try:
        _LOG_DIR.mkdir(parents=True, exist_ok=True)
        with _LOCK, _LOG_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception as exc:  # pragma: no cover — best effort
        _logger.debug("routing_feedback write failed: %s", exc)


def _rotate_if_needed() -> None:
    try:
        if not _LOG_FILE.is_file():
            return
        with _LOG_FILE.open("r", encoding="utf-8") as fh:
            lines = fh.readlines()
        if len(lines) <= _MAX_ENTRIES:
            return
        with _LOCK, _LOG_FILE.open("w", encoding="utf-8") as fh:
            fh.writelines(lines[-_MAX_ENTRIES:])
    except Exception as exc:  # pragma: no cover
        _logger.debug("routing_feedback rotate failed: %s", exc)


def log_turn(
    *,
    prompt: str,
    agent: Optional[str],
    mode: str,
    locale: Optional[str],
    skills: list[str],
    confidence: Optional[dict[str, Any]] = None,
    candidates: Optional[list[dict[str, Any]]] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Record one routing decision. Never raises."""
    if os.environ.get("BETTER_ROUTING_FEEDBACK", "1") == "0":
        return
    payload = {
        "ts": time.time(),
        "prompt": (prompt or "")[:600],  # cap for disk hygiene
        "agent": agent,
        "mode": mode,
        "locale": locale,
        "skills": list(skills or []),
        "confidence": confidence or {},
        # Keep only the top 6 candidates to bound line size.
        "candidates": (candidates or [])[:6],
        "reformulated": False,
    }
    if extra:
        payload.update(extra)
    _safe_write(payload)
    _rotate_if_needed()


def mark_previous_as_reformulated(*, agent: Optional[str] = None) -> bool:
    """If the last logged turn matches ``agent`` (or no agent filter), set
    ``reformulated=True`` on it. Returns True if a record was updated."""
    if os.environ.get("BETTER_ROUTING_FEEDBACK", "1") == "0":
        return False
    try:
        if not _LOG_FILE.is_file():
            return False
        with _LOCK:
            with _LOG_FILE.open("r", encoding="utf-8") as fh:
                lines = fh.readlines()
            if not lines:
                return False
            try:
                last = json.loads(lines[-1])
            except Exception:
                return False
            if agent and last.get("agent") != agent:
                return False
            if last.get("reformulated"):
                return False
            last["reformulated"] = True
            lines[-1] = json.dumps(last, ensure_ascii=False) + "\n"
            with _LOG_FILE.open("w", encoding="utf-8") as fh:
                fh.writelines(lines)
        return True
    except Exception as exc:  # pragma: no cover
        _logger.debug("routing_feedback mark failed: %s", exc)
        return False


def is_reformulation(prompt: str) -> bool:
    """Return True when *prompt* looks like the user is correcting the
    previous answer's direction."""
    if not prompt:
        return False
    head = prompt.strip()[:80]
    return bool(_REFORMULATION_MARKERS.match(head))


def read_recent(limit: int = 200) -> list[dict[str, Any]]:
    """Return up to *limit* most recent log entries (oldest → newest)."""
    if not _LOG_FILE.is_file():
        return []
    try:
        with _LOG_FILE.open("r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except Exception:
        return []
    out: list[dict[str, Any]] = []
    for line in lines[-limit:]:
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


def aggregate(limit: int = 1000) -> dict[str, Any]:
    """Compute aggregate quality metrics over the recent log."""
    entries = read_recent(limit=limit)
    if not entries:
        return {"count": 0, "agents": {}, "low_confidence_rate": 0.0, "reformulation_rate": 0.0, "top_reformulated_skills": []}
    total = len(entries)
    low = sum(1 for e in entries if (e.get("confidence") or {}).get("level") == "low")
    reformulated = [e for e in entries if e.get("reformulated")]
    agents: dict[str, int] = {}
    for e in entries:
        ag = e.get("agent") or "?"
        agents[ag] = agents.get(ag, 0) + 1
    skill_misroutes: dict[str, int] = {}
    for e in reformulated:
        for s in e.get("skills") or []:
            skill_misroutes[s] = skill_misroutes.get(s, 0) + 1
    top_skills = sorted(skill_misroutes.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
    return {
        "count": total,
        "agents": agents,
        "low_confidence_rate": round(low / total, 3),
        "reformulation_rate": round(len(reformulated) / total, 3),
        "top_reformulated_skills": top_skills,
    }
