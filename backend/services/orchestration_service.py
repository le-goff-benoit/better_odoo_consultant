"""Deterministic agent orchestration decisions for AI chat runs.

V1 intentionally supports only ``single_agent`` and short sequential runs.
Parallel review is documented in MULTI_AGENTS.md but kept out of runtime until
the traces, cost display and evals prove the sequential layer is stable.
"""
from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from typing import Literal, Optional

from .ai_service import PERSPECTIVE_ARCHITECT, PERSPECTIVE_BA, PERSPECTIVE_DEVELOPER, PERSPECTIVE_SUPPORT
from .orchestration_config import OrchestrationConfig, OrchestrationRule, get_orchestration_config_or_none

_logger = logging.getLogger(__name__)

OrchestrationMode = Literal["single_agent", "sequential_agents"]
AgentRoleInRun = Literal["primary", "executor", "synthesizer"]


@dataclass(frozen=True)
class PromptIntentSignals:
    has_multiple_tasks: bool = False
    asks_for_bug_diagnosis: bool = False
    asks_for_client_explanation: bool = False
    asks_for_business_scope: bool = False
    asks_for_architecture_decision: bool = False
    asks_for_implementation: bool = False
    asks_for_final_client_output: bool = False
    matched_signal_families: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {
            "hasMultipleTasks": self.has_multiple_tasks,
            "asksForBugDiagnosis": self.asks_for_bug_diagnosis,
            "asksForClientExplanation": self.asks_for_client_explanation,
            "asksForBusinessScope": self.asks_for_business_scope,
            "asksForArchitectureDecision": self.asks_for_architecture_decision,
            "asksForImplementation": self.asks_for_implementation,
            "asksForFinalClientOutput": self.asks_for_final_client_output,
            "matchedSignalFamilies": list(self.matched_signal_families),
        }


@dataclass(frozen=True)
class AgentRunStep:
    step: int
    agent: str
    purpose: str
    role: AgentRoleInRun

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "agent": self.agent,
            "purpose": self.purpose,
            "role": self.role,
        }


@dataclass(frozen=True)
class AgentOrchestrationDecision:
    mode: OrchestrationMode
    primary_agent: str
    final_agent: str
    reason: str
    confidence: float
    signals: PromptIntentSignals
    rule_id: str = "single_agent_default"
    decision_source: str = "runtime_default"
    triggered_rules: tuple[str, ...] = ()
    sequence: tuple[AgentRunStep, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict:
        return {
            "mode": self.mode,
            "primaryAgent": self.primary_agent,
            "finalAgent": self.final_agent,
            "reason": self.reason,
            "confidence": self.confidence,
            "ruleId": self.rule_id,
            "decisionSource": self.decision_source,
            "signals": self.signals.to_dict(),
            "triggeredRules": list(self.triggered_rules),
            "sequence": [step.to_dict() for step in self.sequence],
            "agents": [
                {
                    "name": step.agent,
                    "roleInRun": step.role,
                    "reason": step.purpose,
                }
                for step in self.sequence
            ] or [
                {
                    "name": self.final_agent,
                    "roleInRun": "primary",
                    "reason": self.reason,
                }
            ],
        }


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


_CONNECTOR_RE = re.compile(
    r"\b(puis|ensuite|après|apres|then|and then|before you|avant de|avant d'|et ensuite)\b"
)


def _has_ordered_connector(text: str, first_terms: tuple[str, ...], second_terms: tuple[str, ...]) -> bool:
    first_positions = [text.find(term) for term in first_terms if term in text]
    second_positions = [text.find(term) for term in second_terms if term in text]
    if not first_positions or not second_positions:
        return False
    first = min(p for p in first_positions if p >= 0)
    second = min(p for p in second_positions if p >= 0)
    if first >= second:
        return False
    between = text[first:second]
    return bool(_CONNECTOR_RE.search(between))


def _matched_families(text: str, signal_families: dict[str, tuple[str, ...]]) -> tuple[str, ...]:
    return tuple(
        name for name, terms in signal_families.items()
        if _has_any(text, terms)
    )


def _has_ordered_rule_pair(
    text: str,
    rule: OrchestrationRule,
    signal_families: dict[str, tuple[str, ...]],
) -> bool:
    first, second = rule.required_signals
    return _has_ordered_connector(text, signal_families[first], signal_families[second])


def _signals_match_rule(matched: tuple[str, ...], rule: OrchestrationRule) -> bool:
    matched_set = set(matched)
    return all(signal in matched_set for signal in rule.required_signals)


def _empty_config() -> OrchestrationConfig:
    return OrchestrationConfig(signal_families={}, rules=())


def extract_prompt_signals(prompt: str) -> PromptIntentSignals:
    config = get_orchestration_config_or_none() or _empty_config()
    text = (prompt or "").casefold()
    matched = _matched_families(text, config.signal_families)

    asks_for_bug_diagnosis = "technical_diagnosis" in matched
    asks_for_client_explanation = "client_output" in matched
    asks_for_business_scope = "business_scope" in matched
    asks_for_architecture_decision = "architecture_decision" in matched
    asks_for_implementation = "implementation_plan" in matched
    asks_for_final_client_output = "final_output" in matched or asks_for_client_explanation

    ordered_pairs = tuple(
        _has_ordered_rule_pair(text, rule, config.signal_families)
        for rule in config.rules
        if all(signal in config.signal_families for signal in rule.required_signals)
    )
    dependent_pair = any(
        _signals_match_rule(matched, rule)
        for rule in config.rules
    )
    explicit_multi = bool(_CONNECTOR_RE.search(text))
    final_output_pair = (
        bool(re.search(r"\b(analyse|analyser|diagnostique|diagnostiquer|diagnose|cadrer|clarifie|clarifier|propose|proposer)\b", text))
        and bool(re.search(r"\b(rédige|redige|prépare|prepare|explique|explain|plan|summary|résume|resume)\b", text))
    )
    decision_output_pair = (
        (asks_for_business_scope and asks_for_architecture_decision and bool(re.search(r"\b(cadrer|clarifie|clarifier|scope).+\b(module custom|architecture|design|décision|decision)\b", text))) or
        (asks_for_architecture_decision and asks_for_implementation and bool(re.search(r"\b(décide|decide|design|propose).+\b(plan|implementation|implémentation|implementation steps|développement|developpement)\b", text)))
    )
    has_multiple_tasks = bool(dependent_pair and (explicit_multi or any(ordered_pairs) or final_output_pair or decision_output_pair))

    return PromptIntentSignals(
        has_multiple_tasks=has_multiple_tasks,
        asks_for_bug_diagnosis=asks_for_bug_diagnosis,
        asks_for_client_explanation=asks_for_client_explanation,
        asks_for_business_scope=asks_for_business_scope,
        asks_for_architecture_decision=asks_for_architecture_decision,
        asks_for_implementation=asks_for_implementation,
        asks_for_final_client_output=asks_for_final_client_output,
        matched_signal_families=matched,
    )


def decide_orchestration(
    *,
    user_prompt: str,
    effective_agent: str,
    explicit_agent: Optional[str] = None,
    perspective_router_active: bool = True,
) -> AgentOrchestrationDecision:
    config = get_orchestration_config_or_none()
    signals = extract_prompt_signals(user_prompt)

    # Respect an explicit UI role unless the prompt itself asks for a dependent
    # two-step output. This keeps existing UX predictable.
    explicit_locked = bool(explicit_agent and explicit_agent != "auto")

    if config and signals.has_multiple_tasks:
        for rule in config.rules:
            if not _signals_match_rule(signals.matched_signal_families, rule):
                continue
            return AgentOrchestrationDecision(
                mode="sequential_agents",
                primary_agent=rule.primary_agent,
                final_agent=rule.final_agent,
                reason=rule.reason,
                confidence=rule.confidence,
                signals=signals,
                rule_id=rule.rule_id,
                decision_source="declarative",
                triggered_rules=(rule.rule_id,),
                sequence=tuple(
                    AgentRunStep(index, step.agent, step.purpose, step.role)
                    for index, step in enumerate(rule.sequence, start=1)
                ),
            )
    elif config is None:
        _logger.error("Orchestration config unavailable; keeping single-agent fallback for this turn")

    final_agent = effective_agent if perspective_router_active else PERSPECTIVE_DEVELOPER
    return AgentOrchestrationDecision(
        mode="single_agent",
        primary_agent=final_agent,
        final_agent=final_agent,
        reason=(
            "Agent explicite respecté ; aucun signal séquentiel prioritaire."
            if explicit_locked else
            "Single-agent par défaut ; aucun enchaînement dépendant détecté."
        ),
        confidence=1.0 if explicit_locked else 0.7,
        signals=signals,
        rule_id="single_agent_default",
        decision_source="runtime_default",
        triggered_rules=("single_agent_default",),
        sequence=(
            AgentRunStep(1, final_agent, "Répondre directement avec les skills routés pour ce tour.", "primary"),
        ),
    )
