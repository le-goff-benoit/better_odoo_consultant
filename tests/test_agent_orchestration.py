import json
from pathlib import Path

import pytest

from backend.services.ai_service import PERSPECTIVE_ARCHITECT, PERSPECTIVE_BA, PERSPECTIVE_DEVELOPER
from backend.services.orchestration_config import OrchestrationConfigError, load_orchestration_config
from backend.services.orchestration_service import decide_orchestration, extract_prompt_signals

_ORCHESTRATION_DIR = Path(__file__).resolve().parent.parent / "orchestration"


@pytest.mark.parametrize("prompt", [
    "Analyse cette traceback puis prépare un message client simple.",
    "Diagnostique l'erreur 500 et explique au client ce qui se passe.",
    "Diagnose the stack trace then translate into client terms.",
])
def test_bug_then_client_message_routes_developer_to_ba(prompt: str):
    decision = decide_orchestration(
        user_prompt=prompt,
        effective_agent=PERSPECTIVE_DEVELOPER,
        explicit_agent=None,
    )

    assert decision.mode == "sequential_agents"
    assert decision.primary_agent == PERSPECTIVE_DEVELOPER
    assert decision.final_agent == PERSPECTIVE_BA
    assert [step.agent for step in decision.sequence] == [PERSPECTIVE_DEVELOPER, PERSPECTIVE_BA]
    assert "technical_diagnosis->client_output" in decision.triggered_rules


@pytest.mark.parametrize("prompt", [
    "Clarifie le besoin métier puis propose une architecture Odoo.",
    "Peux-tu cadrer ce processus de vente et dire si un module custom est nécessaire ?",
    "Scope the business need then design the Odoo architecture.",
])
def test_business_scope_then_architecture_routes_ba_to_architect(prompt: str):
    decision = decide_orchestration(
        user_prompt=prompt,
        effective_agent=PERSPECTIVE_BA,
        explicit_agent=None,
    )

    assert decision.mode == "sequential_agents"
    assert decision.primary_agent == PERSPECTIVE_BA
    assert decision.final_agent == PERSPECTIVE_ARCHITECT
    assert "business_scope->architecture_decision" in decision.triggered_rules


@pytest.mark.parametrize("prompt", [
    "Propose l'architecture puis donne les étapes de développement.",
    "Décide l'architecture et prépare le plan d'implémentation.",
    "Design the architecture then provide implementation steps.",
])
def test_architecture_then_implementation_routes_architect_to_developer(prompt: str):
    decision = decide_orchestration(
        user_prompt=prompt,
        effective_agent=PERSPECTIVE_ARCHITECT,
        explicit_agent=None,
    )

    assert decision.mode == "sequential_agents"
    assert decision.primary_agent == PERSPECTIVE_ARCHITECT
    assert decision.final_agent == PERSPECTIVE_DEVELOPER
    assert "architecture_decision->implementation_plan" in decision.triggered_rules


@pytest.mark.parametrize("prompt", [
    "Pourquoi mon devis ne se confirme pas ?",
    "J'ai une erreur sur facture, peux-tu m'aider ?",
    "Propose une architecture pour ce module custom.",
    "Prépare un email client sur la migration Odoo 16 vers 18.",
    "Audit pré-prod dev + studio avec risques métier et technique.",
    "J'ai besoin d'un plan d'action après audit de sécurité.",
    "Migration Odoo 16 vers 18 avec Studio et modules custom.",
])
def test_near_misses_stay_single_agent(prompt: str):
    decision = decide_orchestration(
        user_prompt=prompt,
        effective_agent="support",
        explicit_agent=None,
    )

    assert decision.mode == "single_agent"
    assert decision.final_agent == "support"
    assert decision.triggered_rules == ("single_agent_default",)


def test_explicit_ui_agent_stays_single_when_no_two_step_intent():
    decision = decide_orchestration(
        user_prompt="Propose une architecture pour ce module custom.",
        effective_agent=PERSPECTIVE_ARCHITECT,
        explicit_agent="architect",
    )

    assert decision.mode == "single_agent"
    assert decision.final_agent == PERSPECTIVE_ARCHITECT


def test_explicit_ui_agent_can_be_overridden_by_clear_sequence():
    decision = decide_orchestration(
        user_prompt="Analyse cette traceback puis prépare un message client simple.",
        effective_agent=PERSPECTIVE_DEVELOPER,
        explicit_agent="developer",
    )

    assert decision.mode == "sequential_agents"
    assert decision.final_agent == PERSPECTIVE_BA


def test_signals_use_camel_case_public_shape():
    signals = extract_prompt_signals("Diagnostique l'erreur puis rédige un email client.")

    public = signals.to_dict()
    assert public["hasMultipleTasks"] is True
    assert public["asksForBugDiagnosis"] is True
    assert public["asksForClientExplanation"] is True
    assert "technical_diagnosis" in public["matchedSignalFamilies"]


def test_public_payload_contains_orchestration_explainability():
    decision = decide_orchestration(
        user_prompt="Diagnose the stack trace then translate into client terms.",
        effective_agent=PERSPECTIVE_DEVELOPER,
        explicit_agent=None,
    )

    payload = decision.to_dict()
    assert payload["mode"] == "sequential_agents"
    assert payload["finalAgent"] == PERSPECTIVE_BA
    assert payload["ruleId"] == "technical_diagnosis->client_output"
    assert payload["decisionSource"] == "declarative"
    assert payload["sequence"]
    assert payload["signals"]
    assert payload["triggeredRules"] == ["technical_diagnosis->client_output"]


def test_declarative_orchestration_config_loads():
    config = load_orchestration_config(_ORCHESTRATION_DIR)

    assert "technical_diagnosis" in config.signal_families
    assert {rule.rule_id for rule in config.rules} == {
        "technical_diagnosis->client_output",
        "business_scope->architecture_decision",
        "architecture_decision->implementation_plan",
    }


def _write_config(tmp_path: Path, *, signals: dict, rules: list[dict]) -> Path:
    (tmp_path / "signals.json").write_text(json.dumps(signals), encoding="utf-8")
    (tmp_path / "rules.json").write_text(json.dumps(rules), encoding="utf-8")
    return tmp_path


def _valid_signals() -> dict:
    return {
        "technical_diagnosis": ["traceback"],
        "client_output": ["message client"],
    }


def _valid_rule(**overrides) -> dict:
    rule = {
        "ruleId": "technical_diagnosis->client_output",
        "requiredSignals": ["technical_diagnosis", "client_output"],
        "primaryAgent": "developer",
        "finalAgent": "business_analyst",
        "confidence": 0.9,
        "reason": "Diagnostic puis message client.",
        "sequence": [
            {"agent": "developer", "role": "executor", "purpose": "Diagnostiquer."},
            {"agent": "business_analyst", "role": "synthesizer", "purpose": "Rédiger."},
        ],
    }
    rule.update(overrides)
    return rule


def test_declarative_config_rejects_unknown_signal_family(tmp_path: Path):
    config_dir = _write_config(
        tmp_path,
        signals=_valid_signals(),
        rules=[_valid_rule(requiredSignals=["technical_diagnosis", "unknown_signal"])],
    )

    with pytest.raises(OrchestrationConfigError, match="unknown signal family"):
        load_orchestration_config(config_dir)


def test_declarative_config_rejects_unknown_agent(tmp_path: Path):
    config_dir = _write_config(
        tmp_path,
        signals=_valid_signals(),
        rules=[_valid_rule(finalAgent="unknown_agent")],
    )

    with pytest.raises(OrchestrationConfigError, match="unknown finalAgent"):
        load_orchestration_config(config_dir)


def test_declarative_config_rejects_duplicate_rule_id(tmp_path: Path):
    config_dir = _write_config(
        tmp_path,
        signals=_valid_signals(),
        rules=[_valid_rule(), _valid_rule()],
    )

    with pytest.raises(OrchestrationConfigError, match="duplicate orchestration ruleId"):
        load_orchestration_config(config_dir)


def test_declarative_config_rejects_missing_rule_id(tmp_path: Path):
    rule = _valid_rule()
    rule.pop("ruleId")
    config_dir = _write_config(
        tmp_path,
        signals=_valid_signals(),
        rules=[rule],
    )

    with pytest.raises(OrchestrationConfigError, match="must define ruleId"):
        load_orchestration_config(config_dir)


@pytest.mark.parametrize("entry", json.loads((_ORCHESTRATION_DIR / "eval_queries.json").read_text(encoding="utf-8")))
def test_orchestration_eval_queries(entry: dict):
    decision = decide_orchestration(
        user_prompt=entry["query"],
        effective_agent="support",
        explicit_agent=None,
    )

    assert decision.mode == entry["expected_mode"]
    assert decision.final_agent == entry["expected_final_agent"]
    assert decision.rule_id == entry["expected_rule"]
    assert [step.agent for step in decision.sequence] == entry["expected_sequence"]
