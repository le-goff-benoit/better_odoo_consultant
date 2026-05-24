from dataclasses import replace

from backend.services.policy_engine import DEFAULT_POLICY_ENGINE
from backend.skills.registry import SkillPermissions, skill_by_name


def test_policy_refuses_script_when_permission_is_missing():
    skill = skill_by_name("repo_read_file")

    decision = DEFAULT_POLICY_ENGINE.decide(skill, "run_script", filename="handler.py")

    assert decision.denied is True
    assert decision.permission == "scripts"
    assert "scripts permission required" in decision.reason


def test_policy_allows_reference_with_filesystem_read():
    skill = skill_by_name("odoo_inspect_studio")

    decision = DEFAULT_POLICY_ENGINE.decide(skill, "load_reference", filename="studio_limits.md")

    assert decision.allowed is True
    assert decision.permission == "filesystem"
    assert decision.filesystem == "read"


def test_policy_allows_script_but_network_remains_disabled_by_default():
    skill = skill_by_name("odoo_query_records")

    decision = DEFAULT_POLICY_ENGINE.decide(skill, "run_script", filename="explain_domain.py")

    assert decision.allowed is True
    assert decision.permission == "scripts"
    assert decision.scripts is True
    assert decision.network is False


def test_policy_refuses_handler_when_odoo_permission_is_missing():
    skill = skill_by_name("output_report_writer")

    decision = DEFAULT_POLICY_ENGINE.decide(skill, "run_handler", filename="scripts/handler.py", requires=("odoo",))

    assert decision.denied is True
    assert decision.permission == "odoo"
    assert "odoo permission required" in decision.reason


def test_policy_refuses_handler_when_filesystem_permission_is_missing():
    skill = replace(
        skill_by_name("repo_read_file"),
        permissions=SkillPermissions(filesystem="none", network=False, scripts=False, odoo="none"),
    )

    decision = DEFAULT_POLICY_ENGINE.decide(skill, "run_handler", filename="scripts/handler.py", requires=("repo",))

    assert decision.denied is True
    assert decision.permission == "filesystem"
    assert "filesystem read permission required" in decision.reason
