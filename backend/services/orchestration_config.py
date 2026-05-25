"""Declarative configuration loader for agent orchestration.

The config is intentionally narrower than the skills dispatcher. It describes
which prompt signal families exist and which short sequential agent handoffs
are allowed; runtime still owns conservative multi-task detection.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from backend.agents.registry import list_agents
from backend.services.ai_service import (
    PERSPECTIVE_ARCHITECT,
    PERSPECTIVE_BA,
    PERSPECTIVE_DEVELOPER,
    PERSPECTIVE_SUPPORT,
)

_logger = logging.getLogger(__name__)
_CONFIG_DIR = Path(__file__).resolve().parents[2] / "orchestration"

AgentRoleInRule = Literal["primary", "executor", "synthesizer"]


class OrchestrationConfigError(ValueError):
    """Raised when declarative orchestration config is invalid."""


@dataclass(frozen=True)
class OrchestrationStepRule:
    agent: str
    role: AgentRoleInRule
    purpose: str


@dataclass(frozen=True)
class OrchestrationRule:
    rule_id: str
    required_signals: tuple[str, ...]
    primary_agent: str
    final_agent: str
    confidence: float
    reason: str
    sequence: tuple[OrchestrationStepRule, ...]


@dataclass(frozen=True)
class OrchestrationConfig:
    signal_families: dict[str, tuple[str, ...]]
    rules: tuple[OrchestrationRule, ...]


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise OrchestrationConfigError(f"Missing orchestration config file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise OrchestrationConfigError(f"Invalid JSON in orchestration config file: {path}") from exc


def _known_agents() -> set[str]:
    agents = {agent.name for agent in list_agents()}
    agents.update({
        PERSPECTIVE_ARCHITECT,
        PERSPECTIVE_BA,
        PERSPECTIVE_DEVELOPER,
        PERSPECTIVE_SUPPORT,
    })
    return agents


def _validate_signal_families(raw: Any) -> dict[str, tuple[str, ...]]:
    if not isinstance(raw, dict) or not raw:
        raise OrchestrationConfigError("signals.json must be a non-empty object")

    families: dict[str, tuple[str, ...]] = {}
    for name, terms in raw.items():
        if not isinstance(name, str) or not name.strip():
            raise OrchestrationConfigError("signal family names must be non-empty strings")
        if not isinstance(terms, list) or not terms:
            raise OrchestrationConfigError(f"signal family {name!r} must define a non-empty term list")
        normalized_terms = tuple(str(term).strip().casefold() for term in terms if str(term).strip())
        if not normalized_terms:
            raise OrchestrationConfigError(f"signal family {name!r} has no usable terms")
        families[name.strip()] = normalized_terms
    return families


def _coerce_sequence(rule_id: str, raw: Any, known_agents: set[str]) -> tuple[OrchestrationStepRule, ...]:
    if not isinstance(raw, list) or len(raw) != 2:
        raise OrchestrationConfigError(f"rule {rule_id!r} must define exactly 2 sequence steps")

    steps: list[OrchestrationStepRule] = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise OrchestrationConfigError(f"rule {rule_id!r} sequence step {index} must be an object")
        agent = str(item.get("agent") or "").strip()
        role = str(item.get("role") or "").strip()
        purpose = str(item.get("purpose") or "").strip()
        if agent not in known_agents:
            raise OrchestrationConfigError(f"rule {rule_id!r} references unknown agent {agent!r}")
        if role not in {"executor", "synthesizer"}:
            raise OrchestrationConfigError(f"rule {rule_id!r} step {index} has invalid role {role!r}")
        if not purpose:
            raise OrchestrationConfigError(f"rule {rule_id!r} step {index} must define a purpose")
        steps.append(OrchestrationStepRule(agent=agent, role=role, purpose=purpose))  # type: ignore[arg-type]
    return tuple(steps)


def _validate_rules(raw: Any, families: dict[str, tuple[str, ...]]) -> tuple[OrchestrationRule, ...]:
    if not isinstance(raw, list) or not raw:
        raise OrchestrationConfigError("rules.json must be a non-empty array")

    known_agents = _known_agents()
    rules: list[OrchestrationRule] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise OrchestrationConfigError("each orchestration rule must be an object")
        rule_id = str(item.get("ruleId") or "").strip()
        if not rule_id:
            raise OrchestrationConfigError("each orchestration rule must define ruleId")
        if rule_id in seen:
            raise OrchestrationConfigError(f"duplicate orchestration ruleId {rule_id!r}")
        seen.add(rule_id)

        required_raw = item.get("requiredSignals")
        if not isinstance(required_raw, list) or len(required_raw) != 2:
            raise OrchestrationConfigError(f"rule {rule_id!r} must require exactly 2 signal families")
        required_signals = tuple(str(signal).strip() for signal in required_raw if str(signal).strip())
        if len(required_signals) != 2:
            raise OrchestrationConfigError(f"rule {rule_id!r} must require exactly 2 signal families")
        unknown_signals = [signal for signal in required_signals if signal not in families]
        if unknown_signals:
            raise OrchestrationConfigError(
                f"rule {rule_id!r} references unknown signal family {unknown_signals[0]!r}"
            )

        primary_agent = str(item.get("primaryAgent") or "").strip()
        final_agent = str(item.get("finalAgent") or "").strip()
        if primary_agent not in known_agents:
            raise OrchestrationConfigError(f"rule {rule_id!r} references unknown primaryAgent {primary_agent!r}")
        if final_agent not in known_agents:
            raise OrchestrationConfigError(f"rule {rule_id!r} references unknown finalAgent {final_agent!r}")

        reason = str(item.get("reason") or "").strip()
        if not reason:
            raise OrchestrationConfigError(f"rule {rule_id!r} must define a reason")
        try:
            confidence = float(item.get("confidence", 0.8))
        except (TypeError, ValueError) as exc:
            raise OrchestrationConfigError(f"rule {rule_id!r} has invalid confidence") from exc
        if not 0 <= confidence <= 1:
            raise OrchestrationConfigError(f"rule {rule_id!r} confidence must be between 0 and 1")

        sequence = _coerce_sequence(rule_id, item.get("sequence"), known_agents)
        if sequence[0].agent != primary_agent or sequence[-1].agent != final_agent:
            raise OrchestrationConfigError(
                f"rule {rule_id!r} sequence must start with primaryAgent and end with finalAgent"
            )

        rules.append(OrchestrationRule(
            rule_id=rule_id,
            required_signals=required_signals,
            primary_agent=primary_agent,
            final_agent=final_agent,
            confidence=confidence,
            reason=reason,
            sequence=sequence,
        ))
    return tuple(rules)


def load_orchestration_config(config_dir: Path = _CONFIG_DIR) -> OrchestrationConfig:
    families = _validate_signal_families(_load_json(config_dir / "signals.json"))
    rules = _validate_rules(_load_json(config_dir / "rules.json"), families)
    return OrchestrationConfig(signal_families=families, rules=rules)


@lru_cache(maxsize=1)
def get_orchestration_config() -> OrchestrationConfig:
    return load_orchestration_config(_CONFIG_DIR)


def get_orchestration_config_or_none() -> OrchestrationConfig | None:
    try:
        return get_orchestration_config()
    except OrchestrationConfigError as exc:
        _logger.error("Invalid orchestration config; falling back to single-agent decisions: %s", exc)
        return None
