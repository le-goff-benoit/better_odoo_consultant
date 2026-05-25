"""Tests for the meta-skills: routing_explain, routing_self_audit,
agent_handoff_propose (P2.3, P2.4, P1.3)."""
from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path

import pytest

from backend.services.context_service import _select_skill_playbooks

_REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_handler(skill_dir: str):
    """Load a handler.py from skills/<dir>/scripts/handler.py by path."""
    path = _REPO_ROOT / "skills" / skill_dir / "scripts" / "handler.py"
    spec = importlib.util.spec_from_file_location(f"handler_{skill_dir.replace('-', '_')}", path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Ctx:
    odoo = None
    source_path = None
    repo_path = None
    target_path = None
    loop = None


@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


def _run(loop, coro):
    return loop.run_until_complete(coro)


def test_routing_explain_handler_returns_candidates(event_loop):
    _select_skill_playbooks("compter les commandes de vente", migration=False)
    handler = _load_handler("routing-explain")
    out = _run(event_loop, handler.run({}, _Ctx()))
    assert out["ok"] is True
    assert "Décision de routage" in out["markdown"]
    assert isinstance(out["candidates"], list)
    assert isinstance(out["confidence"], dict)


def test_agent_handoff_propose_validates_target(event_loop):
    handler = _load_handler("agent-handoff-propose")
    out = _run(event_loop, handler.run({"from": "business_analyst", "to": "architect", "reason": "scoping done"}, _Ctx()))
    assert out["ok"] is True
    assert out["handoff"]["from"] == "business_analyst"
    assert out["handoff"]["to"] == "architect"
    text = out["markdown"].lower()
    assert "architect" in text


def test_agent_handoff_propose_rejects_unknown_target(event_loop):
    handler = _load_handler("agent-handoff-propose")
    out = _run(event_loop, handler.run({"from": "business_analyst", "to": "ghost_agent"}, _Ctx()))
    assert out["ok"] is False
    assert "unknown target" in out["error"]


def test_agent_handoff_propose_accepts_declared_target(event_loop):
    # All built-in agents declare the other three as allowed handoff targets.
    handler = _load_handler("agent-handoff-propose")
    out = _run(event_loop, handler.run({"from": "support", "to": "architect"}, _Ctx()))
    assert out["ok"] is True
    assert out["handoff"]["to"] == "architect"


def test_routing_self_audit_handles_empty_log(tmp_path, monkeypatch, event_loop):
    from backend.services import routing_feedback as rfb
    monkeypatch.setattr(rfb, "_LOG_FILE", tmp_path / "missing.jsonl")
    monkeypatch.setattr(rfb, "_LOG_DIR", tmp_path)
    handler = _load_handler("routing-self-audit")
    out = _run(event_loop, handler.run({"limit": 100}, _Ctx()))
    assert out["ok"] is True
    assert "Aucune entrée" in out["markdown"]
